import { KvasirClient } from './kvasir-client';
import { LatencyTestResult, PerformanceMetrics } from './types';

export interface LatencyBenchmarkConfig {
  clickhouseUrl: string;
  databaseId: string;
  baseTime: Date;
  testDuration: number; // hours
  windowSizes: number[]; // minutes
  iterations: number;
  warmupRuns: number;
}

export class LatencyBenchmark {
  private client: KvasirClient;
  private config: LatencyBenchmarkConfig;

  constructor(kvasirClient: KvasirClient, config: Partial<LatencyBenchmarkConfig> = {}) {
    this.client = kvasirClient;
    this.config = {
      clickhouseUrl: 'http://localhost:8123',
      databaseId: 'c2d7dd29a08e40f4',
      baseTime: new Date(),
      testDuration: 1, // 1 hour
      windowSizes: [1, 5, 15, 30, 60], // 1min, 5min, 15min, 30min, 1hour
      iterations: 5,
      warmupRuns: 2,
      ...config
    };
  }

  /**
   * Run comprehensive latency benchmark
   */
  async runBenchmark(): Promise<PerformanceMetrics> {
    const results: LatencyTestResult[] = [];
    const systemLoad: PerformanceMetrics['systemLoad'] = [];

    console.log('Starting Kvasir Query Latency Benchmark');
    console.log(`Testing ${this.config.windowSizes.length} window sizes over ${this.config.testDuration} hour(s)`);
    console.log(`${this.config.iterations} iterations per test (${this.config.warmupRuns} warmup runs)`);
    console.log('');

    // Get database stats first
    const dbStats = await this.client.getDatabaseStats(this.config.clickhouseUrl, this.config.databaseId);
    console.log(`Database contains ${dbStats.totalRecords} records`);
    if (dbStats.timeRange) {
      console.log(`⏰ Time range: ${dbStats.timeRange.min.toISOString()} to ${dbStats.timeRange.max.toISOString()}`);
    }
    console.log('');

    // Warmup runs
    console.log('Running warmup queries...');
    for (let i = 0; i < this.config.warmupRuns; i++) {
      await this.runSingleTest(this.config.windowSizes[0], this.config.baseTime, false);
      await this.sleep(500);
    }
    console.log('');

    // Main benchmark loop
    for (const windowSize of this.config.windowSizes) {
      console.log(`Testing ${windowSize}-minute time windows...`);
      
      const windowResults: LatencyTestResult[] = [];
      
      for (let iteration = 0; iteration < this.config.iterations; iteration++) {
        // Use different time offsets for each iteration
        const timeOffset = iteration * windowSize * 60 * 1000; // Convert to milliseconds
        const testTime = new Date(this.config.baseTime.getTime() + timeOffset);
        
        const result = await this.runSingleTest(windowSize, testTime, true);
        windowResults.push(result);
        results.push(result);
        
        // Collect system metrics
        systemLoad.push({
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
          cpuUsage: process.cpuUsage().user / 1000, // Convert to ms
          timestamp: new Date()
        });
        
        // Small delay between iterations
        await this.sleep(200);
      }
      
      // Calculate statistics for this window size
      const avgLatency = windowResults.reduce((sum, r) => sum + r.queryTime, 0) / windowResults.length;
      const minLatency = Math.min(...windowResults.map(r => r.queryTime));
      const maxLatency = Math.max(...windowResults.map(r => r.queryTime));
      const avgRecords = windowResults.reduce((sum, r) => sum + r.recordCount, 0) / windowResults.length;
      
      console.log(`   ${windowSize}min window: ${avgLatency.toFixed(1)}ms avg (${minLatency}-${maxLatency}ms), ~${avgRecords.toFixed(0)} records`);
    }

    console.log('');
    console.log('BENCHMARK COMPLETE');
    this.printSummaryStats(results);

    return {
      insertionLatency: [], // Not measured in this benchmark
      queryLatency: results,
      systemLoad
    };
  }

  /**
   * Run a single latency test
   */
  private async runSingleTest(windowSizeMinutes: number, baseTime: Date, verbose: boolean = false): Promise<LatencyTestResult> {
    const startTime = new Date(baseTime);
    const endTime = new Date(baseTime.getTime() + windowSizeMinutes * 60 * 1000);

    try {
      const result = await this.client.queryTimeRange(
        startTime,
        endTime,
        this.config.clickhouseUrl,
        this.config.databaseId
      );

      if (verbose && result.success) {
        process.stdout.write('.');
      } else if (verbose) {
        process.stdout.write('x');
      }

      return {
        ...result,
        queryType: `${windowSizeMinutes}-minute-window`
      };
    } catch (error: any) {
      if (verbose) {
        process.stdout.write('E');
      }
      
      return {
        timeRange: { start: startTime, end: endTime },
        recordCount: 0,
        queryTime: 0,
        queryType: `${windowSizeMinutes}-minute-window`,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test query performance under different load conditions
   */
  async runLoadTest(
    concurrentQueries: number[] = [1, 2, 5, 10],
    windowSizeMinutes: number = 15
  ): Promise<LatencyTestResult[]> {
    const results: LatencyTestResult[] = [];
    
    console.log('Running concurrent query load test...');
    
    for (const concurrent of concurrentQueries) {
      console.log(`   Testing ${concurrent} concurrent queries...`);
      
      const promises: Promise<LatencyTestResult>[] = [];
      const startTime = Date.now();
      
      for (let i = 0; i < concurrent; i++) {
        const timeOffset = i * windowSizeMinutes * 60 * 1000;
        const testTime = new Date(this.config.baseTime.getTime() + timeOffset);
        promises.push(this.runSingleTest(windowSizeMinutes, testTime));
      }
      
      const concurrentResults = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // Calculate metrics for this concurrency level
      const successfulQueries = concurrentResults.filter(r => r.success);
      const avgLatency = successfulQueries.reduce((sum, r) => sum + r.queryTime, 0) / successfulQueries.length;
      const throughput = (successfulQueries.length / totalTime) * 1000; // queries per second
      
      console.log(`     ${concurrent} concurrent: ${avgLatency.toFixed(1)}ms avg, ${throughput.toFixed(2)} queries/sec`);
      
      // Add summary result
      results.push({
        timeRange: { start: new Date(), end: new Date() },
        recordCount: concurrentResults.reduce((sum, r) => sum + r.recordCount, 0),
        queryTime: avgLatency,
        queryType: `load-test-${concurrent}-concurrent`,
        success: successfulQueries.length === concurrent
      });
      
      // Cool down between tests
      await this.sleep(1000);
    }
    
    return results;
  }

  /**
   * Generate hourly performance report
   */
  async generateHourlyReport(startTime: Date): Promise<void> {
    console.log('Generating hourly performance report...');
    
    const hourlyResults: LatencyTestResult[] = [];
    
    // Test each hour window
    for (let hour = 0; hour < this.config.testDuration; hour++) {
      const hourStart = new Date(startTime.getTime() + hour * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
      
      const result = await this.client.queryTimeRange(
        hourStart,
        hourEnd,
        this.config.clickhouseUrl,
        this.config.databaseId
      );
      
      hourlyResults.push({
        ...result,
        queryType: `hour-${hour + 1}`
      });
      
      console.log(`   Hour ${hour + 1}: ${result.queryTime}ms, ${result.recordCount} records`);
    }
    
    // Generate summary
    const avgHourlyLatency = hourlyResults.reduce((sum, r) => sum + r.queryTime, 0) / hourlyResults.length;
    const totalRecords = hourlyResults.reduce((sum, r) => sum + r.recordCount, 0);
    
    console.log('');
    console.log('HOURLY REPORT SUMMARY');
    console.log(`   Average query time: ${avgHourlyLatency.toFixed(1)}ms`);
    console.log(`   Total records queried: ${totalRecords}`);
    console.log(`   Average records per hour: ${(totalRecords / this.config.testDuration).toFixed(0)}`);
  }

  private printSummaryStats(results: LatencyTestResult[]): void {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length === 0) {
      console.log('All queries failed!');
      return;
    }
    
    const latencies = successful.map(r => r.queryTime);
    const recordCounts = successful.map(r => r.recordCount);
    
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const medianLatency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)];
    
    const avgRecords = recordCounts.reduce((sum, c) => sum + c, 0) / recordCounts.length;
    const totalRecords = recordCounts.reduce((sum, c) => sum + c, 0);
    
    console.log(`   ${successful.length} successful queries, ${failed.length} failed`);
    console.log(`   Latency: ${avgLatency.toFixed(1)}ms avg, ${medianLatency}ms median (${minLatency}-${maxLatency}ms range)`);
    console.log(`   Records: ${avgRecords.toFixed(0)} avg per query, ${totalRecords} total queried`);
    
    if (avgRecords > 0) {
      const throughput = avgRecords / (avgLatency / 1000); // records per second
      console.log(`   Throughput: ${throughput.toFixed(0)} records/sec`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}