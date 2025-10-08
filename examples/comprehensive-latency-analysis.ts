#!/usr/bin/env node

import { ComprehensiveLatencyBenchmark } from '../src/comprehensive-latency-benchmark';
import { KvasirClient } from '../src/kvasir-client';

async function main() {
  const client = new KvasirClient('http://localhost:8080');

  const benchmark = new ComprehensiveLatencyBenchmark(client, {
    sensorIds: ['TemperatureSensor1', 'HumiditySensor1', 'PressureSensor1', 'LightSensor1', 'CO2Sensor1'],
    testDuration: 30, // 30 seconds for demo
    eventInterval: 500, // 500ms between events
    maxLatencySamples: 200
  });

  try {
    console.log('🔬 Running Comprehensive Latency Analysis...\n');

    const result = await benchmark.runComprehensiveBenchmark();

    console.log('\nAnalysis complete!');
    console.log(`Collected ${result.samples.length} detailed latency samples`);

    // Save results to file for further analysis
    const fs = require('fs');
    const outputFile = `./latency-analysis-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;

    fs.writeFileSync(outputFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      config: {
        sensorIds: ['TemperatureSensor1', 'HumiditySensor1', 'PressureSensor1', 'LightSensor1', 'CO2Sensor1'],
        testDuration: 30,
        eventInterval: 500,
        maxLatencySamples: 200
      },
      results: result
    }, null, 2));

    console.log(`💾 Results saved to: ${outputFile}`);

  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();