// Main entry point for the LLM Observability Monitor

export * from './types';
export * from './interfaces';
export * from './config';
export * from './detection';
export * from './security';
export * from './cost';
export * from './scaling';
export * from './telemetry';
export * from './processing';
export * from './instrumentation';
export * from './datadog';

// Re-export key types for convenience
export type {
  MonitoringConfig,
  InstrumentationAgent,
  TelemetryCollector,
  DataProcessor,
  DetectionEngine
} from './interfaces';

export type {
  TelemetryEvent,
  SecurityAssessment,
  DetectionRule,
  CostBreakdown,
  UsageMetrics
} from './types';

// Configuration utilities
export { ConfigUtils, loadConfig, getDefaultConfig, validateConfig, RealImplementationFlags } from './config';

// Core implementations
export { PricingCalculator } from './cost/pricing-calculator';
export { CostAnalyzer } from './cost/cost-analyzer';
export { SecurityAnalyzer } from './security/security-analyzer';