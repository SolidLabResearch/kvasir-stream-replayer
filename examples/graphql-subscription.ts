#!/usr/bin/env ts-node

/**
 * GraphQL Subscription Example
 *
 * This example demonstrates how to use the KvasirClient to subscribe
 * to real-time measurements via GraphQL subscriptions.
 */

import { KvasirClient, MeasurementSubscription } from '../src';

async function subscribeToSensor() {
  console.log('Subscribing to sensor measurements...');

  const client = new KvasirClient('http://localhost:8080', 'alice');

  // Subscribe to measurements from a specific sensor
  const subscription = client.subscribeToMeasurements('sensor-001', (measurement: MeasurementSubscription) => {
    console.log(`[${new Date().toISOString()}] Sensor ${measurement.sensorId}: ${measurement.value} (${measurement.propertyType})`);
  });

  // Set up event handlers
  subscription.onError((error) => {
    console.error('Subscription error:', error.message);
  });

  subscription.onReconnect(() => {
    console.log('Reconnected to subscription');
  });

  subscription.onDisconnect(() => {
    console.log('Subscription disconnected');
  });

  console.log('Subscription active. Press Ctrl+C to stop...');

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\nStopping subscription...');
    subscription.unsubscribe();
    process.exit(0);
  });
}

async function subscribeToAllSensors() {
  console.log('Subscribing to ALL sensor measurements...');

  const client = new KvasirClient('http://localhost:8080', 'alice');

  let measurementCount = 0;

  // Subscribe to all measurements
  const subscription = client.subscribeToAllMeasurements((measurement: MeasurementSubscription) => {
    measurementCount++;
    console.log(`[${measurementCount}] Sensor ${measurement.sensorId}: ${measurement.value} at ${measurement.timestamp}`);
  });

  subscription.onError((error) => {
    console.error('Subscription error:', error.message);
  });

  console.log('Subscription active. Press Ctrl+C to stop...');

  process.on('SIGINT', () => {
    console.log(`\nStopping subscription. Total measurements received: ${measurementCount}`);
    subscription.unsubscribe();
    process.exit(0);
  });
}

// Example usage
if (require.main === module) {
  const sensorId = process.argv[2];

  if (sensorId) {
    console.log(`Subscribing to sensor: ${sensorId}`);
    subscribeToSensor();
  } else {
    console.log('Subscribing to all sensors (no sensor ID provided)');
    subscribeToAllSensors();
  }
}