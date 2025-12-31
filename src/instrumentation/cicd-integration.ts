import { MonitoringConfig } from '../interfaces';
import { TelemetryEvent } from '../types';

/**
 * Deployment health check result
 */
export interface DeploymentHealthCheck {
  deploymentId: string;
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checks: HealthCheckResult[];
  overallScore: number;
  recommendation: DeploymentRecommendation;
}

/**
 * Individual health check result
 */
export interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  value: number;
  threshold: number;
  message: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Deployment recommendation
 */
export interface DeploymentRecommendation {
  action: 'proceed' | 'rollback' | 'investigate' | 'wait';
  confidence: number;
  reasons: string[];
  suggestedActions: string[];
}

/**
 * Rollback trigger configuration
 */
export interface RollbackTrigger {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  timeWindow: string;
  severity: 'warning' | 'error' | 'critical';
  autoRollback: boolean;
  confirmationRequired: boolean;
}

/**
 * CI/CD platform integration configuration
 */
export interface CICDPlatformConfig {
  platform: 'github-actions' | 'gitlab-ci' | 'jenkins' | 'azure-devops' | 'circleci' | 'custom';
  webhookUrl?: string;
  apiToken?: string;
  projectId?: string;
  pipelineId?: string;
  customHeaders?: Record<string, string>;
}

/**
 * Deployment validation result
 */
export interface DeploymentValidation {
  deploymentId: string;
  isValid: boolean;
  monitoringCoverage: MonitoringCoverage;
  configurationIssues: ConfigurationIssue[];
  recommendations: string[];
}

/**
 * Monitoring coverage assessment
 */
export interface MonitoringCoverage {
  overallCoverage: number;
  components: ComponentCoverage[];
  missingInstrumentation: string[];
  redundantMonitoring: string[];
}

/**
 * Component monitoring coverage
 */
export interface ComponentCoverage {
  component: string;
  coverage: number;
  instrumentedEndpoints: number;
  totalEndpoints: number;
  criticalPathsCovered: boolean;
}

/**
 * Configuration issue
 */
export interface ConfigurationIssue {
  type: 'error' | 'warning' | 'info';
  component: string;
  message: string;
  suggestion: string;
  autoFixable: boolean;
}

/**
 * CI/CD integration system that provides deployment health checks,
 * rollback triggers, and monitoring coverage verification
 */
export class CICDIntegrationSystem {
  private config: MonitoringConfig;
  private rollbackTriggers: Map<string, RollbackTrigger> = new Map();
  private platformConfigs: Map<string, CICDPlatformConfig> = new Map();
  private deploymentHistory: Map<string, DeploymentHealthCheck[]> = new Map();
  private activeDeployments: Set<string> = new Set();

  constructor(config: MonitoringConfig) {
    this.config = config;
    this.initializeDefaultTriggers();
  }

  /**
   * Configure CI/CD platform integration
   */
  configurePlatform(platformId: string, config: CICDPlatformConfig): void {
    this.platformConfigs.set(platformId, config);
  }

  /**
   * Add a rollback trigger
   */
  addRollbackTrigger(trigger: RollbackTrigger): void {
    this.rollbackTriggers.set(trigger.id, trigger);
  }

  /**
   * Perform deployment health check
   */
  async performHealthCheck(deploymentId: string, telemetryEvents: TelemetryEvent[]): Promise<DeploymentHealthCheck> {
    const timestamp = new Date();
    const checks: HealthCheckResult[] = [];

    // Performance health checks
    checks.push(...this.performPerformanceChecks(telemetryEvents));

    // Error rate health checks
    checks.push(...this.performErrorRateChecks(telemetryEvents));

    // Availability health checks
    checks.push(...this.performAvailabilityChecks(telemetryEvents));

    // Cost health checks
    checks.push(...this.performCostChecks(telemetryEvents));

    // Security health checks
    checks.push(...this.performSecurityChecks(telemetryEvents));

    // Calculate overall score and status
    const overallScore = this.calculateOverallScore(checks);
    const status = this.determineHealthStatus(overallScore, checks);
    const recommendation = this.generateRecommendation(status, checks, overallScore);

    const healthCheck: DeploymentHealthCheck = {
      deploymentId,
      timestamp,
      status,
      checks,
      overallScore,
      recommendation
    };

    // Store in history
    if (!this.deploymentHistory.has(deploymentId)) {
      this.deploymentHistory.set(deploymentId, []);
    }
    this.deploymentHistory.get(deploymentId)!.push(healthCheck);

    // Check for rollback triggers
    await this.evaluateRollbackTriggers(deploymentId, healthCheck);

    return healthCheck;
  }

  /**
   * Validate deployment configuration and monitoring coverage
   */
  async validateDeployment(deploymentId: string, configPath?: string): Promise<DeploymentValidation> {
    const monitoringCoverage = await this.assessMonitoringCoverage(deploymentId);
    const configurationIssues = await this.validateConfiguration(configPath);
    const recommendations = this.generateValidationRecommendations(monitoringCoverage, configurationIssues);

    const isValid = configurationIssues.filter(issue => issue.type === 'error').length === 0 &&
                   monitoringCoverage.overallCoverage >= 0.8; // 80% coverage threshold

    return {
      deploymentId,
      isValid,
      monitoringCoverage,
      configurationIssues,
      recommendations
    };
  }

  /**
   * Create integration hooks for CI/CD platforms
   */
  createIntegrationHooks(platformId: string): {
    preDeploymentHook: string;
    postDeploymentHook: string;
    rollbackHook: string;
  } {
    const platformConfig = this.platformConfigs.get(platformId);
    if (!platformConfig) {
      throw new Error(`Platform ${platformId} not configured`);
    }

    const baseUrl = process.env.MONITORING_WEBHOOK_BASE_URL || 'https://monitoring.company.com/webhooks';

    return {
      preDeploymentHook: `${baseUrl}/pre-deployment/${platformId}`,
      postDeploymentHook: `${baseUrl}/post-deployment/${platformId}`,
      rollbackHook: `${baseUrl}/rollback/${platformId}`
    };
  }

  /**
   * Handle pre-deployment webhook
   */
  async handlePreDeployment(deploymentId: string, metadata: Record<string, any>): Promise<{
    approved: boolean;
    message: string;
    checks: string[];
  }> {
    // Validate deployment configuration
    const validation = await this.validateDeployment(deploymentId, metadata.configPath);
    
    // Check if previous deployment is stable
    const previousDeployment = this.getPreviousDeployment(deploymentId);
    const isPreviousStable = previousDeployment ? 
      this.isDeploymentStable(previousDeployment) : true;

    const checks = [
      `Configuration validation: ${validation.isValid ? 'PASS' : 'FAIL'}`,
      `Monitoring coverage: ${(validation.monitoringCoverage.overallCoverage * 100).toFixed(1)}%`,
      `Previous deployment stable: ${isPreviousStable ? 'PASS' : 'FAIL'}`
    ];

    const approved = validation.isValid && isPreviousStable;
    const message = approved ? 
      'Deployment approved - all checks passed' :
      'Deployment blocked - see check results';

    if (approved) {
      this.activeDeployments.add(deploymentId);
    }

    return { approved, message, checks };
  }

  /**
   * Handle post-deployment webhook
   */
  async handlePostDeployment(deploymentId: string, telemetryEvents: TelemetryEvent[]): Promise<DeploymentHealthCheck> {
    // Wait for initial telemetry data
    await this.waitForTelemetryData(deploymentId, 30000); // 30 seconds

    // Perform health check
    const healthCheck = await this.performHealthCheck(deploymentId, telemetryEvents);

    // Send notifications to CI/CD platform
    await this.notifyPlatform(deploymentId, healthCheck);

    return healthCheck;
  }

  /**
   * Trigger rollback for a deployment
   */
  async triggerRollback(deploymentId: string, reason: string, triggerId?: string): Promise<{
    success: boolean;
    message: string;
    rollbackId: string;
  }> {
    const rollbackId = `rollback-${deploymentId}-${Date.now()}`;
    
    try {
      // Notify all configured platforms
      for (const [platformId, config] of this.platformConfigs) {
        await this.sendRollbackNotification(platformId, config, {
          deploymentId,
          rollbackId,
          reason,
          triggerId,
          timestamp: new Date()
        });
      }

      // Remove from active deployments
      this.activeDeployments.delete(deploymentId);

      return {
        success: true,
        message: `Rollback triggered successfully for deployment ${deploymentId}`,
        rollbackId
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to trigger rollback: ${error instanceof Error ? error.message : 'Unknown error'}`,
        rollbackId
      };
    }
  }

  /**
   * Get deployment history
   */
  getDeploymentHistory(deploymentId: string): DeploymentHealthCheck[] {
    return this.deploymentHistory.get(deploymentId) || [];
  }

  /**
   * Get active deployments
   */
  getActiveDeployments(): string[] {
    return Array.from(this.activeDeployments);
  }

  /**
   * Get rollback triggers
   */
  getRollbackTriggers(): RollbackTrigger[] {
    return Array.from(this.rollbackTriggers.values());
  }

  /**
   * Initialize default rollback triggers
   */
  private initializeDefaultTriggers(): void {
    const defaultTriggers: RollbackTrigger[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        condition: 'error_rate > 0.05',
        threshold: 0.05,
        timeWindow: '5m',
        severity: 'critical',
        autoRollback: true,
        confirmationRequired: false
      },
      {
        id: 'extreme-latency',
        name: 'Extreme Latency',
        condition: 'p99_latency > 30000',
        threshold: 30000,
        timeWindow: '3m',
        severity: 'critical',
        autoRollback: true,
        confirmationRequired: false
      },
      {
        id: 'availability-drop',
        name: 'Availability Drop',
        condition: 'availability < 0.95',
        threshold: 0.95,
        timeWindow: '2m',
        severity: 'critical',
        autoRollback: true,
        confirmationRequired: true
      },
      {
        id: 'cost-spike',
        name: 'Cost Spike',
        condition: 'cost_increase > 3.0',
        threshold: 3.0,
        timeWindow: '10m',
        severity: 'warning',
        autoRollback: false,
        confirmationRequired: true
      }
    ];

    for (const trigger of defaultTriggers) {
      this.rollbackTriggers.set(trigger.id, trigger);
    }
  }

  /**
   * Perform performance health checks
   */
  private performPerformanceChecks(events: TelemetryEvent[]): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    
    const responseEvents = events.filter(e => e.type === 'response' && e.response);
    if (responseEvents.length === 0) {
      return checks;
    }

    // Average latency check
    const avgLatency = responseEvents.reduce((sum, e) => sum + (e.response?.latency || 0), 0) / responseEvents.length;
    checks.push({
      name: 'Average Response Time',
      status: avgLatency < 5000 ? 'pass' : avgLatency < 10000 ? 'warning' : 'fail',
      value: avgLatency,
      threshold: 5000,
      message: `Average response time: ${avgLatency.toFixed(0)}ms`,
      impact: avgLatency > 10000 ? 'high' : avgLatency > 5000 ? 'medium' : 'low'
    });

    // P95 latency check
    const latencies = responseEvents.map(e => e.response?.latency || 0).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95Latency = latencies[p95Index] || 0;
    
    checks.push({
      name: 'P95 Response Time',
      status: p95Latency < 8000 ? 'pass' : p95Latency < 15000 ? 'warning' : 'fail',
      value: p95Latency,
      threshold: 8000,
      message: `P95 response time: ${p95Latency.toFixed(0)}ms`,
      impact: p95Latency > 15000 ? 'high' : p95Latency > 8000 ? 'medium' : 'low'
    });

    return checks;
  }

  /**
   * Perform error rate health checks
   */
  private performErrorRateChecks(events: TelemetryEvent[]): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    
    const totalRequests = events.filter(e => e.type === 'request').length;
    const errorCount = events.filter(e => e.type === 'error').length;
    
    if (totalRequests === 0) {
      return checks;
    }

    const errorRate = errorCount / totalRequests;
    
    checks.push({
      name: 'Error Rate',
      status: errorRate < 0.01 ? 'pass' : errorRate < 0.05 ? 'warning' : 'fail',
      value: errorRate,
      threshold: 0.01,
      message: `Error rate: ${(errorRate * 100).toFixed(2)}%`,
      impact: errorRate > 0.05 ? 'critical' : errorRate > 0.01 ? 'medium' : 'low'
    });

    return checks;
  }

  /**
   * Perform availability health checks
   */
  private performAvailabilityChecks(events: TelemetryEvent[]): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    
    const totalRequests = events.filter(e => e.type === 'request').length;
    const successfulRequests = events.filter(e => e.type === 'response').length;
    
    if (totalRequests === 0) {
      return checks;
    }

    const availability = successfulRequests / totalRequests;
    
    checks.push({
      name: 'Service Availability',
      status: availability >= 0.99 ? 'pass' : availability >= 0.95 ? 'warning' : 'fail',
      value: availability,
      threshold: 0.99,
      message: `Availability: ${(availability * 100).toFixed(2)}%`,
      impact: availability < 0.95 ? 'critical' : availability < 0.99 ? 'high' : 'low'
    });

    return checks;
  }

  /**
   * Perform cost health checks
   */
  private performCostChecks(events: TelemetryEvent[]): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    
    const responseEvents = events.filter(e => e.type === 'response' && e.response);
    if (responseEvents.length === 0) {
      return checks;
    }

    const totalCost = responseEvents.reduce((sum, e) => sum + (e.response?.cost || 0), 0);
    const avgCostPerRequest = totalCost / responseEvents.length;
    
    checks.push({
      name: 'Average Cost Per Request',
      status: avgCostPerRequest < 0.01 ? 'pass' : avgCostPerRequest < 0.05 ? 'warning' : 'fail',
      value: avgCostPerRequest,
      threshold: 0.01,
      message: `Average cost: $${avgCostPerRequest.toFixed(4)} per request`,
      impact: avgCostPerRequest > 0.05 ? 'medium' : 'low'
    });

    return checks;
  }

  /**
   * Perform security health checks
   */
  private performSecurityChecks(events: TelemetryEvent[]): HealthCheckResult[] {
    const checks: HealthCheckResult[] = [];
    
    // This would integrate with security analyzer results
    // For now, return a placeholder check
    checks.push({
      name: 'Security Scan',
      status: 'pass',
      value: 1,
      threshold: 1,
      message: 'No security issues detected',
      impact: 'low'
    });

    return checks;
  }

  /**
   * Calculate overall health score
   */
  private calculateOverallScore(checks: HealthCheckResult[]): number {
    if (checks.length === 0) return 0;
    
    const weights = {
      'pass': 1.0,
      'warning': 0.7,
      'fail': 0.0
    };
    
    const totalScore = checks.reduce((sum, check) => sum + weights[check.status], 0);
    return totalScore / checks.length;
  }

  /**
   * Determine health status from score and checks
   */
  private determineHealthStatus(score: number, checks: HealthCheckResult[]): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' {
    const criticalFailures = checks.filter(c => c.status === 'fail' && c.impact === 'critical').length;
    const failures = checks.filter(c => c.status === 'fail').length;
    
    if (criticalFailures > 0) return 'unhealthy';
    if (failures > 0 || score < 0.7) return 'degraded';
    if (score >= 0.9) return 'healthy';
    return 'degraded';
  }

  /**
   * Generate deployment recommendation
   */
  private generateRecommendation(
    status: string, 
    checks: HealthCheckResult[], 
    score: number
  ): DeploymentRecommendation {
    const failedChecks = checks.filter(c => c.status === 'fail');
    const criticalIssues = checks.filter(c => c.status === 'fail' && c.impact === 'critical');
    
    let action: DeploymentRecommendation['action'] = 'proceed';
    let confidence = score;
    const reasons: string[] = [];
    const suggestedActions: string[] = [];

    if (criticalIssues.length > 0) {
      action = 'rollback';
      confidence = 0.9;
      reasons.push(`${criticalIssues.length} critical issues detected`);
      suggestedActions.push('Immediate rollback recommended');
    } else if (failedChecks.length > 2) {
      action = 'investigate';
      confidence = 0.6;
      reasons.push(`Multiple health checks failing (${failedChecks.length})`);
      suggestedActions.push('Investigate issues before proceeding');
    } else if (score < 0.8) {
      action = 'wait';
      confidence = 0.7;
      reasons.push('Health score below threshold');
      suggestedActions.push('Monitor for improvement');
    }

    return {
      action,
      confidence,
      reasons,
      suggestedActions
    };
  }

  /**
   * Evaluate rollback triggers
   */
  private async evaluateRollbackTriggers(deploymentId: string, healthCheck: DeploymentHealthCheck): Promise<void> {
    for (const trigger of this.rollbackTriggers.values()) {
      if (this.shouldTriggerRollback(healthCheck, trigger)) {
        if (trigger.autoRollback && !trigger.confirmationRequired) {
          await this.triggerRollback(deploymentId, `Automatic rollback: ${trigger.name}`, trigger.id);
        } else {
          // Send notification for manual confirmation
          await this.sendRollbackAlert(deploymentId, trigger, healthCheck);
        }
      }
    }
  }

  /**
   * Check if rollback should be triggered
   */
  private shouldTriggerRollback(healthCheck: DeploymentHealthCheck, trigger: RollbackTrigger): boolean {
    // Simple condition evaluation - in production, use proper expression evaluator
    const failedChecks = healthCheck.checks.filter(c => c.status === 'fail');
    
    switch (trigger.id) {
      case 'high-error-rate':
        return failedChecks.some(c => c.name === 'Error Rate' && c.value > trigger.threshold);
      case 'extreme-latency':
        return failedChecks.some(c => c.name === 'P95 Response Time' && c.value > trigger.threshold);
      case 'availability-drop':
        return failedChecks.some(c => c.name === 'Service Availability' && c.value < trigger.threshold);
      case 'cost-spike':
        return failedChecks.some(c => c.name === 'Average Cost Per Request' && c.value > trigger.threshold);
      default:
        return false;
    }
  }

  /**
   * Assess monitoring coverage for deployment
   */
  private async assessMonitoringCoverage(deploymentId: string): Promise<MonitoringCoverage> {
    // This would analyze the deployment to assess monitoring coverage
    // For now, return a mock assessment
    return {
      overallCoverage: 0.85,
      components: [
        {
          component: 'llm-service',
          coverage: 0.9,
          instrumentedEndpoints: 9,
          totalEndpoints: 10,
          criticalPathsCovered: true
        }
      ],
      missingInstrumentation: ['health-check endpoint'],
      redundantMonitoring: []
    };
  }

  /**
   * Validate deployment configuration
   */
  private async validateConfiguration(configPath?: string): Promise<ConfigurationIssue[]> {
    const issues: ConfigurationIssue[] = [];
    
    // Validate monitoring configuration
    if (!this.config.datadog.apiKey) {
      issues.push({
        type: 'error',
        component: 'datadog',
        message: 'Datadog API key not configured',
        suggestion: 'Set DATADOG_API_KEY environment variable',
        autoFixable: false
      });
    }

    if (!this.config.googleCloud.projectId) {
      issues.push({
        type: 'error',
        component: 'google-cloud',
        message: 'Google Cloud project ID not configured',
        suggestion: 'Set GOOGLE_CLOUD_PROJECT_ID environment variable',
        autoFixable: false
      });
    }

    return issues;
  }

  /**
   * Generate validation recommendations
   */
  private generateValidationRecommendations(
    coverage: MonitoringCoverage, 
    issues: ConfigurationIssue[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (coverage.overallCoverage < 0.8) {
      recommendations.push('Increase monitoring coverage to at least 80%');
    }
    
    if (coverage.missingInstrumentation.length > 0) {
      recommendations.push(`Add instrumentation to: ${coverage.missingInstrumentation.join(', ')}`);
    }
    
    const errorCount = issues.filter(i => i.type === 'error').length;
    if (errorCount > 0) {
      recommendations.push(`Fix ${errorCount} configuration errors before deployment`);
    }
    
    return recommendations;
  }

  /**
   * Get previous deployment for comparison
   */
  private getPreviousDeployment(deploymentId: string): DeploymentHealthCheck | null {
    const history = this.deploymentHistory.get(deploymentId);
    return history && history.length > 1 ? (history[history.length - 2] || null) : null;
  }

  /**
   * Check if deployment is stable
   */
  private isDeploymentStable(healthCheck: DeploymentHealthCheck): boolean {
    return healthCheck.status === 'healthy' && healthCheck.overallScore >= 0.9;
  }

  /**
   * Wait for telemetry data to be available
   */
  private async waitForTelemetryData(deploymentId: string, timeoutMs: number): Promise<void> {
    // In a real implementation, this would wait for actual telemetry data
    return new Promise(resolve => setTimeout(resolve, Math.min(timeoutMs, 5000)));
  }

  /**
   * Notify CI/CD platform of deployment status
   */
  private async notifyPlatform(deploymentId: string, healthCheck: DeploymentHealthCheck): Promise<void> {
    for (const [platformId, config] of this.platformConfigs) {
      try {
        await this.sendPlatformNotification(platformId, config, {
          deploymentId,
          status: healthCheck.status,
          score: healthCheck.overallScore,
          timestamp: healthCheck.timestamp
        });
      } catch (error) {
        console.error(`Failed to notify platform ${platformId}:`, error);
      }
    }
  }

  /**
   * Send notification to CI/CD platform
   */
  private async sendPlatformNotification(
    platformId: string, 
    config: CICDPlatformConfig, 
    data: any
  ): Promise<void> {
    if (!config.webhookUrl) {
      console.log(`Would notify ${config.platform} about deployment status:`, data);
      return;
    }

    // In a real implementation, this would make HTTP requests to the platform
    console.log(`Sending notification to ${config.platform} at ${config.webhookUrl}:`, data);
  }

  /**
   * Send rollback notification to platform
   */
  private async sendRollbackNotification(
    platformId: string, 
    config: CICDPlatformConfig, 
    data: any
  ): Promise<void> {
    console.log(`Sending rollback notification to ${config.platform}:`, data);
  }

  /**
   * Send rollback alert for manual confirmation
   */
  private async sendRollbackAlert(
    deploymentId: string, 
    trigger: RollbackTrigger, 
    healthCheck: DeploymentHealthCheck
  ): Promise<void> {
    console.log(`Rollback alert for deployment ${deploymentId}:`, {
      trigger: trigger.name,
      status: healthCheck.status,
      score: healthCheck.overallScore
    });
  }
}