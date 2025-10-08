#!/usr/bin/env ts-node

/**
 * Server-Sent Events (SSE) Subscription Example
 *
 * This example demonstrates how to use the SSE-based subscription
 * that connects to Kvasir's real-time change stream instead of polling.
 */

import { KvasirClient } from '../src';

async function main() {
  console.log('KVASIR SSE SUBSCRIPTION EXAMPLE');
  console.log('===============================');
  console.log('');

  const client = new KvasirClient('http://localhost:8080', 'alice');

  console.log('Starting SSE subscription for all measurements...');
  console.log('This connects to Kvasir\'s real-time change stream');
  console.log('Press Ctrl+C to stop');
  console.log('');

  let measurementCount = 0;
  let changeCount = 0;
  const startTime = Date.now();

  // Subscribe to measurements (filtered from changes)
  const measurementSubscription = client.subscribeToAllMeasurementsSSE(
    (measurement) => {
      measurementCount++;
      const elapsed = (Date.now() - startTime) / 1000;

      console.log(`[${elapsed.toFixed(1)}s] Measurement #${measurementCount}:`);
      console.log(`  ID: ${measurement.id}`);
      console.log(`  Sensor: ${measurement.sensorId || 'Unknown'}`);
      console.log(`  Value: ${measurement.value}`);
      console.log(`  Timestamp: ${measurement.timestamp}`);
      console.log(`  Property: ${measurement.propertyType || 'Unknown'}`);
      console.log('');
    }
  );

  // Also subscribe to raw changes for debugging
  const changesSubscription = client.subscribeToChangesSSE(
    (change) => {
      changeCount++;
      const elapsed = (Date.now() - startTime) / 1000;

      console.log(`[${elapsed.toFixed(1)}s] Raw Change #${changeCount}:`);
      console.log(`  Change ID: ${change['@id']}`);
      console.log(`  Timestamp: ${change['https://kvasir.discover.ilabt.imec.be/vocab#timestamp']}`);
      console.log(`  Raw data:`, JSON.stringify(change, null, 2).substring(0, 300) + '...');

      if (change.insert && Array.isArray(change.insert)) {
        console.log(`  Inserted ${change.insert.length} items`);
        // Show a sample of what's being inserted
        if (change.insert.length > 0) {
          const sample = change.insert[0];
          console.log(`  Sample insert: ${JSON.stringify(sample, null, 2).substring(0, 200)}...`);
        }
      }

      if (change.delete && Array.isArray(change.delete)) {
        console.log(`  Deleted ${change.delete.length} items`);
      }
      console.log('');
    }
  );

  // Handle errors
  measurementSubscription.onError((error) => {
    console.error('Measurement subscription error:', error.message);
  });

  changesSubscription.onError((error) => {
    console.error('Changes subscription error:', error.message);
  });

  measurementSubscription.onReconnect(() => {
    console.log('Measurement subscription reconnected');
  });

  changesSubscription.onReconnect(() => {
    console.log('Changes subscription reconnected');
  });

  measurementSubscription.onDisconnect(() => {
    console.log('Measurement subscription disconnected');
  });

  changesSubscription.onDisconnect(() => {
    console.log('Changes subscription disconnected');
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('Stopping SSE subscriptions...');
    measurementSubscription.unsubscribe();
    changesSubscription.unsubscribe();
    console.log(`Total measurements received: ${measurementCount}`);
    console.log(`Total changes received: ${changeCount}`);
    process.exit(0);
  });

  // Auto-stop after receiving 3 changes for debugging
  const autoStopTimer = setTimeout(() => {
    console.log('\nAuto-stopping after receiving changes...');
    measurementSubscription.unsubscribe();
    changesSubscription.unsubscribe();
    process.exit(0);
  }, 15000); // 15 seconds
}

if (require.main === module) {
  main().catch(console.error);
}