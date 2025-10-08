export interface TimeseriesDataPoint {
  id: string;
  timestamp: Date;
  value: number | string | boolean;
  valueType: string;
  sensorId?: string;
  propertyType?: string;
  metadata?: Record<string, any>;
}

export interface KvasirChangeRequest {
  '@context': Record<string, string>;
  'kss:insert': Array<Record<string, any>>;
}

export interface ReplayerConfig {
  kvasirUrl: string;
  podName: string;
  batchSize: number; // For real-time streaming, typically 1
  delayBetweenBatches: number; // milliseconds (usually 0 for real-time)
  maxRetries: number;
  timeAcceleration: number; // 1.0 = real-time, 10.0 = 10x faster
  startFrom?: Date; // Optional: start from specific timestamp
  endAt?: Date; // Optional: end at specific timestamp
  // Streaming mode options
  mode: 'historical' | 'realtime-frequency' | 'bulk-upload';
  frequencyHz?: number; // Events per second (e.g., 4 = 4Hz = every 250ms)
  maxEvents?: number; // Optional: limit total number of events to stream
  // Bulk upload options
  bulkBatchSize?: number; // Batch size for bulk uploads (default: 1000)
}

export interface ReplayerStats {
  totalRecords: number;
  processedRecords: number;
  successfulInserts: number;
  failedInserts: number;
  startTime: Date;
  endTime?: Date;
  avgInsertionTime: number;
  currentBatchSize: number;
  eventsPerSecond?: number; // Real-time streaming metric
  averageLatency?: number; // Average event processing latency
  // Mode-specific metrics
  mode: 'historical' | 'realtime-frequency' | 'bulk-upload';
  // Frequency-based streaming metrics
  targetFrequencyHz?: number; // Target frequency in Hz
  actualFrequencyHz?: number; // Actual measured frequency
  frequencyDrift?: number; // Difference between target and actual frequency
  nextEventTime?: Date; // When the next event is scheduled
  // Bulk upload metrics
  totalBatches?: number; // Total number of batches in bulk mode
  completedBatches?: number; // Number of completed batches
  avgBatchProcessingTime?: number; // Average time per batch
}

export interface LatencyTestResult {
  timeRange: {
    start: Date;
    end: Date;
  };
  recordCount: number;
  queryTime: number; // milliseconds
  queryType: string;
  success: boolean;
  error?: string;
  data?: string; // Raw response data for parsing measurements
}

export interface NTripleStatement {
  subject: string;
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal' | 'bnode';
  datatype?: string;
  language?: string;
}

export interface PerformanceMetrics {
  insertionLatency: LatencyTestResult[];
  queryLatency: LatencyTestResult[];
  systemLoad: {
    memoryUsage: number;
    cpuUsage: number;
    timestamp: Date;
  }[];
}

// GraphQL Subscription Types
export interface MeasurementSubscription {
  id: string;
  value: number | string | boolean;
  timestamp: string; // ISO date string
  sensorId?: string;
  propertyType?: string;
  metadata?: Record<string, any>;
}

export interface SubscriptionConfig {
  sensorId?: string; // Optional: subscribe to specific sensor
  reconnectAttempts?: number; // Number of reconnection attempts (default: 5)
  reconnectInterval?: number; // Reconnection interval in ms (default: 3000)
  connectionTimeout?: number; // Connection timeout in ms (default: 10000)
}

export interface SubscriptionClient {
  unsubscribe(): void;
  onError(callback: (error: Error) => void): void;
  onReconnect(callback: () => void): void;
  onDisconnect(callback: () => void): void;
}

export interface GraphQLSubscriptionResponse {
  data?: {
    measurementsAdded?: MeasurementSubscription[];
    allMeasurementsAdded?: MeasurementSubscription[];
  };
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}