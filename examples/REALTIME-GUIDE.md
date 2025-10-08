# Real-Time Event Producer & SSE Subscriber

This directory contains **decoupled** producer and subscriber scripts that simulate real-world IoT scenarios.

## Architecture

### Why Separate Scripts?

Previously, the benchmark scripts generated events AND subscribed to them in the same process. This created artificial "batching" behavior and didn't reflect real-world scenarios.

**Now we have:**
- **Producer** (`realtime-event-producer.ts`): Simulates an IoT sensor continuously generating events
- **Subscriber** (`realtime-sse-subscriber.ts`): Independently subscribes to SSE and measures real latency

This separation allows you to:
- Measure **real-world latency** (not self-generated events)
- Test **distributed systems** (producer on one machine, subscriber on another)
- Simulate **multiple producers** and subscribers independently
- Benchmark **network latency** and **Kvasir throughput** realistically

---

## 📡 Realtime Event Producer

Continuously generates IoT sensor events and writes them to Kvasir **one at a time** (no batching).

### Usage

```bash
# Generate 1 event per second from 3 sensors (default)
npm run example:producer

# Generate 5 events per second from 10 sensors
npm run example:producer -- -f 5 -s 10

# High-frequency: 100 events/sec for 60 seconds
npm run example:producer -- -f 100 -s 10 -d 60

# Custom Kvasir URL
npm run example:producer -- -f 10 -u http://kvasir.example.com:8080
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-f, --frequency <hz>` | Events per second | 1 |
| `-s, --sensors <count>` | Number of sensors | 3 |
| `-d, --duration <sec>` | Duration in seconds | ∞ |
| `-u, --url <url>` | Kvasir server URL | `http://localhost:8080` |
| `-h, --help` | Show help | |

### Example Output

```
Starting Realtime Event Producer
Kvasir URL: http://localhost:8080
Sensors: Sensor1, Sensor2, Sensor3
Frequency: 5 Hz (200ms interval)
Duration: Infinite (press Ctrl+C to stop)

Generated 10 events (5.02 events/sec)
Generated 20 events (5.01 events/sec)
Generated 30 events (4.99 events/sec)
```

---

## 📨 Realtime SSE Subscriber

Subscribes to Kvasir SSE events and measures **real-time latency** from event generation to receipt.

### Usage

```bash
# Subscribe and report every 10 seconds (default)
npm run example:subscriber

# Subscribe for 60 seconds with 5-second reports
npm run example:subscriber -- -d 60 -r 5

# Filter events for a specific sensor
npm run example:subscriber -- -s Sensor1

# Custom Kvasir URL
npm run example:subscriber -- -u http://kvasir.example.com:8080
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --duration <sec>` | Duration in seconds | ∞ |
| `-r, --report-interval <s>` | Report stats every N seconds | 10 |
| `-s, --sensor <id>` | Filter for specific sensor | All |
| `-u, --url <url>` | Kvasir server URL | `http://localhost:8080` |
| `-h, --help` | Show help | |

### Example Output

```
📡 Starting Realtime SSE Subscriber
🔗 Kvasir URL: http://localhost:8080
Listening to: ALL sensors
⏰ Duration: Infinite (press Ctrl+C to stop)
Report interval: 10s

📨 Event #100: Sensor2 (45.32ms latency)
📨 Event #200: Sensor1 (52.18ms latency)

=== Latency Report ===
  Events received: 253
  Event rate: 5.02 events/sec
  Latency (avg): 48.73ms
  Latency (min): 12.45ms
  Latency (max): 234.67ms
  Latency (p50): 42.30ms
  Latency (p95): 87.12ms
  Latency (p99): 145.89ms
  Tail ratio (p99/p50): 3.45x
========================
```

---

## Quick Start: Full Demo

Run both scripts in separate terminals for a complete real-time demo:

### Terminal 1: Start Producer
```bash
npm run example:producer -- -f 5 -s 5 -d 120
```

### Terminal 2: Start Subscriber
```bash
npm run example:subscriber -- -r 10 -d 120
```

This simulates:
- **5 sensors** generating **5 events/sec** (25 events/sec total)
- **Real-time SSE subscription** measuring latency
- **10-second reporting intervals** for both
- **2-minute test duration**

---

## Use Cases

### 1. **Latency Benchmarking**
Test Kvasir's end-to-end latency under realistic load:
```bash
# Terminal 1: High-frequency producer
npm run example:producer -- -f 100 -s 10

# Terminal 2: Monitor latency
npm run example:subscriber -- -r 5
```

### 2. **Load Testing**
Stress-test Kvasir with multiple producers:
```bash
# Terminal 1-5: Run 5 producers at 20 Hz each
npm run example:producer -- -f 20 -s 5

# Terminal 6: Monitor aggregate latency
npm run example:subscriber
```

### 3. **Network Latency Testing**
Run producer and subscriber on different machines:
```bash
# Machine 1 (Producer)
npm run example:producer -- -f 10 -u http://kvasir-prod:8080

# Machine 2 (Subscriber)
npm run example:subscriber -- -u http://kvasir-prod:8080
```

### 4. **Sensor-Specific Monitoring**
Monitor a single sensor's latency:
```bash
# Terminal 1: Generate events
npm run example:producer -- -f 10 -s 5

# Terminal 2: Monitor only Sensor1
npm run example:subscriber -- -s Sensor1 -r 5
```

---

## 🆚 Comparison with Old Architecture

| Aspect | Old (Batched) | New (Decoupled) |
|--------|--------------|-----------------|
| **Event Generation** | Same process as subscription | Separate producer script |
| **Latency Measurement** | Self-generated events | Real SSE latency |
| **Scalability** | Single process | Multiple producers/subscribers |
| **Real-world Accuracy** | Artificial | Realistic |
| **Distributed Testing** | Not possible | Fully supported |
| **Batching** | Implicit batching | One event at a time |

---

## Tips

1. **Start small**: Begin with low frequencies (1-5 Hz) and increase gradually
2. **Monitor system load**: High-frequency producers can saturate CPU/network
3. **Use duration limits**: Set `-d` to avoid accidentally running indefinitely
4. **Check Kvasir logs**: Verify events are being written successfully
5. **Network testing**: Run producer/subscriber on different machines for realistic network latency

---

## 🔧 Advanced Configuration

### Multiple Producers (Load Testing)

Create a script to launch multiple producers:

```bash
#!/bin/bash
# launch-producers.sh

for i in {1..5}; do
  npm run example:producer -- -f 20 -s 10 &
done

echo "Launched 5 producers (100 Hz total)"
wait
```

### Prometheus Metrics Integration

Extend the subscriber to export metrics:

```typescript
// Add to realtime-sse-subscriber.ts
import { register, Counter, Histogram } from 'prom-client';

const latencyHistogram = new Histogram({
  name: 'sse_latency_seconds',
  help: 'SSE event latency',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
```

---

## 📝 Notes

- Producer uses `insertBatch([event])` with a single event (no actual batching)
- Subscriber measures time from event generation timestamp to SSE receipt
- Both scripts support graceful shutdown with Ctrl+C
- Latency includes: network time + Kvasir processing + SSE propagation
- Cold starts may cause initial latency spikes

---

## 🐛 Troubleshooting

### Producer not generating events
- Check Kvasir is running: `curl http://localhost:8080/health`
- Verify network connectivity
- Check for errors in producer logs

### Subscriber not receiving events
- Ensure producer is running first
- Verify SSE endpoint is accessible: `curl http://localhost:8080/alice/events/changes?receiveBacklog=true`
- Check for firewall blocking SSE connections

### High latency spikes
- Normal for first few events (cold start)
- Check system load (CPU/memory)
- Verify network is stable
- Reduce producer frequency if saturated

---

Built with ❤️ for real-time IoT monitoring
