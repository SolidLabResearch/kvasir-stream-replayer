#!/usr/bin/env ts-node

/**
 * Simple SSE Test
 * This script simultaneously listens for SSE events and inserts data to test if Kvasir SSE is working
 */

import { KvasirClient } from './src/kvasir-client';

async function testSSESimple() {
  console.log('🧪 Simple SSE Test');
  console.log('==================');
  
  const client = new KvasirClient('http://localhost:8080', 'alice');
  
  let changeCount = 0;
  let measurementCount = 0;

  // Start listening for raw changes
  console.log('📡 Starting SSE subscription for changes...');
  const changesSubscription = client.subscribeToChangesSSE(
    (change) => {
      changeCount++;
      console.log(`\n🔔 CHANGE EVENT #${changeCount}:`);
      console.log('Raw change data:', JSON.stringify(change, null, 2));
      console.log('---');
    },
    {
      reconnectAttempts: 3,
      reconnectInterval: 2000
    }
  );

  // Also listen for measurements  
  console.log('📡 Starting SSE subscription for measurements...');
  const measurementSubscription = client.subscribeToAllMeasurementsSSE(
    (measurement) => {
      measurementCount++;
      console.log(`\nMEASUREMENT EVENT #${measurementCount}:`);
      console.log('Measurement data:', measurement);
      console.log('---');
    },
    {
      reconnectAttempts: 3,
      reconnectInterval: 2000
    }
  );

  // Wait a bit for connections to establish
  console.log('⏳ Waiting 3 seconds for SSE connections to establish...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Insert some test data
  console.log('\n📤 Inserting test data...');
  for (let i = 1; i <= 3; i++) {
    const timestamp = new Date();
    const dataPoint = {
      id: `test-measurement-${i}-${timestamp.getTime()}`,
      timestamp: timestamp,
      value: Math.random() * 100,
      valueType: 'number',
      sensorId: `test-sensor-${i}`,
      propertyType: 'test-measurement'
    };

    try {
      console.log(`🔄 Inserting data point ${i}:`, dataPoint);
      const result = await client.insertBatch([dataPoint]);
      console.log(`Insert ${i} result:`, result);
    } catch (error) {
      console.error(`Insert ${i} failed:`, error);
    }

    // Wait between inserts
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Wait to see if any events are received
  console.log('\n⏳ Waiting 10 seconds to see if any SSE events are received...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('\nFinal Results:');
  console.log(`Change events received: ${changeCount}`);
  console.log(`Measurement events received: ${measurementCount}`);

  if (changeCount === 0 && measurementCount === 0) {
    console.log('No SSE events were received despite successful data insertion');
    console.log('   This suggests the Kvasir SSE endpoint is not broadcasting changes');
  } else {
    console.log('SSE events were received! The endpoint is working.');
  }

  // Cleanup
  changesSubscription.unsubscribe();
  measurementSubscription.unsubscribe();
  
  console.log('\n🏁 Test completed');
}

testSSESimple().catch(console.error);