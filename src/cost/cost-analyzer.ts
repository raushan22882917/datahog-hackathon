import { CostBreakdown, UsageMetrics, Budget, BudgetStatus, Optimization, TimeRange, CostReport, CostTrend } from '../types';
import { CostAnalyzer as ICostAnalyzer } from '../interfaces';
import { PricingCalculator } from './pricing-calculator';
import { BudgetTracker } from './budget-tracker';
import { OptimizationEngine } from './optimization-engine';

/**
 * Main cost analyzer that coordinates cost tracking, budget management, and optimization
 */
export class CostAnalyzer implements ICostAnalyzer {
  private pricingCalculator: PricingCalculator;
  private budgetTracker: BudgetTracker;
  private optimizationEngine: OptimizationEngine;
  private usageHistory: UsageMetrics[];

  constructor() {
    this.pricingCalculator = new PricingCalculator();
    this.budgetTracker = new BudgetTracker();
    this.optimizationEngine = new OptimizationEngine(this.pricingCalculator);
    this.usageHistory = [];
  }

  /**
   * Calculate cost breakdown for usage metrics
   */
  public async calculateCost(usage: UsageMetrics): Promise<CostBreakdown> {
    // Record usage in history
    this.usageHistory.push(usage);
    
    // Keep history manageable (last 10000 entries)
    if (this.usageHistory.length > 10000) {
      this.usageHistory.shift();
    }

    const totalCost = await this.pricingCalculator.calculateUsageCost(usage);

    // Calculate cost by model
    const costByModel: Record<string, number> = {
      [usage.model]: totalCost
    };

    // Calculate cost by feature (simplified categorization)
    const costByFeature: Record<string, number> = {
      'text-generation': 0,
      'chat': 0,
      'code': 0,
      'vision': 0,
      'other': 0
    };

    // Categorize based on model name
    if (usage.model.includes('chat')) {
      costByFeature['chat'] = totalCost;
    } else if (usage.model.includes('code')) {
      costByFeature['code'] = totalCost;
    } else if (usage.model.includes('vision')) {
      costByFeature['vision'] = totalCost;
    } else if (usage.model.includes('text') || usage.model.includes('bison')) {
      costByFeature['text-generation'] = totalCost;
    } else {
      costByFeature['other'] = totalCost;
    }

    // Calculate projected monthly cost based on recent usage
    const projectedMonthlyCost = await this.calculateProjectedMonthlyCost();

    return {
      totalCost,
      costByModel,
      costByFeature,
      projectedMonthlyCost
    };
  }

  /**
   * Track budget and return status
   */
  public async trackBudget(budget: Budget): Promise<BudgetStatus> {
    // Add budget if not exists
    this.budgetTracker.addBudget(budget);

    // Record recent spending against this budget
    const recentUsage = this.getRecentUsageForBudget(budget);
    const recentCost = await this.pricingCalculator.calculateBatchCost(recentUsage);
    
    if (recentCost > 0) {
      this.budgetTracker.recordSpend(budget.id, recentCost);
    }

    return this.budgetTracker.getBudgetStatus(budget.id);
  }

  /**
   * Identify optimization opportunities
   */
  public async identifyOptimizations(usage: UsageMetrics[]): Promise<Optimization[]> {
    // Combine provided usage with historical data for better analysis
    const allUsage = [...this.usageHistory, ...usage];
    return await this.optimizationEngine.identifyOptimizations(allUsage);
  }

  /**
   * Generate comprehensive cost report
   */
  public async generateReport(timeRange: TimeRange): Promise<CostReport> {
    // Filter usage to time range
    const filteredUsage = this.usageHistory.filter(usage => 
      usage.timestamp >= timeRange.start && usage.timestamp <= timeRange.end
    );

    if (filteredUsage.length === 0) {
      return {
        timeRange,
        totalCost: 0,
        breakdown: {
          totalCost: 0,
          costByModel: {},
          costByFeature: {},
          projectedMonthlyCost: 0
        },
        trends: [],
        optimizations: []
      };
    }

    // Calculate total cost and breakdown
    const totalCost = await this.pricingCalculator.calculateBatchCost(filteredUsage);
    const breakdown = await this.calculateAggregatedBreakdown(filteredUsage);
    
    // Generate trends
    const trends = await this.calculateCostTrends(filteredUsage);
    
    // Get optimization recommendations
    const optimizations = await this.identifyOptimizations(filteredUsage);

    return {
      timeRange,
      totalCost,
      breakdown,
      trends,
      optimizations
    };
  }

  /**
   * Get real-time cost metrics
   */
  public async getRealTimeCosts(): Promise<{
    currentHourCost: number;
    currentDayCost: number;
    currentMonthCost: number;
    projectedMonthlyCost: number;
  }> {
    const now = new Date();
    
    // Current hour
    const hourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    const currentHourUsage = this.usageHistory.filter(usage => usage.timestamp >= hourStart);
    const currentHourCost = await this.pricingCalculator.calculateBatchCost(currentHourUsage);

    // Current day
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentDayUsage = this.usageHistory.filter(usage => usage.timestamp >= dayStart);
    const currentDayCost = await this.pricingCalculator.calculateBatchCost(currentDayUsage);

    // Current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthUsage = this.usageHistory.filter(usage => usage.timestamp >= monthStart);
    const currentMonthCost = await this.pricingCalculator.calculateBatchCost(currentMonthUsage);

    const projectedMonthlyCost = await this.calculateProjectedMonthlyCost();

    return {
      currentHourCost,
      currentDayCost,
      currentMonthCost,
      projectedMonthlyCost
    };
  }

  /**
   * Get budget alerts
   */
  public getBudgetAlerts(): Array<{ budgetId: string; status: BudgetStatus; alerts: string[] }> {
    return this.budgetTracker.checkAlerts().map(alert => ({
      budgetId: alert.budgetId,
      status: alert.status,
      alerts: alert.newAlerts
    }));
  }

  /**
   * Add custom pricing for models
   */
  public updateModelPricing(model: string, inputPrice: number, outputPrice: number): void {
    this.pricingCalculator.addModelPricing({
      model,
      inputTokenPrice: inputPrice,
      outputTokenPrice: outputPrice
    });
  }

  /**
   * Get usage trends from real data
   */
  public async getUsageTrends(): Promise<Array<{
    date: string;
    requests: number;
    tokens: number;
    uniqueModels: number;
    estimatedCost: number;
  }>> {
    if (this.usageHistory.length === 0) {
      return [];
    }

    // Group usage by day
    const dailyUsage = new Map();
    
    for (const usage of this.usageHistory) {
      const day = usage.timestamp.toISOString().split('T')[0];
      if (!dailyUsage.has(day)) {
        dailyUsage.set(day, { requests: 0, tokens: 0, cost: 0, models: new Set() });
      }
      const dayData = dailyUsage.get(day);
      dayData.requests += usage.requestCount;
      dayData.tokens += usage.tokenUsage.totalTokens;
      dayData.cost += await this.pricingCalculator.calculateUsageCost(usage);
      dayData.models.add(usage.model);
    }

    return Array.from(dailyUsage.entries()).map(([date, data]) => ({
      date,
      requests: data.requests,
      tokens: data.tokens,
      uniqueModels: data.models.size,
      estimatedCost: data.cost
    })).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Calculate projected monthly cost based on recent usage patterns
   */
  private async calculateProjectedMonthlyCost(): Promise<number> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentUsage = this.usageHistory.filter(usage => usage.timestamp >= thirtyDaysAgo);
    
    if (recentUsage.length === 0) {
      return 0;
    }

    const recentCost = await this.pricingCalculator.calculateBatchCost(recentUsage);
    const daysOfData = (now.getTime() - thirtyDaysAgo.getTime()) / (24 * 60 * 60 * 1000);
    const dailyAverage = recentCost / daysOfData;
    
    return dailyAverage * 30; // Project for 30 days
  }

  /**
   * Get recent usage for a specific budget period
   */
  private getRecentUsageForBudget(budget: Budget): UsageMetrics[] {
    const now = new Date();
    let periodStart: Date;

    switch (budget.period) {
      case 'daily':
        periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'weekly':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodStart.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        periodStart = new Date(0); // All time
    }

    return this.usageHistory.filter(usage => usage.timestamp >= periodStart);
  }

  /**
   * Calculate aggregated cost breakdown for multiple usage metrics (public method)
   */
  public async calculateAggregatedBreakdown(usageMetrics: UsageMetrics[]): Promise<CostBreakdown> {
    const costByModel: Record<string, number> = {};
    const costByFeature: Record<string, number> = {
      'text-generation': 0,
      'chat': 0,
      'code': 0,
      'vision': 0,
      'other': 0
    };

    let totalCost = 0;

    for (const usage of usageMetrics) {
      const cost = await this.pricingCalculator.calculateUsageCost(usage);
      totalCost += cost;

      // Aggregate by model
      costByModel[usage.model] = (costByModel[usage.model] || 0) + cost;

      // Aggregate by feature
      if (usage.model.includes('chat')) {
        costByFeature['chat'] = (costByFeature['chat'] || 0) + cost;
      } else if (usage.model.includes('code')) {
        costByFeature['code'] = (costByFeature['code'] || 0) + cost;
      } else if (usage.model.includes('vision')) {
        costByFeature['vision'] = (costByFeature['vision'] || 0) + cost;
      } else if (usage.model.includes('text') || usage.model.includes('bison')) {
        costByFeature['text-generation'] = (costByFeature['text-generation'] || 0) + cost;
      } else {
        costByFeature['other'] = (costByFeature['other'] || 0) + cost;
      }
    }

    return {
      totalCost,
      costByModel,
      costByFeature,
      projectedMonthlyCost: await this.calculateProjectedMonthlyCost()
    };
  }

  /**
   * Calculate cost trends over time
   */
  private async calculateCostTrends(usageMetrics: UsageMetrics[]): Promise<CostTrend[]> {
    // Group usage by day
    const dailyCosts = new Map<string, { cost: number; usage: number; requests: number }>();

    for (const usage of usageMetrics) {
      const dateKey = usage.timestamp.toISOString().split('T')[0];
      if (dateKey) {
        const cost = await this.pricingCalculator.calculateUsageCost(usage);
        
        const existing = dailyCosts.get(dateKey) || { cost: 0, usage: 0, requests: 0 };
        existing.cost += cost;
        existing.usage += usage.tokenUsage.totalTokens;
        existing.requests += usage.requestCount;
        dailyCosts.set(dateKey, existing);
      }
    }

    // Convert to trend array
    const trends: CostTrend[] = [];
    for (const [date, data] of dailyCosts.entries()) {
      const efficiency = data.usage > 0 ? data.cost / data.usage : 0;
      trends.push({
        period: date,
        cost: data.cost,
        usage: data.usage,
        efficiency
      });
    }

    // Sort by date
    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }
}