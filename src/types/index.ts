// Core type definitions for the LLM Observability Monitor

/**
 * Primary telemetry event structure
 */
export interface TelemetryEvent {
  id: string;
  timestamp: Date;
  type: 'request' | 'response' | 'error' | 'metric';
  source: 'vertex-ai' | 'gemini' | 'application';
  
  // Request/Response data
  request?: {
    model: string;
    prompt: string;
    parameters: Record<string, any>;
    userId?: string;
    sessionId?: string;
  };
  
  response?: {
    content: string;
    tokenUsage: TokenUsage;
    latency: number;
    cost: number;
  };
  
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  
  // Metadata
  metadata: {
    environment: string;
    version: string;
    service: string;
    traceId: string;
    spanId: string;
  };
}

/**
 * Token usage tracking
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Security assessment results
 */
export interface SecurityAssessment {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  threats: SecurityThreat[];
  sensitiveDataFound: boolean;
  complianceViolations: ComplianceViolation[];
}

/**
 * Security threat information
 */
export interface SecurityThreat {
  type: 'prompt-injection' | 'harmful-content' | 'bias' | 'data-exposure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  mitigation?: string;
}

/**
 * Compliance violation details
 */
export interface ComplianceViolation {
  regulation: string;
  violationType: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Detection rule configuration
 */
export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  condition: string; // Query expression
  threshold: number;
  timeWindow: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  actions: AlertAction[];
}

/**
 * Alert action configuration
 */
export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'datadog-incident';
  target: string;
  template?: string;
}

/**
 * Cost tracking structures
 */
export interface CostBreakdown {
  totalCost: number;
  costByModel: Record<string, number>;
  costByFeature: Record<string, number>;
  projectedMonthlyCost: number;
}

/**
 * Usage metrics for cost calculation
 */
export interface UsageMetrics {
  model: string;
  tokenUsage: TokenUsage;
  requestCount: number;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

/**
 * Budget configuration and status
 */
export interface Budget {
  id: string;
  name: string;
  limit: number;
  period: 'daily' | 'weekly' | 'monthly';
  alertThresholds: number[]; // Percentage thresholds (e.g., [50, 80, 95])
}

export interface BudgetStatus {
  budget: Budget;
  currentSpend: number;
  percentageUsed: number;
  projectedSpend: number;
  alertsTriggered: string[];
}

/**
 * Cost optimization recommendation
 */
export interface Optimization {
  type: 'model-switch' | 'parameter-tuning' | 'caching' | 'batching';
  description: string;
  estimatedSavings: number;
  confidence: number;
  implementation: string;
}

/**
 * Time range specification
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Cost report structure
 */
export interface CostReport {
  timeRange: TimeRange;
  totalCost: number;
  breakdown: CostBreakdown;
  trends: CostTrend[];
  optimizations: Optimization[];
}

/**
 * Cost trend data
 */
export interface CostTrend {
  period: string;
  cost: number;
  usage: number;
  efficiency: number;
}