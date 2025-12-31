// Core component interfaces for the LLM Observability Monitor

// Re-export all types from the types module
export * from '../types';

// Import types for use in interfaces
import {
  TelemetryEvent,
  DetectionRule,
  SecurityAssessment,
  UsageMetrics,
  CostBreakdown,
  Budget,
  BudgetStatus,
  Optimization,
  TimeRange,
  CostReport
} from '../types';

/**
 * Configuration for the monitoring system
 */
export interface MonitoringConfig {
  // Google Cloud configuration
  googleCloud: {
    projectId: string;
    location: string;
    credentials?: string; // Path to service account key file
  };
  
  // Datadog configuration
  datadog: {
    apiKey: string;
    appKey: string;
    site?: string; // e.g., 'datadoghq.com', 'datadoghq.eu'
  };
  
  // Application configuration
  application: {
    name: string;
    version: string;
    environment: string;
  };
  
  // Telemetry configuration
  telemetry: {
    batchSize: number;
    flushInterval: number; // milliseconds
    maxRetries: number;
    retryDelay: number; // milliseconds
  };
  
  // Security configuration
  security: {
    enableDlpScanning: boolean;
    sensitiveDataTypes: string[];
    confidenceThreshold: number;
  };
  
  // Cost configuration
  cost: {
    currency: string;
    budgets: Budget[];
    alertThresholds: number[];
  };
}

/**
 * Instrumentation Agent interface
 */
export interface InstrumentationAgent {
  initialize(config: MonitoringConfig): Promise<void>;
  captureRequest(request: LLMRequest): TelemetryEvent;
  captureResponse(response: LLMResponse): TelemetryEvent;
  captureError(error: LLMError): TelemetryEvent;
  shutdown(): Promise<void>;
}

/**
 * LLM Request structure
 */
export interface LLMRequest {
  id: string;
  model: string;
  prompt: string;
  parameters: Record<string, any>;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
}

/**
 * LLM Response structure
 */
export interface LLMResponse {
  id: string;
  requestId: string;
  content: string;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
  cost: number;
  timestamp: Date;
}

/**
 * LLM Error structure
 */
export interface LLMError {
  id: string;
  requestId?: string;
  code: string;
  message: string;
  stack?: string;
  timestamp: Date;
}

/**
 * Telemetry Collector interface
 */
export interface TelemetryCollector {
  collect(event: TelemetryEvent): void;
  flush(): Promise<void>;
  getMetrics(): CollectorMetrics;
}

/**
 * Collector metrics
 */
export interface CollectorMetrics {
  eventsCollected: number;
  eventsProcessed: number;
  eventsFailed: number;
  batchesSent: number;
  lastFlushTime: Date;
  queueSize: number;
}

/**
 * Data Processor interface
 */
export interface DataProcessor {
  processEvent(event: TelemetryEvent): ProcessedData;
  generateMetrics(events: TelemetryEvent[]): Metric[];
  createTrace(events: TelemetryEvent[]): Trace;
}

/**
 * Processed data structure
 */
export interface ProcessedData {
  metrics: Metric[];
  logs: LogEntry[];
  traces: Trace[];
  alerts: Alert[];
}

/**
 * Metric structure
 */
export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags: Record<string, string>;
  type: 'gauge' | 'counter' | 'histogram' | 'distribution';
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: string;
  tags: Record<string, string>;
  attributes: Record<string, any>;
}

/**
 * Trace structure
 */
export interface Trace {
  traceId: string;
  spans: Span[];
}

/**
 * Span structure
 */
export interface Span {
  spanId: string;
  parentId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  tags: Record<string, string>;
  logs?: SpanLog[];
}

/**
 * Span log structure
 */
export interface SpanLog {
  timestamp: number;
  fields: Record<string, any>;
}

/**
 * Alert structure
 */
export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  tags: Record<string, string>;
  context: Record<string, any>;
}

/**
 * Detection Engine interface
 */
export interface DetectionEngine {
  addRule(rule: DetectionRule): void;
  evaluateRules(data: ProcessedData): Alert[];
  updateRule(ruleId: string, rule: DetectionRule): void;
  removeRule(ruleId: string): void;
}

/**
 * Security Analyzer interface
 */
export interface SecurityAnalyzer {
  analyzeInput(input: string): Promise<SecurityAssessment>;
  analyzeOutput(output: string): Promise<SecurityAssessment>;
  detectPromptInjection(prompt: string): Promise<InjectionRisk>;
  scanForSensitiveData(text: string): Promise<SensitivityReport>;
}

/**
 * Injection risk assessment
 */
export interface InjectionRisk {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
  mitigation: string;
}

/**
 * Sensitivity report
 */
export interface SensitivityReport {
  hasSensitiveData: boolean;
  dataTypes: string[];
  confidence: number;
  locations: SensitiveDataLocation[];
}

/**
 * Sensitive data location
 */
export interface SensitiveDataLocation {
  type: string;
  start: number;
  end: number;
  confidence: number;
}

/**
 * Cost Analyzer interface
 */
export interface CostAnalyzer {
  calculateCost(usage: UsageMetrics): Promise<CostBreakdown>;
  trackBudget(budget: Budget): Promise<BudgetStatus>;
  identifyOptimizations(usage: UsageMetrics[]): Promise<Optimization[]>;
  generateReport(timeRange: TimeRange): Promise<CostReport>;
}