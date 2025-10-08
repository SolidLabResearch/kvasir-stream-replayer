#!/usr/bin/env ts-node

import { Command } from 'commander';
import { KvasirClient } from './kvasir-client';
import { LatencyBenchmark } from './latency-benchmark';
import { NTDataGenerator } from './nt-generator';
import { KvasirReplayer } from './replayer';
import { ReplayerConfig } from './types';

const program = new Command();

program
  .name('kvasir-replayer-demo')
  .description('Kvasir Replayer Demo - Stream RDF data and measure query performance')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate sample NT data file')
  .option('-f, --file <path>', 'Output file path', './sample-data.nt')
  .option('-h, --hours <number>', 'Hours of data to generate', '2')
  .option('--large', 'Generate large dataset for performance testing')
  .action(async (options) => {
    const generator = new NTDataGenerator();
    const hours = parseInt(options.hours);

    if (options.large) {
      console.log('Generating large performance test dataset...');
      generator.generateLargeTestFile(options.file, hours);
    } else {
      console.log('Generating standard test dataset...');
      const now = new Date();
      const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);
      generator.generateNTFile(options.file, startTime, hours);
    }
  });

program
  .command('replay')
  .description('Replay NT data into Kvasir')
  .option('-f, --file <path>', 'NT file to replay', './sample-data.nt')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('-a, --acceleration <factor>', 'Time acceleration factor', '10')
  .option('--frequency <hz>', 'Frequency in Hz for real-time streaming (e.g., 4 for 4Hz)')
  .option('--max-events <count>', 'Maximum number of events to stream')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    const useFrequency = options.frequency !== undefined;
    const frequencyHz = options.frequency ? parseFloat(options.frequency) : undefined;
    
    const config: ReplayerConfig = {
      kvasirUrl: options.url,
      podName: options.pod,
      batchSize: 1, // Real-time streaming: one event at a time
      delayBetweenBatches: 0, // No delay between events
      maxRetries: 3,
      timeAcceleration: parseFloat(options.acceleration),
      mode: useFrequency ? 'realtime-frequency' : 'historical',
      frequencyHz: frequencyHz,
      maxEvents: options.maxEvents ? parseInt(options.maxEvents) : undefined
    };

    console.log('Starting Kvasir Real-Time Stream Replayer');
    console.log('============================================');
    console.log(`File: ${options.file}`);
    console.log(`Kvasir: ${config.kvasirUrl}`);
    console.log(`Pod: ${config.podName}`);
    
    if (useFrequency) {
      console.log(`Mode: Frequency-based streaming`);
      console.log(`Frequency: ${frequencyHz}Hz (${(1000 / (frequencyHz || 1)).toFixed(1)}ms intervals)`);
      if (config.maxEvents) {
        console.log(`Max Events: ${config.maxEvents}`);
      }
    } else {
      console.log(`Mode: Historical timing replay`);
      console.log(`Acceleration: ${config.timeAcceleration}x`);
    }
    console.log('');

    const replayer = new KvasirReplayer(config);
    let eventCount = 0;
    let lastEventTime = Date.now();

    // Set up event listeners for real-time streaming
    replayer.on('start', (stats) => {
      console.log('Real-time stream started');
      console.log('Events will be streamed individually as they occur in time...');
      console.log('');
    });

    replayer.on('eventProcessed', (info) => {
      eventCount++;
      const now = Date.now();
      const timeSinceLastEvent = now - lastEventTime;
      lastEventTime = now;

      // Show periodic updates for real-time streaming
      if (eventCount % 10 === 0 || timeSinceLastEvent > 5000) {
        const sensorName = info.sensorId?.split('/').pop() || 'Unknown';
        console.log(`   Event ${eventCount}: ${sensorName} = ${info.value} at ${info.timestamp.toISOString().slice(11, 19)} (${info.processingTime}ms)`);
      }
    });

    replayer.on('eventFailed', (info) => {
      const sensorName = info.dataPoint.sensorId?.split('/').pop() || 'Unknown';
      console.log(`   Event failed: ${sensorName} at ${info.timestamp.toISOString().slice(11, 19)} - ${info.error}`);
    });

    replayer.on('complete', (stats) => {
      console.log('');
      console.log('Replay Complete!');
      console.log(`Processed: ${stats.processedRecords}/${stats.totalRecords} records`);
      console.log(`Successful: ${stats.successfulInserts}`);
      console.log(`Failed: ${stats.failedInserts}`);
      console.log(`Duration: ${((stats.endTime?.getTime() || 0) - stats.startTime.getTime()) / 1000}s`);
      console.log(`Avg time per record: ${stats.avgInsertionTime.toFixed(2)}ms`);
      
      if (stats.targetFrequencyHz) {
        console.log(`Target Frequency: ${stats.targetFrequencyHz.toFixed(2)}Hz`);
        console.log(`Actual Frequency: ${(stats.actualFrequencyHz || 0).toFixed(2)}Hz`);
        console.log(`Frequency Drift: ${(stats.frequencyDrift || 0).toFixed(3)}Hz`);
      }
    });

    try {
      await replayer.replay(options.file, !options.noProgress);
    } catch (error: any) {
      console.error('Replay failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('stream')
  .description('Stream data at a specific frequency (real-time)')
  .option('-f, --file <path>', 'NT file to stream', './sample-data.nt')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('--frequency <hz>', 'Streaming frequency in Hz', '4')
  .option('--duration <seconds>', 'Duration in seconds', '60')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    const frequencyHz = parseFloat(options.frequency);
    const durationSeconds = parseInt(options.duration);
    const maxEvents = Math.ceil(frequencyHz * durationSeconds);
    
    const config: ReplayerConfig = {
      kvasirUrl: options.url,
      podName: options.pod,
      batchSize: 1,
      delayBetweenBatches: 0,
      maxRetries: 3,
      timeAcceleration: 1.0,
      mode: 'realtime-frequency',
      frequencyHz: frequencyHz,
      maxEvents: maxEvents
    };

    console.log('FREQUENCY-BASED STREAMING DEMO');
    console.log('==============================');
    console.log(`File: ${options.file}`);
    console.log(`Kvasir: ${config.kvasirUrl}`);
    console.log(`Frequency: ${frequencyHz}Hz (every ${(1000 / frequencyHz).toFixed(1)}ms)`);
    console.log(`Duration: ${durationSeconds}s`);
    console.log(`Expected Events: ${maxEvents}`);
    console.log('');
    console.log('Starting real-time frequency-based streaming...');
    console.log('Events will be generated at precise intervals starting NOW!');
    console.log('');

    const replayer = new KvasirReplayer(config);
    let startTime = Date.now();

    replayer.on('eventProcessed', (info) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const sensorName = info.sensorId?.split('/').pop() || 'Unknown';
      
      console.log(`[${elapsed.toFixed(1)}s] ${sensorName}: ${info.value} (${info.processingTime}ms)`);
    });

    replayer.on('complete', (stats) => {
      console.log('');
      console.log('STREAMING COMPLETE!');
      console.log('===================');
      console.log(`Target: ${stats.targetFrequencyHz?.toFixed(2)}Hz | Actual: ${(stats.actualFrequencyHz || 0).toFixed(2)}Hz`);
      console.log(`Drift: ${(stats.frequencyDrift || 0).toFixed(3)}Hz`);
      console.log(`Total Events: ${stats.successfulInserts}`);
      console.log(`Duration: ${((stats.endTime?.getTime() || 0) - stats.startTime.getTime()) / 1000}s`);
    });

    try {
      await replayer.replay(options.file, !options.noProgress);
    } catch (error: any) {
      console.error('Streaming failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('bulk')
  .description('Bulk upload entire dataset at once')
  .option('-f, --file <path>', 'NT file to upload', './sample-data.nt')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('--batch-size <size>', 'Batch size for uploads', '1000')
  .option('--delay <ms>', 'Delay between batches in ms', '100')
  .option('--no-progress', 'Disable progress bar')
  .action(async (options) => {
    const config: ReplayerConfig = {
      kvasirUrl: options.url,
      podName: options.pod,
      batchSize: 1,
      delayBetweenBatches: parseInt(options.delay),
      maxRetries: 3,
      timeAcceleration: 1.0,
      mode: 'bulk-upload',
      bulkBatchSize: parseInt(options.batchSize)
    };

    console.log('BULK UPLOAD MODE');
    console.log('================');
    console.log(`File: ${options.file}`);
    console.log(`Kvasir: ${config.kvasirUrl}`);
    console.log(`Batch Size: ${config.bulkBatchSize} events per batch`);
    console.log(`Delay: ${config.delayBetweenBatches}ms between batches`);
    console.log('');
    console.log('Loading data and starting bulk upload...');

    const replayer = new KvasirReplayer(config);
    let startTime = Date.now();

    replayer.on('start', (stats) => {
      console.log(`Starting bulk upload of ${stats.totalRecords} events...`);
      console.log('');
    });

    replayer.on('batchProcessed', (info) => {
      const elapsed = (Date.now() - startTime) / 1000;
      const avgBatchTime = info.processingTime;
      const remainingTime = info.remainingBatches * avgBatchTime / 1000;
      
      console.log(`[${elapsed.toFixed(1)}s] Batch ${info.batchNumber}: ${info.batchSize} events (${avgBatchTime}ms) | ETA: ${remainingTime.toFixed(1)}s`);
    });

    replayer.on('batchFailed', (info) => {
      console.log(`[ERROR] Batch ${info.batchNumber} failed: ${info.error}`);
    });

    replayer.on('complete', (stats) => {
      console.log('');
      console.log('BULK UPLOAD COMPLETE!');
      console.log('=====================');
      console.log(`Total Events: ${stats.totalRecords}`);
      console.log(`Successful: ${stats.successfulInserts}`);
      console.log(`Failed: ${stats.failedInserts}`);
      console.log(`Batches: ${stats.completedBatches}/${stats.totalBatches}`);
      console.log(`Avg Batch Time: ${(stats.avgBatchProcessingTime || 0).toFixed(0)}ms`);
      console.log(`Total Duration: ${((stats.endTime?.getTime() || 0) - stats.startTime.getTime()) / 1000}s`);
      console.log(`Upload Rate: ${((stats.successfulInserts || 0) / (((stats.endTime?.getTime() || 0) - stats.startTime.getTime()) / 1000)).toFixed(0)} events/sec`);
    });

    try {
      await replayer.replay(options.file, !options.noProgress);
    } catch (error: any) {
      console.error('Bulk upload failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('benchmark')
  .description('Run query latency benchmark')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-c, --clickhouse <url>', 'ClickHouse URL', 'http://localhost:8123')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('-d, --database <id>', 'Database ID', 'c2d7dd29a08e40f4')
  .option('-i, --iterations <number>', 'Iterations per test', '5')
  .option('--load-test', 'Include concurrent load testing')
  .action(async (options) => {
    const client = new KvasirClient(options.url, options.pod);
    const benchmark = new LatencyBenchmark(client, {
      clickhouseUrl: options.clickhouse,
      databaseId: options.database,
      iterations: parseInt(options.iterations),
      baseTime: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    });

    console.log('Kvasir Query Latency Benchmark');
    console.log('==================================');
    console.log('');

    try {
      // Main benchmark
      const results = await benchmark.runBenchmark();

      // Load testing if requested
      if (options.loadTest) {
        console.log('');
        console.log('Running Load Tests...');
        await benchmark.runLoadTest([1, 2, 5, 10], 15);
      }

      // Generate hourly report
      console.log('');
      console.log('Generating Hourly Report...');
      await benchmark.generateHourlyReport(new Date(Date.now() - 60 * 60 * 1000));

    } catch (error: any) {
      console.error('Benchmark failed:', error.message);
      process.exit(1);
    }
  });

program
  .command('full-demo')
  .description('Run complete demo: generate data, replay, and benchmark')
  .option('-f, --file <path>', 'NT file path', './demo-data.nt')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-h, --hours <number>', 'Hours of data', '2')
  .action(async (options) => {
    const hours = parseInt(options.hours);

    console.log('KVASIR REPLAYER FULL DEMO');
    console.log('============================');
    console.log('');

    try {
      // Step 1: Generate data
      console.log('Step 1: Generating sample data...');
      const generator = new NTDataGenerator();
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      generator.generateNTFile(options.file, startTime, hours);
      console.log('');

      // Step 2: Replay data
      console.log('Step 2: Replaying data to Kvasir...');
      const config: ReplayerConfig = {
        kvasirUrl: options.url,
        podName: 'alice',
        batchSize: 25,
        delayBetweenBatches: 500,
        maxRetries: 3,
        timeAcceleration: 50, // Very fast for demo
        mode: 'historical'
      };

      const replayer = new KvasirReplayer(config);
      await replayer.replay(options.file, true);
      console.log('');

      // Wait for data to settle
      console.log('Waiting for data to settle...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('');

      // Step 3: Benchmark queries
      console.log('Step 3: Running query benchmarks...');
      const client = new KvasirClient(options.url, 'alice');
      const benchmark = new LatencyBenchmark(client, {
        baseTime: startTime,
        iterations: 3
      });

      await benchmark.runBenchmark();

      console.log('');
      console.log('FULL DEMO COMPLETE!');
      console.log('');
      console.log('Next steps:');
      console.log('   - Check ClickHouse for stored data');
      console.log('   - Try different query time ranges');
      console.log('   - Experiment with batch sizes and acceleration');

    } catch (error: any) {
      console.error('Demo failed:', error.message);
      process.exit(1);
    }
  });

// Subscribe to real-time measurements using polling
program
  .command('subscribe-polling')
  .description('Subscribe to real-time measurements using polling (works with ClickHouse)')
  .option('-u, --url <url>', 'Kvasir URL (for WebSocket, will be converted)', 'http://localhost:8080')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('-s, --sensor-id <id>', 'Specific sensor ID to subscribe to (optional)')
  .option('-i, --interval <ms>', 'Polling interval in milliseconds', '1000')
  .option('-w, --window <seconds>', 'Lookback window in seconds', '10')
  .option('-c, --clickhouse-url <url>', 'ClickHouse URL', 'http://localhost:8123')
  .option('-d, --database-id <id>', 'ClickHouse database ID', 'c2d7dd29a08e40f4')
  .action(async (options) => {
    console.log('KVASIR POLLING SUBSCRIPTION');
    console.log('===========================');
    console.log(`Kvasir URL: ${options.url}`);
    console.log(`Pod: ${options.pod}`);
    console.log(`ClickHouse URL: ${options.clickhouseUrl}`);
    console.log(`Database ID: ${options.databaseId}`);
    console.log(`Polling Interval: ${options.interval}ms`);
    console.log(`Lookback Window: ${options.window}s`);

    if (options.sensorId) {
      console.log(`Subscribing to measurements from sensor: ${options.sensorId}`);
    } else {
      console.log('Subscribing to ALL measurements');
    }
    console.log('');

    const client = new KvasirClient(options.url, options.pod);

    let measurementCount = 0;
    let startTime = Date.now();

    const subscriptionConfig = {
      pollingInterval: parseInt(options.interval),
      lookbackWindow: parseInt(options.window),
      clickhouseUrl: options.clickhouseUrl,
      databaseId: options.databaseId,
      sensorId: options.sensorId
    };

    let subscription: any;

    if (options.sensorId) {
      console.log(`Starting polling subscription for sensor: ${options.sensorId}`);
      subscription = client.subscribeToMeasurementsPolling(
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Sensor ${measurement.sensorId}: ${measurement.value} at ${measurement.timestamp}`);
        },
        subscriptionConfig
      );
    } else {
      console.log('Starting polling subscription for ALL measurements...');
      subscription = client.subscribeToAllMeasurementsPolling(
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Sensor ${measurement.sensorId}: ${measurement.value} at ${measurement.timestamp}`);
        },
        subscriptionConfig
      );
    }

    // Set up event handlers
    subscription.onError((error: Error) => {
      console.error('Polling subscription error:', error.message);
    });

    subscription.onReconnect(() => {
      console.log('Polling subscription reconnected');
    });

    subscription.onDisconnect(() => {
      console.log('Polling subscription disconnected');
    });

    console.log('Polling subscription active. Press Ctrl+C to stop...');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('');
      console.log('Stopping polling subscription...');
      subscription.unsubscribe();
      console.log(`Total measurements received: ${measurementCount}`);
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {}); // Never resolves
  });

// Subscribe to real-time measurements using Server-Sent Events (SSE)
program
  .command('subscribe-sse')
  .description('Subscribe to real-time measurements using Server-Sent Events (SSE)')
  .option('-u, --url <url>', 'Kvasir URL', 'http://localhost:8080')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('-s, --sensor-id <id>', 'Specific sensor ID to subscribe to (optional)')
  .option('-r, --reconnect-attempts <count>', 'Number of reconnection attempts', '5')
  .option('-i, --reconnect-interval <ms>', 'Reconnection interval in milliseconds', '3000')
  .action(async (options) => {
    console.log('KVASIR SSE SUBSCRIPTION');
    console.log('=======================');
    console.log(`Kvasir URL: ${options.url}`);
    console.log(`Pod: ${options.pod}`);

    if (options.sensorId) {
      console.log(`Subscribing to measurements from sensor: ${options.sensorId}`);
    } else {
      console.log('Subscribing to ALL measurements');
    }
    console.log('');

    const client = new KvasirClient(options.url, options.pod);

    let measurementCount = 0;
    let changeCount = 0;
    const startTime = Date.now();

    const subscriptionConfig = {
      reconnectAttempts: parseInt(options.reconnectAttempts),
      reconnectInterval: parseInt(options.reconnectInterval)
    };

    let subscription: any;

    if (options.sensorId) {
      console.log(`Starting SSE subscription for sensor: ${options.sensorId}`);
      subscription = client.subscribeToMeasurementsSSE(
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Measurement #${measurementCount}:`);
          console.log(`  Sensor: ${measurement.sensorId || 'Unknown'}`);
          console.log(`  Value: ${measurement.value}`);
          console.log(`  Timestamp: ${measurement.timestamp}`);
          console.log(`  Property: ${measurement.propertyType || 'Unknown'}`);
          console.log('');
        },
        { ...subscriptionConfig, sensorId: options.sensorId }
      );
    } else {
      console.log('Starting SSE subscription for ALL measurements...');
      subscription = client.subscribeToAllMeasurementsSSE(
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Measurement #${measurementCount}:`);
          console.log(`  Sensor: ${measurement.sensorId || 'Unknown'}`);
          console.log(`  Value: ${measurement.value}`);
          console.log(`  Timestamp: ${measurement.timestamp}`);
          console.log(`  Property: ${measurement.propertyType || 'Unknown'}`);
          console.log('');
        },
        subscriptionConfig
      );
    }

    // Also subscribe to raw changes for debugging
    const changesSubscription = client.subscribeToChangesSSE(
      (change) => {
        changeCount++;
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[${elapsed.toFixed(1)}s] Raw Change #${changeCount}:`);
        console.log(`  Change ID: ${change['@id']}`);
        console.log(`  Timestamp: ${change['https://kvasir.discover.ilabt.imec.be/vocab#timestamp']}`);
        if (change.insert && change.insert.length > 0) {
          console.log(`  Inserts: ${change.insert.length} items`);
        }
        if (change.delete && change.delete.length > 0) {
          console.log(`  Deletes: ${change.delete.length} items`);
        }
        console.log('');
      },
      subscriptionConfig
    );

    // Set up event handlers
    subscription.onError((error: Error) => {
      console.error('SSE subscription error:', error.message);
    });

    subscription.onReconnect(() => {
      console.log('SSE subscription reconnected');
    });

    subscription.onDisconnect(() => {
      console.log('SSE subscription disconnected');
    });

    changesSubscription.onError((error: Error) => {
      console.error('Changes SSE subscription error:', error.message);
    });

    console.log('SSE subscriptions active. Press Ctrl+C to stop...');
    console.log('Note: This will show both raw changes and converted measurements');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('');
      console.log('Stopping SSE subscriptions...');
      subscription.unsubscribe();
      changesSubscription.unsubscribe();
      console.log(`Total measurements received: ${measurementCount}`);
      console.log(`Total changes received: ${changeCount}`);
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {}); // Never resolves
  });

// Subscribe to real-time measurements
program
  .command('subscribe')
  .description('Subscribe to real-time measurements via GraphQL')
  .option('-u, --url <url>', 'Kvasir GraphQL WebSocket URL', 'ws://localhost:8080/graphql')
  .option('-p, --pod <name>', 'Pod name', 'alice')
  .option('--sensor-id <id>', 'Specific sensor ID to subscribe to (optional)')
  .option('--reconnect-attempts <number>', 'Number of reconnection attempts', '5')
  .option('--reconnect-interval <ms>', 'Reconnection interval in ms', '3000')
  .action(async (options) => {
    console.log('KVASIR REAL-TIME MEASUREMENT SUBSCRIPTION');
    console.log('========================================');
    console.log(`WebSocket URL: ${options.url}`);
    console.log(`Pod: ${options.pod}`);

    if (options.sensorId) {
      console.log(`Sensor ID: ${options.sensorId}`);
    } else {
      console.log('Subscribing to ALL measurements');
    }
    console.log('');

    const client = new KvasirClient(options.url.replace(/^ws/, 'http'), options.pod);

    let measurementCount = 0;
    let startTime = Date.now();

    const subscriptionConfig = {
      reconnectAttempts: parseInt(options.reconnectAttempts),
      reconnectInterval: parseInt(options.reconnectInterval)
    };

    let subscription: any;

    if (options.sensorId) {
      console.log(`Subscribing to measurements from sensor: ${options.sensorId}`);
      subscription = client.subscribeToMeasurements(
        options.sensorId,
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Sensor ${measurement.sensorId}: ${measurement.value} at ${measurement.timestamp}`);
        },
        subscriptionConfig
      );
    } else {
      console.log('Subscribing to ALL measurements...');
      subscription = client.subscribeToAllMeasurements(
        (measurement) => {
          measurementCount++;
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`[${elapsed.toFixed(1)}s] Sensor ${measurement.sensorId}: ${measurement.value} at ${measurement.timestamp}`);
        },
        subscriptionConfig
      );
    }

    // Set up event handlers
    subscription.onError((error: Error) => {
      console.error('Subscription error:', error.message);
    });

    subscription.onReconnect(() => {
      console.log('Reconnected to subscription');
    });

    subscription.onDisconnect(() => {
      console.log('Subscription disconnected');
    });

    console.log('Subscription active. Press Ctrl+C to stop...');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('');
      console.log('Stopping subscription...');
      subscription.unsubscribe();
      console.log(`Total measurements received: ${measurementCount}`);
      process.exit(0);
    });

    // Keep the process running
    await new Promise(() => {}); // Never resolves
  });

// Parse command line arguments
if (require.main === module) {
  program.parse();
}