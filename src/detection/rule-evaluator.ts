import { DetectionRule } from '../types';
import { ProcessedData, Alert, Metric } from '../interfaces';

/**
 * Rule evaluation context for maintaining state during evaluation
 */
export interface RuleEvaluationContext {
  rule: DetectionRule;
  currentValue: number;
  previousValues: number[];
  lastEvaluationTime: Date;
  consecutiveViolations: number;
}

/**
 * Rule evaluator that handles different types of detection logic
 */
export class RuleEvaluator {
  /**
   * Evaluate a detection rule against processed data
   */
  public evaluateRule(rule: DetectionRule, data: ProcessedData, context: RuleEvaluationContext): Alert | null {
    try {
      const currentValue = this.extractMetricValue(rule.condition, data.metrics);
      
      // Update context
      context.currentValue = currentValue;
      context.lastEvaluationTime = new Date();
      
      // Evaluate based on rule type
      const violated = this.evaluateCondition(rule, currentValue, context);
      
      if (violated) {
        context.consecutiveViolations++;
        return this.createAlert(rule, currentValue, context);
      } else {
        context.consecutiveViolations = 0;
        return null;
      }
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
      return null;
    }
  }

  /**
   * Extract metric value based on condition expression
   */
  private extractMetricValue(condition: string, metrics: Metric[]): number {
    // Parse simple conditions like "response_time > 1000" or "error_rate > 0.05"
    const metricNameMatch = condition.match(/(\w+)/);
    if (!metricNameMatch) {
      throw new Error(`Invalid condition format: ${condition}`);
    }
    
    const metricName = metricNameMatch[1];
    const metric = metrics.find(m => m.name === metricName);
    
    if (!metric) {
      return 0; // Default to 0 if metric not found
    }
    
    return metric.value;
  }

  /**
   * Evaluate the condition based on rule type
   */
  private evaluateCondition(rule: DetectionRule, currentValue: number, context: RuleEvaluationContext): boolean {
    const condition = rule.condition.toLowerCase();
    
    // Threshold-based detection
    if (condition.includes('>')) {
      return currentValue > rule.threshold;
    } else if (condition.includes('<')) {
      return currentValue < rule.threshold;
    } else if (condition.includes('>=')) {
      return currentValue >= rule.threshold;
    } else if (condition.includes('<=')) {
      return currentValue <= rule.threshold;
    }
    
    // Anomaly-based detection (simple statistical approach)
    if (condition.includes('anomaly')) {
      return this.detectAnomaly(currentValue, context.previousValues, rule.threshold);
    }
    
    // Pattern-based detection (consecutive violations)
    if (condition.includes('pattern')) {
      return context.consecutiveViolations >= rule.threshold;
    }
    
    // Default to threshold comparison
    return currentValue > rule.threshold;
  }

  /**
   * Simple anomaly detection using standard deviation
   */
  private detectAnomaly(currentValue: number, previousValues: number[], sensitivityThreshold: number): boolean {
    if (previousValues.length < 3) {
      return false; // Need at least 3 data points for anomaly detection
    }
    
    const mean = previousValues.reduce((sum, val) => sum + val, 0) / previousValues.length;
    const variance = previousValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / previousValues.length;
    const stdDev = Math.sqrt(variance);
    
    // Consider it an anomaly if current value is more than N standard deviations from mean
    const deviations = Math.abs(currentValue - mean) / (stdDev || 1);
    return deviations > sensitivityThreshold;
  }

  /**
   * Create an alert from a violated rule
   */
  private createAlert(rule: DetectionRule, currentValue: number, context: RuleEvaluationContext): Alert {
    return {
      id: `alert_${rule.id}_${Date.now()}`,
      ruleId: rule.id,
      severity: rule.severity,
      title: `${rule.name} - Threshold Exceeded`,
      description: `${rule.description}. Current value: ${currentValue}, Threshold: ${rule.threshold}`,
      timestamp: new Date(),
      tags: {
        rule_name: rule.name,
        rule_type: this.getRuleType(rule.condition),
        consecutive_violations: context.consecutiveViolations.toString()
      },
      context: {
        currentValue,
        threshold: rule.threshold,
        condition: rule.condition,
        consecutiveViolations: context.consecutiveViolations,
        timeWindow: rule.timeWindow
      }
    };
  }

  /**
   * Determine rule type from condition
   */
  private getRuleType(condition: string): string {
    const lowerCondition = condition.toLowerCase();
    if (lowerCondition.includes('anomaly')) return 'anomaly';
    if (lowerCondition.includes('pattern')) return 'pattern';
    return 'threshold';
  }
}