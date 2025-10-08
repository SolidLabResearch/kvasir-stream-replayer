#!/bin/bash

# Demo script to show producer and subscriber working together
# This script demonstrates the decoupled real-time architecture

set -e

echo "Real-Time Producer/Subscriber Demo"
echo "======================================"
echo ""
echo "This demo will:"
echo "  1. Start a producer generating 5 events/sec from 3 sensors"
echo "  2. Start a subscriber measuring real-time latency"
echo "  3. Run for 30 seconds"
echo ""
echo "Prerequisites:"
echo "  - Kvasir server running at http://localhost:8080"
echo "  - npm dependencies installed (npm install)"
echo ""
read -p "Press Enter to start demo (or Ctrl+C to cancel)..."

echo ""
echo "📡 Starting producer in background..."
npm run example:producer -- -f 5 -s 3 -d 30 > /tmp/producer.log 2>&1 &
PRODUCER_PID=$!

# Wait a moment for producer to start
sleep 2

echo "📨 Starting subscriber..."
npm run example:subscriber -- -d 30 -r 5 &
SUBSCRIBER_PID=$!

# Wait for both to finish
wait $SUBSCRIBER_PID
wait $PRODUCER_PID

echo ""
echo "Demo complete!"
echo ""
echo "Producer logs:"
tail -20 /tmp/producer.log
echo ""
echo "Tip: Run 'npm run example:producer -- --help' for more options"
echo "Tip: See examples/REALTIME-GUIDE.md for detailed documentation"
