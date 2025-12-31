// Telemetry aggregation across multiple instances

import { EventEmitter } from 'events';
import { TelemetryEvent, Metric, ProcessedData } from '../interfaces';
import { InstanceInfo } from './instance-discovery';

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  // Aggregation windows
  windowSizes: number[]; // seconds
  
  // Aggregation methods
  enableSum: boolean;
  enableAverage: boolean;
  enableMin: boolean;
  enableMax: boolean;
  enableCount: boolean;
  enablePercentiles: boolean;
  
  // Percentiles to calculate
  percentiles: number[]; // e.g., [50, 90, 95, 99]
  
  // Buffer settings
  maxBufferSize: number;
  flushInterval: number; // milliseconds
  
  // Instance weighting
  enableInstanceWeighting: boolean;
  weightingStrategy: 'equal' | 'cpu-based' | 'memory-based' | 'custom';
  
  // Data retention
  retentionPeriod: number; // milliseconds
}

/**
 * Default aggregation configuration
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  windowSizes: [60, 300, 900, 3600], // 1min, 5min, 15min, 1hour
  enableSum: true,
  enableAverage: true,
  enableMin: true,
  enableMax: true,
  enableCount: true,
  enablePercentiles: true,
  percentiles: [50, 90, 95, 99],
  maxBufferSize: 10000,
  flushInterval: 30000, // 30 seconds
  enableInstanceWeighting: false,
  weightingStrategy: 'equal',
  retentionPeriod: 86400000 // 24 hours
};

/**
 * Aggregated metric data
 */
export interface AggregatedMetric {
  name: string;
  windowSize: number; // seconds
  timestamp: Date;
  instanceCount: number;
  
  // Aggregated values
  sum?: number;
  average?: number;
  min?: number;
  max?: number;
  count?: number;
  percentiles?: Record<number, number>;
  
  // Instance breakdown
  instanceValues: Record<string, number>;
  
  // Metadata
  tags: Record<string, string>;
  aggregationMethod: string;
}

/**
 * Telemetry data point
 */
interface TelemetryDataPoint {
  instanceId: string;
  metric: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
}

/**
 * Telemetry aggregator for multi-instance monitoring
 */
export class TelemetryAggregator extends EventEmitter {
  private config: AggregationConfig;
  private dataBuffer: Map<string, TelemetryDataPoint[]> = new Map();
  private aggregatedMetrics: Map<string, AggregatedMetric[]> = new Map();
  private instanceWeights: Map<string, number> = new Map();
  private flushInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: Partial<AggregationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_AGGREGATION_CONFIG, ...config };
  }

  /**
   * Start the aggregator
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Set up periodic flushing
    this.flushInterval = setInterval(() => {
      this.flushAggregations();
    }, this.config.flushInterval);

    // Set up periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, this.config.retentionPeriod / 24); // Clean up every hour

    this.emit('started');
  }

  /**
   * Stop the aggregator
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = undefined as any;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined as any;
    }

    // Final flush
    this.flushAggregations();

    this.emit('stopped');
  }

  /**
   * Add telemetry data from an instance
   */
  addTelemetryData(instanceId: string, events: TelemetryEvent[]): void {
    for (const event of events) {
      this.processTelemetryEvent(instanceId, event);
    }
  }

  /**
   * Add processed data from an instance
   */
  addProcessedData(instanceId: string, data: ProcessedData): void {
    for (const metric of data.metrics) {
      this.addDataPoint(instanceId, metric.name, metric.value, metric.timestamp, metric.tags);
    }
  }

  /**
   * Add individual metric data point
   */
  addDataPoint(
    instanceId: string, 
    metricName: string, 
    value: number, 
    timestamp: Date = new Date(),
    tags: Record<string, string> = {}
  ): void {
    const dataPoint: TelemetryDataPoint = {
      instanceId,
      metric: metricName,
      value,
      timestamp,
      tags
    };

    const key = this.getMetricKey(metricName, tags);
    
    if (!this.dataBuffer.has(key)) {
      this.dataBuffer.set(key, []);
    }

    const buffer = this.dataBuffer.get(key)!;
    buffer.push(dataPoint);

    // Limit buffer size
    if (buffer.length > this.config.maxBufferSize) {
      buffer.shift(); // Remove oldest data point
    }
  }

  /**
   * Process telemetry event and extract metrics
   */
  private processTelemetryEvent(instanceId: string, event: TelemetryEvent): void {
    const timestamp = event.timestamp;
    const baseTags = {
      source: event.source,
      environment: event.metadata?.environment || 'unknown',
      service: event.metadata?.service || 'unknown'
    };

    switch (event.type) {
      case 'request':
        this.addDataPoint(instanceId, 'requests.count', 1, timestamp, baseTags);
        break;

      case 'response':
        if (event.response) {
          this.addDataPoint(instanceId, 'responses.count', 1, timestamp, baseTags);
          this.addDataPoint(instanceId, 'responses.latency', event.response.latency, timestamp, baseTags);
          this.addDataPoint(instanceId, 'responses.cost', event.response.cost, timestamp, baseTags);
          
          if (event.response.tokenUsage) {
            this.addDataPoint(instanceId, 'tokens.prompt', event.response.tokenUsage.promptTokens, timestamp, baseTags);
            this.addDataPoint(instanceId, 'tokens.completion', event.response.tokenUsage.completionTokens, timestamp, baseTags);
            this.addDataPoint(instanceId, 'tokens.total', event.response.tokenUsage.totalTokens, timestamp, baseTags);
          }
        }
        break;

      case 'error':
        this.addDataPoint(instanceId, 'errors.count', 1, timestamp, {
          ...baseTags,
          errorCode: event.error?.code || 'unknown'
        });
        break;

      case 'metric':
        // Direct metric events
        if (event.metadata) {
          this.addDataPoint(instanceId, 'custom.metric', 1, timestamp, baseTags);
        }
        break;
    }
  }

  /**
   * Update instance weights for weighted aggregation
   */
  updateInstanceWeights(weights: Record<string, number>): void {
    this.instanceWeights.clear();
    for (const [instanceId, weight] of Object.entries(weights)) {
      this.instanceWeights.set(instanceId, weight);
    }
    this.emit('weightsUpdated', weights);
  }

  /**
   * Set instance weight based on instance info
   */
  setInstanceWeight(instance: InstanceInfo): void {
    let weight = 1.0;

    switch (this.config.weightingStrategy) {
      case 'equal':
        weight = 1.0;
        break;
      case 'cpu-based':
        // In a real implementation, this would use actual CPU metrics
        weight = this.parseResourceValue(instance.metadata.cpu) || 1.0;
        break;
      case 'memory-based':
        // In a real implementation, this would use actual memory metrics
        weight = this.parseResourceValue(instance.metadata.memory) || 1.0;
        break;
      case 'custom':
        weight = parseFloat(instance.metadata.weight || '1.0') || 1.0;
        break;
    }

    this.instanceWeights.set(instance.id, weight);
  }

  /**
   * Parse resource value from metadata
   */
  private parseResourceValue(value: string | undefined): number | undefined {
    if (!value) return undefined;
    
    // Simple parsing for CPU (e.g., "2", "2.5") or memory (e.g., "4Gi", "2048Mi")
    const numericValue = parseFloat(value);
    return isNaN(numericValue) ? undefined : numericValue;
  }

  /**
   * Flush aggregations for all metrics
   */
  private flushAggregations(): void {
    for (const [metricKey, dataPoints] of this.dataBuffer.entries()) {
      if (dataPoints.length === 0) continue;

      for (const windowSize of this.config.windowSizes) {
        const aggregated = this.aggregateDataPoints(metricKey, dataPoints, windowSize);
        if (aggregated) {
          this.storeAggregatedMetric(metricKey, aggregated);
          this.emit('metricAggregated', aggregated);
        }
      }
    }
  }

  /**
   * Aggregate data points for a specific window
   */
  private aggregateDataPoints(
    metricKey: string, 
    dataPoints: TelemetryDataPoint[], 
    windowSizeSeconds: number
  ): AggregatedMetric | null {
    const now = new Date();
    const windowStart = new Date(now.getTime() - (windowSizeSeconds * 1000));
    
    // Filter data points within the window
    const windowData = dataPoints.filter(dp => dp.timestamp >= windowStart);
    
    if (windowData.length === 0) {
      return null;
    }

    // Group by instance
    const instanceValues: Record<string, number[]> = {};
    const allValues: number[] = [];
    const instanceCounts: Record<string, number> = {};
    
    for (const dataPoint of windowData) {
      if (!instanceValues[dataPoint.instanceId]) {
        instanceValues[dataPoint.instanceId] = [];
        instanceCounts[dataPoint.instanceId] = 0;
      }
      
      instanceValues[dataPoint.instanceId]!.push(dataPoint.value);
      instanceCounts[dataPoint.instanceId]!++;
      allValues.push(dataPoint.value);
    }

    // Calculate aggregations
    const aggregated: AggregatedMetric = {
      name: this.extractMetricName(metricKey),
      windowSize: windowSizeSeconds,
      timestamp: now,
      instanceCount: Object.keys(instanceValues).length,
      instanceValues: {},
      tags: windowData[0]?.tags || {},
      aggregationMethod: 'multi-instance'
    };

    // Calculate per-instance aggregates
    for (const [instanceId, values] of Object.entries(instanceValues)) {
      const instanceAggregate = this.calculateAggregates(values);
      aggregated.instanceValues[instanceId] = instanceAggregate.sum || 0;
    }

    // Calculate overall aggregates
    const overallAggregates = this.calculateAggregates(allValues);
    
    if (this.config.enableSum && overallAggregates.sum !== undefined) aggregated.sum = overallAggregates.sum;
    if (this.config.enableAverage && overallAggregates.average !== undefined) aggregated.average = overallAggregates.average;
    if (this.config.enableMin && overallAggregates.min !== undefined) aggregated.min = overallAggregates.min;
    if (this.config.enableMax && overallAggregates.max !== undefined) aggregated.max = overallAggregates.max;
    if (this.config.enableCount && overallAggregates.count !== undefined) aggregated.count = overallAggregates.count;
    if (this.config.enablePercentiles && overallAggregates.percentiles !== undefined) aggregated.percentiles = overallAggregates.percentiles;

    return aggregated;
  }

  /**
   * Calculate statistical aggregates for a set of values
   */
  private calculateAggregates(values: number[]): {
    sum?: number;
    average?: number;
    min?: number;
    max?: number;
    count?: number;
    percentiles?: Record<number, number>;
  } {
    if (values.length === 0) {
      return {};
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    
    const result: any = {
      sum,
      average: sum / values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: values.length
    };

    // Calculate percentiles
    if (this.config.enablePercentiles) {
      result.percentiles = {};
      for (const percentile of this.config.percentiles) {
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        result.percentiles[percentile] = sorted[Math.max(0, index)];
      }
    }

    return result;
  }

  /**
   * Store aggregated metric
   */
  private storeAggregatedMetric(metricKey: string, metric: AggregatedMetric): void {
    if (!this.aggregatedMetrics.has(metricKey)) {
      this.aggregatedMetrics.set(metricKey, []);
    }

    const metrics = this.aggregatedMetrics.get(metricKey)!;
    metrics.push(metric);

    // Limit stored metrics
    const maxMetrics = Math.ceil(this.config.retentionPeriod / (metric.windowSize * 1000));
    if (metrics.length > maxMetrics) {
      metrics.shift();
    }
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoffTime = new Date(Date.now() - this.config.retentionPeriod);

    // Clean up data buffer
    for (const [key, dataPoints] of this.dataBuffer.entries()) {
      const filteredPoints = dataPoints.filter(dp => dp.timestamp > cutoffTime);
      this.dataBuffer.set(key, filteredPoints);
    }

    // Clean up aggregated metrics
    for (const [key, metrics] of this.aggregatedMetrics.entries()) {
      const filteredMetrics = metrics.filter(m => m.timestamp > cutoffTime);
      this.aggregatedMetrics.set(key, filteredMetrics);
    }
  }

  /**
   * Get metric key for grouping
   */
  private getMetricKey(metricName: string, tags: Record<string, string>): string {
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${value}`)
      .join(',');
    
    return `${metricName}|${tagString}`;
  }

  /**
   * Extract metric name from key
   */
  private extractMetricName(metricKey: string): string {
    return metricKey.split('|')[0] || metricKey;
  }

  /**
   * Get aggregated metrics for a specific metric name and window
   */
  getAggregatedMetrics(
    metricName: string, 
    windowSize: number,
    tags: Record<string, string> = {}
  ): AggregatedMetric[] {
    const key = this.getMetricKey(metricName, tags);
    const metrics = this.aggregatedMetrics.get(key) || [];
    
    return metrics.filter(m => m.windowSize === windowSize);
  }

  /**
   * Get latest aggregated metric
   */
  getLatestAggregatedMetric(
    metricName: string, 
    windowSize: number,
    tags: Record<string, string> = {}
  ): AggregatedMetric | undefined {
    const metrics = this.getAggregatedMetrics(metricName, windowSize, tags);
    return metrics[metrics.length - 1];
  }

  /**
   * Get aggregation statistics
   */
  getStats(): {
    bufferedMetrics: number;
    aggregatedMetrics: number;
    instanceCount: number;
    windowSizes: number[];
    dataPointsProcessed: number;
  } {
    let totalDataPoints = 0;
    for (const dataPoints of this.dataBuffer.values()) {
      totalDataPoints += dataPoints.length;
    }

    let totalAggregatedMetrics = 0;
    for (const metrics of this.aggregatedMetrics.values()) {
      totalAggregatedMetrics += metrics.length;
    }

    return {
      bufferedMetrics: this.dataBuffer.size,
      aggregatedMetrics: totalAggregatedMetrics,
      instanceCount: this.instanceWeights.size,
      windowSizes: this.config.windowSizes,
      dataPointsProcessed: totalDataPoints
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): AggregationConfig {
    return { ...this.config };
  }
}