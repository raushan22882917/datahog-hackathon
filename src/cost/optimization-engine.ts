import { Optimization, UsageMetrics, TokenUsage } from '../types';
import { PricingCalculator } from './pricing-calculator';

/**
 * Analyzes usage patterns and generates cost optimization recommendations
 */
export class OptimizationEngine {
  private pricingCalculator: PricingCalculator;

  constructor(pricingCalculator: PricingCalculator) {
    this.pricingCalculator = pricingCalculator;
  }

  /**
   * Analyze usage patterns and generate optimization recommendations
   */
  public async identifyOptimizations(usageMetrics: UsageMetrics[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Group usage by model
    const usageByModel = this.groupUsageByModel(usageMetrics);

    // 1. Model switching recommendations
    optimizations.push(...await this.analyzeModelSwitching(usageByModel));

    // 2. Batching opportunities
    optimizations.push(...await this.analyzeBatchingOpportunities(usageMetrics));

    // 3. Caching opportunities
    optimizations.push(...await this.analyzeCachingOpportunities(usageMetrics));

    // 4. Parameter tuning recommendations
    optimizations.push(...await this.analyzeParameterTuning(usageMetrics));

    // 5. Usage pattern optimizations
    optimizations.push(...await this.analyzeUsagePatterns(usageMetrics));

    // Sort by estimated savings (highest first)
    return optimizations.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  }

  /**
   * Analyze model switching opportunities
   */
  private async analyzeModelSwitching(usageByModel: Map<string, UsageMetrics[]>): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    for (const [currentModel, metrics] of usageByModel.entries()) {
      const totalUsage = this.aggregateUsage(metrics);
      const currentCost = await this.pricingCalculator.calculateUsageCost({
        model: currentModel,
        tokenUsage: totalUsage,
        requestCount: metrics.length,
        timestamp: new Date()
      });

      // Compare with alternative models
      const alternatives = ['gemini-pro', 'chat-bison', 'text-bison'].filter(m => m !== currentModel);
      
      for (const altModel of alternatives) {
        const altCost = await this.pricingCalculator.calculateUsageCost({
          model: altModel,
          tokenUsage: totalUsage,
          requestCount: metrics.length,
          timestamp: new Date()
        });

        if (altCost < currentCost) {
          const savings = currentCost - altCost;
          const savingsPercentage = (savings / currentCost) * 100;

          if (savingsPercentage > 10) { // Only recommend if savings > 10%
            optimizations.push({
              type: 'model-switch',
              description: `Switch from ${currentModel} to ${altModel} for ${savingsPercentage.toFixed(1)}% cost reduction`,
              estimatedSavings: savings,
              confidence: this.calculateModelSwitchConfidence(currentModel, altModel, totalUsage),
              implementation: `Update model configuration to use ${altModel}. Test thoroughly to ensure output quality meets requirements.`
            });
          }
        }
      }
    }

    return optimizations;
  }

  /**
   * Analyze batching opportunities
   */
  private async analyzeBatchingOpportunities(usageMetrics: UsageMetrics[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Look for patterns of small, frequent requests that could be batched
    const smallRequests = usageMetrics.filter(usage => 
      usage.tokenUsage.totalTokens < 100 && usage.requestCount === 1
    );

    if (smallRequests.length > 10) {
      let totalSmallRequestCost = 0;
      for (const usage of smallRequests) {
        totalSmallRequestCost += await this.pricingCalculator.calculateUsageCost(usage);
      }

      // Estimate savings from batching (assume 20-30% reduction)
      const estimatedSavings = totalSmallRequestCost * 0.25;

      optimizations.push({
        type: 'batching',
        description: `Batch ${smallRequests.length} small requests to reduce API overhead and costs`,
        estimatedSavings,
        confidence: 0.7,
        implementation: 'Implement request batching logic to combine multiple small requests into fewer, larger requests. Consider user experience impact.'
      });
    }

    return optimizations;
  }

  /**
   * Analyze caching opportunities
   */
  private async analyzeCachingOpportunities(usageMetrics: UsageMetrics[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Look for repeated patterns (simplified - in reality you'd analyze actual prompts)
    const modelUsage = new Map<string, number>();
    let totalCost = 0;

    for (const usage of usageMetrics) {
      const key = `${usage.model}_${usage.tokenUsage.promptTokens}`;
      modelUsage.set(key, (modelUsage.get(key) || 0) + 1);
      totalCost += await this.pricingCalculator.calculateUsageCost(usage);
    }

    // Find patterns that appear multiple times
    const repeatedPatterns = Array.from(modelUsage.entries())
      .filter(([, count]) => count > 2)
      .length;

    if (repeatedPatterns > 0) {
      // Estimate savings from caching (assume 15-25% for repeated requests)
      const estimatedSavings = totalCost * 0.2;

      optimizations.push({
        type: 'caching',
        description: `Implement response caching for ${repeatedPatterns} repeated request patterns`,
        estimatedSavings,
        confidence: 0.6,
        implementation: 'Implement intelligent caching layer to store and reuse responses for similar requests. Consider cache invalidation strategy.'
      });
    }

    return optimizations;
  }

  /**
   * Analyze parameter tuning opportunities
   */
  private async analyzeParameterTuning(usageMetrics: UsageMetrics[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Look for usage with very high output token counts
    const highOutputUsage = usageMetrics.filter(usage => 
      usage.tokenUsage.completionTokens > usage.tokenUsage.promptTokens * 2
    );

    if (highOutputUsage.length > 0) {
      let potentialSavings = 0;
      for (const usage of highOutputUsage) {
        // Estimate savings from reducing output length by 20%
        const currentCost = await this.pricingCalculator.calculateUsageCost(usage);
        const optimizedUsage = {
          ...usage,
          tokenUsage: {
            ...usage.tokenUsage,
            completionTokens: Math.floor(usage.tokenUsage.completionTokens * 0.8),
            totalTokens: usage.tokenUsage.promptTokens + Math.floor(usage.tokenUsage.completionTokens * 0.8)
          }
        };
        const optimizedCost = await this.pricingCalculator.calculateUsageCost(optimizedUsage);
        potentialSavings += (currentCost - optimizedCost);
      }

      optimizations.push({
        type: 'parameter-tuning',
        description: `Optimize output length parameters for ${highOutputUsage.length} requests with high output token usage`,
        estimatedSavings: potentialSavings,
        confidence: 0.5,
        implementation: 'Review and optimize max_tokens, temperature, and other parameters to reduce unnecessary output length while maintaining quality.'
      });
    }

    return optimizations;
  }

  /**
   * Analyze usage patterns for optimization opportunities
   */
  private async analyzeUsagePatterns(usageMetrics: UsageMetrics[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    // Analyze usage by time to identify peak/off-peak patterns
    const hourlyUsage = new Map<number, number>();
    let totalCost = 0;

    for (const usage of usageMetrics) {
      const hour = usage.timestamp.getHours();
      const cost = await this.pricingCalculator.calculateUsageCost(usage);
      hourlyUsage.set(hour, (hourlyUsage.get(hour) || 0) + cost);
      totalCost += cost;
    }

    // Find peak hours (simplified analysis)
    const avgHourlyCost = totalCost / 24;
    const peakHours = Array.from(hourlyUsage.entries())
      .filter(([, cost]) => cost > avgHourlyCost * 1.5)
      .map(([hour]) => hour);

    if (peakHours.length > 0) {
      // Suggest load balancing or scheduling optimizations
      const estimatedSavings = totalCost * 0.1; // Assume 10% savings from better scheduling

      optimizations.push({
        type: 'batching',
        description: `Optimize request scheduling to reduce peak hour usage (peak hours: ${peakHours.join(', ')})`,
        estimatedSavings,
        confidence: 0.4,
        implementation: 'Implement request scheduling and load balancing to distribute usage more evenly throughout the day.'
      });
    }

    return optimizations;
  }

  /**
   * Group usage metrics by model
   */
  private groupUsageByModel(usageMetrics: UsageMetrics[]): Map<string, UsageMetrics[]> {
    const grouped = new Map<string, UsageMetrics[]>();

    for (const usage of usageMetrics) {
      const existing = grouped.get(usage.model) || [];
      existing.push(usage);
      grouped.set(usage.model, existing);
    }

    return grouped;
  }

  /**
   * Aggregate token usage across multiple metrics
   */
  private aggregateUsage(metrics: UsageMetrics[]): TokenUsage {
    return metrics.reduce((total, usage) => ({
      promptTokens: total.promptTokens + usage.tokenUsage.promptTokens,
      completionTokens: total.completionTokens + usage.tokenUsage.completionTokens,
      totalTokens: total.totalTokens + usage.tokenUsage.totalTokens
    }), { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
  }

  /**
   * Calculate confidence score for model switching recommendation
   */
  private calculateModelSwitchConfidence(currentModel: string, altModel: string, usage: TokenUsage): number {
    // Base confidence on model capabilities and usage patterns
    let confidence = 0.5;

    // Higher confidence for switching to more cost-effective models with similar capabilities
    const modelTiers = {
      'gemini-pro': 3,
      'text-bison': 2,
      'chat-bison': 2,
      'code-bison': 2
    };

    const currentTier = modelTiers[currentModel as keyof typeof modelTiers] || 1;
    const altTier = modelTiers[altModel as keyof typeof modelTiers] || 1;

    // Higher confidence if switching to similar or better tier
    if (altTier >= currentTier) {
      confidence += 0.2;
    }

    // Higher confidence for larger usage volumes (more data to base decision on)
    if (usage.totalTokens > 10000) {
      confidence += 0.2;
    }

    // Lower confidence for very different model types
    if ((currentModel.includes('code') && !altModel.includes('code')) ||
        (!currentModel.includes('code') && altModel.includes('code'))) {
      confidence -= 0.3;
    }

    return Math.max(0.1, Math.min(0.9, confidence));
  }
}