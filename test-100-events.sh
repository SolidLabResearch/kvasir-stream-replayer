#!/bin/bash

echo "🧪 Testing Producer/Subscriber with 100 Events"
echo "=============================================="
echo ""

# Clean up any existing processes
pkill -f "realtime-event-producer" 2>/dev/null || true
pkill -f "realtime-sse-subscriber" 2>/dev/null || true
sleep 1

echo "Starting producer (10 Hz, 2 sensors, 5 seconds = ~100 events)..."
npm run example:producer -- -f 10 -s 2 -d 5 > /tmp/producer-test.log 2>&1 &
PRODUCER_PID=$!

# Wait a moment for producer to start
sleep 0.5

echo "📡 Starting subscriber..."
npm run example:subscriber -- -d 8 -r 100 > /tmp/subscriber-test.log 2>&1 &
SUBSCRIBER_PID=$!

# Wait for the test duration
sleep 8

# Stop the subscriber
kill $SUBSCRIBER_PID 2>/dev/null || true

# Wait for producer to finish
wait $PRODUCER_PID 2>/dev/null

echo ""
echo "Producer Results:"
echo "==================="
tail -10 /tmp/producer-test.log

echo ""
echo "📡 Subscriber Results (Last 100 events):"
echo "========================================"

# Extract only events from our test sensors (Sensor1, Sensor2)
# and filter for reasonable latency values (< 10000ms)
grep -E "Sensor[12].*\([0-9]+\.[0-9]+ms latency\)" /tmp/subscriber-test.log | \
  awk -F'[()]' '{
    latency = $2;
    gsub(/ms latency/, "", latency);
    if (latency < 10000) print $0;
  }' | tail -100 > /tmp/fresh-events.log

EVENT_COUNT=$(wc -l < /tmp/fresh-events.log | tr -d ' ')

echo "Found $EVENT_COUNT fresh events with reasonable latency:"
echo ""

if [ "$EVENT_COUNT" -gt 0 ]; then
  cat /tmp/fresh-events.log
  
  echo ""
  echo "Latency Statistics:"
  echo "===================="
  
  # Calculate statistics
  awk -F'[()]' '{
    gsub(/ms latency/, "", $2);
    latencies[NR] = $2;
    sum += $2;
    if (NR == 1 || $2 < min) min = $2;
    if (NR == 1 || $2 > max) max = $2;
  }
  END {
    avg = sum / NR;
    printf "  Events: %d\n", NR;
    printf "  Average: %.2fms\n", avg;
    printf "  Min: %.2fms\n", min;
    printf "  Max: %.2fms\n", max;
    
    # Calculate percentiles
    n = asort(latencies);
    p50_idx = int(n * 0.50);
    p95_idx = int(n * 0.95);
    p99_idx = int(n * 0.99);
    
    printf "  p50: %.2fms\n", latencies[p50_idx];
    printf "  p95: %.2fms\n", latencies[p95_idx];
    printf "  p99: %.2fms\n", latencies[p99_idx];
  }' /tmp/fresh-events.log
else
  echo "No fresh events found. The old backlog may be interfering."
  echo "   Consider clearing Kvasir's data or using a different timestamp filter."
fi

echo ""
echo "Test complete!"
