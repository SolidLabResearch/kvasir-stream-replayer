#!/usr/bin/env ts-node

/**
 * GraphQL Subscription Demo
 *
 * This script demonstrates the GraphQL subscription functionality
 * without requiring a live Kvasir server.
 */

import { KvasirClient, MeasurementSubscription } from '../src';

console.log('Kvasir GraphQL Subscription Demo');
console.log('=====================================\n');

// Create a client instance
const client = new KvasirClient('http://localhost:8080', 'alice');
console.log('✓ Created KvasirClient instance');

// Demonstrate the subscription methods exist
console.log('✓ subscribeToMeasurements method available:', typeof client.subscribeToMeasurements);
console.log('✓ subscribeToAllMeasurements method available:', typeof client.subscribeToAllMeasurements);

// Show what a subscription callback would look like
const mockMeasurement: MeasurementSubscription = {
  id: 'measurement-123',
  value: 25.5,
  timestamp: new Date().toISOString(),
  sensorId: 'sensor-001',
  propertyType: 'temperature',
  metadata: { unit: 'celsius' }
};

console.log('\nMock Measurement Data Structure:');
console.log(JSON.stringify(mockMeasurement, null, 2));

console.log('\n🔧 Subscription Configuration Options:');
console.log('- sensorId: Filter by specific sensor (optional)');
console.log('- reconnectAttempts: Auto-reconnection attempts (default: 5)');
console.log('- reconnectInterval: Time between reconnection attempts (default: 3000ms)');

console.log('\n📝 Example Usage:');

// Example 1: Subscribe to specific sensor
console.log('\n1. Subscribe to specific sensor:');
console.log(`const subscription = client.subscribeToMeasurements('sensor-001', (measurement) => {
  console.log(\`Sensor \${measurement.sensorId}: \${measurement.value} \${measurement.metadata?.unit}\`);
});`);

// Example 2: Subscribe to all sensors
console.log('\n2. Subscribe to all sensors:');
console.log(`const allSubscription = client.subscribeToAllMeasurements((measurement) => {
  console.log(\`[\${measurement.timestamp}] \${measurement.sensorId}: \${measurement.value}\`);
});`);

// Example 3: With custom configuration
console.log('\n3. With custom reconnection settings:');
console.log(`const subscription = client.subscribeToMeasurements('sensor-001', callback, {
  reconnectAttempts: 10,
  reconnectInterval: 5000
});`);

console.log('\n✨ GraphQL Subscription Features:');
console.log('• Real-time WebSocket connections');
console.log('• Automatic reconnection on disconnect');
console.log('• Sensor-specific filtering');
console.log('• TypeScript type safety');
console.log('• Error handling callbacks');
console.log('• Graceful cleanup with unsubscribe()');

console.log('\nCLI Usage:');
console.log('# Subscribe to all measurements');
console.log('npm run demo subscribe -- --url ws://localhost:8080/graphql --pod alice');
console.log('');
console.log('# Subscribe to specific sensor');
console.log('npm run demo subscribe -- --url ws://localhost:8080/graphql --pod alice --sensor-id sensor-001');

console.log('\nGraphQL subscription functionality is ready!');
console.log('Note: Requires a running Kvasir server with GraphQL WebSocket support');