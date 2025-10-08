#!/usr/bin/env node

/**
 * Realtime Event Producer
 * 
 * This script continuously generates events and writes them to Kvasir one at a time.
 * It simulates a real IoT sensor that produces measurements at a specified frequency.
 * 
 * Usage:
 *   npx ts-node examples/realtime-event-producer.ts --frequency 1 --sensors 5 --duration 60
 */

import { KvasirClient } from '../src/kvasir-client';
import { TimeseriesDataPoint } from '../src/types';

interface ProducerConfig {
  frequency: number; // Events per second (Hz)
  sensorIds: string[];
  duration?: number; // Optional: stop after N seconds
  kvasirUrl: string;
}

class RealtimeEventProducer {
  private client: KvasirClient;
  private config: ProducerConfig;
  private timer?: NodeJS.Timeout;
  private eventCount = 0;
  private startTime?: Date;
  private running = false;

  constructor(config: ProducerConfig) {
    this.config = config;
    this.client = new KvasirClient(config.kvasirUrl);
  }

  async start(): Promise<void> {
    console.log('Starting Realtime Event Producer');
    console.log(`📡 Kvasir URL: ${this.config.kvasirUrl}`);
    console.log(`Sensors: ${this.config.sensorIds.join(', ')}`);
    console.log(`⏱️  Frequency: ${this.config.frequency} Hz (${1000 / this.config.frequency}ms interval)`);
    if (this.config.duration) {
      console.log(`⏰ Duration: ${this.config.duration}s`);
    } else {
      console.log(`⏰ Duration: Infinite (press Ctrl+C to stop)`);
    }
    console.log('');

    this.startTime = new Date();
    this.running = true;

    const intervalMs = 1000 / this.config.frequency;

    this.timer = setInterval(() => {
      if (!this.running) {
        this.stop();
        return;
      }

      // Check duration limit
      if (this.config.duration) {
        const elapsed = (Date.now() - this.startTime!.getTime()) / 1000;
        if (elapsed >= this.config.duration) {
          console.log('\n⏰ Duration limit reached, stopping...');
          this.stop();
          return;
        }
      }

      // Generate one event per sensor
      this.generateEvent();
    }, intervalMs);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down...');
      this.stop();
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down...');
      this.stop();
    });
  }

  private async generateEvent(): Promise<void> {
    // Pick a random sensor for this event
    const sensorId = this.config.sensorIds[Math.floor(Math.random() * this.config.sensorIds.length)];
    const timestamp = new Date();
    const value = Math.random() * 100;

    const measurementId = `http://example.org/Measurement_${sensorId}_${timestamp.getTime()}`;

    const dataPoint: TimeseriesDataPoint = {
      id: measurementId,
      timestamp: timestamp,
      value: value,
      valueType: 'number',
      sensorId: sensorId,
      propertyType: 'temperature',
      metadata: {
        unit: 'celsius',
        producer: 'realtime-event-producer',
        eventNumber: this.eventCount + 1
      }
    };

    try {
      // Write ONE event at a time (no batching)
      const result = await this.client.insertBatch([dataPoint]);

      if (result.success) {
        this.eventCount++;
        
        // Log every 10 events
        if (this.eventCount % 10 === 0) {
          const elapsed = (Date.now() - this.startTime!.getTime()) / 1000;
          const rate = this.eventCount / elapsed;
          console.log(`Generated ${this.eventCount} events (${rate.toFixed(2)} events/sec)`);
        }
      } else {
        console.error(`Failed to insert event for ${sensorId}`);
      }
    } catch (error) {
      console.error(`Error generating event for ${sensorId}:`, error);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    this.running = false;

    const elapsed = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 : 0;
    const rate = elapsed > 0 ? this.eventCount / elapsed : 0;

    console.log('\nProducer Statistics:');
    console.log(`  Total events generated: ${this.eventCount}`);
    console.log(`  Runtime: ${elapsed.toFixed(2)}s`);
    console.log(`  Average rate: ${rate.toFixed(2)} events/sec`);
    console.log(`  Target rate: ${this.config.frequency} events/sec`);
    console.log(`  Rate accuracy: ${((rate / this.config.frequency) * 100).toFixed(1)}%`);

    process.exit(0);
  }
}

// CLI argument parsing
function parseArgs(): ProducerConfig {
  const args = process.argv.slice(2);
  const config: ProducerConfig = {
    frequency: 1, // Default: 1 event per second
    sensorIds: ['Sensor1', 'Sensor2', 'Sensor3'],
    kvasirUrl: 'http://localhost:8080'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--frequency':
      case '-f':
        config.frequency = parseFloat(args[++i]);
        break;
      case '--sensors':
      case '-s':
        const sensorCount = parseInt(args[++i]);
        config.sensorIds = Array.from({ length: sensorCount }, (_, i) => `Sensor${i + 1}`);
        break;
      case '--duration':
      case '-d':
        config.duration = parseInt(args[++i]);
        break;
      case '--url':
      case '-u':
        config.kvasirUrl = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Realtime Event Producer - Continuously generate IoT events

Usage:
  npx ts-node examples/realtime-event-producer.ts [options]

Options:
  -f, --frequency <hz>    Events per second (default: 1)
  -s, --sensors <count>   Number of sensors (default: 3)
  -d, --duration <sec>    Duration in seconds (optional, infinite if not set)
  -u, --url <url>         Kvasir server URL (default: http://localhost:8080)
  -h, --help              Show this help message

Examples:
  # Generate 1 event per second from 5 sensors
  npx ts-node examples/realtime-event-producer.ts -f 1 -s 5

  # Generate 10 events per second for 60 seconds
  npx ts-node examples/realtime-event-producer.ts -f 10 -d 60

  # High-frequency producer: 100 events/sec from 10 sensors
  npx ts-node examples/realtime-event-producer.ts -f 100 -s 10
        `);
        process.exit(0);
    }
  }

  return config;
}

// Main
async function main() {
  const config = parseArgs();
  const producer = new RealtimeEventProducer(config);
  await producer.start();
}

main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
