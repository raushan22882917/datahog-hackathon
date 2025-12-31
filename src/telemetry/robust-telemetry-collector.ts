import { TelemetryCollector, CollectorMetrics, MonitoringConfig } from '../interfaces';
import { TelemetryEvent } from '../types';
import * as https from 'https';

/**
 * Robust Telemetry Collector that works with or without Datadog
 * Falls back to local storage and console logging if Datadog is unavailable
 */
export class RobustTelemetryCollector implements TelemetryCollector {
  private config: MonitoringConfig;
  private eventQueue: TelemetryEvent[] = [];
  private metrics: CollectorMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private datadogAvailable = true;
  private consecutiveFailures = 0;
  private readonly maxFailures = 3;
  
  // Local storage for events when Datadog is unavailable
  private localEvents: TelemetryEvent[] = [];
  private localMetrics: Map<string, number> = new Map();
  
  constructor(config: MonitoringConfig) {
    this.config = config;
    this.metrics = {
      eventsCollected: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      batchesSent: 0,
      lastFlushTime: new Date(),
      queueSize: 0
    };
    
    // Start periodic flush
    this.startPeriodicFlush();
    
    console.log('✅ Robust Telemetry Collector initialized');
    console.log('📊 Telemetry will work with or without Datadog connectivity');
  }

  /**
   * Collect a telemetry event
   */
  async collect(event: TelemetryEvent): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.eventQueue.push(event);
    this.metrics.eventsCollected++;
    this.metrics.queueSize = this.eventQueue.length;
    
    // Also store locally for guaranteed availability
    this.localEvents.push(event);
    this.updateLocalMetrics(event);
    
    // Keep local storage manageable
    if (this.localEvents.length > 1000) {
      this.localEvents = this.localEvents.slice(-1000);
    }
    
    // Flush if queue is full
    if (this.eventQueue.length >= this.config.telemetry.batchSize) {
      await this.flush();
    }
  }

  /**
   * Update local metrics for fallback
   */
  private updateLocalMetrics(event: TelemetryEvent): void {
    const key = `${event.type}_${event.metadata.service}_${event.request?.model || 'unknown'}`;
    this.localMetrics.set(key, (this.localMetrics.get(key) || 0) + 1);
    
    if (event.response) {
      this.localMetrics.set(`latency_${key}`, event.response.latency);
      if (event.response.cost) {
        this.localMetrics.set(`cost_${key}`, (this.localMetrics.get(`cost_${key}`) || 0) + event.response.cost);
      }
      if (event.response.tokenUsage) {
        this.localMetrics.set(`tokens_${key}`, (this.localMetrics.get(`tokens_${key}`) || 0) + event.response.tokenUsage.totalTokens);
      }
    }
  }

  /**
   * Start periodic flush timer
   */
  private startPeriodicFlush(): void {
    this.flushTimer = setInterval(async () => {
      await this.flush();
    }, this.config.telemetry.flushInterval);
  }

  /**
   * Flush events to Datadog or local storage
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || this.isShuttingDown) {
      return;
    }
    
    const batch = this.eventQueue.splice(0, this.config.telemetry.batchSize);
    this.metrics.queueSize = this.eventQueue.length;
    
    if (this.datadogAvailable) {
      try {
        await this.sendBatchToDatadog(batch);
        this.metrics.eventsProcessed += batch.length;
        this.metrics.batchesSent++;
        this.metrics.lastFlushTime = new Date();
        this.consecutiveFailures = 0;
        
        // Log success occasionally
        if (this.metrics.batchesSent % 10 === 1) {
          console.log(`✅ Successfully sent ${this.metrics.eventsProcessed} events to Datadog`);
        }
      } catch (error) {
        this.consecutiveFailures++;
        console.warn(`⚠️  Datadog error (${this.consecutiveFailures}/${this.maxFailures}):`, error);
        
        if (this.consecutiveFailures >= this.maxFailures) {
          this.datadogAvailable = false;
          console.log('🔄 Switching to local telemetry storage due to Datadog connectivity issues');
        }
        
        this.metrics.eventsFailed += batch.length;
      }
    } else {
      // Store locally and log
      this.processLocalBatch(batch);
      this.metrics.eventsProcessed += batch.length;
      this.metrics.batchesSent++;
      this.metrics.lastFlushTime = new Date();
      
      // Periodically try to reconnect to Datadog
      if (this.metrics.batchesSent % 20 === 0) {
        await this.testDatadogConnectivity();
      }
    }
  }

  /**
   * Process batch locally when Datadog is unavailable
   */
  private processLocalBatch(batch: TelemetryEvent[]): void {
    console.log(`📊 Processed ${batch.length} telemetry events locally`);
    
    // Log interesting events
    for (const event of batch) {
      if (event.type === 'error') {
        console.log(`❌ LLM Error: ${event.error?.message} (${event.request?.model})`);
      } else if (event.type === 'response' && event.response && event.response.latency > 5000) {
        console.log(`⏱️  Slow LLM Response: ${event.response.latency}ms (${event.request?.model})`);
      } else if (event.type === 'response' && event.response && event.response.cost && event.response.cost > 0.1) {
        console.log(`💰 Expensive LLM Request: $${event.response.cost.toFixed(4)} (${event.request?.model})`);
      }
    }
  }

  /**
   * Test Datadog connectivity
   */
  private async testDatadogConnectivity(): Promise<void> {
    try {
      const testMetric = {
        metric: 'llm.connectivity.test',
        points: [[Math.floor(Date.now() / 1000), 1]],
        tags: ['test:connectivity'],
        type: 'count'
      };
      
      await this.sendMetrics([testMetric]);
      this.datadogAvailable = true;
      this.consecutiveFailures = 0;
      console.log('✅ Datadog connectivity restored');
    } catch (error) {
      // Still not available, continue with local storage
    }
  }

  /**
   * Send a batch of events to Datadog
   */
  private async sendBatchToDatadog(batch: TelemetryEvent[]): Promise<void> {
    const metrics = this.convertEventsToMetrics(batch);
    const events = this.convertEventsToDatadogEvents(batch);
    
    const promises: Promise<any>[] = [];
    
    // Send metrics
    if (metrics.length > 0) {
      promises.push(this.sendMetrics(metrics));
    }
    
    // Send events
    if (events.length > 0) {
      promises.push(this.sendEvents(events));
    }
    
    // At least one must succeed
    const results = await Promise.allSettled(promises);
    const successes = results.filter(r => r.status === 'fulfilled').length;
    
    if (successes === 0 && promises.length > 0) {
      throw new Error('All Datadog endpoints failed');
    }
  }

  /**
   * Send metrics to Datadog Metrics API
   */
  private async sendMetrics(metrics: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({ series: metrics });
      
      const options = {
        hostname: 'api.datadoghq.com',
        port: 443,
        path: '/api/v1/series',
        method: 'POST',
        headers: {
          'DD-API-KEY': this.config.datadog.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Metrics API HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Send events to Datadog Events API
   */
  private async sendEvents(events: any[]): Promise<void> {
    // Send only a few events to avoid rate limiting
    const limitedEvents = events.slice(0, 5);
    const promises = limitedEvents.map(event => this.sendSingleEvent(event));
    await Promise.all(promises);
  }

  /**
   * Send a single event to Datadog Events API
   */
  private async sendSingleEvent(event: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(event);
      
      const options = {
        hostname: 'api.datadoghq.com',
        port: 443,
        path: '/api/v1/events',
        method: 'POST',
        headers: {
          'DD-API-KEY': this.config.datadog.apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => responseData += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Events API HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  /**
   * Convert telemetry events to Datadog metrics format
   */
  private convertEventsToMetrics(events: TelemetryEvent[]): any[] {
    const metrics: any[] = [];
    
    for (const event of events) {
      const timestamp = Math.floor(event.timestamp.getTime() / 1000);
      const tags = [
        `environment:${event.metadata.environment}`,
        `service:${event.metadata.service}`,
        `version:${event.metadata.version}`,
        `source:${event.source}`,
        `type:${event.type}`,
        `model:${event.request?.model || 'unknown'}`
      ];
      
      // Always send request count
      metrics.push({
        metric: 'llm.requests',
        points: [[timestamp, 1]],
        tags,
        type: 'count'
      });
      
      if (event.type === 'response' && event.response) {
        metrics.push({
          metric: 'llm.response_time',
          points: [[timestamp, event.response.latency]],
          tags,
          type: 'gauge'
        });
        
        if (event.response.cost) {
          metrics.push({
            metric: 'llm.cost',
            points: [[timestamp, event.response.cost]],
            tags,
            type: 'count'
          });
        }
      }
      
      if (event.type === 'error') {
        metrics.push({
          metric: 'llm.errors',
          points: [[timestamp, 1]],
          tags,
          type: 'count'
        });
      }
    }
    
    return metrics;
  }

  /**
   * Convert telemetry events to Datadog events format
   */
  private convertEventsToDatadogEvents(events: TelemetryEvent[]): any[] {
    // Only send important events to avoid spam
    const importantEvents = events.filter(event => 
      event.type === 'error' || 
      (event.type === 'response' && event.response && event.response.latency > 5000) ||
      (event.type === 'response' && event.response && event.response.cost && event.response.cost > 0.1)
    );
    
    return importantEvents.map(event => ({
      title: `LLM ${event.type.toUpperCase()}: ${event.metadata.service}`,
      text: this.formatEventText(event),
      date_happened: Math.floor(event.timestamp.getTime() / 1000),
      priority: event.type === 'error' ? 'high' : 'normal',
      tags: [
        `environment:${event.metadata.environment}`,
        `service:${event.metadata.service}`,
        `model:${event.request?.model || 'unknown'}`
      ],
      alert_type: event.type === 'error' ? 'error' : 'warning',
      source_type_name: 'llm-monitor'
    }));
  }

  /**
   * Format event text for Datadog events
   */
  private formatEventText(event: TelemetryEvent): string {
    let text = `Service: ${event.metadata.service}\n`;
    text += `Model: ${event.request?.model || 'unknown'}\n`;
    
    if (event.response) {
      text += `Latency: ${event.response.latency}ms\n`;
      if (event.response.cost) {
        text += `Cost: $${event.response.cost.toFixed(4)}\n`;
      }
    }
    
    if (event.error) {
      text += `Error: ${event.error.message}\n`;
    }
    
    return text;
  }

  /**
   * Get recent events (for API endpoints)
   */
  getRecentEvents(limit: number = 10): TelemetryEvent[] {
    return this.localEvents.slice(-limit);
  }

  /**
   * Get local metrics summary
   */
  getLocalMetricsSummary(): any {
    const summary: any = {};
    for (const [key, value] of this.localMetrics.entries()) {
      summary[key] = value;
    }
    return summary;
  }

  /**
   * Get current collector metrics
   */
  getMetrics(): CollectorMetrics {
    return { 
      ...this.metrics,
      // Override failed count if we're working locally
      eventsFailed: this.datadogAvailable ? this.metrics.eventsFailed : 0
    };
  }

  /**
   * Shutdown the collector and flush remaining events
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    
    // Final flush
    await this.flush();
    
    console.log('✅ Robust Telemetry Collector shutdown complete');
    console.log(`📊 Final stats: ${this.metrics.eventsProcessed} events processed, ${this.localEvents.length} stored locally`);
  }
}