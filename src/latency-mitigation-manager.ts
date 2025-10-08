import { SLOConfig, TailLatencyMitigations } from './comprehensive-latency-benchmark';

export interface MitigationConfig {
  environment: 'development' | 'staging' | 'production';
  serviceType: 'serverless' | 'container' | 'vm';
  autoscaling: boolean;
  mitigations: TailLatencyMitigations;
  sloConfig: SLOConfig;
}

export class LatencyMitigationManager {
  private config: MitigationConfig;

  constructor(config: Partial<MitigationConfig> = {}) {
    this.config = {
      environment: 'development',
      serviceType: 'container',
      autoscaling: false,
      mitigations: {
        capacity: { preWarmed: false, minReplicas: 1, scaleOnQueueTime: false },
        concurrency: { maxPerInstance: 10, admissionControl: false },
        timeouts: { hedgingEnabled: false, jitteredRetries: false, timeoutMs: 5000 },
        caching: { readThrough: false, writeThrough: false, ttlValidation: false },
        downstream: { parallelized: false, bulkheads: false, circuitBreakers: false },
        runtime: { memoryTuned: false, asyncIO: true, cpuPinned: false },
        network: { keepAlives: true, connectionPooling: true, tlsOptimized: false, servicesColocated: true },
        payloads: { compressed: false, chunked: false, paginated: false }
      },
      sloConfig: {
        p95Target: 1500,
        p99Target: 2500,
        windowDays: 30,
        burnRateThreshold: 2
      },
      ...config
    };
  }

  /**
   * Apply production-ready mitigations for tail latency
   */
  applyProductionMitigations(): void {
    console.log('🔧 Applying production tail-latency mitigations...');

    // Capacity and autoscaling
    this.config.mitigations.capacity = {
      preWarmed: true,
      minReplicas: 3,
      scaleOnQueueTime: true
    };

    // Concurrency control
    this.config.mitigations.concurrency = {
      maxPerInstance: 50,
      admissionControl: true
    };

    // Timeouts and hedging
    this.config.mitigations.timeouts = {
      hedgingEnabled: true,
      jitteredRetries: true,
      timeoutMs: 2000
    };

    // Caching
    this.config.mitigations.caching = {
      readThrough: true,
      writeThrough: true,
      ttlValidation: true
    };

    // Downstream hardening
    this.config.mitigations.downstream = {
      parallelized: true,
      bulkheads: true,
      circuitBreakers: true
    };

    // Runtime optimization
    this.config.mitigations.runtime = {
      memoryTuned: true,
      asyncIO: true,
      cpuPinned: true
    };

    // Network optimization
    this.config.mitigations.network = {
      keepAlives: true,
      connectionPooling: true,
      tlsOptimized: true,
      servicesColocated: true
    };

    // Payload optimization
    this.config.mitigations.payloads = {
      compressed: true,
      chunked: true,
      paginated: true
    };

    console.log('Production mitigations applied');
  }

  /**
   * Apply serverless-specific optimizations
   */
  applyServerlessOptimizations(): void {
    console.log('☁️ Applying serverless optimizations...');

    this.config.serviceType = 'serverless';
    this.config.autoscaling = true;

    // Serverless-specific capacity settings
    this.config.mitigations.capacity = {
      preWarmed: true,
      minReplicas: 0, // Serverless scales to zero
      scaleOnQueueTime: true
    };

    // Lower concurrency limits for serverless
    this.config.mitigations.concurrency = {
      maxPerInstance: 10,
      admissionControl: true
    };

    // More aggressive timeouts for serverless
    this.config.mitigations.timeouts = {
      hedgingEnabled: true,
      jitteredRetries: true,
      timeoutMs: 1000
    };

    // Essential caching for serverless
    this.config.mitigations.caching = {
      readThrough: true,
      writeThrough: false, // Write-through can be expensive in serverless
      ttlValidation: true
    };

    console.log('Serverless optimizations applied');
  }

  /**
   * Generate SLO monitoring configuration
   */
  generateSLOMonitoringConfig(): string {
    const config = {
      service_name: 'kvasir-sse-latency',
      environment: this.config.environment,
      slo_targets: {
        p95_latency_ms: this.config.sloConfig.p95Target,
        p99_latency_ms: this.config.sloConfig.p99Target,
        window_days: this.config.sloConfig.windowDays
      },
      alerts: [
        {
          name: 'p95-latency-breach',
          condition: `p95_latency > ${this.config.sloConfig.p95Target}`,
          severity: 'warning',
          description: 'p95 latency exceeded target threshold'
        },
        {
          name: 'p99-latency-breach',
          condition: `p99_latency > ${this.config.sloConfig.p99Target}`,
          severity: 'critical',
          description: 'p99 latency exceeded target threshold'
        },
        {
          name: 'error-budget-burn',
          condition: `error_budget_burn_rate > ${this.config.sloConfig.burnRateThreshold}`,
          severity: 'warning',
          description: 'Error budget burning faster than expected'
        },
        {
          name: 'cold-start-spike',
          condition: 'cold_start_rate > 0.05',
          severity: 'info',
          description: 'High cold start rate detected'
        }
      ],
      metrics: [
        'p50_latency',
        'p95_latency',
        'p99_latency',
        'error_budget_remaining',
        'cold_start_count',
        'cache_hit_rate',
        'queue_depth',
        'concurrency_level'
      ]
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Generate infrastructure configuration for mitigations
   */
  generateInfrastructureConfig(): string {
    const infra = {
      service: 'kvasir-sse-service',
      type: this.config.serviceType,
      autoscaling: this.config.autoscaling ? {
        min_replicas: this.config.mitigations.capacity.minReplicas,
        max_replicas: 100,
        scale_on: this.config.mitigations.capacity.scaleOnQueueTime ? 'queue_time' : 'cpu',
        target_queue_time_ms: 100,
        cooldown_period_seconds: 60
      } : null,
      concurrency: {
        max_per_instance: this.config.mitigations.concurrency.maxPerInstance,
        admission_control: this.config.mitigations.concurrency.admissionControl
      },
      timeouts: {
        request_timeout_ms: this.config.mitigations.timeouts.timeoutMs,
        hedging_enabled: this.config.mitigations.timeouts.hedgingEnabled,
        jittered_retries: this.config.mitigations.timeouts.jitteredRetries
      },
      caching: {
        redis_cluster: this.config.mitigations.caching.readThrough ? {
          read_through: true,
          write_through: this.config.mitigations.caching.writeThrough,
          ttl_seconds: 300,
          validation_enabled: this.config.mitigations.caching.ttlValidation
        } : null
      },
      circuit_breakers: this.config.mitigations.downstream.circuitBreakers ? {
        failure_threshold: 0.5,
        recovery_timeout_seconds: 60,
        monitoring_window_seconds: 300
      } : null,
      network: {
        keep_alives: this.config.mitigations.network.keepAlives,
        connection_pooling: this.config.mitigations.network.connectionPooling,
        tls_optimization: this.config.mitigations.network.tlsOptimized,
        service_colocation: this.config.mitigations.network.servicesColocated
      },
      runtime: {
        memory_mb: this.config.mitigations.runtime.memoryTuned ? 2048 : 1024,
        cpu_pinning: this.config.mitigations.runtime.cpuPinned,
        async_io: this.config.mitigations.runtime.asyncIO,
        gc_tuning: this.config.mitigations.runtime.memoryTuned
      }
    };

    return JSON.stringify(infra, null, 2);
  }

  /**
   * Analyze mitigation effectiveness based on benchmark results
   */
  analyzeMitigationEffectiveness(analysis: any): {
    effectiveness: Record<string, number>;
    recommendations: string[];
  } {
    const effectiveness: Record<string, number> = {};
    const recommendations: string[] = [];

    // Analyze cold start impact
    if (analysis.mitigationEffectiveness.coldStartImpact) {
      const coldStartPenalty = analysis.mitigationEffectiveness.coldStartImpact.avgLatency;
      effectiveness.coldStartReduction = this.config.mitigations.capacity.preWarmed ? 0.8 : 0;

      if (coldStartPenalty > 500) {
        recommendations.push('Enable pre-warming to reduce cold start latency');
      }
    }

    // Analyze cache effectiveness
    const cacheHitRate = analysis.mitigationEffectiveness.cacheHitImpact.hitRate;
    effectiveness.cacheEffectiveness = cacheHitRate;

    if (cacheHitRate < 0.7) {
      recommendations.push('Improve cache hit rate through better key design or TTL optimization');
    }

    // Analyze concurrency impact
    const highConcurrencySamples = analysis.byConcurrency['10-20 concurrent'] || analysis.byConcurrency['20+ concurrent'];
    if (highConcurrencySamples && highConcurrencySamples.p95 > this.config.sloConfig.p95Target * 1.5) {
      effectiveness.concurrencyControl = 0.5;
      recommendations.push('Implement admission control to prevent head-of-line blocking');
    } else {
      effectiveness.concurrencyControl = 1.0;
    }

    // Analyze network optimization
    const tlsTime = analysis.tailAnalysis.spanBreakdown.avgSpans.tlsHandshakeTime || 0;
    if (tlsTime > 50) {
      effectiveness.networkOptimization = 0.6;
      recommendations.push('Enable TLS session resumption and connection pooling');
    } else {
      effectiveness.networkOptimization = 1.0;
    }

    // Overall effectiveness score
    effectiveness.overall = Object.values(effectiveness).reduce((a, b) => a + b, 0) / Object.values(effectiveness).length;

    return { effectiveness, recommendations };
  }

  /**
   * Generate alert configuration for monitoring
   */
  generateAlertConfig(): string {
    const alerts = [
      {
        name: 'high-p95-latency',
        query: `rate(http_request_duration_seconds{quantile="0.95"}[5m]) > ${this.config.sloConfig.p95Target / 1000}`,
        severity: 'warning',
        description: 'p95 latency is above target threshold',
        runbook: 'Check for increased load, implement circuit breakers, or scale up capacity'
      },
      {
        name: 'high-p99-latency',
        query: `rate(http_request_duration_seconds{quantile="0.99"}[5m]) > ${this.config.sloConfig.p99Target / 1000}`,
        severity: 'critical',
        description: 'p99 latency is above target threshold',
        runbook: 'Immediate action required: check for cascading failures, implement emergency mitigations'
      },
      {
        name: 'error-budget-exhaustion',
        query: `error_budget_remaining < 0.1`,
        severity: 'critical',
        description: 'Error budget nearly exhausted',
        runbook: 'Stop deployments, focus on reliability improvements'
      },
      {
        name: 'cold-start-spike',
        query: `rate(cold_start_total[5m]) > 0.1`,
        severity: 'warning',
        description: 'High rate of cold starts detected',
        runbook: 'Check autoscaling configuration, consider pre-warming'
      },
      {
        name: 'cache-miss-spike',
        query: `rate(cache_miss_total[5m]) / rate(cache_total[5m]) > 0.3`,
        severity: 'info',
        description: 'Cache miss rate above 30%',
        runbook: 'Review cache key strategy and TTL settings'
      },
      {
        name: 'queue-depth-increasing',
        query: `rate(queue_depth[5m]) > 10`,
        severity: 'warning',
        description: 'Queue depth is growing rapidly',
        runbook: 'Scale up capacity or implement admission control'
      }
    ];

    return JSON.stringify({
      alerts,
      global_config: {
        resolve_timeout: '5m',
        http_config: {
          follow_redirects: true,
          enable_http2: true
        }
      }
    }, null, 2);
  }

  getConfig(): MitigationConfig {
    return this.config;
  }

  updateConfig(updates: Partial<MitigationConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export default LatencyMitigationManager;