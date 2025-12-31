import { DetectionRule } from '../types';
import { ProcessedData, Alert } from '../interfaces';
import { DetectionEngine as IDetectionEngine } from '../interfaces';
import { RuleEvaluator } from './rule-evaluator';
import { RuleStateManager } from './rule-state-manager';

/**
 * Detection engine that evaluates performance and operational rules
 * Supports threshold-based, anomaly-based, and pattern-based detection
 */
export class DetectionEngine implements IDetectionEngine {
  private rules: Map<string, DetectionRule> = new Map();
  private ruleEvaluator: RuleEvaluator;
  private stateManager: RuleStateManager;
  private isRunning: boolean = false;

  constructor() {
    this.ruleEvaluator = new RuleEvaluator();
    this.stateManager = new RuleStateManager();
  }

  /**
   * Add a new detection rule
   */
  public addRule(rule: DetectionRule): void {
    this.validateRule(rule);
    this.rules.set(rule.id, { ...rule });
    console.log(`Added detection rule: ${rule.name} (${rule.id})`);
  }

  /**
   * Evaluate all rules against processed data and return triggered alerts
   */
  public evaluateRules(data: ProcessedData): Alert[] {
    if (!this.isRunning) {
      this.isRunning = true;
    }

    const alerts: Alert[] = [];
    
    for (const rule of this.rules.values()) {
      try {
        const context = this.stateManager.getContext(rule);
        const alert = this.ruleEvaluator.evaluateRule(rule, data, context);
        
        if (alert) {
          alerts.push(alert);
          this.executeAlertActions(rule, alert);
        }
        
        // Update state with current evaluation
        this.stateManager.updateContext(rule.id, context.currentValue);
      } catch (error) {
        console.error(`Error evaluating rule ${rule.id}:`, error);
      }
    }

    return alerts;
  }

  /**
   * Update an existing detection rule
   */
  public updateRule(ruleId: string, rule: DetectionRule): void {
    if (!this.rules.has(ruleId)) {
      throw new Error(`Rule with id ${ruleId} not found`);
    }
    
    this.validateRule(rule);
    
    // Ensure the rule ID matches
    if (rule.id !== ruleId) {
      throw new Error(`Rule ID mismatch: expected ${ruleId}, got ${rule.id}`);
    }
    
    this.rules.set(ruleId, { ...rule });
    console.log(`Updated detection rule: ${rule.name} (${ruleId})`);
  }

  /**
   * Remove a detection rule
   */
  public removeRule(ruleId: string): void {
    if (!this.rules.has(ruleId)) {
      throw new Error(`Rule with id ${ruleId} not found`);
    }
    
    this.rules.delete(ruleId);
    this.stateManager.removeRuleState(ruleId);
    console.log(`Removed detection rule: ${ruleId}`);
  }

  /**
   * Get all current rules
   */
  public getRules(): DetectionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a specific rule by ID
   */
  public getRule(ruleId: string): DetectionRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get engine statistics
   */
  public getStatistics(): {
    totalRules: number;
    rulesByType: Record<string, number>;
    ruleBySeverity: Record<string, number>;
    stateStats: any;
  } {
    const rulesByType: Record<string, number> = {};
    const ruleBySeverity: Record<string, number> = {};

    for (const rule of this.rules.values()) {
      // Count by type (derived from condition)
      const type = this.getRuleType(rule.condition);
      rulesByType[type] = (rulesByType[type] || 0) + 1;
      
      // Count by severity
      ruleBySeverity[rule.severity] = (ruleBySeverity[rule.severity] || 0) + 1;
    }

    return {
      totalRules: this.rules.size,
      rulesByType,
      ruleBySeverity,
      stateStats: this.stateManager.getStateStatistics()
    };
  }

  /**
   * Clean up stale rule states
   */
  public cleanup(maxAgeMinutes: number = 60): number {
    return this.stateManager.cleanupStaleStates(maxAgeMinutes);
  }

  /**
   * Validate a detection rule
   */
  private validateRule(rule: DetectionRule): void {
    if (!rule.id || typeof rule.id !== 'string') {
      throw new Error('Rule must have a valid string ID');
    }
    
    if (!rule.name || typeof rule.name !== 'string') {
      throw new Error('Rule must have a valid name');
    }
    
    if (!rule.condition || typeof rule.condition !== 'string') {
      throw new Error('Rule must have a valid condition');
    }
    
    if (typeof rule.threshold !== 'number' || isNaN(rule.threshold)) {
      throw new Error('Rule must have a valid numeric threshold');
    }
    
    if (!rule.timeWindow || typeof rule.timeWindow !== 'string') {
      throw new Error('Rule must have a valid time window');
    }
    
    if (!['info', 'warning', 'error', 'critical'].includes(rule.severity)) {
      throw new Error('Rule severity must be one of: info, warning, error, critical');
    }
    
    if (!Array.isArray(rule.actions)) {
      throw new Error('Rule actions must be an array');
    }
  }

  /**
   * Execute alert actions for a triggered rule
   */
  private executeAlertActions(rule: DetectionRule, alert: Alert): void {
    // Add to recent alerts
    this.addAlert(rule, alert);
    
    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case 'email':
            console.log(`Would send email alert to ${action.target} for rule ${rule.name}`);
            break;
          case 'slack':
            console.log(`Would send Slack alert to ${action.target} for rule ${rule.name}`);
            break;
          case 'webhook':
            console.log(`Would send webhook to ${action.target} for rule ${rule.name}`);
            break;
          case 'datadog-incident':
            console.log(`Would create Datadog incident for rule ${rule.name}`);
            break;
          default:
            console.warn(`Unknown alert action type: ${action.type}`);
        }
      } catch (error) {
        console.error(`Error executing alert action ${action.type} for rule ${rule.id}:`, error);
      }
    }
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

  // Alert management for API endpoints
  private recentAlerts: Array<{
    id: string;
    ruleId: string;
    ruleName: string;
    message: string;
    severity: string;
    timestamp: Date;
    acknowledged: boolean;
  }> = [];

  /**
   * Get recent alerts
   */
  public getRecentAlerts(): Array<{
    id: string;
    ruleId: string;
    ruleName: string;
    message: string;
    severity: string;
    timestamp: string;
    acknowledged: boolean;
  }> {
    return this.recentAlerts.map(alert => ({
      ...alert,
      timestamp: alert.timestamp.toISOString()
    }));
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string): void {
    const alert = this.recentAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Add alert to recent alerts (called when rule is triggered)
   */
  private addAlert(rule: DetectionRule, alert: Alert): void {
    this.recentAlerts.push({
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      message: alert.description,
      severity: alert.severity,
      timestamp: new Date(),
      acknowledged: false
    });

    // Keep only last 100 alerts
    if (this.recentAlerts.length > 100) {
      this.recentAlerts.shift();
    }
  }
}