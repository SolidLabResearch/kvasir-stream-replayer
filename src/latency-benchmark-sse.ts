import { KvasirClient } from './kvasir-client';
import { MeasurementSubscription, TimeseriesDataPoint } from './types';

export interface SSELatencyBenchmarkConfig {
  kvasirUrl: string;
  sensorIds: string[];
  testDuration: number; // seconds
  eventInterval: number; // milliseconds between events
  maxLatencySamples: number;
}

export interface LatencySample {
  sensorId: string;
  generatedAt: Date;
  receivedAt: Date;
  latencyMs: number;
}

export class SSELatencyBenchmark {
  private client: KvasirClient;
  private config: SSELatencyBenchmarkConfig;
  private latencySamples: LatencySample[] = [];
  private eventGenerationTimer?: NodeJS.Timeout;
  private sseSubscription?: { unsubscribe: () => void };
  private benchmarkStartTime?: Date;
  private pendingEvents = new Map<string, { sensorId: string; generatedAt: Date }>();

  constructor(kvasirClient: KvasirClient, config: Partial<SSELatencyBenchmarkConfig> = {}) {
    this.client = kvasirClient;
    this.config = {
      kvasirUrl: 'http://localhost:8080',
      sensorIds: ['TemperatureSensor1', 'HumiditySensor1', 'PressureSensor1'], // Use actual sensor names from demo data
      testDuration: 60, // 1 minute
      eventInterval: 1000, // 1 second
      maxLatencySamples: 1000,
      ...config
    };
  }

  /**
   * Run SSE latency benchmark
   */
  async runBenchmark(): Promise<{
    samples: LatencySample[];
    summary: {
      totalSamples: number;
      averageLatency: number;
      minLatency: number;
      maxLatency: number;
      p95Latency: number;
      p99Latency: number;
    };
  }> {
    console.log('Starting SSE Latency Benchmark');
    console.log(`Testing ${this.config.sensorIds.length} sensors for ${this.config.testDuration}s`);
    console.log(`⏱️  Event interval: ${this.config.eventInterval}ms`);
    console.log(`Max samples: ${this.config.maxLatencySamples}`);
    console.log('');

    this.benchmarkStartTime = new Date();
    this.latencySamples = [];

    // Start SSE subscription to capture received events
    await this.startSSESubscription();

    // Event generation will be started after backlog completes

    // Wait for test duration
    await this.waitForDuration(this.config.testDuration * 1000);

  // Allow time for any in-flight SSE events to arrive
  await this.waitForPendingEvents(15000);

    // Cleanup
    this.stopBenchmark();

    // Calculate results
    const summary = this.calculateSummary();

    console.log('\nBenchmark Results:');
    console.log(`Total samples: ${summary.totalSamples}`);
    console.log(`Average latency: ${summary.averageLatency.toFixed(2)}ms`);
    console.log(`Min latency: ${summary.minLatency.toFixed(2)}ms`);
    console.log(`Max latency: ${summary.maxLatency.toFixed(2)}ms`);
    console.log(`95th percentile: ${summary.p95Latency.toFixed(2)}ms`);
    console.log(`99th percentile: ${summary.p99Latency.toFixed(2)}ms`);

    return {
      samples: this.latencySamples,
      summary
    };
  }

  private async startSSESubscription(): Promise<void> {
    console.log('📡 Starting SSE subscription...');

    // pendingEvents is now a class property

    this.sseSubscription = this.client.subscribeToAllMeasurementsSSE(
      (measurement: MeasurementSubscription) => {
        const measurementTimestamp = new Date(measurement.timestamp);

        // Filter out backlog events that were generated before the benchmark started
        if (this.benchmarkStartTime && measurementTimestamp < this.benchmarkStartTime) {
          return; // Skip old events
        }

        console.log('📨 Received SSE measurement:', measurement);
        
        const eventId = measurement.id || this.buildEventId(measurement.sensorId, measurementTimestamp);

        if (!eventId) {
          console.warn('⚠️  Unable to build event ID for measurement', measurement);
          return;
        }

        // Check if we generated this event
        const generated = this.pendingEvents.get(eventId);
        if (generated) {
          const receivedAt = new Date();
          const latencyMs = receivedAt.getTime() - generated.generatedAt.getTime();

          this.latencySamples.push({
            sensorId: measurement.sensorId!,
            generatedAt: generated.generatedAt,
            receivedAt,
            latencyMs
          });

          this.pendingEvents.delete(eventId);

          if (this.latencySamples.length % 10 === 0) {
            console.log(`Collected ${this.latencySamples.length} latency samples`);
          }

          // Stop if we have enough samples
          if (this.latencySamples.length >= this.config.maxLatencySamples) {
            console.log('Reached maximum sample count, stopping early...');
            this.stopBenchmark();
          }
        } else {
          console.log('⚠️  Received measurement not in pending events:', eventId);
          console.log('   Available pending events:', Array.from(this.pendingEvents.keys()));
        }
      },
      {
        reconnectAttempts: 5,
        reconnectInterval: 3000
      }
    );

    // pendingEvents is now a class property, no need to store reference

    // Wait for SSE backlog to finish before starting event generation
    console.log('⏳ Waiting for SSE backlog to complete...');
    await this.waitForBacklogToComplete();
  }

  private async waitForBacklogToComplete(): Promise<void> {
    // Instead of waiting for backlog, we'll start generating events immediately
    // and use timestamp filtering to distinguish new events from backlog
    console.log('⏳ Starting event generation immediately (backlog will be filtered by timestamp)...');
    console.log('About to call startEventGeneration...');
    this.startEventGeneration();
    console.log('startEventGeneration completed');
  }

  private startEventGeneration(): void {
    console.log('🔄 STARTING EVENT GENERATION METHOD CALLED');
    console.log('🔄 Starting event generation...');
    console.log(`⏰ Event interval: ${this.config.eventInterval}ms`);
    console.log(`Sensors: ${this.config.sensorIds.join(', ')}`);
    console.log(`⏱️  Benchmark start time: ${this.benchmarkStartTime?.toISOString()}`);

    let eventCount = 0;
    const startTime = Date.now();

    this.eventGenerationTimer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.config.testDuration * 1000) {
        this.stopEventGeneration();
        return;
      }

      console.log(`🔄 Timer fired at ${new Date().toISOString()}, elapsed: ${elapsed}ms`);

      // Generate events for all sensors
      for (const sensorId of this.config.sensorIds) {
        const generatedAt = new Date();
        const value = Math.random() * 100;
        const measurementId = `http://example.org/Measurement_${sensorId}_${generatedAt.getTime()}`;

        try {
          // Create TimeseriesDataPoint for insertion
          const dataPoint: TimeseriesDataPoint = {
            id: measurementId,
            timestamp: generatedAt,
            value: value,
            valueType: 'number',
            sensorId: sensorId,
            propertyType: 'test-value'
          };

          // Insert measurement into Kvasir
          console.log(`🔄 Inserting event for ${sensorId} at ${generatedAt.toISOString()}`);
          const insertResult = await this.client.insertBatch([dataPoint]);
          console.log(`Insert result:`, insertResult);

          // Track for latency measurement
          const pendingKey = measurementId || this.buildEventId(sensorId, generatedAt);

          if (!pendingKey) {
            console.warn('⚠️  Unable to create pending event ID', { sensorId, generatedAt });
            continue;
          }

          this.pendingEvents.set(pendingKey, {
            sensorId,
            generatedAt
          });

          console.log(`🕒 Tracking pending event ${pendingKey}. Pending count: ${this.pendingEvents.size}`);

          eventCount++;
          if (eventCount % 10 === 0) {
            console.log(`Generated ${eventCount} events`);
          }
        } catch (error) {
          console.error(`Failed to insert measurement for ${sensorId}:`, error);
        }
      }
    }, this.config.eventInterval);

    console.log(`setInterval created with interval ${this.config.eventInterval}ms`);
    console.log(`⏰ Timer ID:`, this.eventGenerationTimer);
  }

  private stopEventGeneration(): void {
    if (this.eventGenerationTimer) {
      clearInterval(this.eventGenerationTimer);
      this.eventGenerationTimer = undefined;
      console.log('🛑 Stopped event generation');
    }
  }

  private stopBenchmark(): void {
    this.stopEventGeneration();

    if (this.sseSubscription) {
      this.sseSubscription.unsubscribe();
      this.sseSubscription = undefined;
      console.log('🛑 Stopped SSE subscription');
    }
  }

  private async waitForDuration(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async waitForPendingEvents(timeoutMs: number): Promise<void> {
    const endTime = Date.now() + timeoutMs;

    while (this.pendingEvents.size > 0 && Date.now() < endTime) {
      await this.waitForDuration(100);
    }
  }

  private buildEventId(sensorId: string | undefined, timestamp: Date | string): string | null {
    if (!sensorId) {
      return null;
    }

    const timeMs = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();

    if (Number.isNaN(timeMs)) {
      return null;
    }

    return `${sensorId}-${timeMs}`;
  }

  private calculateSummary() {
    if (this.latencySamples.length === 0) {
      return {
        totalSamples: 0,
        averageLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        p95Latency: 0,
        p99Latency: 0
      };
    }

    const latencies = this.latencySamples.map(s => s.latencyMs).sort((a, b) => a - b);

    return {
      totalSamples: this.latencySamples.length,
      averageLatency: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      minLatency: latencies[0],
      maxLatency: latencies[latencies.length - 1],
      p95Latency: latencies[Math.floor(latencies.length * 0.95)],
      p99Latency: latencies[Math.floor(latencies.length * 0.99)]
    };
  }
}

export default SSELatencyBenchmark;
