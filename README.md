# Kvasir Stream Replayer

A TypeScript library for real-time s### Polling-based Subscriptions (Works with ClickHouse - no GraphQL required)
```bash
# Subscribe to all measurements using polling
npm run demo subscribe-polling --interval 2000

# Subscribe to specific sensor using polling
npm run demo subscribe-polling --sensor-id sensor-001 --interval 1000

# Run the polling example
npm run example:polling
```

### Server-Sent Events Subscriptions (True real-time - requires Kvasir SSE endpoint)
```bash
# Subscribe to all measurements using SSE
npm run demo subscribe-sse

# Subscribe to specific sensor using SSE
npm run demo subscribe-sse --sensor-id sensor-001

# Run the SSE example
npm run example:sse
``` RDF data from N-Triples (.nt) files into Kvasir timeseries storage.

## Features

### Three Streaming Modes
1. **Historical Replay**: Replays data with original timestamps and configurable acceleration
2. **Real-time Frequency**: Streams data at precise intervals (e.g., 4Hz = every 250ms) starting from "now"
3. **Bulk Upload**: Uploads entire datasets in optimized batches for maximum throughput

### Core Capabilities
- **RDF N-Triples Support**: Parses SAREF ontology-compliant sensor data
- **Kvasir Integration**: Direct insertion into Kvasir timeseries database
- **Latency Benchmarking**: Measure query performance for time-range requests
- **TypeScript**: Full type safety and modern development experience
- **CLI Interface**: Command-line tools for generation, replay, and benchmarking

## Installation

```bash
npm install kvasir-stream-replayer
```

## Quick Start

### Generate Test Data
```bash
npm run demo generate -- --file ./test-data.nt --hours 1
```

### Historical Replay (Original timestamps with acceleration)
```bash
npm run demo replay -- --file ./test-data.nt --acceleration 10
```

### Real-time Frequency Streaming (Precise intervals starting now)
```bash
# Stream at 4Hz (every 250ms) for 30 seconds
npm run demo stream -- --file ./test-data.nt --frequency 4 --duration 30

# Or use the replay command with frequency option
npm run demo replay -- --file ./test-data.nt --frequency 4 --max-events 120
```

### Bulk Upload (Entire dataset uploaded in batches)
```bash
npm run demo bulk -- --file ./test-data.nt --batch-size 1000 --delay 100
```

### GraphQL Real-time Subscriptions (Subscribe to live measurements)
```bash
# Subscribe to all measurements
npm run demo subscribe -- --url ws://localhost:8080/graphql --pod alice

# Subscribe to specific sensor measurements
npm run demo subscribe -- --url ws://localhost:8080/graphql --pod alice --sensor-id sensor-001

# Run the example script
npm run example:subscription [sensor-id]
```

### Polling-based Subscriptions (Works with ClickHouse - no GraphQL required)
```bash
# Subscribe to all measurements using polling
npm run demo subscribe-polling -- --interval 2000 --window 10

# Subscribe to specific sensor using polling
npm run demo subscribe-polling -- --sensor-id sensor-001 --interval 1000

# Run the polling example
npm run example:polling
```

### Benchmark Query Latency
```bash
npm run demo benchmark -- --iterations 10
```

## Development

### Build
```bash
npm run build
```

### Lint
```bash
npm run lint
```

### Generate Documentation
```bash
npm run docs
```

### Run Tests
```bash
npm test
```

## Streaming Modes Explained

### Historical Replay Mode
- **Use Case**: Replaying historical sensor data maintaining original temporal relationships
- **Behavior**: Respects original timestamps, applies time acceleration factor
- **Example**: 1 hour of historical data replayed in 6 minutes (10x acceleration)
```bash
npm run demo replay -- --acceleration 10 --file historical-data.nt
```

### Real-time Frequency Mode  
- **Use Case**: Generating live sensor data streams at precise frequencies
- **Behavior**: Ignores historical timestamps, creates events at exact intervals from "now"
- **Example**: 4Hz stream means events every 250ms starting immediately
```bash
npm run demo stream -- --frequency 4 --duration 60 --file sensor-data.nt
```

### Bulk Upload Mode
- **Use Case**: Fast import of large datasets (hours/days of historical data)
- **Behavior**: Uploads data in large batches for maximum throughput
- **Example**: Upload 1 hour of 4Hz data (14,400 events) in 15 batches of 1000 events each
```bash
npm run demo bulk -- --batch-size 1000 --delay 100 --file large-dataset.nt
```

### GraphQL Subscription Mode
- **Use Case**: Real-time subscription to live sensor measurements
- **Behavior**: Connects via WebSocket to GraphQL endpoint for real-time event streaming
- **Features**: Automatic reconnection, sensor-specific filtering, error handling
- **Example**: Subscribe to all measurements or specific sensor data
```typescript
import { KvasirClient } from 'kvasir-stream-replayer';

// Subscribe to specific sensor
const client = new KvasirClient('http://localhost:8080', 'alice');
const subscription = client.subscribeToMeasurements('sensor-001', (measurement) => {
  console.log(`New measurement: ${measurement.value} at ${measurement.timestamp}`);
});

// Subscribe to all measurements
const allSubscription = client.subscribeToAllMeasurements((measurement) => {
  console.log(`Sensor ${measurement.sensorId}: ${measurement.value}`);
});

// Cleanup
subscription.unsubscribe();
allSubscription.unsubscribe();
```

### Polling Subscription Mode (Alternative)
- **Use Case**: Real-time subscription using existing ClickHouse API (works without GraphQL)
- **Behavior**: Periodically polls ClickHouse for new measurements since last check
- **Features**: Works with existing infrastructure, configurable polling interval, automatic timestamp tracking
- **Example**: Poll-based subscription that mimics real-time behavior
```bash
# Subscribe to all measurements using polling
npm run demo subscribe-polling --interval 2000

# Subscribe to specific sensor using polling
npm run demo subscribe-polling --sensor-id sensor-001 --interval 1000

# Run the polling example
npm run example:polling
```

### Server-Sent Events (SSE) Subscription Mode (Recommended)
- **Use Case**: True real-time subscription to Kvasir's change stream
- **Behavior**: Connects to Kvasir's SSE endpoint for instant change notifications
- **Features**: True real-time streaming, automatic reconnection, no polling overhead
- **Requirements**: Kvasir server with SSE endpoint enabled
- **Example**: SSE-based subscription for maximum real-time performance
```bash
# Subscribe to all measurements using SSE
npm run demo subscribe-sse

# Subscribe to specific sensor using SSE
npm run demo subscribe-sse --sensor-id sensor-001

# Run the SSE example
npm run example:sse
```
```typescript
import { KvasirClient } from 'kvasir-stream-replayer';

const client = new KvasirClient('http://localhost:8080', 'alice');

// Server-Sent Events subscription (true real-time)
const subscription = client.subscribeToAllMeasurementsSSE(
  (measurement) => {
    console.log(`Real-time measurement: ${measurement.value} at ${measurement.timestamp}`);
  }
);

// Raw changes subscription
const changesSubscription = client.subscribeToChangesSSE(
  (change) => {
    console.log(`Change detected: ${change['@id']}`);
    if (change.insert) {
      console.log(`Inserted ${change.insert.length} items`);
    }
  }
);

// Cleanup
subscription.unsubscribe();
changesSubscription.unsubscribe();
```

### SSE Latency Benchmarking (End-to-end performance measurement)
```bash
# Run SSE latency benchmark (default: 60s test, 3 sensors, 1s intervals)
npm run benchmark:sse-latency

# Custom benchmark configuration
npm run benchmark:sse-latency -- --duration 120 --interval 500 --sensors temp1,humidity1,pressure1

# Run with help
npm run benchmark:sse-latency -- --help
```
```typescript
import { KvasirClient } from 'kvasir-stream-replayer';
import { SSELatencyBenchmark } from './src/latency-benchmark-sse';

const client = new KvasirClient('http://localhost:8080', 'alice');
const benchmark = new SSELatencyBenchmark(client, {
  sensorIds: ['temperature-sensor', 'humidity-sensor'],
  testDuration: 60, // 60 seconds
  eventInterval: 1000, // Generate event every 1 second
  maxLatencySamples: 1000
});

const result = await benchmark.runBenchmark();
console.log('Average latency:', result.summary.averageLatency, 'ms');
console.log('95th percentile:', result.summary.p95Latency, 'ms');
```

### 🆕 Decoupled Real-Time Producer & Subscriber (Recommended for realistic testing)

**Why separate scripts?** Previous benchmarks generated events and subscribed in the same process, creating artificial "batching". The new architecture **decouples** event generation from subscription, simulating real-world IoT scenarios.

#### Real-Time Event Producer
Continuously generates events **one at a time** (no batching), simulating real IoT sensors:

```bash
# Generate 1 event per second from 3 sensors (default)
npm run example:producer

# Generate 5 events per second from 10 sensors
npm run example:producer -- -f 5 -s 10

# High-frequency: 100 events/sec for 60 seconds
npm run example:producer -- -f 100 -s 10 -d 60
```

#### Real-Time SSE Subscriber
Independently subscribes to SSE and measures **true end-to-end latency**:

```bash
# Subscribe and report every 10 seconds (default)
npm run example:subscriber

# Subscribe for 60 seconds with 5-second reports
npm run example:subscriber -- -d 60 -r 5

# Filter events for a specific sensor
npm run example:subscriber -- -s Sensor1
```

#### Full Demo (Run in separate terminals)
```bash
# Terminal 1: Start producer (5 sensors @ 5 Hz)
npm run example:producer -- -f 5 -s 5 -d 120

# Terminal 2: Start subscriber (10-second reports)
npm run example:subscriber -- -r 10 -d 120
```

**Output example:**
```
=== Latency Report ===
  Events received: 253
  Event rate: 5.02 events/sec
  Latency (avg): 48.73ms
  Latency (p95): 87.12ms
  Latency (p99): 145.89ms
  Tail ratio (p99/p50): 3.45x
========================
```

📚 **[Full Real-Time Producer/Subscriber Guide →](./examples/REALTIME-GUIDE.md)**

## Architecture

The library consists of several key components:

- **NTGenerator**: Creates synthetic sensor data in N-Triples format
- **Replayer**: Multi-mode streaming engine (historical/frequency/bulk)
- **KvasirClient**: REST API client for Kvasir timeseries operations + GraphQL subscriptions
- **LatencyBenchmark**: Measures query performance across different time windows
- **SSELatencyBenchmark**: Measures end-to-end latency from event generation to SSE reception


## License

This code is copyrighted by [Ghent University - imec](https://www.ugent.be/ea/idlab/en) and released under the [MIT Licence](./LICENCE) 

## Contact

For any questions, please contact [Kush](mailto:mailkushbisen@gmail.com) or create an issue in the repository.