# Kvasir Stream Replayer

A TypeScript library for real-time streaming of RDF data from N-Triples (.nt) files into Kvasir timeseries storage.

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

## Architecture

The library consists of several key components:

- **NTGenerator**: Creates synthetic sensor data in N-Triples format
- **Replayer**: Multi-mode streaming engine (historical/frequency/bulk)
- **KvasirClient**: REST API client for Kvasir timeseries operations
- **LatencyBenchmark**: Measures query performance across different time windows

## Configuration

### Sensor Types Supported
- Temperature sensors (20-30°C range)
- Humidity sensors (50-80% range)  
- Pressure sensors (995-1015 hPa range)
- Light sensors (0-1000 lux range)

### Performance Guidelines
- **Real-time Frequency**: Up to 100Hz for single sensors, 10Hz for multiple sensors
- **Bulk Upload**: Batch sizes of 500-2000 events work best depending on network
- **Historical Replay**: Acceleration factors of 1x-100x depending on data density

## License

MIT