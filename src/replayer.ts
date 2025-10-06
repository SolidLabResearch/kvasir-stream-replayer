import { EventEmitter } from 'events';
import ProgressBar from 'progress';
import { RDFParser } from './rdf-utils';
import { KvasirClient } from './kvasir-client';
import { ReplayerConfig, ReplayerStats, TimeseriesDataPoint, LatencyTestResult } from './types';

export class KvasirReplayer extends EventEmitter {
  private config: ReplayerConfig;
  private client: KvasirClient;
  private parser: RDFParser;
  private stats: ReplayerStats;
  private progressBar?: ProgressBar;
  private isRunning: boolean = false;
  private realtimeStartTime?: Date; // When real-time replay started

  constructor(config: ReplayerConfig) {
    super();
    this.config = {
      batchSize: config.batchSize || (config.mode === 'bulk-upload' ? 1000 : 1),
      delayBetweenBatches: config.delayBetweenBatches || 0,
      maxRetries: config.maxRetries || 3,
      timeAcceleration: config.timeAcceleration || 1.0,
      kvasirUrl: config.kvasirUrl,
      podName: config.podName,
      startFrom: config.startFrom,
      endAt: config.endAt,
      mode: config.mode || 'historical',
      frequencyHz: config.frequencyHz || 1.0,
      maxEvents: config.maxEvents,
      bulkBatchSize: config.bulkBatchSize || 1000
    };
    
    this.client = new KvasirClient(config.kvasirUrl, config.podName);
    this.parser = new RDFParser();
    this.stats = this.initializeStats();
  }

  /**
   * Start replaying data from an NT file
   */
  async replay(ntFilePath: string, showProgress: boolean = true): Promise<ReplayerStats> {
    if (this.isRunning) {
      throw new Error('Replayer is already running');
    }

    this.isRunning = true;
    this.stats = this.initializeStats();
    this.emit('start', this.stats);

    try {
      // Health check
      const isHealthy = await this.client.healthCheck();
      if (!isHealthy) {
        throw new Error('Kvasir health check failed');
      }

      switch (this.config.mode) {
        case 'realtime-frequency':
          return await this.replayWithFrequency(ntFilePath, showProgress);
        case 'bulk-upload':
          return await this.replayWithBulkUpload(ntFilePath, showProgress);
        case 'historical':
        default:
          return await this.replayWithHistoricalTiming(ntFilePath, showProgress);
      }

    } catch (error: any) {
      this.emit('error', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Replay with frequency-based real-time streaming
   */
  private async replayWithFrequency(ntFilePath: string, showProgress: boolean): Promise<ReplayerStats> {
    // Load all data points into memory first
    const dataPoints: TimeseriesDataPoint[] = [];
    for await (const dataPoint of this.parser.parseTimeseriesFromFile(ntFilePath)) {
      dataPoints.push(dataPoint);
      this.stats.totalRecords++;
    }

    if (dataPoints.length === 0) {
      throw new Error('No data points found in file');
    }

    // Calculate interval between events based on frequency
    const intervalMs = 1000 / (this.config.frequencyHz || 1.0);
    const maxEvents = this.config.maxEvents || dataPoints.length;
    const eventsToProcess = Math.min(maxEvents, dataPoints.length);

    // Initialize progress bar
    if (showProgress) {
      this.progressBar = new ProgressBar(
        'Streaming [:bar] :percent :current/:total @ :rateHz Hz | Next: :eta',
        { 
          total: eventsToProcess, 
          width: 50,
          renderThrottle: 100
        }
      );
    }

    // Set up frequency tracking
    this.stats.targetFrequencyHz = this.config.frequencyHz;
    this.realtimeStartTime = new Date();
    let nextEventTime = this.realtimeStartTime.getTime();

    // Stream events at the specified frequency
    for (let i = 0; i < eventsToProcess && this.isRunning; i++) {
      const dataPoint = dataPoints[i % dataPoints.length]; // Cycle through data if needed
      
      // Create new data point with current timestamp
      const realtimeDataPoint: TimeseriesDataPoint = {
        ...dataPoint,
        timestamp: new Date(nextEventTime)
      };

      // Schedule next event
      this.stats.nextEventTime = new Date(nextEventTime + intervalMs);
      
      // Wait until it's time for this event
      const now = Date.now();
      const waitTime = nextEventTime - now;
      
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }

      // Process the event
      await this.processEvent(realtimeDataPoint, i);
      
      // Update timing for next event
      nextEventTime += intervalMs;
      
      // Update progress
      if (this.progressBar) {
        this.progressBar.tick(1, {
          rateHz: this.config.frequencyHz?.toFixed(1)
        });
      }

      // Calculate actual frequency
      const elapsed = (Date.now() - this.realtimeStartTime.getTime()) / 1000;
      if (elapsed > 0) {
        this.stats.actualFrequencyHz = (i + 1) / elapsed;
        this.stats.frequencyDrift = (this.stats.actualFrequencyHz || 0) - (this.config.frequencyHz || 0);
      }
    }

    this.stats.endTime = new Date();
    this.stats.avgInsertionTime = this.calculateAverageInsertionTime();
    
    if (this.progressBar) {
      this.progressBar.terminate();
    }

    this.emit('complete', this.stats);
    return this.stats;
  }

  /**
   * Replay with bulk upload (entire dataset uploaded in batches)
   */
  private async replayWithBulkUpload(ntFilePath: string, showProgress: boolean): Promise<ReplayerStats> {
    // Load all data points into memory first
    const dataPoints: TimeseriesDataPoint[] = [];
    for await (const dataPoint of this.parser.parseTimeseriesFromFile(ntFilePath)) {
      dataPoints.push(dataPoint);
      this.stats.totalRecords++;
    }

    if (dataPoints.length === 0) {
      throw new Error('No data points found in file');
    }

    const batchSize = this.config.bulkBatchSize || 1000;
    const totalBatches = Math.ceil(dataPoints.length / batchSize);
    this.stats.totalBatches = totalBatches;

    // Initialize progress bar
    if (showProgress) {
      this.progressBar = new ProgressBar(
        'Bulk Upload [:bar] :percent :current/:total batches | :rate batches/sec | ETA: :eta',
        { 
          total: totalBatches, 
          width: 50,
          renderThrottle: 100
        }
      );
    }

    console.log(`Starting bulk upload of ${dataPoints.length} events in ${totalBatches} batches...`);
    this.realtimeStartTime = new Date();

    // Process data in batches
    for (let i = 0; i < totalBatches && this.isRunning; i++) {
      const batchStart = i * batchSize;
      const batchEnd = Math.min((i + 1) * batchSize, dataPoints.length);
      const batch = dataPoints.slice(batchStart, batchEnd);
      
      const batchStartTime = Date.now();
      
      try {
        // Upload entire batch at once
        const response = await this.client.insertBatch(batch);
        
        if (response.success) {
          this.stats.successfulInserts += batch.length;
          this.stats.processedRecords += batch.length;
          this.stats.completedBatches = (this.stats.completedBatches || 0) + 1;
          
          const batchTime = Date.now() - batchStartTime;
          const totalBatchTime = ((this.stats.avgBatchProcessingTime || 0) * i + batchTime) / (i + 1);
          this.stats.avgBatchProcessingTime = totalBatchTime;
          
          this.emit('batchProcessed', {
            batchNumber: i + 1,
            batchSize: batch.length,
            processingTime: batchTime,
            changeId: response.changeId,
            totalProcessed: this.stats.processedRecords,
            remainingBatches: totalBatches - (i + 1)
          });
          
        } else {
          throw new Error('Batch upload failed');
        }
        
      } catch (error: any) {
        this.stats.failedInserts += batch.length;
        this.emit('batchFailed', {
          batchNumber: i + 1,
          batchSize: batch.length,
          error: error.message
        });
      }
      
      // Update progress
      if (this.progressBar) {
        this.progressBar.tick(1);
      }
      
      // Small delay between batches to avoid overwhelming the server
      if (i < totalBatches - 1) {
        await this.sleep(this.config.delayBetweenBatches);
      }
    }

    this.stats.endTime = new Date();
    this.stats.avgInsertionTime = this.calculateAverageInsertionTime();
    
    if (this.progressBar) {
      this.progressBar.terminate();
    }

    this.emit('complete', this.stats);
    return this.stats;
  }

  /**
   * Replay with historical timing (original behavior)
   */
  private async replayWithHistoricalTiming(ntFilePath: string, showProgress: boolean): Promise<ReplayerStats> {
    // Initialize progress bar
    if (showProgress) {
      this.progressBar = new ProgressBar(
        'Replaying [:bar] :percent :current/:total (:rate/sec) ETA: :eta',
        { total: 100, width: 50 }
      );
    }

    let lastTimestamp: Date | null = null;
    let eventCount = 0;
    this.realtimeStartTime = new Date();

    // Stream through the NT file in real-time
    for await (const dataPoint of this.parser.parseTimeseriesFromFile(ntFilePath)) {
      this.stats.totalRecords++;

      // Apply time filtering if configured
      if (this.config.startFrom && dataPoint.timestamp < this.config.startFrom) {
        continue;
      }
      if (this.config.endAt && dataPoint.timestamp > this.config.endAt) {
        break;
      }

      // Real-time timing simulation
      if (lastTimestamp && this.config.timeAcceleration < Infinity) {
        const timeDiff = dataPoint.timestamp.getTime() - lastTimestamp.getTime();
        const delayMs = timeDiff / this.config.timeAcceleration;
        
        if (delayMs > 0) {
          await this.sleep(Math.min(delayMs, 10000)); // Cap at 10 seconds for safety
        }
      }

      // Process single event immediately (real-time streaming)
      await this.processEvent(dataPoint, eventCount++);
      lastTimestamp = dataPoint.timestamp;

      // Update progress
      if (this.progressBar && this.stats.totalRecords % 50 === 0) {
        this.progressBar.tick(1);
      }
    }

    this.stats.endTime = new Date();
    this.stats.avgInsertionTime = this.calculateAverageInsertionTime();
    
    if (this.progressBar) {
      this.progressBar.terminate();
    }

    this.emit('complete', this.stats);
    return this.stats;
  }

  /**
   * Process a single event in real-time with retry logic
   */
  private async processEvent(dataPoint: TimeseriesDataPoint, eventNumber: number): Promise<void> {
    const eventStartTime = Date.now();
    let attempts = 0;

    while (attempts < this.config.maxRetries) {
      try {
        // Insert single data point (real-time streaming)
        const response = await this.client.insertBatch([dataPoint]);
        
        if (response.success) {
          // For real-time, we don't wait for full processing to maintain streaming speed
          // Just emit immediately and continue
          this.stats.successfulInserts++;
          this.stats.processedRecords++;
          this.stats.currentBatchSize = 1;
          
          const eventTime = Date.now() - eventStartTime;
          const realtimeElapsed = this.realtimeStartTime ? 
            Date.now() - this.realtimeStartTime.getTime() : 0;
          
          this.emit('eventProcessed', {
            eventNumber,
            dataPoint,
            processingTime: eventTime,
            changeId: response.changeId,
            timestamp: dataPoint.timestamp,
            value: dataPoint.value,
            sensorId: dataPoint.sensorId,
            realtimeElapsed
          });
          
          return;
        }

        throw new Error('Event processing failed');
        
      } catch (error: any) {
        attempts++;
        
        if (attempts >= this.config.maxRetries) {
          this.stats.failedInserts++;
          this.emit('eventFailed', {
            eventNumber,
            dataPoint,
            error: error.message,
            attempts,
            timestamp: dataPoint.timestamp
          });
          break;
        }
        
        // Quick exponential backoff for real-time streaming
        const backoffMs = Math.min(200 * Math.pow(2, attempts - 1), 2000);
        await this.sleep(backoffMs);
      }
    }
  }

  /**
   * Stop the replayer
   */
  stop(): void {
    this.isRunning = false;
    this.emit('stopped');
  }

  /**
   * Get current statistics
   */
  getStats(): ReplayerStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }

  private initializeStats(): ReplayerStats {
    return {
      totalRecords: 0,
      processedRecords: 0,
      successfulInserts: 0,
      failedInserts: 0,
      startTime: new Date(),
      avgInsertionTime: 0,
      currentBatchSize: this.config.mode === 'bulk-upload' ? this.config.bulkBatchSize || 1000 : 1,
      eventsPerSecond: 0,
      averageLatency: 0,
      mode: this.config.mode,
      targetFrequencyHz: this.config.frequencyHz,
      actualFrequencyHz: 0,
      frequencyDrift: 0,
      nextEventTime: undefined,
      totalBatches: 0,
      completedBatches: 0,
      avgBatchProcessingTime: 0
    };
  }

  private calculateAverageInsertionTime(): number {
    if (!this.stats.endTime) return 0;
    
    const totalTime = this.stats.endTime.getTime() - this.stats.startTime.getTime();
    const avgTime = this.stats.processedRecords > 0 ? totalTime / this.stats.processedRecords : 0;
    
    // Calculate real-time streaming metrics
    if (totalTime > 0) {
      this.stats.eventsPerSecond = (this.stats.processedRecords / totalTime) * 1000;
      this.stats.averageLatency = avgTime;
    }
    
    return avgTime;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}