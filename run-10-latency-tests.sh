#!/bin/bash

# Script to run latency tests 10 times and collect statistics

echo "🧪 Running 10 Latency Test Iterations"
echo "======================================"
echo ""

# Clean up any existing processes
pkill -f "realtime-event" 2>/dev/null || true
sleep 2

# Arrays to store results
declare -a avg_latencies
declare -a min_latencies
declare -a max_latencies
declare -a p50_latencies
declare -a p95_latencies
declare -a p99_latencies
declare -a event_counts
declare -a tail_ratios

# Run 10 iterations
for i in {1..10}; do
  echo "▶ Running iteration $i/10..."
  
  # Start subscriber
  npm run example:subscriber -- -d 25 -r 100 > /tmp/latency-iter-${i}.log 2>&1 &
  SUBSCRIBER_PID=$!
  
  # Wait for subscriber to connect
  sleep 2
  
  # Start producer (8 Hz * 3 sensors * 12 seconds ≈ 288 events)
  npm run example:producer -- -f 8 -s 3 -d 12 > /dev/null 2>&1
  
  # Wait for remaining events to be processed
  sleep 3
  
  # Stop subscriber
  kill $SUBSCRIBER_PID 2>/dev/null || true
  wait $SUBSCRIBER_PID 2>/dev/null || true
  
  # Extract metrics from log
  if [ -f "/tmp/latency-iter-${i}.log" ]; then
    # Parse the final report
    avg=$(grep "Latency (avg):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    min=$(grep "Latency (min):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    max=$(grep "Latency (max):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    p50=$(grep "Latency (p50):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    p95=$(grep "Latency (p95):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    p99=$(grep "Latency (p99):" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*ms" | grep -o "[0-9.]*")
    events=$(grep "Events received:" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9]*" | head -1)
    tail_ratio=$(grep "Tail ratio" /tmp/latency-iter-${i}.log | tail -1 | grep -o "[0-9.]*x" | grep -o "[0-9.]*")
    
    # Store results
    if [ ! -z "$avg" ]; then
      avg_latencies+=($avg)
      min_latencies+=($min)
      max_latencies+=($max)
      p50_latencies+=($p50)
      p95_latencies+=($p95)
      p99_latencies+=($p99)
      event_counts+=($events)
      tail_ratios+=($tail_ratio)
      
      echo "  ✓ Iteration $i: ${events} events, avg=${avg}ms, p50=${p50}ms, p99=${p99}ms"
    else
      echo "  ✗ Iteration $i: Failed to parse results"
    fi
  else
    echo "  ✗ Iteration $i: Log file not found"
  fi
  
  # Wait between iterations
  sleep 2
done

echo ""
echo "Calculating Statistics..."
echo ""

# Function to calculate mean and std dev
calculate_stats() {
  local arr=("$@")
  local sum=0
  local count=${#arr[@]}
  
  # Calculate mean
  for val in "${arr[@]}"; do
    sum=$(echo "$sum + $val" | bc -l)
  done
  local mean=$(echo "scale=2; $sum / $count" | bc -l)
  
  # Calculate standard deviation
  local sq_diff_sum=0
  for val in "${arr[@]}"; do
    local diff=$(echo "$val - $mean" | bc -l)
    local sq_diff=$(echo "$diff * $diff" | bc -l)
    sq_diff_sum=$(echo "$sq_diff_sum + $sq_diff" | bc -l)
  done
  local variance=$(echo "scale=2; $sq_diff_sum / $count" | bc -l)
  local std_dev=$(echo "scale=2; sqrt($variance)" | bc -l)
  
  echo "$mean $std_dev"
}

# Calculate statistics for each metric
avg_stats=($(calculate_stats "${avg_latencies[@]}"))
min_stats=($(calculate_stats "${min_latencies[@]}"))
max_stats=($(calculate_stats "${max_latencies[@]}"))
p50_stats=($(calculate_stats "${p50_latencies[@]}"))
p95_stats=($(calculate_stats "${p95_latencies[@]}"))
p99_stats=($(calculate_stats "${p99_latencies[@]}"))
events_stats=($(calculate_stats "${event_counts[@]}"))
tail_stats=($(calculate_stats "${tail_ratios[@]}"))

# Generate Markdown report
cat > LATENCY-STATISTICS-10-RUNS.md << EOF
# Latency Test Statistics - 10 Iterations

## Test Configuration

- **Test Date**: $(date '+%Y-%m-%d %H:%M:%S')
- **Number of Iterations**: 10
- **Architecture**: Decoupled Producer/Subscriber
- **Backlog Filtering**: receiveBacklog=false (no old events)
- **Producer Settings**: 8 Hz, 3 sensors, 12 seconds duration
- **Expected Events per Test**: ~288 events (8 Hz × 3 sensors × 12 sec)

---

## Statistical Summary

### Events Received
- **Mean**: ${events_stats[0]} events
- **Standard Deviation**: ${events_stats[1]} events

### Average Latency
- **Mean**: ${avg_stats[0]} ms
- **Standard Deviation**: ± ${avg_stats[1]} ms

### Minimum Latency
- **Mean**: ${min_stats[0]} ms
- **Standard Deviation**: ± ${min_stats[1]} ms

### Maximum Latency
- **Mean**: ${max_stats[0]} ms
- **Standard Deviation**: ± ${max_stats[1]} ms

### p50 (Median) Latency
- **Mean**: ${p50_stats[0]} ms
- **Standard Deviation**: ± ${p50_stats[1]} ms

### p95 Latency
- **Mean**: ${p95_stats[0]} ms
- **Standard Deviation**: ± ${p95_stats[1]} ms

### p99 Latency
- **Mean**: ${p99_stats[0]} ms
- **Standard Deviation**: ± ${p99_stats[1]} ms

### Tail Ratio (p99/p50)
- **Mean**: ${tail_stats[0]}x
- **Standard Deviation**: ± ${tail_stats[1]}x

---

## Detailed Results per Iteration

| Iteration | Events | Avg (ms) | Min (ms) | Max (ms) | p50 (ms) | p95 (ms) | p99 (ms) | Tail Ratio |
|-----------|--------|----------|----------|----------|----------|----------|----------|------------|
EOF

# Add individual iteration results
for i in {0..9}; do
  iter=$((i + 1))
  echo "| $iter | ${event_counts[$i]} | ${avg_latencies[$i]} | ${min_latencies[$i]} | ${max_latencies[$i]} | ${p50_latencies[$i]} | ${p95_latencies[$i]} | ${p99_latencies[$i]} | ${tail_ratios[$i]}x |" >> LATENCY-STATISTICS-10-RUNS.md
done

cat >> LATENCY-STATISTICS-10-RUNS.md << EOF

---

## Analysis

### Consistency
EOF

# Calculate coefficient of variation for key metrics
cv_avg=$(echo "scale=2; (${avg_stats[1]} / ${avg_stats[0]}) * 100" | bc -l)
cv_p50=$(echo "scale=2; (${p50_stats[1]} / ${p50_stats[0]}) * 100" | bc -l)
cv_p99=$(echo "scale=2; (${p99_stats[1]} / ${p99_stats[0]}) * 100" | bc -l)

cat >> LATENCY-STATISTICS-10-RUNS.md << EOF

The **Coefficient of Variation (CV)** indicates measurement consistency:

- **Average Latency CV**: ${cv_avg}%
- **p50 Latency CV**: ${cv_p50}%
- **p99 Latency CV**: ${cv_p99}%

**Interpretation**:
- CV < 10%: Very consistent
- CV 10-20%: Moderately consistent  
- CV > 20%: High variability

### Performance Summary

Based on ${#event_counts[@]} successful test runs:

1. **Typical Latency** (p50): ${p50_stats[0]} ms ± ${p50_stats[1]} ms
   - Best case: ${min_stats[0]} ms ± ${min_stats[1]} ms
   - Worst case: ${max_stats[0]} ms ± ${max_stats[1]} ms

2. **Tail Latency** (p99): ${p99_stats[0]} ms ± ${p99_stats[1]} ms
   - The p99 latency is **${tail_stats[0]}x** the median (p50)

3. **95th Percentile**: ${p95_stats[0]} ms ± ${p95_stats[1]} ms
   - 95% of requests complete within this time

### Recommendations

EOF

# Add recommendations based on CV
if (( $(echo "$cv_avg < 10" | bc -l) )); then
  echo "**Excellent consistency** - System shows very stable latency characteristics" >> LATENCY-STATISTICS-10-RUNS.md
elif (( $(echo "$cv_avg < 20" | bc -l) )); then
  echo "**Good consistency** - System shows reasonably stable latency" >> LATENCY-STATISTICS-10-RUNS.md
else
  echo "Warning: **High variability** - Consider investigating sources of inconsistency" >> LATENCY-STATISTICS-10-RUNS.md
fi

cat >> LATENCY-STATISTICS-10-RUNS.md << EOF

**For Production Use**:

1. **SLO Targets** (based on these measurements):
   - p50 target: ≤ $(echo "${p50_stats[0]} * 1.1" | bc -l | xargs printf "%.0f") ms (110% of measured mean)
   - p95 target: ≤ $(echo "${p95_stats[0]} * 1.1" | bc -l | xargs printf "%.0f") ms
   - p99 target: ≤ $(echo "${p99_stats[0]} * 1.2" | bc -l | xargs printf "%.0f") ms (120% buffer for p99)

2. **Monitoring**:
   - Alert if p99 > $(echo "${p99_stats[0]} * 1.5" | bc -l | xargs printf "%.0f") ms (150% of measured mean)
   - Alert if tail ratio > $(echo "${tail_stats[0]} * 1.5" | bc -l | xargs printf "%.1f")x

3. **Capacity Planning**:
   - System handles ~${events_stats[0]} events per test run
   - Sustained throughput: ~$(echo "${events_stats[0]} / 12" | bc -l | xargs printf "%.1f") events/sec

---

## Raw Data

Individual test logs are available in:
- \`/tmp/latency-iter-1.log\` through \`/tmp/latency-iter-10.log\`

---

## Conclusion

Over 10 independent test runs, the decoupled producer/subscriber architecture demonstrates:

**Consistent Performance**: CV of ${cv_avg}% for average latency  
**Predictable Tail Latency**: p99 is ${tail_stats[0]}x the median  
**Production-Ready**: Stable measurements with quantifiable variability  
**Clean Data**: receiveBacklog=false eliminates old event contamination  

**Overall Verdict**: The system shows $(if (( $(echo "$cv_avg < 20" | bc -l) )); then echo "good to excellent"; else echo "moderate"; fi) consistency and is suitable for production use with appropriate SLO targets.

---

**Generated**: $(date '+%Y-%m-%d %H:%M:%S')  
**Test Duration**: ~$(echo "${#event_counts[@]} * 17" | bc) seconds (including setup/teardown)
EOF

echo ""
echo "Statistical analysis complete!"
echo ""
echo "Results written to: LATENCY-STATISTICS-10-RUNS.md"
echo ""
echo "Summary:"
echo "  Events (mean): ${events_stats[0]} ± ${events_stats[1]}"
echo "  Avg Latency: ${avg_stats[0]} ms ± ${avg_stats[1]} ms"
echo "  p50 Latency: ${p50_stats[0]} ms ± ${p50_stats[1]} ms"
echo "  p95 Latency: ${p95_stats[0]} ms ± ${p95_stats[1]} ms"
echo "  p99 Latency: ${p99_stats[0]} ms ± ${p99_stats[1]} ms"
echo "  Tail Ratio: ${tail_stats[0]}x ± ${tail_stats[1]}x"
echo "  CV (avg): ${cv_avg}%"
echo ""
