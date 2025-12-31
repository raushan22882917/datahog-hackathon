import { DetectionRule } from '../types';
import { RuleEvaluationContext } from './rule-evaluator';

/**
 * Manages state for detection rules including historical data and evaluation context
 */
export class RuleStateManager {
  private ruleStates: Map<string, RuleEvaluationContext> = new Map();
  private readonly maxHistorySize = 100; // Maximum number of historical values to keep

  /**
   * Get or create evaluation context for a rule
   */
  public getContext(rule: DetectionRule): RuleEvaluationContext {
    let context = this.ruleStates.get(rule.id);
    
    if (!context) {
      context = {
        rule,
        currentValue: 0,
        previousValues: [],
        lastEvaluationTime: new Date(),
        consecutiveViolations: 0
      };
      this.ruleStates.set(rule.id, context);
    }
    
    return context;
  }

  /**
   * Update context with new evaluation data
   */
  public updateContext(ruleId: string, value: number): void {
    const context = this.ruleStates.get(ruleId);
    if (!context) {
      return;
    }

    // Add current value to history
    context.previousValues.push(context.currentValue);
    
    // Maintain history size limit
    if (context.previousValues.length > this.maxHistorySize) {
      context.previousValues.shift();
    }
    
    context.currentValue = value;
    context.lastEvaluationTime = new Date();
  }

  /**
   * Remove state for a rule (when rule is deleted)
   */
  public removeRuleState(ruleId: string): void {
    this.ruleStates.delete(ruleId);
  }

  /**
   * Clear all rule states
   */
  public clearAllStates(): void {
    this.ruleStates.clear();
  }

  /**
   * Get statistics about rule states
   */
  public getStateStatistics(): {
    totalRules: number;
    activeRules: number;
    averageHistorySize: number;
  } {
    const totalRules = this.ruleStates.size;
    let activeRules = 0;
    let totalHistorySize = 0;

    for (const context of this.ruleStates.values()) {
      if (context.lastEvaluationTime > new Date(Date.now() - 5 * 60 * 1000)) { // Active in last 5 minutes
        activeRules++;
      }
      totalHistorySize += context.previousValues.length;
    }

    return {
      totalRules,
      activeRules,
      averageHistorySize: totalRules > 0 ? totalHistorySize / totalRules : 0
    };
  }

  /**
   * Clean up old rule states that haven't been evaluated recently
   */
  public cleanupStaleStates(maxAgeMinutes: number = 60): number {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    let removedCount = 0;

    for (const [ruleId, context] of this.ruleStates.entries()) {
      if (context.lastEvaluationTime < cutoffTime) {
        this.ruleStates.delete(ruleId);
        removedCount++;
      }
    }

    return removedCount;
  }
}