#!/usr/bin/env ts-node

/**
 * Polling Subscription Example
 *
 * This example demonstrates how to use the polling-based subscription
 * that works with the existing ClickHouse API instead of requiring
 * GraphQL WebSocket endpoints.
 */

import { KvasirClient } from '../src';

async function main() {
  console.log('KVASIR POLLING SUBSCRIPTION EXAMPLE');
  console.log('====================================');
  console.log('');

  const client = new KvasirClient('http://localhost:8080', 'alice');

  console.log('Starting polling subscription for all measurements...');
  console.log('This will poll ClickHouse every 2 seconds for new data');
  console.log('Press Ctrl+C to stop');
  console.log('');

  let measurementCount = 0;
  const startTime = Date.now();

    // Subscribe to all measurements using polling
  const subscription = client.subscribeToAllMeasurementsPolling(
    (measurement) => {
      measurementCount++;
      const elapsed = (Date.now() - startTime) / 1000;

      console.log(`[${elapsed.toFixed(1)}s] Measurement #${measurementCount}:`);
      console.log(`  Sensor: ${measurement.sensorId || 'Unknown'}`);
      console.log(`  Value: ${measurement.value}`);
      console.log(`  Timestamp: ${measurement.timestamp}`);
      console.log(`  Property: ${measurement.propertyType || 'Unknown'}`);
      if (measurement.metadata && Object.keys(measurement.metadata).length > 0) {
        console.log(`  Metadata: ${JSON.stringify(measurement.metadata, null, 2)}`);
      }
      console.log('');
    },
    {
      pollingInterval: 2000, // Poll every 2 seconds
      lookbackWindow: 5,     // Look back 5 seconds for new data
      clickhouseUrl: 'http://localhost:8123',
      databaseId: 'c2d7dd29a08e40f4',
      initialTimestamp: new Date(Date.now() - 5 * 60 * 1000) // Start from 5 minutes ago to catch existing data
    }
  );

  // Handle errors
  subscription.onError((error) => {
    console.error('Subscription error:', error.message);
  });

  subscription.onReconnect(() => {
    console.log('Subscription reconnected');
  });

  subscription.onDisconnect(() => {
    console.log('Subscription disconnected');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('Stopping subscription...');
    subscription.unsubscribe();
    console.log(`Total measurements received: ${measurementCount}`);
    process.exit(0);
  });

  // Keep the process running for 10 seconds then exit
  setTimeout(() => {
    console.log('\nAuto-stopping after 10 seconds...');
    subscription.unsubscribe();
    process.exit(0);
  }, 10000);

  // Keep the process running
  await new Promise(() => {}); // Never resolves
}

if (require.main === module) {
  main().catch(console.error);
}