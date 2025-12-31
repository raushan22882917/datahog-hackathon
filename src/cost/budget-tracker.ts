import { Budget, BudgetStatus } from '../types';

/**
 * Tracks budget usage and generates alerts when thresholds are exceeded
 */
export class BudgetTracker {
  private budgets: Map<string, Budget>;
  private currentSpend: Map<string, number>;
  private spendHistory: Map<string, Array<{ timestamp: Date; amount: number }>>;

  constructor() {
    this.budgets = new Map();
    this.currentSpend = new Map();
    this.spendHistory = new Map();
  }

  /**
   * Add or update a budget
   */
  public addBudget(budget: Budget): void {
    this.budgets.set(budget.id, { ...budget });
    
    // Initialize spend tracking if not exists
    if (!this.currentSpend.has(budget.id)) {
      this.currentSpend.set(budget.id, 0);
      this.spendHistory.set(budget.id, []);
    }
  }

  /**
   * Record spending against a budget
   */
  public recordSpend(budgetId: string, amount: number): void {
    if (!this.budgets.has(budgetId)) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const currentAmount = this.currentSpend.get(budgetId) || 0;
    this.currentSpend.set(budgetId, currentAmount + amount);

    // Add to history
    const history = this.spendHistory.get(budgetId) || [];
    history.push({ timestamp: new Date(), amount });
    this.spendHistory.set(budgetId, history);

    // Clean up old history (keep last 1000 entries)
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
  }

  /**
   * Get current budget status
   */
  public getBudgetStatus(budgetId: string): BudgetStatus {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const currentSpend = this.getCurrentPeriodSpend(budgetId);
    const percentageUsed = (currentSpend / budget.limit) * 100;
    const projectedSpend = this.calculateProjectedSpend(budgetId);

    // Check which alert thresholds have been triggered
    const alertsTriggered = budget.alertThresholds
      .filter(threshold => percentageUsed >= threshold)
      .map(threshold => `${threshold}% threshold exceeded`);

    return {
      budget,
      currentSpend,
      percentageUsed,
      projectedSpend,
      alertsTriggered
    };
  }

  /**
   * Get all budget statuses
   */
  public getAllBudgetStatuses(): BudgetStatus[] {
    return Array.from(this.budgets.keys()).map(budgetId => 
      this.getBudgetStatus(budgetId)
    );
  }

  /**
   * Check if any budgets have exceeded alert thresholds
   */
  public checkAlerts(): Array<{ budgetId: string; status: BudgetStatus; newAlerts: string[] }> {
    const alerts: Array<{ budgetId: string; status: BudgetStatus; newAlerts: string[] }> = [];

    for (const budgetId of this.budgets.keys()) {
      const status = this.getBudgetStatus(budgetId);
      
      if (status.alertsTriggered.length > 0) {
        // For simplicity, we'll consider all current alerts as "new"
        // In a real implementation, you'd track which alerts have already been sent
        alerts.push({
          budgetId,
          status,
          newAlerts: status.alertsTriggered
        });
      }
    }

    return alerts;
  }

  /**
   * Reset budget spend for a new period
   */
  public resetBudgetPeriod(budgetId: string): void {
    if (!this.budgets.has(budgetId)) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    this.currentSpend.set(budgetId, 0);
    // Keep history but mark the reset point
    const history = this.spendHistory.get(budgetId) || [];
    history.push({ timestamp: new Date(), amount: -999999 }); // Marker for period reset
  }

  /**
   * Get spending trend for a budget
   */
  public getSpendingTrend(budgetId: string, days: number = 30): Array<{ date: string; amount: number }> {
    const history = this.spendHistory.get(budgetId) || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Filter to recent history and group by day
    const dailySpend = new Map<string, number>();
    
    for (const entry of history) {
      if (entry.timestamp >= cutoffDate && entry.amount > 0) { // Exclude reset markers
        const dateKey = entry.timestamp.toISOString().split('T')[0];
        if (dateKey) {
          const currentAmount = dailySpend.get(dateKey) || 0;
          dailySpend.set(dateKey, currentAmount + entry.amount);
        }
      }
    }

    // Convert to array and sort by date
    return Array.from(dailySpend.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get current period spend based on budget period
   */
  private getCurrentPeriodSpend(budgetId: string): number {
    const budget = this.budgets.get(budgetId)!;
    const history = this.spendHistory.get(budgetId) || [];
    
    // Calculate period start date
    const now = new Date();
    let periodStart: Date;
    
    switch (budget.period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        periodStart.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        return this.currentSpend.get(budgetId) || 0;
    }

    // Sum spending since period start
    return history
      .filter(entry => entry.timestamp >= periodStart && entry.amount > 0)
      .reduce((sum, entry) => sum + entry.amount, 0);
  }

  /**
   * Calculate projected spend for the current period
   */
  private calculateProjectedSpend(budgetId: string): number {
    const budget = this.budgets.get(budgetId)!;
    const currentSpend = this.getCurrentPeriodSpend(budgetId);
    
    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;
    
    switch (budget.period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 1);
        break;
      case 'weekly':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);
        break;
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
      default:
        return currentSpend;
    }

    // Calculate how much of the period has elapsed
    const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
    const elapsedMs = now.getTime() - periodStart.getTime();
    const elapsedRatio = elapsedMs / totalPeriodMs;

    // Project based on current spending rate
    if (elapsedRatio > 0) {
      return currentSpend / elapsedRatio;
    }

    return currentSpend;
  }

  /**
   * Remove a budget
   */
  public removeBudget(budgetId: string): void {
    this.budgets.delete(budgetId);
    this.currentSpend.delete(budgetId);
    this.spendHistory.delete(budgetId);
  }

  /**
   * Get budget utilization summary
   */
  public getBudgetSummary(): {
    totalBudgets: number;
    totalLimit: number;
    totalSpend: number;
    averageUtilization: number;
    budgetsOverThreshold: number;
  } {
    const statuses = this.getAllBudgetStatuses();
    
    const totalLimit = statuses.reduce((sum, status) => sum + status.budget.limit, 0);
    const totalSpend = statuses.reduce((sum, status) => sum + status.currentSpend, 0);
    const averageUtilization = statuses.length > 0 ? 
      statuses.reduce((sum, status) => sum + status.percentageUsed, 0) / statuses.length : 0;
    const budgetsOverThreshold = statuses.filter(status => status.alertsTriggered.length > 0).length;

    return {
      totalBudgets: statuses.length,
      totalLimit,
      totalSpend,
      averageUtilization,
      budgetsOverThreshold
    };
  }
}