import { KvasirClient } from './kvasir-client';
import { SSELatencyBenchmark } from './latency-benchmark-sse';

async function runMultipleBenchmarks(numRuns: number = 30) {
  console.log(`Running SSE Latency Benchmark ${numRuns} times`);
  console.log('=' .repeat(60));

  const client = new KvasirClient('http://localhost:8080');
  const latencies: number[] = [];

  for (let i = 1; i <= numRuns; i++) {
    console.log(`\nRun ${i}/${numRuns}`);

    try {
      const benchmark = new SSELatencyBenchmark(client, {
        sensorIds: ['TemperatureSensor1', 'HumiditySensor1', 'PressureSensor1'],
        testDuration: 10, // 10 seconds per run
        eventInterval: 2000, // 2 seconds between events
        maxLatencySamples: 100 // Collect up to 100 samples per run
      });

      const result = await benchmark.runBenchmark();
      const avgLatency = result.summary.averageLatency;

      console.log(`   Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`   Samples collected: ${result.summary.totalSamples}`);

      latencies.push(avgLatency);

      // Small delay between runs to avoid overwhelming the system
      if (i < numRuns) {
        console.log('   Waiting 2 seconds before next run...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`Run ${i} failed:`, error);
      // Continue with next run instead of stopping
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('STATISTICAL ANALYSIS');
  console.log('='.repeat(60));

  if (latencies.length === 0) {
    console.log('No successful runs to analyze');
    return;
  }

  // Calculate mean
  const mean = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

  // Calculate standard deviation
  const variance = latencies.reduce((sum, lat) => sum + Math.pow(lat - mean, 2), 0) / latencies.length;
  const stdDev = Math.sqrt(variance);

  // Calculate percentiles
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const median = sortedLatencies[Math.floor(sortedLatencies.length / 2)];
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  console.log(`Total runs: ${numRuns}`);
  console.log(`Successful runs: ${latencies.length}`);
  console.log(`Success rate: ${((latencies.length / numRuns) * 100).toFixed(1)}%`);
  console.log('');
  console.log('Latency Statistics (milliseconds):');
  console.log(`  Mean: ${mean.toFixed(2)}ms`);
  console.log(`  Standard Deviation: ${stdDev.toFixed(2)}ms`);
  console.log(`  Median: ${median.toFixed(2)}ms`);
  console.log(`  95th Percentile: ${p95.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log('');
  console.log('Coefficient of Variation: ' + ((stdDev / mean) * 100).toFixed(2) + '%');

  // Show distribution
  console.log('\nDistribution:');
  const bins = [0, 50, 100, 150, 200, 300, 500, 1000, Infinity];
  const binLabels = ['<50ms', '50-100ms', '100-150ms', '150-200ms', '200-300ms', '300-500ms', '500-1000ms', '>1000ms'];

  for (let i = 0; i < bins.length - 1; i++) {
    const count = latencies.filter(lat => lat >= bins[i] && lat < bins[i + 1]).length;
    const percentage = ((count / latencies.length) * 100).toFixed(1);
    console.log(`  ${binLabels[i].padEnd(12)}: ${count.toString().padStart(3)} runs (${percentage}%)`);
  }

  return {
    latencies,
    statistics: {
      mean,
      stdDev,
      median,
      p95,
      min,
      max,
      totalRuns: numRuns,
      successfulRuns: latencies.length
    }
  };
}

// CLI runner
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Multiple SSE Latency Benchmark Runner

Usage: ts-node src/run-multiple-benchmarks.ts [options]

Options:
  --runs <number>     Number of benchmark runs (default: 30)
  --help, -h          Show this help

Example:
  ts-node src/run-multiple-benchmarks.ts --runs 50
`);
    return;
  }

  const runsIndex = args.indexOf('--runs');
  const runsArg = runsIndex !== -1 && args[runsIndex + 1] ? args[runsIndex + 1] : '30';
  const numRuns = parseInt(runsArg);

  if (isNaN(numRuns) || numRuns <= 0) {
    console.error('Invalid number of runs. Must be a positive integer.');
    process.exit(1);
  }

  try {
    await runMultipleBenchmarks(numRuns);
  } catch (error) {
    console.error('Benchmark runner failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export default runMultipleBenchmarks;