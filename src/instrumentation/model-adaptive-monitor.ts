import { MonitoringConfig } from '../interfaces';
import { TelemetryEvent, DetectionRule } from '../types';

/**
 * Model characteristics and capabilities
 */
export interface ModelCharacteristics {
  provider: 'vertex-ai' | 'gemini' | 'unknown';
  modelFamily: string;
  modelVersion: string;
  capabilities: ModelCapability[];
  tokenLimits: {
    maxInputTokens: number;
    maxOutputTokens: number;
    contextWindow: number;
  };
  costStructure: {
    inputTokenCost: number;
    outputTokenCost: number;
    currency: string;
  };
  performanceBaselines: {
    averageLatency: number;
    p95Latency: number;
    p99Latency: number;
  };
  knownLimitations: string[];
}

/**
 * Model capability types
 */
export type ModelCapability = 
  | 'text-generation' 
  | 'code-generation' 
  | 'conversation' 
  | 'function-calling' 
  | 'multimodal' 
  | 'reasoning' 
  | 'analysis';

/**
 * Adaptive monitoring strategy for a specific model
 */
export interface AdaptiveMonitoringStrategy {
  modelId: string;
  characteristics: ModelCharacteristics;
  metricCollectionRules: MetricCollectionRule[];
  detectionRules: DetectionRule[];
  alertThresholds: AlertThreshold[];
  samplingStrategy: SamplingStrategy;
}

/**
 * Metric collection rule for specific model characteristics
 */
export interface MetricCollectionRule {
  id: string;
  name: string;
  condition: string;
  metrics: string[];
  frequency: 'always' | 'sample' | 'conditional';
  priority: 'high' | 'medium' | 'low';
}

/**
 * Alert threshold configuration for model-specific monitoring
 */
export interface AlertThreshold {
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'anomaly';
  value: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  description: string;
}

/**
 * Sampling strategy for telemetry collection
 */
export interface SamplingStrategy {
  type: 'fixed' | 'adaptive' | 'error-biased';
  baseRate: number;
  maxRate: number;
  conditions: SamplingCondition[];
}

/**
 * Sampling condition for adaptive sampling
 */
export interface SamplingCondition {
  condition: string;
  rate: number;
  priority: number;
}

/**
 * Model-adaptive monitoring system that adjusts monitoring strategies
 * based on LLM model characteristics and capabilities
 */
export class ModelAdaptiveMonitor {
  private strategies: Map<string, AdaptiveMonitoringStrategy> = new Map();
  private modelRegistry: Map<string, ModelCharacteristics> = new Map();
  private config: MonitoringConfig;

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.initializeModelRegistry();
  }

  /**
   * Register a new model with its characteristics
   */
  registerModel(modelId: string, characteristics: ModelCharacteristics): void {
    this.modelRegistry.set(modelId, characteristics);
    
    // Generate adaptive monitoring strategy for this model
    const strategy = this.generateMonitoringStrategy(modelId, characteristics);
    this.strategies.set(modelId, strategy);
  }

  /**
   * Get monitoring strategy for a specific model
   */
  getMonitoringStrategy(modelId: string): AdaptiveMonitoringStrategy | null {
    return this.strategies.get(modelId) || null;
  }

  /**
   * Adapt monitoring strategy based on observed model behavior
   */
  adaptStrategy(modelId: string, observedMetrics: Record<string, number>): void {
    const strategy = this.strategies.get(modelId);
    if (!strategy) {
      return;
    }

    // Update performance baselines based on observed metrics
    if (observedMetrics.averageLatency) {
      strategy.characteristics.performanceBaselines.averageLatency = 
        this.updateBaseline(
          strategy.characteristics.performanceBaselines.averageLatency,
          observedMetrics.averageLatency
        );
    }

    // Adjust alert thresholds based on new baselines
    this.adjustAlertThresholds(strategy, observedMetrics);

    // Update sampling strategy if needed
    this.updateSamplingStrategy(strategy, observedMetrics);
  }

  /**
   * Determine if a telemetry event should be collected based on model strategy
   */
  shouldCollectTelemetry(event: TelemetryEvent): boolean {
    const modelId = this.extractModelId(event);
    const strategy = this.strategies.get(modelId);
    
    if (!strategy) {
      // Default collection for unknown models
      return true;
    }

    return this.evaluateSamplingStrategy(event, strategy.samplingStrategy);
  }

  /**
   * Get model-specific metrics to collect for an event
   */
  getMetricsToCollect(event: TelemetryEvent): string[] {
    const modelId = this.extractModelId(event);
    const strategy = this.strategies.get(modelId);
    
    if (!strategy) {
      return this.getDefaultMetrics();
    }

    const metrics: string[] = [];
    
    for (const rule of strategy.metricCollectionRules) {
      if (this.evaluateCollectionCondition(event, rule.condition)) {
        metrics.push(...rule.metrics);
      }
    }

    return [...new Set(metrics)]; // Remove duplicates
  }

  /**
   * Get model-specific detection rules
   */
  getDetectionRules(modelId: string): DetectionRule[] {
    const strategy = this.strategies.get(modelId);
    return strategy ? strategy.detectionRules : this.getDefaultDetectionRules();
  }

  /**
   * Get all registered models
   */
  getRegisteredModels(): string[] {
    return Array.from(this.modelRegistry.keys());
  }

  /**
   * Get model characteristics
   */
  getModelCharacteristics(modelId: string): ModelCharacteristics | null {
    return this.modelRegistry.get(modelId) || null;
  }

  /**
   * Initialize the model registry with known models
   */
  private initializeModelRegistry(): void {
    // Gemini models
    this.registerModel('gemini-pro', {
      provider: 'gemini',
      modelFamily: 'gemini',
      modelVersion: 'pro',
      capabilities: ['text-generation', 'conversation', 'reasoning', 'analysis'],
      tokenLimits: {
        maxInputTokens: 30720,
        maxOutputTokens: 2048,
        contextWindow: 32768
      },
      costStructure: {
        inputTokenCost: 0.00025,
        outputTokenCost: 0.0005,
        currency: 'USD'
      },
      performanceBaselines: {
        averageLatency: 2000,
        p95Latency: 5000,
        p99Latency: 8000
      },
      knownLimitations: ['No function calling', 'Limited multimodal support']
    });

    this.registerModel('gemini-1.5-pro', {
      provider: 'gemini',
      modelFamily: 'gemini',
      modelVersion: '1.5-pro',
      capabilities: ['text-generation', 'conversation', 'reasoning', 'analysis', 'multimodal', 'function-calling'],
      tokenLimits: {
        maxInputTokens: 1000000,
        maxOutputTokens: 8192,
        contextWindow: 1048576
      },
      costStructure: {
        inputTokenCost: 0.00125,
        outputTokenCost: 0.00375,
        currency: 'USD'
      },
      performanceBaselines: {
        averageLatency: 3000,
        p95Latency: 7000,
        p99Latency: 12000
      },
      knownLimitations: ['Higher cost for large contexts']
    });

    // Vertex AI models
    this.registerModel('text-bison', {
      provider: 'vertex-ai',
      modelFamily: 'bison',
      modelVersion: '001',
      capabilities: ['text-generation'],
      tokenLimits: {
        maxInputTokens: 8192,
        maxOutputTokens: 1024,
        contextWindow: 8192
      },
      costStructure: {
        inputTokenCost: 0.0001,
        outputTokenCost: 0.0002,
        currency: 'USD'
      },
      performanceBaselines: {
        averageLatency: 1500,
        p95Latency: 3000,
        p99Latency: 5000
      },
      knownLimitations: ['Limited context window', 'No conversation memory']
    });

    this.registerModel('chat-bison', {
      provider: 'vertex-ai',
      modelFamily: 'bison',
      modelVersion: '001',
      capabilities: ['conversation', 'text-generation'],
      tokenLimits: {
        maxInputTokens: 4096,
        maxOutputTokens: 1024,
        contextWindow: 4096
      },
      costStructure: {
        inputTokenCost: 0.0001,
        outputTokenCost: 0.0002,
        currency: 'USD'
      },
      performanceBaselines: {
        averageLatency: 1800,
        p95Latency: 3500,
        p99Latency: 6000
      },
      knownLimitations: ['Smaller context window', 'Basic conversation capabilities']
    });

    this.registerModel('code-bison', {
      provider: 'vertex-ai',
      modelFamily: 'bison',
      modelVersion: '001',
      capabilities: ['code-generation', 'text-generation'],
      tokenLimits: {
        maxInputTokens: 6144,
        maxOutputTokens: 1024,
        contextWindow: 6144
      },
      costStructure: {
        inputTokenCost: 0.0001,
        outputTokenCost: 0.0002,
        currency: 'USD'
      },
      performanceBaselines: {
        averageLatency: 2200,
        p95Latency: 4000,
        p99Latency: 7000
      },
      knownLimitations: ['Specialized for code', 'Limited general conversation']
    });
  }

  /**
   * Generate monitoring strategy for a model based on its characteristics
   */
  private generateMonitoringStrategy(modelId: string, characteristics: ModelCharacteristics): AdaptiveMonitoringStrategy {
    const metricCollectionRules = this.generateMetricCollectionRules(characteristics);
    const detectionRules = this.generateDetectionRules(modelId, characteristics);
    const alertThresholds = this.generateAlertThresholds(characteristics);
    const samplingStrategy = this.generateSamplingStrategy(characteristics);

    return {
      modelId,
      characteristics,
      metricCollectionRules,
      detectionRules,
      alertThresholds,
      samplingStrategy
    };
  }

  /**
   * Generate metric collection rules based on model characteristics
   */
  private generateMetricCollectionRules(characteristics: ModelCharacteristics): MetricCollectionRule[] {
    const rules: MetricCollectionRule[] = [];

    // Base metrics for all models
    rules.push({
      id: 'base-metrics',
      name: 'Base Performance Metrics',
      condition: 'always',
      metrics: ['latency', 'token_usage', 'cost', 'success_rate'],
      frequency: 'always',
      priority: 'high'
    });

    // Model-specific metrics based on capabilities
    if (characteristics.capabilities.includes('conversation')) {
      rules.push({
        id: 'conversation-metrics',
        name: 'Conversation Quality Metrics',
        condition: 'event.type === "response"',
        metrics: ['conversation_length', 'context_utilization', 'response_coherence'],
        frequency: 'sample',
        priority: 'medium'
      });
    }

    if (characteristics.capabilities.includes('code-generation')) {
      rules.push({
        id: 'code-metrics',
        name: 'Code Generation Metrics',
        condition: 'event.request?.prompt.includes("code") || event.request?.prompt.includes("function")',
        metrics: ['code_quality_score', 'syntax_correctness', 'execution_time'],
        frequency: 'conditional',
        priority: 'medium'
      });
    }

    if (characteristics.capabilities.includes('multimodal')) {
      rules.push({
        id: 'multimodal-metrics',
        name: 'Multimodal Processing Metrics',
        condition: 'event.request?.parameters.images || event.request?.parameters.files',
        metrics: ['image_processing_time', 'multimodal_accuracy', 'content_analysis_depth'],
        frequency: 'always',
        priority: 'high'
      });
    }

    // High-cost model monitoring
    if (characteristics.costStructure.inputTokenCost > 0.001) {
      rules.push({
        id: 'cost-optimization',
        name: 'Cost Optimization Metrics',
        condition: 'always',
        metrics: ['cost_per_request', 'token_efficiency', 'cost_trend'],
        frequency: 'always',
        priority: 'high'
      });
    }

    return rules;
  }

  /**
   * Generate detection rules based on model characteristics
   */
  private generateDetectionRules(modelId: string, characteristics: ModelCharacteristics): DetectionRule[] {
    const rules: DetectionRule[] = [];

    // Latency detection rule based on model baselines
    rules.push({
      id: `${modelId}-high-latency`,
      name: `High Latency for ${modelId}`,
      description: `Detect when ${modelId} response time exceeds baseline`,
      condition: `latency > ${characteristics.performanceBaselines.p95Latency}`,
      threshold: characteristics.performanceBaselines.p95Latency,
      timeWindow: '5m',
      severity: 'warning',
      actions: [
        { type: 'datadog-incident', target: 'performance-team' }
      ]
    });

    // Token limit detection
    rules.push({
      id: `${modelId}-token-limit`,
      name: `Token Limit Approached for ${modelId}`,
      description: `Detect when token usage approaches model limits`,
      condition: `input_tokens > ${characteristics.tokenLimits.maxInputTokens * 0.9}`,
      threshold: characteristics.tokenLimits.maxInputTokens * 0.9,
      timeWindow: '1m',
      severity: 'warning',
      actions: [
        { type: 'slack', target: '#llm-alerts' }
      ]
    });

    // Cost anomaly detection for expensive models
    if (characteristics.costStructure.inputTokenCost > 0.001) {
      rules.push({
        id: `${modelId}-cost-anomaly`,
        name: `Cost Anomaly for ${modelId}`,
        description: `Detect unusual cost patterns for expensive model`,
        condition: 'cost > average_cost * 3',
        threshold: 3,
        timeWindow: '10m',
        severity: 'error',
        actions: [
          { type: 'email', target: 'cost-alerts@company.com' },
          { type: 'datadog-incident', target: 'cost-team' }
        ]
      });
    }

    return rules;
  }

  /**
   * Generate alert thresholds based on model characteristics
   */
  private generateAlertThresholds(characteristics: ModelCharacteristics): AlertThreshold[] {
    return [
      {
        metric: 'latency',
        condition: 'greater_than',
        value: characteristics.performanceBaselines.p99Latency,
        severity: 'critical',
        description: 'Response time exceeds P99 baseline'
      },
      {
        metric: 'error_rate',
        condition: 'greater_than',
        value: 0.05, // 5%
        severity: 'error',
        description: 'Error rate exceeds acceptable threshold'
      },
      {
        metric: 'token_usage_ratio',
        condition: 'greater_than',
        value: 0.95, // 95% of token limit
        severity: 'warning',
        description: 'Token usage approaching model limits'
      },
      {
        metric: 'cost_per_request',
        condition: 'greater_than',
        value: characteristics.costStructure.inputTokenCost * 10000, // 10k tokens worth
        severity: 'warning',
        description: 'Individual request cost is unusually high'
      }
    ];
  }

  /**
   * Generate sampling strategy based on model characteristics
   */
  private generateSamplingStrategy(characteristics: ModelCharacteristics): SamplingStrategy {
    // Higher sampling for expensive or experimental models
    const isExpensive = characteristics.costStructure.inputTokenCost > 0.001;
    const isExperimental = characteristics.modelVersion.includes('preview') || 
                          characteristics.modelVersion.includes('experimental');

    let baseRate = 0.1; // 10% default
    let maxRate = 1.0;

    if (isExpensive || isExperimental) {
      baseRate = 0.5; // 50% for expensive/experimental models
    }

    return {
      type: 'adaptive',
      baseRate,
      maxRate,
      conditions: [
        {
          condition: 'event.type === "error"',
          rate: 1.0, // Always sample errors
          priority: 1
        },
        {
          condition: `latency > ${characteristics.performanceBaselines.p95Latency}`,
          rate: 0.8, // High sampling for slow requests
          priority: 2
        },
        {
          condition: `cost > ${characteristics.costStructure.inputTokenCost * 1000}`,
          rate: 0.6, // Higher sampling for expensive requests
          priority: 3
        }
      ]
    };
  }

  /**
   * Extract model ID from telemetry event
   */
  private extractModelId(event: TelemetryEvent): string {
    return event.request?.model || 'unknown';
  }

  /**
   * Evaluate sampling strategy for an event
   */
  private evaluateSamplingStrategy(event: TelemetryEvent, strategy: SamplingStrategy): boolean {
    // Check high-priority conditions first
    for (const condition of strategy.conditions.sort((a, b) => a.priority - b.priority)) {
      if (this.evaluateCondition(event, condition.condition)) {
        return Math.random() < condition.rate;
      }
    }

    // Use base rate if no conditions match
    return Math.random() < strategy.baseRate;
  }

  /**
   * Evaluate a condition string against an event
   */
  private evaluateCondition(event: TelemetryEvent, condition: string): boolean {
    // Simple condition evaluation - in production, use a proper expression evaluator
    try {
      // Replace event properties in condition
      let evaluableCondition = condition
        .replace(/event\.type/g, `"${event.type}"`)
        .replace(/event\.request\.model/g, `"${event.request?.model || ''}"`)
        .replace(/latency/g, (event.response?.latency || 0).toString())
        .replace(/cost/g, (event.response?.cost || 0).toString());

      // Use Function constructor for safe evaluation (in production, use a proper parser)
      return new Function('return ' + evaluableCondition)();
    } catch {
      return false;
    }
  }

  /**
   * Evaluate collection condition for metric rules
   */
  private evaluateCollectionCondition(event: TelemetryEvent, condition: string): boolean {
    if (condition === 'always') {
      return true;
    }
    
    return this.evaluateCondition(event, condition);
  }

  /**
   * Update baseline with exponential moving average
   */
  private updateBaseline(currentBaseline: number, observedValue: number, alpha: number = 0.1): number {
    return alpha * observedValue + (1 - alpha) * currentBaseline;
  }

  /**
   * Adjust alert thresholds based on observed metrics
   */
  private adjustAlertThresholds(strategy: AdaptiveMonitoringStrategy, observedMetrics: Record<string, number>): void {
    for (const threshold of strategy.alertThresholds) {
      if (threshold.metric === 'latency' && observedMetrics.averageLatency) {
        // Adjust latency threshold based on new baseline
        const newBaseline = strategy.characteristics.performanceBaselines.averageLatency;
        threshold.value = newBaseline * 2; // 2x average as threshold
      }
    }
  }

  /**
   * Update sampling strategy based on observed behavior
   */
  private updateSamplingStrategy(strategy: AdaptiveMonitoringStrategy, observedMetrics: Record<string, number>): void {
    // Increase sampling if error rate is high
    if (observedMetrics.errorRate && observedMetrics.errorRate > 0.1) {
      strategy.samplingStrategy.baseRate = Math.min(0.5, strategy.samplingStrategy.baseRate * 1.5);
    }
    
    // Decrease sampling if system is stable
    if (observedMetrics.errorRate && observedMetrics.errorRate < 0.01) {
      strategy.samplingStrategy.baseRate = Math.max(0.05, strategy.samplingStrategy.baseRate * 0.8);
    }
  }

  /**
   * Get default metrics for unknown models
   */
  private getDefaultMetrics(): string[] {
    return ['latency', 'token_usage', 'cost', 'success_rate', 'error_count'];
  }

  /**
   * Get default detection rules for unknown models
   */
  private getDefaultDetectionRules(): DetectionRule[] {
    return [
      {
        id: 'default-high-latency',
        name: 'High Latency (Default)',
        description: 'Default high latency detection',
        condition: 'latency > 10000',
        threshold: 10000,
        timeWindow: '5m',
        severity: 'warning',
        actions: [{ type: 'slack', target: '#llm-alerts' }]
      }
    ];
  }
}