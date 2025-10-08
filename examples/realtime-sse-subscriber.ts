#!/usr/bin/env node

/**
 * Realtime SSE Subscriber
 * 
 * This script subscribes to SSE events from Kvasir and measures real-time latency.
 * It measures the time from when an event was generated (by the producer) to when
 * it's received via SSE.
 * 
 * Usage:
 *   npx ts-node examples/realtime-sse-subscriber.ts --duration 60 --report-interval 10
 */

import { KvasirClient } from '../src/kvasir-client';
import { MeasurementSubscription } from '../src/types';

interface SubscriberConfig {
  kvasirUrl: string;
  duration?: number; // Optional: stop after N seconds
  reportInterval: number; // Print stats every N seconds
  sensorFilter?: string; // Optional: only listen to specific sensor
}

interface LatencyMetrics {
  count: number;
  sum: number;
  min: number;
  max: number;
  values: number[];
}

class RealtimeSSESubscriber {
  private client: KvasirClient;
  private config: SubscriberConfig;
  private subscription?: { unsubscribe: () => void };
  private startTime?: Date;
  private running = false;
  private metrics: LatencyMetrics = {
    count: 0,
    sum: 0,
    min: Infinity,
    max: -Infinity,
    values: []
  };
  private lastReportTime?: Date;

  constructor(config: SubscriberConfig) {
    this.config = config;
    this.client = new KvasirClient(config.kvasirUrl);
  }

  async start(): Promise<void> {
    console.log('📡 Starting Realtime SSE Subscriber');
    console.log(`🔗 Kvasir URL: ${this.config.kvasirUrl}`);
    if (this.config.sensorFilter) {
      console.log(`Filtering sensor: ${this.config.sensorFilter}`);
    } else {
      console.log(`Listening to: ALL sensors`);
    }
    if (this.config.duration) {
      console.log(`⏰ Duration: ${this.config.duration}s`);
    } else {
      console.log(`⏰ Duration: Infinite (press Ctrl+C to stop)`);
    }
    console.log(`Report interval: ${this.config.reportInterval}s`);
    console.log('');

    this.startTime = new Date();
    this.lastReportTime = new Date();
    this.running = true;

    // Subscribe to SSE events
    this.subscription = this.client.subscribeToAllMeasurementsSSE(
      (measurement: MeasurementSubscription) => {
        this.handleEvent(measurement);
      },
      {
        reconnectAttempts: 10,
        reconnectInterval: 3000,
        connectionTimeout: 15000,
        receiveBacklog: false // Skip old backlog events!
      }
    );

    // Periodic reporting
    const reportTimer = setInterval(() => {
      if (!this.running) {
        clearInterval(reportTimer);
        return;
      }

      const now = new Date();
      const elapsed = (now.getTime() - this.lastReportTime!.getTime()) / 1000;

      if (elapsed >= this.config.reportInterval) {
        this.printReport();
        this.lastReportTime = new Date();
      }

      // Check duration limit
      if (this.config.duration) {
        const totalElapsed = (now.getTime() - this.startTime!.getTime()) / 1000;
        if (totalElapsed >= this.config.duration) {
          console.log('\n⏰ Duration limit reached, stopping...');
          this.stop();
          clearInterval(reportTimer);
        }
      }
    }, 1000); // Check every second

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down...');
      clearInterval(reportTimer);
      this.stop();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down...');
      clearInterval(reportTimer);
      this.stop();
    });
  }

  private handleEvent(measurement: MeasurementSubscription): void {
    // Filter by sensor if specified
    if (this.config.sensorFilter && measurement.sensorId !== this.config.sensorFilter) {
      return;
    }

    const receivedAt = new Date();
    const generatedAt = new Date(measurement.timestamp);

    // Calculate latency
    const latencyMs = receivedAt.getTime() - generatedAt.getTime();

    // Update metrics
    this.metrics.count++;
    this.metrics.sum += latencyMs;
    this.metrics.min = Math.min(this.metrics.min, latencyMs);
    this.metrics.max = Math.max(this.metrics.max, latencyMs);
    this.metrics.values.push(latencyMs);

    // Keep only last 1000 samples to prevent memory bloat
    if (this.metrics.values.length > 1000) {
      this.metrics.values.shift();
    }

    // Log individual event every 100 events
    if (this.metrics.count % 100 === 0) {
      console.log(`📨 Event #${this.metrics.count}: ${measurement.sensorId} (${latencyMs.toFixed(2)}ms latency)`);
    }
  }

  private printReport(): void {
    if (this.metrics.count === 0) {
      console.log('⏳ No events received yet...');
      return;
    }

    const avg = this.metrics.sum / this.metrics.count;
    const sorted = [...this.metrics.values].sort((a, b) => a - b);
    const p50 = this.percentile(sorted, 50);
    const p95 = this.percentile(sorted, 95);
    const p99 = this.percentile(sorted, 99);

    const elapsed = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 : 0;
    const rate = elapsed > 0 ? this.metrics.count / elapsed : 0;

    console.log('\n=== Latency Report ===');
    console.log(`  Events received: ${this.metrics.count}`);
    console.log(`  Event rate: ${rate.toFixed(2)} events/sec`);
    console.log(`  Latency (avg): ${avg.toFixed(2)}ms`);
    console.log(`  Latency (min): ${this.metrics.min.toFixed(2)}ms`);
    console.log(`  Latency (max): ${this.metrics.max.toFixed(2)}ms`);
    console.log(`  Latency (p50): ${p50.toFixed(2)}ms`);
    console.log(`  Latency (p95): ${p95.toFixed(2)}ms`);
    console.log(`  Latency (p99): ${p99.toFixed(2)}ms`);
    console.log(`  Tail ratio (p99/p50): ${(p99 / p50).toFixed(2)}x`);
    console.log('========================\n');
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = undefined;
    }

    this.running = false;

    // Print final report
    console.log('\n🏁 Final Report:');
    this.printReport();

    process.exit(0);
  }
}

// CLI argument parsing
function parseArgs(): SubscriberConfig {
  const args = process.argv.slice(2);
  const config: SubscriberConfig = {
    kvasirUrl: 'http://localhost:8080',
    reportInterval: 10 // Report every 10 seconds by default
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--duration':
      case '-d':
        config.duration = parseInt(args[++i]);
        break;
      case '--report-interval':
      case '-r':
        config.reportInterval = parseInt(args[++i]);
        break;
      case '--sensor':
      case '-s':
        config.sensorFilter = args[++i];
        break;
      case '--url':
      case '-u':
        config.kvasirUrl = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Realtime SSE Subscriber - Subscribe to real-time events and measure latency

Usage:
  npx ts-node examples/realtime-sse-subscriber.ts [options]

Options:
  -d, --duration <sec>      Duration in seconds (optional, infinite if not set)
  -r, --report-interval <s> Print stats every N seconds (default: 10)
  -s, --sensor <id>         Filter events for specific sensor (optional)
  -u, --url <url>           Kvasir server URL (default: http://localhost:8080)
  -h, --help                Show this help message

Examples:
  # Subscribe and report every 10 seconds
  npx ts-node examples/realtime-sse-subscriber.ts -r 10

  # Subscribe for 60 seconds
  npx ts-node examples/realtime-sse-subscriber.ts -d 60

  # Subscribe to specific sensor only
  npx ts-node examples/realtime-sse-subscriber.ts -s Sensor1

  # High-frequency monitoring with 5-second reports
  npx ts-node examples/realtime-sse-subscriber.ts -r 5 -d 120
        `);
        process.exit(0);
    }
  }

  return config;
}

// Main
async function main() {
  const config = parseArgs();
  const subscriber = new RealtimeSSESubscriber(config);
  await subscriber.start();
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
