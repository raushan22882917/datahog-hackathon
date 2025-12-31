import { client, v1 } from '@datadog/datadog-api-client';
import { TelemetryCollector, CollectorMetrics, MonitoringConfig } from '../interfaces';
import { TelemetryEvent } from '../types';
import * as https from 'https';

/**
 * Circuit breaker states for handling Datadog API failures
 */
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open'
}

/**
 * Improved TelemetryCollector that works with limited Datadog API permissions
 * Uses only the endpoints that are confirmed to work: Metrics and Events
 */
export class ImprovedDatadogTelemetryCollector implements TelemetryCollector {
  private config: MonitoringConfig;
  private eventQueue: TelemetryEvent[] = [];
  private metrics: CollectorMetrics;
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
  // Circuit breaker properties
  private circuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds
  
  // Datadog API clients
  private metricsApi: v1.MetricsApi;
  
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
    
    // Initialize Datadog API clients
    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: this.config.datadog.apiKey,
        appKeyAuth: this.config.datadog.appKey
      }
    });
    
    this.metricsApi = new v1.MetricsApi(configuration);
    
    // Start periodic flush
    this.startPeriodicFlush();
    
    console.log('✅ Improved Datadog Telemetry Collector initialized');
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
    
    // Check circuit breaker state
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        console.log('🔄 Circuit breaker: Attempting recovery');
      } else {
        // Circuit is open, drop events to prevent further failures
        this.metrics.eventsFailed += this.eventQueue.length;
        this.eventQueue = [];
        this.metrics.queueSize = 0;
        return;
      }
    }
    
    const batch = this.eventQueue.splice(0, this.config.telemetry.batchSize);
    this.metrics.queueSize = this.eventQueue.length;
    
    try {
      await this.sendBatchToDatadog(batch);
      this.metrics.eventsProcessed += batch.length;
      this.metrics.batchesSent++;
      this.metrics.lastFlushTime = new Date();
      
      // Reset circuit breaker on success
      if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
        this.circuitBreakerState = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        console.log('✅ Circuit breaker: Recovery successful');
      }
      
    } catch (error) {
      console.warn('⚠️  Failed to send batch to Datadog:', error);
      this.handleFailure(batch);
    }
  }

  /**
   * Send a batch of events to Datadog using working endpoints only
   */
  private async sendBatchToDatadog(batch: TelemetryEvent[]): Promise<void> {
    const maxRetries = this.config.telemetry.maxRetries;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const metrics = this.convertEventsToMetrics(batch);
        const events = this.convertEventsToDatadogEvents(batch);
        
        let successCount = 0;
        let totalAttempts = 0;
        
        // Send metrics (confirmed working)
        if (metrics.length > 0) {
          totalAttempts++;
          try {
            await this.metricsApi.submitMetrics({
              body: { series: metrics }
            });
            successCount++;
            console.log(`✅ Sent ${metrics.length} metrics to Datadog`);
          } catch (metricsError: any) {
            console.warn('⚠️  Datadog metrics error:', metricsError.message);
          }
        }
        
        // Send events (confirmed working)
        if (events.length > 0) {
          totalAttempts++;
          try {
            await this.sendDatadogEvents(events);
            successCount++;
            console.log(`✅ Sent ${events.length} events to Datadog`);
          } catch (eventsError: any) {
            console.warn('⚠️  Datadog events error:', eventsError.message);
          }
        }
        
        // Consider it successful if at least one endpoint worked
        if (successCount > 0 || totalAttempts === 0) {
          return;
        }
        
        throw new Error(`No Datadog endpoints succeeded (${successCount}/${totalAttempts})`);
        
      } catch (error) {
        retryCount++;
        
        if (retryCount > maxRetries) {
          throw error;
        }
        
        // Exponential backoff with jitter
        const baseDelay = this.config.telemetry.retryDelay;
        const delay = baseDelay * Math.pow(2, retryCount - 1) + Math.random() * 1000;
        await this.sleep(delay);
      }
    }
  }

  /**
   * Send events to Datadog Events API using direct HTTPS
   */
  private async sendDatadogEvents(events: any[]): Promise<void> {
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
          
          // Check if inputTokens exists (it might be promptTokens)
          const inputTokens = (event.response.tokenUsage as any).inputTokens || 
                             (event.response.tokenUsage as any).promptTokens || 0;
          metrics.push({
            metric: 'llm.tokens.input',
            points: [[timestamp, inputTokens]],
            tags: [...tags, `model:${event.request?.model || 'unknown'}`],
            type: 'count'
          });
          
          // Check if outputTokens exists (it might be completionTokens)
          const outputTokens = (event.response.tokenUsage as any).outputTokens || 
                              (event.response.tokenUsage as any).completionTokens || 0;
          metrics.push({
            metric: 'llm.tokens.output',
            points: [[timestamp, outputTokens]],
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
   * Handle failure with circuit breaker logic
   */
  private handleFailure(batch: TelemetryEvent[]): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.metrics.eventsFailed += batch.length;
    
    if (this.failureCount >= this.failureThreshold) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      console.warn(`🔴 Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    
    console.log('✅ Improved Datadog Telemetry Collector shutdown complete');
  }
}