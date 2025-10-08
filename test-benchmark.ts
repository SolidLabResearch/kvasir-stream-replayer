import { KvasirClient } from './src/kvasir-client';
import { SSELatencyBenchmark } from './src/latency-benchmark-sse';

async function test() {
  console.log('🔧 TEST STARTING...');
  console.log('Creating client...');
  const client = new KvasirClient('http://localhost:8080');
  console.log('Client created');
  console.log('Creating benchmark...');
  const benchmark = new SSELatencyBenchmark(client, {
    sensorIds: ['TemperatureSensor1'],
    testDuration: 2,
    eventInterval: 1000,
    maxLatencySamples: 5
  });
  console.log('Benchmark created');
  console.log('About to call runBenchmark...');
  try {
    const result = await benchmark.runBenchmark();
    console.log('Benchmark completed successfully!');
    console.log('Samples collected:', result.summary.totalSamples);
  } catch (error) {
    console.error('Benchmark failed:', error);
  }
}

test();