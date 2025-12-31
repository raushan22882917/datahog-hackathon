import { v4 as uuidv4 } from 'uuid';
import { 
  DataProcessor, 
  ProcessedData, 
  Metric, 
  LogEntry, 
  Trace, 
  Span, 
  Alert 
} from '../interfaces';
import { TelemetryEvent } from '../types';

/**
 * DataProcessor implementation that normalizes and enriches telemetry events,
 * generates derived metrics, and transforms events into Datadog-compatible formats.
 */
export class LLMDataProcessor implements DataProcessor {
  
  /**
   * Process a single telemetry event and generate structured data
   */
  processEvent(event: TelemetryEvent): ProcessedData {
    const metrics = this.generateMetricsFromEvent(event);
    const logs = this.generateLogsFromEvent(event);
    const traces = this.generateTracesFromEvent(event);
    const alerts = this.generateAlertsFromEvent(event);
    
    return {
      metrics,
      logs,
      traces,
      alerts
    };
  }

  /**
   * Generate derived metrics from multiple telemetry events
   */
  generateMetrics(events: TelemetryEvent[]): Metric[] {
    const metrics: Metric[] = [];
    
    // Group events by time windows for aggregation
    const timeWindows = this.groupEventsByTimeWindow(events, 60000); // 1-minute windows
    
    for (const [windowStart, windowEvents] of timeWindows) {
      metrics.push(...this.calculateDerivedMetrics(windowEvents, windowStart));
    }
    
    return metrics;
  }

  /**
   * Create distributed traces from related telemetry events
   */
  createTrace(events: TelemetryEvent[]): Trace {
    // Group events by trace ID
    const traceGroups = this.groupEventsByTraceId(events);
    
    if (traceGroups.size === 0) {
      throw new Error('No events provided for trace creation');
    }
    
    // Use the first trace ID found
    const firstEntry = traceGroups.entries().next().value as [string, TelemetryEvent[]];
    const [traceId, traceEvents] = firstEntry;
    
    const spans = traceEvents.map((event: TelemetryEvent) => this.createSpanFromEvent(event));
    
    return {
      traceId,
      spans
    };
  }

  /**
   * Generate metrics from a single telemetry event
   */
  private generateMetricsFromEvent(event: TelemetryEvent): Metric[] {
    const metrics: Metric[] = [];
    const timestamp = event.timestamp;
    const baseTags = {
      environment: event.metadata.environment,
      service: event.metadata.service,
      version: event.metadata.version,
      source: event.source,
      event_type: event.type
    };

    switch (event.type) {
      case 'request':
        if (event.request) {
          metrics.push({
            name: 'llm.requests.count',
            value: 1,
            timestamp,
            tags: { ...baseTags, model: event.request.model },
            type: 'counter'
          });
          
          // Prompt length metric
          metrics.push({
            name: 'llm.prompt.length',
            value: event.request.prompt.length,
            timestamp,
            tags: { ...baseTags, model: event.request.model },
            type: 'gauge'
          });
        }
        break;

      case 'response':
        if (event.response) {
          // Response time metric
          metrics.push({
            name: 'llm.response.latency',
            value: event.response.latency,
            timestamp,
            tags: { ...baseTags },
            type: 'gauge'
          });
          
          // Token usage metrics
          metrics.push({
            name: 'llm.tokens.prompt',
            value: event.response.tokenUsage.promptTokens,
            timestamp,
            tags: { ...baseTags },
            type: 'counter'
          });
          
          metrics.push({
            name: 'llm.tokens.completion',
            value: event.response.tokenUsage.completionTokens,
            timestamp,
            tags: { ...baseTags },
            type: 'counter'
          });
          
          metrics.push({
            name: 'llm.tokens.total',
            value: event.response.tokenUsage.totalTokens,
            timestamp,
            tags: { ...baseTags },
            type: 'counter'
          });
          
          // Cost metric
          metrics.push({
            name: 'llm.cost',
            value: event.response.cost,
            timestamp,
            tags: { ...baseTags },
            type: 'counter'
          });
        }
        break;

      case 'error':
        if (event.error) {
          metrics.push({
            name: 'llm.errors.count',
            value: 1,
            timestamp,
            tags: { ...baseTags, error_code: event.error.code },
            type: 'counter'
          });
        }
        break;
    }

    return metrics;
  }

  /**
   * Generate log entries from a telemetry event
   */
  private generateLogsFromEvent(event: TelemetryEvent): LogEntry[] {
    const baseLog: Omit<LogEntry, 'level' | 'message'> = {
      timestamp: event.timestamp,
      service: event.metadata.service,
      tags: {
        environment: event.metadata.environment,
        version: event.metadata.version,
        source: event.source,
        trace_id: event.metadata.traceId,
        span_id: event.metadata.spanId
      },
      attributes: {
        event_id: event.id,
        event_type: event.type,
        ...event.request && { request: event.request },
        ...event.response && { response: event.response },
        ...event.error && { error: event.error }
      }
    };

    const logs: LogEntry[] = [];

    switch (event.type) {
      case 'request':
        logs.push({
          ...baseLog,
          level: 'info',
          message: `LLM request initiated for model ${event.request?.model} with ${event.request?.prompt.length} character prompt`
        });
        break;

      case 'response':
        logs.push({
          ...baseLog,
          level: 'info',
          message: `LLM response completed in ${event.response?.latency}ms with ${event.response?.tokenUsage.totalTokens} tokens (cost: $${event.response?.cost})`
        });
        break;

      case 'error':
        logs.push({
          ...baseLog,
          level: 'error',
          message: `LLM error occurred: ${event.error?.code} - ${event.error?.message}`
        });
        break;

      case 'metric':
        logs.push({
          ...baseLog,
          level: 'debug',
          message: `LLM metric event recorded`
        });
        break;
    }

    return logs;
  }

  /**
   * Generate traces from a telemetry event
   */
  private generateTracesFromEvent(event: TelemetryEvent): Trace[] {
    const span = this.createSpanFromEvent(event);
    
    return [{
      traceId: event.metadata.traceId,
      spans: [span]
    }];
  }

  /**
   * Generate alerts from a telemetry event based on thresholds
   */
  private generateAlertsFromEvent(event: TelemetryEvent): Alert[] {
    const alerts: Alert[] = [];

    // High latency alert
    if (event.type === 'response' && event.response && event.response.latency > 10000) {
      alerts.push({
        id: uuidv4(),
        ruleId: 'high-latency',
        severity: 'warning',
        title: 'High LLM Response Latency',
        description: `Response latency of ${event.response.latency}ms exceeds threshold of 10000ms`,
        timestamp: event.timestamp,
        tags: {
          environment: event.metadata.environment,
          service: event.metadata.service,
          source: event.source
        },
        context: {
          event_id: event.id,
          latency: event.response.latency,
          model: event.request?.model
        }
      });
    }

    // High cost alert
    if (event.type === 'response' && event.response && event.response.cost > 1.0) {
      alerts.push({
        id: uuidv4(),
        ruleId: 'high-cost',
        severity: 'warning',
        title: 'High LLM Request Cost',
        description: `Request cost of $${event.response.cost} exceeds threshold of $1.00`,
        timestamp: event.timestamp,
        tags: {
          environment: event.metadata.environment,
          service: event.metadata.service,
          source: event.source
        },
        context: {
          event_id: event.id,
          cost: event.response.cost,
          tokens: event.response.tokenUsage.totalTokens,
          model: event.request?.model
        }
      });
    }

    // Error alert
    if (event.type === 'error' && event.error) {
      const severity = this.getErrorSeverity(event.error.code);
      alerts.push({
        id: uuidv4(),
        ruleId: 'llm-error',
        severity,
        title: 'LLM Error Occurred',
        description: `LLM error: ${event.error.code} - ${event.error.message}`,
        timestamp: event.timestamp,
        tags: {
          environment: event.metadata.environment,
          service: event.metadata.service,
          source: event.source,
          error_code: event.error.code
        },
        context: {
          event_id: event.id,
          error_code: event.error.code,
          error_message: event.error.message,
          stack_trace: event.error.stack
        }
      });
    }

    return alerts;
  }

  /**
   * Calculate derived metrics from a group of events in a time window
   */
  private calculateDerivedMetrics(events: TelemetryEvent[], windowStart: number): Metric[] {
    const metrics: Metric[] = [];
    const timestamp = new Date(windowStart);
    
    // Calculate success rate
    const totalRequests = events.filter(e => e.type === 'request').length;
    const errorCount = events.filter(e => e.type === 'error').length;
    const successRate = totalRequests > 0 ? ((totalRequests - errorCount) / totalRequests) * 100 : 100;
    
    metrics.push({
      name: 'llm.success_rate',
      value: successRate,
      timestamp,
      tags: { window: '1m' },
      type: 'gauge'
    });

    // Calculate average response time
    const responseEvents = events.filter(e => e.type === 'response' && e.response);
    if (responseEvents.length > 0) {
      const avgLatency = responseEvents.reduce((sum, e) => sum + (e.response?.latency || 0), 0) / responseEvents.length;
      
      metrics.push({
        name: 'llm.response.latency.avg',
        value: avgLatency,
        timestamp,
        tags: { window: '1m' },
        type: 'gauge'
      });

      // Calculate percentiles
      const latencies = responseEvents.map(e => e.response?.latency || 0).sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p99Index = Math.floor(latencies.length * 0.99);
      
      metrics.push({
        name: 'llm.response.latency.p95',
        value: latencies[p95Index] || 0,
        timestamp,
        tags: { window: '1m' },
        type: 'gauge'
      });
      
      metrics.push({
        name: 'llm.response.latency.p99',
        value: latencies[p99Index] || 0,
        timestamp,
        tags: { window: '1m' },
        type: 'gauge'
      });
    }

    // Calculate throughput (requests per minute)
    metrics.push({
      name: 'llm.throughput',
      value: totalRequests,
      timestamp,
      tags: { window: '1m' },
      type: 'gauge'
    });

    return metrics;
  }

  /**
   * Create a span from a telemetry event
   */
  private createSpanFromEvent(event: TelemetryEvent): Span {
    const startTime = event.timestamp.getTime() * 1000; // Convert to microseconds
    let duration = 0;
    let operationName = `llm.${event.type}`;

    // Calculate duration for response events
    if (event.type === 'response' && event.response) {
      duration = event.response.latency * 1000; // Convert ms to microseconds
      operationName = `llm.${event.request?.model || 'unknown'}.generate`;
    }

    const span: Span = {
      spanId: event.metadata.spanId,
      operationName,
      serviceName: event.metadata.service,
      startTime,
      duration,
      tags: {
        environment: event.metadata.environment,
        version: event.metadata.version,
        source: event.source,
        event_type: event.type,
        ...(event.request?.model && { model: event.request.model }),
        ...(event.error?.code && { error_code: event.error.code })
      }
    };
    
    // Add optional properties only if they exist
    if (event.error) {
      span.logs = [{
        timestamp: startTime,
        fields: {
          level: 'error',
          message: event.error.message,
          ...(event.error.stack && { stack: event.error.stack })
        }
      }];
    }
    
    return span;
  }

  /**
   * Group events by time windows for aggregation
   */
  private groupEventsByTimeWindow(events: TelemetryEvent[], windowSizeMs: number): Map<number, TelemetryEvent[]> {
    const windows = new Map<number, TelemetryEvent[]>();
    
    for (const event of events) {
      const windowStart = Math.floor(event.timestamp.getTime() / windowSizeMs) * windowSizeMs;
      
      if (!windows.has(windowStart)) {
        windows.set(windowStart, []);
      }
      
      windows.get(windowStart)!.push(event);
    }
    
    return windows;
  }

  /**
   * Group events by trace ID
   */
  private groupEventsByTraceId(events: TelemetryEvent[]): Map<string, TelemetryEvent[]> {
    const traces = new Map<string, TelemetryEvent[]>();
    
    for (const event of events) {
      const traceId = event.metadata.traceId;
      
      if (!traces.has(traceId)) {
        traces.set(traceId, []);
      }
      
      traces.get(traceId)!.push(event);
    }
    
    return traces;
  }

  /**
   * Determine error severity based on error code
   */
  private getErrorSeverity(errorCode: string): 'info' | 'warning' | 'error' | 'critical' {
    // Map common error codes to severity levels
    const criticalErrors = ['QUOTA_EXCEEDED', 'AUTHENTICATION_FAILED', 'SERVICE_UNAVAILABLE'];
    const errorCodes = ['INVALID_REQUEST', 'MODEL_NOT_FOUND', 'TIMEOUT'];
    const warningCodes = ['RATE_LIMITED', 'DEPRECATED_MODEL'];
    
    if (criticalErrors.includes(errorCode)) {
      return 'critical';
    } else if (errorCodes.includes(errorCode)) {
      return 'error';
    } else if (warningCodes.includes(errorCode)) {
      return 'warning';
    } else {
      return 'info';
    }
  }
}