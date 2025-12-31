import { TelemetryCollector, CollectorMetrics, MonitoringConfig } from '../interfaces';
import { TelemetryEvent } from '../types';
import * as https from 'https';

/**
 * Simple Datadog Telemetry Collector using direct HTTP calls
 * Uses only the confirmed working endpoints: Metrics and Events
 */
export class SimpleDatadogTelemetryCollector implements TelemetryCollector {
  private config: MonitoringConfig;
  private eventQueue: TelemetryEvent[] = [];
  private metrics: CollectorMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
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
    
    console.log('✅ Simple Datadog Telemetry Collector initialized');
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
    
    // Flush if queue is full
    if (this.eventQueue.length >= this.config.telemetry.batchSize) {
      await this.flush();
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
   * Flush events to Datadog
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 || this.isShuttingDown) {
      return;
    }
    
    const batch = this.eventQueue.splice(0, this.config.telemetry.batchSize);
    this.metrics.queueSize = this.eventQueue.length;
    
    try {
      await this.sendBatchToDatadog(batch);
      this.metrics.eventsProcessed += batch.length;
      this.metrics.batchesSent++;
      this.metrics.lastFlushTime = new Date();
    } catch (error) {
      console.warn('⚠️  Failed to send batch to Datadog:', error);
      this.metrics.eventsFailed += batch.length;
    }
  }

  /**
   * Send a batch of events to Datadog using direct HTTP calls
   */
  private async sendBatchToDatadog(batch: TelemetryEvent[]): Promise<void> {
    const metrics = this.convertEventsToMetrics(batch);
    const events = this.convertEventsToDatadogEvents(batch);
    
    const promises: Promise<any>[] = [];
    
    // Send metrics
    if (metrics.length > 0) {
      promises.push(
        this.sendMetrics(metrics)
          .then(() => console.log(`✅ Sent ${metrics.length} metrics to Datadog`))
          .catch(error => console.warn('⚠️  Metrics error:', error.message))
      );
    }
    
    // Send events
    if (events.length > 0) {
      promises.push(
        this.sendEvents(events)
          .then(() => console.log(`✅ Sent ${events.length} events to Datadog`))
          .catch(error => console.warn('⚠️  Events error:', error.message))
      );
    }
    
    // Wait for all to complete (don't fail if some fail)
    await Promise.allSettled(promises);
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
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
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
    const promises = events.map(event => this.sendSingleEvent(event));
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
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
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
        `type:${event.type}`
      ];
      
      if (event.type === 'response' && event.response) {
        // Response time metric
        metrics.push({
          metric: 'llm.response_time',
          points: [[timestamp, event.response.latency]],
          tags: [...tags, `model:${event.request?.model || 'unknown'}`],
          type: 'gauge'
        });
        
        // Token usage metrics
        if (event.response.tokenUsage) {
          metrics.push({
            metric: 'llm.tokens.total',
            points: [[timestamp, event.response.tokenUsage.totalTokens]],
            tags: [...tags, `model:${event.request?.model || 'unknown'}`],
            type: 'count'
          });
        }
        
        // Cost metric
        if (event.response.cost) {
          metrics.push({
            metric: 'llm.cost',
            points: [[timestamp, event.response.cost]],
            tags: [...tags, `model:${event.request?.model || 'unknown'}`],
            type: 'count'
          });
        }
      }
      
      if (event.type === 'error') {
        // Error count metric
        metrics.push({
          metric: 'llm.errors',
          points: [[timestamp, 1]],
          tags: [...tags, `model:${event.request?.model || 'unknown'}`],
          type: 'count'
        });
      }
      
      // General request count
      metrics.push({
        metric: 'llm.requests',
        points: [[timestamp, 1]],
        tags: [...tags, `model:${event.request?.model || 'unknown'}`],
        type: 'count'
      });
    }
    
    return metrics;
  }

  /**
   * Convert telemetry events to Datadog events format
   */
  private convertEventsToDatadogEvents(events: TelemetryEvent[]): any[] {
    return events.map(event => ({
      title: `LLM ${event.type.toUpperCase()}: ${event.metadata.service}`,
      text: this.formatEventText(event),
      date_happened: Math.floor(event.timestamp.getTime() / 1000),
      priority: this.getEventPriority(event),
      tags: [
        `environment:${event.metadata.environment}`,
        `service:${event.metadata.service}`,
        `version:${event.metadata.version}`,
        `source:${event.source}`,
        `type:${event.type}`,
        `model:${event.request?.model || 'unknown'}`
      ],
      alert_type: this.getAlertType(event),
      source_type_name: 'llm-monitor'
    }));
  }

  /**
   * Format event text for Datadog events
   */
  private formatEventText(event: TelemetryEvent): string {
    let text = `Service: ${event.metadata.service}\n`;
    text += `Environment: ${event.metadata.environment}\n`;
    text += `Source: ${event.source}\n`;
    
    if (event.request) {
      text += `Model: ${event.request.model}\n`;
      if (event.request.prompt) {
        text += `Prompt: ${event.request.prompt.substring(0, 100)}...\n`;
      }
    }
    
    if (event.response) {
      text += `Latency: ${event.response.latency}ms\n`;
      if (event.response.tokenUsage) {
        text += `Tokens: ${event.response.tokenUsage.totalTokens}\n`;
      }
      if (event.response.cost) {
        text += `Cost: $${event.response.cost.toFixed(4)}\n`;
      }
    }
    
    if (event.error) {
      text += `Error: ${event.error.message}\n`;
      if (event.error.code) {
        text += `Error Code: ${event.error.code}\n`;
      }
    }
    
    return text;
  }

  /**
   * Get event priority for Datadog
   */
  private getEventPriority(event: TelemetryEvent): string {
    if (event.type === 'error') return 'high';
    if (event.response && event.response.latency > 5000) return 'normal';
    return 'low';
  }

  /**
   * Get alert type for Datadog
   */
  private getAlertType(event: TelemetryEvent): string {
    if (event.type === 'error') return 'error';
    if (event.response && event.response.latency > 5000) return 'warning';
    return 'info';
  }

  /**
   * Get current collector metrics
   */
  getMetrics(): CollectorMetrics {
    return { ...this.metrics };
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
    
    console.log('✅ Simple Datadog Telemetry Collector shutdown complete');
  }
}