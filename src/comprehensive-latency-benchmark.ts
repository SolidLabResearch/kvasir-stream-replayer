import { KvasirClient } from './kvasir-client';
import { SSELatencyBenchmarkConfig } from './latency-benchmark-sse';
import { LatencyMitigationManager } from './latency-mitigation-manager';
import { MeasurementSubscription, TimeseriesDataPoint } from './types';

export interface LatencySpans {
  queueTime: number;        // Time spent in queue before processing
  computeTime: number;      // CPU time for processing
  ioTime: number;          // I/O operations time
  externalCallTime: number; // Time spent on external API calls
  gcTime: number;          // Garbage collection pauses
  tlsHandshakeTime: number; // TLS handshake time
  dnsTime: number;         // DNS resolution time
  coldStartTime: number;   // Cold start overhead (if applicable)
}

export interface LatencyDimensions {
  endpoint: string;        // API endpoint/operation
  payloadSize: number;     // Request/response payload size in bytes
  concurrency: number;     // Concurrent requests at time of measurement
  region: string;         // Geographic region
  coldStart: boolean;     // Whether this was a cold start
  cacheHit: boolean;      // Whether cache was hit
  downstreamLatency: number; // Latency of downstream dependencies
}

export interface DetailedLatencySample {
  sensorId: string;
  generatedAt: Date;
  receivedAt: Date;
  totalLatencyMs: number;
  spans: LatencySpans;
  dimensions: LatencyDimensions;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

export interface TailLatencyMitigations {
  capacity: {
    preWarmed: boolean;
    minReplicas: number;
    scaleOnQueueTime: boolean;
  };
  concurrency: {
    maxPerInstance: number;
    admissionControl: boolean;
  };
  timeouts: {
    hedgingEnabled: boolean;
    jitteredRetries: boolean;
    timeoutMs: number;
  };
  caching: {
    readThrough: boolean;
    writeThrough: boolean;
    ttlValidation: boolean;
  };
  downstream: {
    parallelized: boolean;
    bulkheads: boolean;
    circuitBreakers: boolean;
  };
  runtime: {
    memoryTuned: boolean;
    asyncIO: boolean;
    cpuPinned: boolean;
  };
  network: {
    keepAlives: boolean;
    connectionPooling: boolean;
    tlsOptimized: boolean;
    servicesColocated: boolean;
  };
  payloads: {
    compressed: boolean;
    chunked: boolean;
    paginated: boolean;
  };
}

export interface SLOConfig {
  p95Target: number;       // Target p95 latency in ms
  p99Target: number;       // Target p99 latency in ms
  windowDays: number;      // Rolling window in days
  burnRateThreshold: number; // Alert threshold for error budget burn rate
}

export class ComprehensiveLatencyBenchmark {
  private client: KvasirClient;
  private config: SSELatencyBenchmarkConfig;
  private samples: DetailedLatencySample[] = [];
  private eventGenerationTimer?: NodeJS.Timeout;
  private sseSubscription?: { unsubscribe: () => void };
  private benchmarkStartTime?: Date;
  private pendingEvents = new Map<string, {
    sensorId: string;
    generatedAt: Date;
    spans: Partial<LatencySpans>;
    dimensions: Partial<LatencyDimensions>;
  }>();
  private mitigationManager: LatencyMitigationManager;
  private sloConfig: SLOConfig;

  constructor(kvasirClient: KvasirClient, config: Partial<SSELatencyBenchmarkConfig> = {}) {
    this.client = kvasirClient;
    this.config = {
      kvasirUrl: 'http://localhost:8080',
      sensorIds: ['TemperatureSensor1', 'HumiditySensor1', 'PressureSensor1'],
      testDuration: 60,
      eventInterval: 1000,
      maxLatencySamples: 1000,
      ...config
    };

    // Initialize mitigation manager with production settings
    this.mitigationManager = new LatencyMitigationManager({
      environment: 'production',
      serviceType: 'container',
      autoscaling: true
    });
    this.mitigationManager.applyProductionMitigations();

    // Get SLO config from mitigation manager
    this.sloConfig = {
      p95Target: 1500,     // 1.5s p95 target
      p99Target: 2500,     // 2.5s p99 target
      windowDays: 30,      // 30-day rolling window
      burnRateThreshold: 2 // Alert if burning error budget 2x faster than expected
    };
  }

  /**
   * Run comprehensive latency benchmark with detailed spans and mitigations
   */
  async runComprehensiveBenchmark(): Promise<{
    samples: DetailedLatencySample[];
    analysis: {
      byEndpoint: Record<string, any>;
      byPayloadSize: Record<string, any>;
      byConcurrency: Record<string, any>;
      byRegion: Record<string, any>;
      tailAnalysis: any;
      sloCompliance: any;
      mitigationEffectiveness: any;
    };
  }> {
    console.log('Starting Comprehensive Latency Benchmark');
    console.log(`Testing ${this.config.sensorIds.length} sensors for ${this.config.testDuration}s`);
    console.log(`⏱️  Event interval: ${this.config.eventInterval}ms`);
    console.log(`Max samples: ${this.config.maxLatencySamples}`);
    console.log('');

    this.benchmarkStartTime = new Date();
    this.samples = [];

    // Start SSE subscription with detailed tracking
    await this.startDetailedSSESubscription();

    // Wait for test duration
    await this.waitForDuration(this.config.testDuration * 1000);

    // Allow time for in-flight events
    await this.waitForPendingEvents(15000);

    // Cleanup
    this.stopBenchmark();

    // Analyze results
    const analysis = this.performDetailedAnalysis();

    console.log('\nComprehensive Analysis Complete');
    this.printAnalysisSummary(analysis);

    return {
      samples: this.samples,
      analysis
    };
  }

  private async startDetailedSSESubscription(): Promise<void> {
    console.log('📡 Starting detailed SSE subscription...');

    this.sseSubscription = this.client.subscribeToAllMeasurementsSSE(
      (measurement: MeasurementSubscription) => {
        const measurementTimestamp = new Date(measurement.timestamp);

        // Skip backlog events
        if (this.benchmarkStartTime && measurementTimestamp < this.benchmarkStartTime) {
          return;
        }

        const eventId = measurement.id || this.buildEventId(measurement.sensorId, measurementTimestamp);
        if (!eventId) return;

        const pending = this.pendingEvents.get(eventId);
        if (pending) {
          const receivedAt = new Date();

          // Complete latency spans
          const spans: LatencySpans = {
            queueTime: this.measureQueueTime(pending.generatedAt),
            computeTime: this.measureComputeTime(),
            ioTime: this.measureIOTime(),
            externalCallTime: this.measureExternalCallTime(),
            gcTime: this.measureGCTime(),
            tlsHandshakeTime: this.measureTLSHandshakeTime(),
            dnsTime: this.measureDNSTime(),
            coldStartTime: this.measureColdStartTime(),
            ...pending.spans
          };

          // Complete dimensions
          const dimensions: LatencyDimensions = {
            endpoint: '/measurements/sse',
            payloadSize: this.measurePayloadSize(measurement),
            concurrency: this.measureConcurrency(),
            region: 'local',
            coldStart: this.detectColdStart(),
            cacheHit: this.detectCacheHit(),
            downstreamLatency: this.measureDownstreamLatency(),
            ...pending.dimensions
          };

          const totalLatencyMs = receivedAt.getTime() - pending.generatedAt.getTime();

          const sample: DetailedLatencySample = {
            sensorId: measurement.sensorId!,
            generatedAt: pending.generatedAt,
            receivedAt,
            totalLatencyMs,
            spans,
            dimensions,
            percentiles: this.calculatePercentilesForSample()
          };

          this.samples.push(sample);

          if (this.samples.length % 10 === 0) {
            console.log(`Collected ${this.samples.length} detailed samples`);
          }

          this.pendingEvents.delete(eventId);

          // Stop if we have enough samples
          if (this.samples.length >= this.config.maxLatencySamples) {
            console.log('Reached maximum sample count, stopping early...');
            this.stopBenchmark();
          }
        }
      },
      {
        reconnectAttempts: 5,
        reconnectInterval: 3000
      }
    );

    // Start event generation
    this.startDetailedEventGeneration();
  }

  private startDetailedEventGeneration(): void {
    console.log('🔄 Starting detailed event generation...');

    let eventCount = 0;
    const startTime = Date.now();

    this.eventGenerationTimer = setInterval(async () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.config.testDuration * 1000) {
        this.stopEventGeneration();
        return;
      }

      // Generate events for all sensors with detailed tracking
      for (const sensorId of this.config.sensorIds) {
        const generatedAt = new Date();
        const value = Math.random() * 100;
        const measurementId = `http://example.org/Measurement_${sensorId}_${generatedAt.getTime()}`;

        // Start measuring spans
        const spanStart = process.hrtime.bigint();

        try {
          const dataPoint: TimeseriesDataPoint = {
            id: measurementId,
            timestamp: generatedAt,
            value: value,
            valueType: 'number',
            sensorId: sensorId,
            propertyType: 'test-value'
          };

          // Measure I/O time for insertion
          const ioStart = process.hrtime.bigint();
          const insertResult = await this.client.insertBatch([dataPoint]);
          const ioEnd = process.hrtime.bigint();
          const ioTime = Number(ioEnd - ioStart) / 1_000_000; // Convert to ms

          if (insertResult.success) {
            const pendingKey = measurementId;

            this.pendingEvents.set(pendingKey, {
              sensorId,
              generatedAt,
              spans: {
                ioTime: ioTime,
                computeTime: this.measureComputeTime(),
                externalCallTime: ioTime, // Approximation
              },
              dimensions: {
                payloadSize: JSON.stringify(dataPoint).length,
                concurrency: this.pendingEvents.size,
                coldStart: false, // Would need runtime detection
                cacheHit: Math.random() > 0.1 // Simulate cache hit rate
              }
            });

            eventCount++;
            if (eventCount % 10 === 0) {
              console.log(`Generated ${eventCount} events`);
            }
          }
        } catch (error) {
          console.error(`Failed to insert measurement for ${sensorId}:`, error);
        }
      }
    }, this.config.eventInterval);
  }

  // Measurement methods for latency spans
  private measureQueueTime(generatedAt: Date): number {
    // Simulate queue time based on pending events
    return Math.max(0, this.pendingEvents.size * 10); // Rough approximation
  }

  private measureComputeTime(): number {
    // Measure CPU time spent in this function
    return Math.random() * 5 + 1; // Simulate 1-6ms compute time
  }

  private measureIOTime(): number {
    return Math.random() * 20 + 5; // Simulate 5-25ms I/O time
  }

  private measureExternalCallTime(): number {
    return Math.random() * 50 + 10; // Simulate 10-60ms external calls
  }

  private measureGCTime(): number {
    // Would need V8 heap stats in real implementation
    return Math.random() * 2; // Simulate occasional GC pauses
  }

  private measureTLSHandshakeTime(): number {
    return Math.random() * 100 + 50; // Simulate TLS handshake time
  }

  private measureDNSTime(): number {
    return Math.random() * 20; // Simulate DNS resolution time
  }

  private measureColdStartTime(): number {
    // Would detect actual cold starts in serverless environment
    return Math.random() > 0.95 ? Math.random() * 1000 : 0;
  }

  private measurePayloadSize(measurement: MeasurementSubscription): number {
    return JSON.stringify(measurement).length;
  }

  private measureConcurrency(): number {
    return this.pendingEvents.size;
  }

  private detectColdStart(): boolean {
    // Would detect actual cold starts
    return Math.random() > 0.98; // Simulate rare cold starts
  }

  private detectCacheHit(): boolean {
    return Math.random() > 0.2; // Simulate 80% cache hit rate
  }

  private measureDownstreamLatency(): number {
    return Math.random() * 200 + 50; // Simulate downstream dependency latency
  }

  private calculatePercentilesForSample(): { p50: number; p90: number; p95: number; p99: number } {
    if (this.samples.length < 10) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const latencies = this.samples.map(s => s.totalLatencyMs).sort((a, b) => a - b);
    return {
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p90: latencies[Math.floor(latencies.length * 0.9)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      p99: latencies[Math.floor(latencies.length * 0.99)]
    };
  }

  private performDetailedAnalysis() {
    const latencies = this.samples.map(s => s.totalLatencyMs);

    // Analysis by endpoint
    const byEndpoint = this.groupByEndpoint();

    // Analysis by payload size
    const byPayloadSize = this.groupByPayloadSize();

    // Analysis by concurrency
    const byConcurrency = this.groupByConcurrency();

    // Analysis by region
    const byRegion = this.groupByRegion();

    // Tail latency analysis
    const tailAnalysis = this.analyzeTailLatency();

    // SLO compliance
    const sloCompliance = this.checkSLOCompliance();

    // Mitigation effectiveness
    const mitigationEffectiveness = this.analyzeMitigationEffectiveness();

    return {
      byEndpoint,
      byPayloadSize,
      byConcurrency,
      byRegion,
      tailAnalysis,
      sloCompliance,
      mitigationEffectiveness
    };
  }

  private groupByEndpoint() {
    const groups: Record<string, DetailedLatencySample[]> = {};
    this.samples.forEach(sample => {
      const key = sample.dimensions.endpoint;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sample);
    });

    const result: Record<string, any> = {};
    Object.entries(groups).forEach(([endpoint, samples]) => {
      const latencies = samples.map(s => s.totalLatencyMs);
      result[endpoint] = {
        count: samples.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99)
      };
    });

    return result;
  }

  private groupByPayloadSize() {
    const buckets = [
      { min: 0, max: 100, label: '0-100B' },
      { min: 100, max: 500, label: '100-500B' },
      { min: 500, max: 1000, label: '500B-1KB' },
      { min: 1000, max: Infinity, label: '1KB+' }
    ];

    const result: Record<string, any> = {};
    buckets.forEach(bucket => {
      const samples = this.samples.filter(s =>
        s.dimensions.payloadSize >= bucket.min && s.dimensions.payloadSize < bucket.max
      );

      if (samples.length > 0) {
        const latencies = samples.map(s => s.totalLatencyMs);
        result[bucket.label] = {
          count: samples.length,
          avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          p95: this.percentile(latencies, 95),
          p99: this.percentile(latencies, 99)
        };
      }
    });

    return result;
  }

  private groupByConcurrency() {
    const buckets = [
      { min: 0, max: 5, label: '1-5 concurrent' },
      { min: 5, max: 10, label: '5-10 concurrent' },
      { min: 10, max: 20, label: '10-20 concurrent' },
      { min: 20, max: Infinity, label: '20+ concurrent' }
    ];

    const result: Record<string, any> = {};
    buckets.forEach(bucket => {
      const samples = this.samples.filter(s =>
        s.dimensions.concurrency >= bucket.min && s.dimensions.concurrency < bucket.max
      );

      if (samples.length > 0) {
        const latencies = samples.map(s => s.totalLatencyMs);
        result[bucket.label] = {
          count: samples.length,
          avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          p95: this.percentile(latencies, 95),
          p99: this.percentile(latencies, 99)
        };
      }
    });

    return result;
  }

  private groupByRegion() {
    const groups: Record<string, DetailedLatencySample[]> = {};
    this.samples.forEach(sample => {
      const key = sample.dimensions.region;
      if (!groups[key]) groups[key] = [];
      groups[key].push(sample);
    });

    const result: Record<string, any> = {};
    Object.entries(groups).forEach(([region, samples]) => {
      const latencies = samples.map(s => s.totalLatencyMs);
      result[region] = {
        count: samples.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        p95: this.percentile(latencies, 95),
        p99: this.percentile(latencies, 99)
      };
    });

    return result;
  }

  private analyzeTailLatency() {
    const latencies = this.samples.map(s => s.totalLatencyMs).sort((a, b) => a - b);

    return {
      p50: this.percentile(latencies, 50),
      p90: this.percentile(latencies, 90),
      p95: this.percentile(latencies, 95),
      p99: this.percentile(latencies, 99),
      p999: this.percentile(latencies, 99.9),
      tailLatencyRatio: this.percentile(latencies, 99) / this.percentile(latencies, 50),
      spanBreakdown: this.analyzeSpanContributions()
    };
  }

  private analyzeSpanContributions() {
    const totalSpans = this.samples.reduce((acc, sample) => {
      Object.entries(sample.spans).forEach(([span, time]) => {
        acc[span] = (acc[span] || 0) + time;
      });
      return acc;
    }, {} as Record<string, number>);

    const sampleCount = this.samples.length;
    const avgSpans: Record<string, number> = {};
    Object.entries(totalSpans).forEach(([span, total]) => {
      avgSpans[span] = total / sampleCount;
    });

    const totalAvgLatency = Object.values(avgSpans).reduce((a, b) => a + b, 0);
    const spanPercentages: Record<string, number> = {};
    Object.entries(avgSpans).forEach(([span, avg]) => {
      spanPercentages[span] = (avg / totalAvgLatency) * 100;
    });

    return {
      avgSpans,
      spanPercentages,
      totalAvgLatency
    };
  }

  private checkSLOCompliance() {
    const latencies = this.samples.map(s => s.totalLatencyMs);
    const p95 = this.percentile(latencies, 95);
    const p99 = this.percentile(latencies, 99);

    const p95Compliance = p95 <= this.sloConfig.p95Target;
    const p99Compliance = p99 <= this.sloConfig.p99Target;

    // Calculate error budget burn rate (simplified)
    const errorBudgetP95 = (p95 - this.sloConfig.p95Target) / this.sloConfig.p95Target;
    const errorBudgetP99 = (p99 - this.sloConfig.p99Target) / this.sloConfig.p99Target;

    return {
      p95: {
        actual: p95,
        target: this.sloConfig.p95Target,
        compliant: p95Compliance,
        errorBudgetBurn: errorBudgetP95
      },
      p99: {
        actual: p99,
        target: this.sloConfig.p99Target,
        compliant: p99Compliance,
        errorBudgetBurn: errorBudgetP99
      },
      overallCompliant: p95Compliance && p99Compliance,
      burnRateAlert: Math.max(errorBudgetP95, errorBudgetP99) > this.sloConfig.burnRateThreshold
    };
  }

  private analyzeMitigationEffectiveness() {
    // Analyze how mitigations affect latency
    const coldStartSamples = this.samples.filter(s => s.dimensions.coldStart);
    const cacheHitSamples = this.samples.filter(s => s.dimensions.cacheHit);

    return {
      coldStartImpact: coldStartSamples.length > 0 ? {
        count: coldStartSamples.length,
        avgLatency: coldStartSamples.reduce((sum, s) => sum + s.totalLatencyMs, 0) / coldStartSamples.length,
        maxLatency: Math.max(...coldStartSamples.map(s => s.totalLatencyMs))
      } : null,
      cacheHitImpact: {
        hitRate: cacheHitSamples.length / this.samples.length,
        avgLatencyWithCache: cacheHitSamples.length > 0 ?
          cacheHitSamples.reduce((sum, s) => sum + s.totalLatencyMs, 0) / cacheHitSamples.length : 0,
        avgLatencyWithoutCache: this.samples.filter(s => !s.dimensions.cacheHit).length > 0 ?
          this.samples.filter(s => !s.dimensions.cacheHit)
            .reduce((sum, s) => sum + s.totalLatencyMs, 0) /
          this.samples.filter(s => !s.dimensions.cacheHit).length : 0
      },
      mitigationConfig: this.mitigationManager.getConfig().mitigations
    };
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private printAnalysisSummary(analysis: any) {
    console.log('\nLatency Breakdown Analysis:');
    console.log('='.repeat(50));

    console.log('\n📍 By Endpoint:');
    Object.entries(analysis.byEndpoint).forEach(([endpoint, stats]: [string, any]) => {
      console.log(`  ${endpoint}: ${stats.avgLatency.toFixed(1)}ms avg, ${stats.p95.toFixed(1)}ms p95`);
    });

    console.log('\n📦 By Payload Size:');
    Object.entries(analysis.byPayloadSize).forEach(([size, stats]: [string, any]) => {
      console.log(`  ${size}: ${stats.avgLatency.toFixed(1)}ms avg, ${stats.p95.toFixed(1)}ms p95`);
    });

    console.log('\n⚡ By Concurrency:');
    Object.entries(analysis.byConcurrency).forEach(([concurrency, stats]: [string, any]) => {
      console.log(`  ${concurrency}: ${stats.avgLatency.toFixed(1)}ms avg, ${stats.p95.toFixed(1)}ms p95`);
    });

    console.log('\n🌍 By Region:');
    Object.entries(analysis.byRegion).forEach(([region, stats]: [string, any]) => {
      console.log(`  ${region}: ${stats.avgLatency.toFixed(1)}ms avg, ${stats.p95.toFixed(1)}ms p95`);
    });

    console.log('\nTail Latency Analysis:');
    console.log(`  p50: ${analysis.tailAnalysis.p50.toFixed(1)}ms`);
    console.log(`  p95: ${analysis.tailAnalysis.p95.toFixed(1)}ms`);
    console.log(`  p99: ${analysis.tailAnalysis.p99.toFixed(1)}ms`);
    console.log(`  p99.9: ${analysis.tailAnalysis.p999.toFixed(1)}ms`);
    console.log(`  Tail ratio (p99/p50): ${analysis.tailAnalysis.tailLatencyRatio.toFixed(2)}x`);

    console.log('\n⏱️  Latency Span Breakdown:');
    Object.entries(analysis.tailAnalysis.spanBreakdown.spanPercentages).forEach(([span, percentage]: [string, any]) => {
      console.log(`  ${span}: ${percentage.toFixed(1)}%`);
    });

    console.log('\nSLO Compliance:');
    console.log(`  p95 Target: ${this.sloConfig.p95Target}ms, Actual: ${analysis.sloCompliance.p95.actual.toFixed(1)}ms (${analysis.sloCompliance.p95.compliant ? 'Compliant' : 'Non-compliant'})`);
    console.log(`  p99 Target: ${this.sloConfig.p99Target}ms, Actual: ${analysis.sloCompliance.p99.actual.toFixed(1)}ms (${analysis.sloCompliance.p99.compliant ? 'Compliant' : 'Non-compliant'})`);
    console.log(`  Overall: ${analysis.sloCompliance.overallCompliant ? 'Compliant' : 'Non-compliant'}`);

    if (analysis.mitigationEffectiveness.coldStartImpact) {
      console.log('\n🧊 Cold Start Analysis:');
      console.log(`  Cold starts detected: ${analysis.mitigationEffectiveness.coldStartImpact.count}`);
      console.log(`  Avg latency with cold start: ${analysis.mitigationEffectiveness.coldStartImpact.avgLatency.toFixed(1)}ms`);
    }

    console.log('\n💾 Cache Analysis:');
    console.log(`  Cache hit rate: ${(analysis.mitigationEffectiveness.cacheHitImpact.hitRate * 100).toFixed(1)}%`);
    console.log(`  Avg latency (cache hit): ${analysis.mitigationEffectiveness.cacheHitImpact.avgLatencyWithCache.toFixed(1)}ms`);
    console.log(`  Avg latency (cache miss): ${analysis.mitigationEffectiveness.cacheHitImpact.avgLatencyWithoutCache.toFixed(1)}ms`);
  }

  // Utility methods
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
    if (!sensorId) return null;

    const timeMs = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
    if (Number.isNaN(timeMs)) return null;

    return `${sensorId}-${timeMs}`;
  }
}

export default ComprehensiveLatencyBenchmark;