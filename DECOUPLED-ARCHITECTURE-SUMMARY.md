# Summary: Decoupled Real-Time Architecture

## What Changed?

Previously, the latency benchmark generated events and subscribed to them **in the same process**. This created artificial "batching" behavior where events were generated in loops and immediately measured.

## New Architecture

We've split the system into **two independent scripts**:

### 1. **Producer** (`realtime-event-producer.ts`)
- Simulates real IoT sensors
- Writes **one event at a time** (no batching)
- Configurable frequency (Hz)
- Can run independently

### 2. **Subscriber** (`realtime-sse-subscriber.ts`)
- Subscribes to SSE events
- Measures **true end-to-end latency**
- Reports statistics periodically
- Can run on different machines

## Why This Matters

### Benefits
- **Realistic latency**: Measures real network + processing time
- **Scalability**: Run multiple producers/subscribers independently
- **Distribution**: Test across networks/machines
- **Production-like**: Mirrors real IoT deployments
- **No artificial batching**: Each event written individually

### Use Cases
1. **Load testing**: Multiple producers at different frequencies
2. **Network latency**: Producer and subscriber on different machines
3. **Tail latency analysis**: Real p95/p99 measurements
4. **Continuous monitoring**: Long-running latency tracking

## Quick Start

### Simple Demo (30 seconds)
```bash
# Terminal 1: Start producer (5 events/sec)
npm run example:producer -- -f 5 -s 3 -d 30

# Terminal 2: Monitor latency
npm run example:subscriber -- -d 30 -r 5
```

### Or use the demo script
```bash
./demo-realtime.sh
```

## Example Output

### Producer
```
Starting Realtime Event Producer
Kvasir URL: http://localhost:8080
Sensors: Sensor1, Sensor2, Sensor3
Frequency: 5 Hz (200ms interval)

Generated 10 events (5.02 events/sec)
Generated 20 events (5.01 events/sec)
```

### Subscriber
```
Starting Realtime SSE Subscriber
Kvasir URL: http://localhost:8080
Listening to: ALL sensors

=== Latency Report ===
  Events received: 253
  Event rate: 5.02 events/sec
  Latency (avg): 48.73ms
  Latency (p50): 42.30ms
  Latency (p95): 87.12ms
  Latency (p99): 145.89ms
  Tail ratio (p99/p50): 3.45x
========================
```

## Documentation

- 📚 **[Full Guide](./examples/REALTIME-GUIDE.md)**: Detailed usage and examples
- 🏗️ **[Architecture Comparison](./ARCHITECTURE.md)**: Old vs new design
- 📖 **[Main README](./README.md)**: Updated with new scripts

## Scripts Added

```json
{
  "example:producer": "ts-node examples/realtime-event-producer.ts",
  "example:subscriber": "ts-node examples/realtime-sse-subscriber.ts"
}
```

## Files Created

1. `examples/realtime-event-producer.ts` - Event generator
2. `examples/realtime-sse-subscriber.ts` - SSE latency monitor
3. `examples/REALTIME-GUIDE.md` - Complete documentation
4. `ARCHITECTURE.md` - Architecture comparison
5. `demo-realtime.sh` - Quick demo script

## Comparison

| Old (Batched) | New (Decoupled) |
|---------------|-----------------|
| Single process | Separate processes |
| Artificial batching | Individual events |
| Self-measurement | Real latency |
| Not scalable | Fully scalable |
| Production testing | Production testing |

## Next Steps

1. **Try the demo**: Run `./demo-realtime.sh`
2. **Read the guide**: Open `examples/REALTIME-GUIDE.md`
3. **Test load**: Run multiple producers simultaneously
4. **Monitor production**: Use subscriber for continuous monitoring

## Key Insight

> "The old architecture measured how fast we could generate and consume our own events. The new architecture measures how fast Kvasir can process events from independent producers - which is what matters in production."

---

Built to simulate real-world IoT deployments
