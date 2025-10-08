import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { EventSource } from 'eventsource';
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';
import { KvasirChangeRequest, LatencyTestResult, MeasurementSubscription, SubscriptionClient, SubscriptionConfig, TimeseriesDataPoint } from './types';

export interface KvasirInsertResponse {
  location: string;
  changeId: string;
  success: boolean;
}

export interface KvasirQueryResponse {
  data: any;
  executionTime: number;
}

export class KvasirClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private podName: string;

  constructor(baseUrl: string = 'http://localhost:8080', podName: string = 'alice') {
    this.baseUrl = baseUrl;
    this.podName = podName;
    this.client = axios.create({
      baseURL: baseUrl,
    });
  }

  /**
   * Helper method to check if change data represents a measurement
   */
  private isMeasurementData(data: any): boolean {
    // Check for common measurement patterns in JSON-LD format
    // This is a heuristic - measurements typically have value-like properties or specific types
    return data['@type']?.includes('Measurement') ||
           data['http://schema.org/value'] ||
           data['https://saref.etsi.org/core/hasValue'] ||
           data['http://www.w3.org/2006/time#hasTime'] ||
           data['@id']?.includes('Measurement') ||
           data['https://kvasir.discover.ilabt.imec.be/vocab#value'];
  }

  /**
   * Insert a batch of timeseries data into Kvasir
   */
  async insertBatch(dataPoints: TimeseriesDataPoint[]): Promise<KvasirInsertResponse> {
    const startTime = Date.now();
    
    try {
      const jsonLD = this.toKvasirJsonLD(dataPoints);
      
      const response: AxiosResponse = await this.client.post(
        `/${this.podName}/changes`,
        jsonLD,
        {
          headers: {
            'Content-Type': 'application/ld+json'
          }
        }
      );

      const location = response.headers.location || '';
      const changeId = location.split('/').pop() || '';

      return {
        location,
        changeId,
        success: response.status === 201
      };
    } catch (error: any) {
      console.error('Failed to insert batch:', error.response?.data || error.message);
      throw new Error(`Insert failed: ${error.response?.status} ${error.response?.statusText}`);
    }
  }

  /**
   * Query ClickHouse directly for timeseries data with latency measurement
   */
  async queryTimeRange(
    startTime: Date, 
    endTime: Date, 
    clickhouseUrl: string = 'http://localhost:8123',
    databaseId: string = 'c2d7dd29a08e40f4'
  ): Promise<LatencyTestResult> {
    const queryStartTime = Date.now();
    
    const query = `
      SELECT id, timestamp, value_number, labels
      FROM ${databaseId}.observations 
      WHERE timestamp >= '${startTime.toISOString().slice(0, 19).replace('T', ' ')}' 
        AND timestamp <= '${endTime.toISOString().slice(0, 19).replace('T', ' ')}'
      ORDER BY timestamp
    `;

    try {
      const response = await axios.get(clickhouseUrl, {
        params: { query },
        timeout: 10000
      });

      const queryTime = Date.now() - queryStartTime;
      const lines = response.data.trim().split('\\n').filter((line: string) => line.trim());
      
      return {
        timeRange: { start: startTime, end: endTime },
        recordCount: lines.length,
        queryTime,
        queryType: 'time-range',
        success: true,
        data: response.data // Include the raw data
      };
    } catch (error: any) {
      const queryTime = Date.now() - queryStartTime;
      return {
        timeRange: { start: startTime, end: endTime },
        recordCount: 0,
        queryTime,
        queryType: 'time-range',
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test query latency for different time window sizes
   */
  async benchmarkQueryLatency(
    baseTime: Date,
    windowSizes: number[], // in minutes
    clickhouseUrl: string = 'http://localhost:8123',
    databaseId: string = 'c2d7dd29a08e40f4'
  ): Promise<LatencyTestResult[]> {
    const results: LatencyTestResult[] = [];

    for (const windowMinutes of windowSizes) {
      const startTime = new Date(baseTime);
      const endTime = new Date(baseTime.getTime() + windowMinutes * 60 * 1000);

      try {
        const result = await this.queryTimeRange(startTime, endTime, clickhouseUrl, databaseId);
        results.push({
          ...result,
          queryType: `${windowMinutes}-minute-window`
        });
        
        // Add small delay between queries to avoid overwhelming the server
        await this.sleep(100);
      } catch (error: any) {
        results.push({
          timeRange: { start: startTime, end: endTime },
          recordCount: 0,
          queryTime: 0,
          queryType: `${windowMinutes}-minute-window`,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Check if Kvasir is healthy and ready to receive data
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get(`/${this.podName}`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Wait for a change request to be processed
   */
  async waitForProcessing(changeId: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await this.client.get(`/${this.podName}/changes/${changeId}`);
        const statusEntries = response.data['kss:statusEntry'] || [];
        
        // Check if status is COMMITTED
        const isCommitted = statusEntries.some((entry: any) => 
          entry['kss:statusCode'] === 'COMMITTED'
        );
        
        if (isCommitted) return true;
        
        // Check if status is FAILED
        const isFailed = statusEntries.some((entry: any) => 
          entry['kss:statusCode'] === 'FAILED'
        );
        
        if (isFailed) return false;
        
        await this.sleep(500); // Wait 500ms before checking again
      } catch (error) {
        // If we can't check status, assume it's still processing
        await this.sleep(1000);
      }
    }
    
    return false; // Timeout
  }

  private toKvasirJsonLD(dataPoints: TimeseriesDataPoint[]): KvasirChangeRequest {
    return {
      '@context': {
        '@vocab': 'http://example.org/',
        'kss': 'https://kvasir.discover.ilabt.imec.be/vocab#',
        'saref': 'https://saref.etsi.org/core/',
        'xsd': 'http://www.w3.org/2001/XMLSchema#',
        'rdfs': 'http://rdfs.org/ns/void#'
      },
      'kss:insert': dataPoints.map(dp => ({
        '@id': dp.id,
        '@type': 'saref:Measurement',
        'saref:hasValue': dp.value,
        'saref:hasTimestamp': {
          '@value': dp.timestamp.toISOString(),
          '@type': 'xsd:dateTime'
        },
        ...(dp.sensorId && { 'saref:measurementMadeBy': dp.sensorId }),
        ...(dp.propertyType && { 'saref:relatesToProperty': dp.propertyType }),
        'rdfs:inDataset': 'http://example.org/replayed-data',
        ...dp.metadata
      }))
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(
    clickhouseUrl: string = 'http://localhost:8123',
    databaseId: string = 'c2d7dd29a08e40f4'
  ): Promise<{ totalRecords: number; timeRange: { min: Date; max: Date } | null }> {
    try {
      const countQuery = `SELECT COUNT(*) as total FROM ${databaseId}.observations`;
      const timeRangeQuery = `SELECT MIN(timestamp) as min_time, MAX(timestamp) as max_time FROM ${databaseId}.observations`;
      
      const [countResponse, timeResponse] = await Promise.all([
        axios.get(clickhouseUrl, { params: { query: countQuery } }),
        axios.get(clickhouseUrl, { params: { query: timeRangeQuery } })
      ]);
      
      const totalRecords = parseInt(countResponse.data.trim()) || 0;
      const timeData = timeResponse.data.trim().split('\\t');
      
      let timeRange = null;
      if (timeData.length >= 2 && timeData[0] !== '\\N' && timeData[1] !== '\\N') {
        timeRange = {
          min: new Date(timeData[0]),
          max: new Date(timeData[1])
        };
      }
      
      return { totalRecords, timeRange };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return { totalRecords: 0, timeRange: null };
    }
  }

  /**
   * Subscribe to real-time measurements for a specific sensor
   */
  subscribeToMeasurements(
    sensorId: string,
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig = {}
  ): SubscriptionClient {
    const {
      reconnectAttempts = 5,
      reconnectInterval = 3000,
      connectionTimeout = 10000
    } = config;

    // Convert HTTP URL to WebSocket URL
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/graphql';

    const client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {
        headers: {
          'X-User-ID': this.podName
        }
      },
      retryAttempts: reconnectAttempts,
      retryWait: async () => {
        await new Promise(resolve => setTimeout(resolve, reconnectInterval));
      }
    });

    const unsubscribe = client.subscribe(
      {
        query: `
          subscription OnNewMeasurements($sensorId: String!) {
            measurementsAdded(sensorId: $sensorId) {
              id
              value
              timestamp
              sensorId
              propertyType
              metadata
            }
          }
        `,
        variables: { sensorId }
      },
      {
        next: (data) => {
          if (data.data?.measurementsAdded && Array.isArray(data.data.measurementsAdded)) {
            data.data.measurementsAdded.forEach((measurement: MeasurementSubscription) => {
              onNewMeasurement(measurement);
            });
          }
        },
        error: (error: any) => {
          console.error('Subscription error:', error);
          if (errorCallbacks.length > 0) {
            errorCallbacks.forEach(callback => callback(error));
          }
        },
        complete: () => {
          console.log('Subscription completed');
          if (disconnectCallbacks.length > 0) {
            disconnectCallbacks.forEach(callback => callback());
          }
        }
      }
    );

    const errorCallbacks: ((error: Error) => void)[] = [];
    const reconnectCallbacks: (() => void)[] = [];
    const disconnectCallbacks: (() => void)[] = [];

    return {
      unsubscribe: () => {
        unsubscribe();
        client.dispose();
      },
      onError: (callback: (error: Error) => void) => {
        errorCallbacks.push(callback);
      },
      onReconnect: (callback: () => void) => {
        reconnectCallbacks.push(callback);
      },
      onDisconnect: (callback: () => void) => {
        disconnectCallbacks.push(callback);
      }
    };
  }

  /**
   * Subscribe to all real-time measurements
   */
  subscribeToAllMeasurements(
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig = {}
  ): SubscriptionClient {
    const {
      reconnectAttempts = 5,
      reconnectInterval = 3000,
      connectionTimeout = 10000
    } = config;

    // Convert HTTP URL to WebSocket URL
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/graphql';

    const client = createClient({
      url: wsUrl,
      webSocketImpl: WebSocket,
      connectionParams: {
        headers: {
          'X-User-ID': this.podName
        }
      },
      retryAttempts: reconnectAttempts,
      retryWait: async () => {
        await new Promise(resolve => setTimeout(resolve, reconnectInterval));
      }
    });

    const unsubscribe = client.subscribe(
      {
        query: `
          subscription OnAllNewMeasurements {
            allMeasurementsAdded {
              id
              value
              timestamp
              sensorId
              propertyType
              metadata
            }
          }
        `
      },
      {
        next: (data) => {
          if (data.data?.allMeasurementsAdded && Array.isArray(data.data.allMeasurementsAdded)) {
            data.data.allMeasurementsAdded.forEach((measurement: MeasurementSubscription) => {
              onNewMeasurement(measurement);
            });
          }
        },
        error: (error: any) => {
          console.error('Subscription error:', error);
          if (errorCallbacks.length > 0) {
            errorCallbacks.forEach(callback => callback(error));
          }
        },
        complete: () => {
          console.log('Subscription completed');
          if (disconnectCallbacks.length > 0) {
            disconnectCallbacks.forEach(callback => callback());
          }
        }
      }
    );

    const errorCallbacks: ((error: Error) => void)[] = [];
    const reconnectCallbacks: (() => void)[] = [];
    const disconnectCallbacks: (() => void)[] = [];

    return {
      unsubscribe: () => {
        unsubscribe();
        client.dispose();
      },
      onError: (callback: (error: Error) => void) => {
        errorCallbacks.push(callback);
      },
      onReconnect: (callback: () => void) => {
        reconnectCallbacks.push(callback);
      },
      onDisconnect: (callback: () => void) => {
        disconnectCallbacks.push(callback);
      }
    };
  }

  /**
   * Subscribe to measurements using polling (works with existing ClickHouse API)
   * This provides real-time-like behavior by periodically querying for new data
   */
  subscribeToMeasurementsPolling(
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig & {
      pollingInterval?: number; // How often to poll in milliseconds (default: 1000)
      lookbackWindow?: number; // How far back to look for new data in seconds (default: 10)
      clickhouseUrl?: string;
      databaseId?: string;
      initialTimestamp?: Date; // Initial timestamp to start from (default: now - lookbackWindow)
    } = {}
  ): SubscriptionClient {
    const {
      pollingInterval = 1000,
      lookbackWindow = 10,
      clickhouseUrl = 'http://localhost:8123',
      databaseId = 'c2d7dd29a08e40f4',
      sensorId,
      initialTimestamp
    } = config;

    let isRunning = true;
    let lastTimestamp = initialTimestamp || new Date(Date.now() - lookbackWindow * 1000); // Start with recent data
    let pollTimer: NodeJS.Timeout;

    const pollForNewData = async () => {
      if (!isRunning) return;

      try {
        const now = new Date();
        const startTime = new Date(lastTimestamp.getTime() + 1); // Start from last timestamp + 1ms

        const result = await this.queryTimeRange(startTime, now, clickhouseUrl, databaseId);

        console.log(`Query result: success=${result.success}, recordCount=${result.recordCount}`);
        console.log(`Time range: ${startTime.toISOString()} to ${now.toISOString()}`);
        console.log(`Last timestamp: ${lastTimestamp.toISOString()}`);

        if (result.success && result.recordCount > 0) {
          // Parse the ClickHouse response and convert to MeasurementSubscription format
          const rawData = result.data?.trim() || '';
          console.log(`Raw ClickHouse response:`, rawData.substring(0, 200) + '...');

          // ClickHouse returns multiple measurements per line, separated by spaces
          // Each measurement has format: id timestamp value {json}
          // We need to parse this by finding the JSON objects and splitting accordingly

          const measurements: Array<{id: string, timestamp: string, value: string, labels: string}> = [];
          let currentPos = 0;

          while (currentPos < rawData.length) {
            // Find the next JSON object (starts with '{')
            const jsonStart = rawData.indexOf('{', currentPos);
            if (jsonStart === -1) break;

            // Find the end of this JSON object
            let braceCount = 0;
            let jsonEnd = jsonStart;
            for (let i = jsonStart; i < rawData.length; i++) {
              if (rawData[i] === '{') braceCount++;
              else if (rawData[i] === '}') braceCount--;
              if (braceCount === 0) {
                jsonEnd = i;
                break;
              }
            }

            if (braceCount !== 0) {
              console.warn('Unmatched braces in JSON, skipping');
              break;
            }

            // Extract the part before the JSON (should contain id, timestamp, value)
            const beforeJson = rawData.substring(currentPos, jsonStart).trim();
            const jsonStr = rawData.substring(jsonStart, jsonEnd + 1);

            // Split the before part by spaces
            const parts = beforeJson.split(/\s+/);
            if (parts.length >= 3) {
              const id = parts[0];
              const timestamp = parts[1] + ' ' + parts[2];
              const value = parts[3];

              measurements.push({ id, timestamp, value, labels: jsonStr });
            }

            // Move to after this JSON object
            currentPos = jsonEnd + 1;
          }

          console.log(`Parsed ${measurements.length} measurements from response`);

          for (const measurement of measurements) {
            try {
              const { id, timestamp: timestampStr, value: valueStr, labels: labelsStr } = measurement;

              console.log(`Processing measurement: id=${id}, timestamp=${timestampStr}, value=${valueStr}`);

              // Convert ClickHouse timestamp format to ISO
              let timestamp: string;
              try {
                const date = new Date(timestampStr.replace(' ', 'T') + 'Z');
                if (isNaN(date.getTime())) {
                  throw new Error('Invalid date');
                }
                timestamp = date.toISOString();
              } catch (dateError) {
                console.warn('Failed to parse timestamp:', timestampStr, dateError);
                continue;
              }

              // Parse the value
              let value: number | string | boolean = valueStr;
              const numValue = Number(valueStr);
              if (!isNaN(numValue)) {
                value = numValue;
              } else if (valueStr === 'true' || valueStr === 'false') {
                value = valueStr === 'true';
              }

              // Parse labels (JSON string)
              let metadata: Record<string, any> = {};
              let sensorIdFromData: string | undefined;
              let propertyType: string | undefined;

              try {
                const labels = JSON.parse(labelsStr);
                metadata = labels;

                // Try to extract sensor ID from the measurement ID
                // Format: http://example.org/Measurement_TemperatureSensor1_1
                const urlParts = id.split('/');
                const measurementId = urlParts[urlParts.length - 1]; // "Measurement_TemperatureSensor1_1"
                const idParts = measurementId.split('_');
                if (idParts.length >= 3 && idParts[0] === 'Measurement') {
                  sensorIdFromData = idParts.slice(1, -1).join('_'); // "TemperatureSensor1"
                }

                // Look for property type in metadata or derive from sensor name
                propertyType = labels.propertyType || labels.property_type;
                if (!propertyType && sensorIdFromData?.toLowerCase().includes('temperature')) {
                  propertyType = 'temperature';
                }
              } catch (e) {
                console.warn('Failed to parse labels JSON:', labelsStr, e);
              }

              // Filter by sensorId if specified
              if (sensorId && sensorIdFromData !== sensorId) {
                continue;
              }

              const measurementObj: MeasurementSubscription = {
                id,
                value,
                timestamp,
                sensorId: sensorIdFromData,
                propertyType,
                metadata
              };

              onNewMeasurement(measurementObj);

              // Update last timestamp
              const measurementTime = new Date(timestamp);
              if (measurementTime > lastTimestamp) {
                lastTimestamp = measurementTime;
              }
            } catch (parseError) {
              console.warn('Failed to parse measurement:', measurement, parseError);
            }
          }
        }
      } catch (error: any) {
        console.error('Polling subscription error:', error.message);
        if (errorCallbacks.length > 0) {
          errorCallbacks.forEach(callback => callback(error));
        }
      }

      // Schedule next poll if still running
      if (isRunning) {
        pollTimer = setTimeout(pollForNewData, pollingInterval);
      }
    };

    // Start polling
    pollTimer = setTimeout(pollForNewData, 0);

    const errorCallbacks: ((error: Error) => void)[] = [];
    const reconnectCallbacks: (() => void)[] = [];
    const disconnectCallbacks: (() => void)[] = [];

    return {
      unsubscribe: () => {
        isRunning = false;
        if (pollTimer) {
          clearTimeout(pollTimer);
        }
        if (disconnectCallbacks.length > 0) {
          disconnectCallbacks.forEach(callback => callback());
        }
      },
      onError: (callback: (error: Error) => void) => {
        errorCallbacks.push(callback);
      },
      onReconnect: (callback: () => void) => {
        reconnectCallbacks.push(callback);
        // For polling, we can simulate reconnection by continuing polling
        callback();
      },
      onDisconnect: (callback: () => void) => {
        disconnectCallbacks.push(callback);
      }
    };
  }

  /**
   * Subscribe to all measurements using polling (works with existing ClickHouse API)
   */
  subscribeToAllMeasurementsPolling(
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig & {
      pollingInterval?: number;
      lookbackWindow?: number;
      clickhouseUrl?: string;
      databaseId?: string;
      initialTimestamp?: Date;
    } = {}
  ): SubscriptionClient {
    // For "all measurements", we just don't filter by sensorId
    return this.subscribeToMeasurementsPolling(onNewMeasurement, { ...config, sensorId: undefined });
  }

  /**
   * Subscribe to real-time changes using Server-Sent Events (SSE)
   * This provides true real-time streaming of changes from Kvasir
   */
  subscribeToChangesSSE(
    onChange: (change: any) => void,
    config: {
      reconnectAttempts?: number;
      reconnectInterval?: number;
      connectionTimeout?: number;
      receiveBacklog?: boolean;
    } = {}
  ): SubscriptionClient {
    const {
      reconnectAttempts = 5,
      reconnectInterval = 3000,
      connectionTimeout = 10000,
      receiveBacklog = true
    } = config;

    let eventSource: EventSource | null = null;
    let isRunning = true;
    let reconnectCount = 0;

    const connect = () => {
      if (!isRunning) return;

  const changesUrl = `${this.baseUrl}/${this.podName}/events/changes?receiveBacklog=${receiveBacklog}`;
      console.log(`Connecting to SSE endpoint: ${changesUrl}`);

      eventSource = new EventSource(changesUrl);

      if (!eventSource) return;

      eventSource.onopen = () => {
        console.log('SSE connection opened');
        reconnectCount = 0; // Reset reconnect count on successful connection
        if (reconnectCallbacks.length > 0) {
          reconnectCallbacks.forEach(callback => callback());
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const changeData = JSON.parse(event.data);
          onChange(changeData);
        } catch (error) {
          console.warn('Failed to parse SSE change data:', event.data, error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);

        if (errorCallbacks.length > 0) {
          errorCallbacks.forEach(callback => callback(new Error('SSE connection error')));
        }

        // Attempt to reconnect if we haven't exceeded the limit
        if (reconnectCount < reconnectAttempts) {
          reconnectCount++;
          console.log(`Attempting to reconnect (${reconnectCount}/${reconnectAttempts}) in ${reconnectInterval}ms...`);

          setTimeout(() => {
            if (eventSource) {
              eventSource.close();
            }
            connect();
          }, reconnectInterval);
        } else {
          console.error('Max reconnection attempts reached, giving up');
          if (disconnectCallbacks.length > 0) {
            disconnectCallbacks.forEach(callback => callback());
          }
        }
      };
    };

    // Start the connection
    connect();

    const errorCallbacks: ((error: Error) => void)[] = [];
    const reconnectCallbacks: (() => void)[] = [];
    const disconnectCallbacks: (() => void)[] = [];

    return {
      unsubscribe: () => {
        isRunning = false;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        if (disconnectCallbacks.length > 0) {
          disconnectCallbacks.forEach(callback => callback());
        }
      },
      onError: (callback: (error: Error) => void) => {
        errorCallbacks.push(callback);
      },
      onReconnect: (callback: () => void) => {
        reconnectCallbacks.push(callback);
      },
      onDisconnect: (callback: () => void) => {
        disconnectCallbacks.push(callback);
      }
    };
  }

  /**
   * Subscribe to measurements using Server-Sent Events (SSE) for changes
   * This converts change events to measurement events for compatibility
   */
  subscribeToMeasurementsSSE(
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig & {
      reconnectAttempts?: number;
      reconnectInterval?: number;
      connectionTimeout?: number;
      receiveBacklog?: boolean;
    } = {}
  ): SubscriptionClient {
    const { sensorId: _ignoredSensorId, ...changesConfig } = config;

    return this.subscribeToChangesSSE((change) => {
      // Convert change events to measurement events
      // Look for insert operations that contain measurement data
      const graph = change.insert?.['@graph'];
      if (graph && Array.isArray(graph)) {
        for (const item of graph) {
          // Check if this is a measurement (has timestamp and value-like properties)
          if (this.isMeasurementData(item)) {
            const measurement = this.convertChangeToMeasurement(change.insert, change);
            if (measurement) {
              onNewMeasurement(measurement);
            }
          }
        }
      }
    }, changesConfig);
  }

  /**
   * Subscribe to all measurements using Server-Sent Events (SSE)
   */
  subscribeToAllMeasurementsSSE(
    onNewMeasurement: (measurement: MeasurementSubscription) => void,
    config: SubscriptionConfig & {
      reconnectAttempts?: number;
      reconnectInterval?: number;
      connectionTimeout?: number;
      receiveBacklog?: boolean;
    } = {}
  ): SubscriptionClient {
    // For SSE, "all measurements" means all measurement changes
    return this.subscribeToMeasurementsSSE(onNewMeasurement, { ...config, sensorId: undefined });
  }

  /**
   * Helper method to convert change data to measurement format
   */
  private convertChangeToMeasurement(changeData: any, fullChange: any): MeasurementSubscription | null {
    try {
      // Handle SSE change format - changeData should be the insert object with @graph
      const graph = changeData?.['@graph'];
      if (!graph || !Array.isArray(graph)) {
        return null;
      }

      // Process each item in the graph
      for (const item of graph) {
        if (!this.isMeasurementData(item)) {
          continue;
        }

        const id = item['@id'];
        if (!id) continue;

        // Extract timestamp - try multiple possible locations
        let timestamp: string;

        // First try to extract from the measurement item itself (this is what we want for latency measurement)
        const timestampField = item['http://schema.org/dateModified'] ||
                              item['http://www.w3.org/2006/time#hasTime'] ||
                              item['https://saref.etsi.org/core/hasTimestamp'] ||
                              item['https://kvasir.discover.ilabt.imec.be/vocab#timestamp'];

        if (timestampField) {
          if (typeof timestampField === 'object' && timestampField['@value']) {
            timestamp = timestampField['@value'];
          } else {
            const rawTimestamp = Array.isArray(timestampField) ? timestampField[0]['@value'] || timestampField[0] : timestampField;
            if (typeof rawTimestamp === 'string') {
              const date = new Date(rawTimestamp);
              if (!isNaN(date.getTime())) {
                timestamp = date.toISOString();
              } else {
                timestamp = rawTimestamp;
              }
            } else {
              timestamp = String(rawTimestamp);
            }
          }
        } else {
          // Fallback: try to get timestamp from the full change (SSE change timestamp)
          const changeTimestamp = fullChange?.['https://kvasir.discover.ilabt.imec.be/vocab#timestamp'] ||
                                 fullChange?.timestamp;

          if (changeTimestamp && changeTimestamp !== 'timestamp') {  // Avoid the literal "timestamp" string
            // Convert various timestamp formats to ISO string
            if (typeof changeTimestamp === 'string') {
              const date = new Date(changeTimestamp);
              if (!isNaN(date.getTime())) {
                timestamp = date.toISOString();
              } else {
                timestamp = changeTimestamp;
              }
            } else if (changeTimestamp instanceof Date) {
              timestamp = changeTimestamp.toISOString();
            } else {
              timestamp = String(changeTimestamp);
            }
          } else {
            // Last resort: use current time
            timestamp = new Date().toISOString();
          }
        }

        // Extract value - look for common value properties
        let value: number | string | boolean;
        const valueField = item['http://schema.org/value'] ||
                          item['https://saref.etsi.org/core/hasValue'] ||
                          item['http://example.org/value'] ||
                          item['https://kvasir.discover.ilabt.imec.be/vocab#value'];

        if (valueField) {
          let rawValue: any;
          if (typeof valueField === 'object' && valueField['@value']) {
            rawValue = valueField['@value'];
          } else {
            rawValue = Array.isArray(valueField) ? valueField[0]['@value'] || valueField[0] : valueField;
          }
          if (typeof rawValue === 'number') {
            value = rawValue;
          } else if (typeof rawValue === 'string') {
            const numValue = Number(rawValue);
            value = isNaN(numValue) ? rawValue : numValue;
          } else {
            value = rawValue;
          }
        } else {
          continue; // No value found
        }

        // Extract sensor ID
        let sensorId: string | undefined;
        // Look for relationships that might indicate the sensor
        const sensorRelation = item['http://schema.org/isObservedBy'] ||
                              item['https://saref.etsi.org/core/isMeasuredBy'] ||
                              item['https://saref.etsi.org/core/measurementMadeBy'] ||
                              item['https://saref.etsi.org/core/relatesToProperty'] ||
                              item['http://example.org/sensor'];

        if (sensorRelation) {
          sensorId = Array.isArray(sensorRelation) ?
            sensorRelation[0]['@id'] || sensorRelation[0] :
            sensorRelation['@id'] || sensorRelation;
        } else {
          // Try to extract from measurement ID pattern: Measurement_TemperatureSensor1_1
          const idMatch = id.match(/Measurement_(.+)_(\d+)$/);
          if (idMatch) {
            sensorId = idMatch[1]; // "TemperatureSensor1"
          }
        }

        if (typeof sensorId === 'string') {
          sensorId = sensorId.replace(/^"|"$/g, '');
        }

        // Extract property type
        let propertyType: string | undefined;
        // Try to infer from the measurement type or sensor name
        if (item['@type']) {
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          for (const type of types) {
            if (type.includes('Temperature')) propertyType = 'temperature';
            else if (type.includes('Humidity')) propertyType = 'humidity';
            else if (type.includes('Pressure')) propertyType = 'pressure';
            else if (type.includes('Light')) propertyType = 'light';
          }
        }

        // Infer from sensor name if not found in type
        if (!propertyType && sensorId?.toLowerCase().includes('temperature')) {
          propertyType = 'temperature';
        } else if (!propertyType && sensorId?.toLowerCase().includes('humidity')) {
          propertyType = 'humidity';
        } else if (!propertyType && sensorId?.toLowerCase().includes('pressure')) {
          propertyType = 'pressure';
        } else if (!propertyType && sensorId?.toLowerCase().includes('light')) {
          propertyType = 'light';
        }

        return {
          id,
          value,
          timestamp,
          sensorId,
          propertyType,
          metadata: item // Include all original data as metadata
        };
      }

      return null; // No valid measurements found
    } catch (error) {
      console.warn('Failed to convert change to measurement:', changeData, error);
      return null;
    }
  }
}