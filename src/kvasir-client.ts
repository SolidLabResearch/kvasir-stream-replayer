import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { KvasirChangeRequest, TimeseriesDataPoint, LatencyTestResult } from './types';

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
      timeout: 30000,
      headers: {
        'Content-Type': 'application/ld+json',
        'X-User-ID': podName
      }
    });
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
        jsonLD
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
        success: true
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
}