# Architecture Comparison: Batched vs Decoupled

## Old Architecture (Batched - Single Process)

```
┌─────────────────────────────────────────────────────┐
│         Comprehensive Latency Benchmark             │
│                                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Event Generation Loop                       │  │
│  │  (generates events in intervals)             │  │
│  └──────────┬───────────────────────────────────┘  │
│             │                                        │
│             │ insertBatch([events])                 │
│             ▼                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │         Kvasir Client                        │  │
│  │         (writes to server)                   │  │
│  └──────────┬───────────────────────────────────┘  │
│             │                                        │
│  ┌──────────▼───────────────────────────────────┐  │
│  │         SSE Subscription                     │  │
│  │  (receives own events back)                  │  │
│  └──────────┬───────────────────────────────────┘  │
│             │                                        │
│             ▼                                        │
│  ┌──────────────────────────────────────────────┐  │
│  │    Latency Measurement                       │  │
│  │    (measures self-generated events)          │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
└─────────────────────────────────────────────────────┘

Problems:
  • Artificial "batching" due to tight loop
  • Can't measure real network latency
  • Single point of failure
  • Doesn't reflect real-world distributed systems
  • Can't scale producers/consumers independently
```

## New Architecture (Decoupled - Separate Processes)

```
┌─────────────────────────┐          ┌──────────────────────────┐
│   Event Producer        │          │    SSE Subscriber        │
│   (Sensor Simulator)    │          │   (Latency Monitor)      │
│                         │          │                          │
│  ┌──────────────────┐  │          │  ┌───────────────────┐  │
│  │ Generate Event   │  │          │  │  Subscribe SSE    │  │
│  │ (one at a time)  │  │          │  │  (all sensors)    │  │
│  └────────┬─────────┘  │          │  └────────┬──────────┘  │
│           │             │          │           │              │
│           │ write       │          │           │ listen       │
│           ▼             │          │           ▼              │
│  ┌──────────────────┐  │          │  ┌───────────────────┐  │
│  │ Kvasir Client    │  │          │  │ Kvasir Client     │  │
│  └────────┬─────────┘  │          │  └────────┬──────────┘  │
└───────────┼─────────────┘          └───────────┼─────────────┘
            │                                    │
            │                                    │
            ▼                                    ▼
      ┌─────────────────────────────────────────────┐
      │          Kvasir Server                      │
      │                                             │
      │  ┌────────────┐      ┌─────────────────┐  │
      │  │ REST API   │      │ SSE Endpoint    │  │
      │  │ (write)    │      │ (read/stream)   │  │
      │  └─────┬──────┘      └────────┬────────┘  │
      │        │                      │            │
      │        ▼                      ▼            │
      │  ┌──────────────────────────────────────┐ │
      │  │     Timeseries Storage               │ │
      │  │     (ClickHouse)                     │ │
      │  └──────────────────────────────────────┘ │
      └─────────────────────────────────────────────┘

Benefits:
  • True end-to-end latency measurement
  • Real network latency included
  • Independent scaling (N producers, M subscribers)
  • Simulates real-world IoT deployments
  • Can run on different machines/networks
  • No artificial batching
  • Each event written individually
```

## Event Flow Comparison

### Old (Batched)
```
Time  │ Producer                │ Subscriber
─────┼─────────────────────────┼────────────────────────
0ms   │ Generate Event 1-5      │ (waiting)
      │ insertBatch([1,2,3,4,5])│
100ms │ (waiting for batch)     │ Receive Events 1-5
      │                         │ Measure latency
200ms │ Generate Event 6-10     │ (waiting)
      │ insertBatch([6-10])     │
300ms │ (waiting)               │ Receive Events 6-10
      │                         │ Measure latency
```
Events are "batched" in tight loops
Latency includes batch processing overhead

### New (Decoupled)
```
Time  │ Producer (5 Hz)        │ Kvasir        │ Subscriber
─────┼────────────────────────┼───────────────┼─────────────────
0ms   │ Generate Event 1       │ Write Event 1 │ (listening...)
      │ insert([Event 1])      │               │
50ms  │                        │ Push SSE      │ Receive Event 1
      │                        │               │ Measure: 50ms
200ms │ Generate Event 2       │ Write Event 2 │
      │ insert([Event 2])      │               │
245ms │                        │ Push SSE      │ Receive Event 2
      │                        │               │ Measure: 45ms
400ms │ Generate Event 3       │ Write Event 3 │
      │ insert([Event 3])      │               │
435ms │                        │ Push SSE      │ Receive Event 3
      │                        │               │ Measure: 35ms
```
Each event written individually
True latency measurement (includes network, processing, SSE push)

## Use Cases

### Old Architecture (Still Useful For)
- Comprehensive latency analysis with detailed spans
- Controlled benchmarking with known load
- Testing mitigation strategies
- SLO compliance testing

### New Architecture (Best For)
- **Real-world latency testing**
- **Production-like scenarios**
- **Load testing** (multiple producers)
- **Network latency analysis**
- **Distributed system testing**
- **Continuous monitoring**

## Migration Guide

### Before (Batched)
```bash
npm run example:comprehensive-latency
```

### After (Decoupled)
```bash
# Terminal 1: Producer
npm run example:producer -- -f 5 -s 5

# Terminal 2: Subscriber
npm run example:subscriber -- -r 10
```

### Quick Demo Script
```bash
./demo-realtime.sh
```

## Summary

| Aspect | Batched (Old) | Decoupled (New) |
|--------|---------------|-----------------|
| **Architecture** | Single process | Separate processes |
| **Event Writing** | Batch intervals | Individual events |
| **Latency** | Self-measurement | Real end-to-end |
| **Scaling** | Limited | Independent |
| **Network Testing** | No | Yes |
| **Real-world Accuracy** | Artificial | Realistic |
| **Use Case** | Controlled benchmarks | Production testing |

**Recommendation**: Use the **new decoupled architecture** for realistic latency testing and production monitoring. Use the **old comprehensive benchmark** for detailed span analysis and mitigation testing.
