import { client, v1, v2 } from '@datadog/datadog-api-client';
import { MonitoringConfig } from '../interfaces';
import { SecurityAssessment, SecurityThreat, ComplianceViolation } from '../types';
import { 
  SecurityEventConfig, 
  AuditTrailEntry, 
  IncidentSeverity 
} from './types';
import { IncidentManager } from './incident-manager';

/**
 * Manages security event visibility and incident creation for LLM monitoring
 */
export class SecurityEventManager {
  private logsApi: v2.LogsApi;
  private incidentsApi: v2.IncidentsApi;
  private dashboardsApi: v1.DashboardsApi;
  private config: MonitoringConfig;
  private incidentManager: IncidentManager;
  private auditTrail: AuditTrailEntry[] = [];
  private securityMetrics: SecurityMetrics = {
    totalEvents: 0,
    criticalEvents: 0,
    complianceViolations: 0,
    incidentsCreated: 0,
    lastEventTime: null,
  };

  constructor(config: MonitoringConfig, incidentManager: IncidentManager) {
    this.config = config;
    this.incidentManager = incidentManager;
    
    // Configure Datadog client
    const configuration = client.createConfiguration({
      authMethods: {
        apiKeyAuth: config.datadog.apiKey,
        appKeyAuth: config.datadog.appKey,
      },
    });
    
    if (config.datadog.site) {
      configuration.setServerVariables({
        site: config.datadog.site,
      });
    }

    this.logsApi = new v2.LogsApi(configuration);
    this.incidentsApi = new v2.IncidentsApi(configuration);
    this.dashboardsApi = new v1.DashboardsApi(configuration);
  }

  /**
   * Processes a security assessment and creates appropriate visibility
   */
  async processSecurityEvent(
    assessment: SecurityAssessment,
    context: SecurityEventContext
  ): Promise<SecurityEventResult> {
    try {
      const eventConfig = this.buildSecurityEventConfig(assessment, context);
      
      // Update metrics
      this.updateSecurityMetrics(eventConfig);
      
      // Create audit trail entry
      const auditEntry = this.createAuditTrailEntry(eventConfig, context);
      this.auditTrail.push(auditEntry);
      
      // Surface event on dashboard
      await this.surfaceEventOnDashboard(eventConfig, context);
      
      // Create high-priority incident for compliance violations
      let incidentId: string | null = null;
      if (this.shouldCreateIncident(assessment)) {
        incidentId = await this.createSecurityIncident(assessment, context);
      }
      
      // Send security log to Datadog
      await this.sendSecurityLog(eventConfig, context, incidentId);
      
      return {
        eventId: auditEntry.id,
        severity: eventConfig.severity,
        incidentCreated: incidentId !== null,
        incidentId,
        dashboardUpdated: true,
        auditTrailUpdated: true,
      };
    } catch (error) {
      throw new Error(`Failed to process security event: ${error}`);
    }
  }

  /**
   * Surfaces security events prominently on dashboards
   */
  async surfaceEventOnDashboard(
    eventConfig: SecurityEventConfig,
    context: SecurityEventContext
  ): Promise<void> {
    try {
      // Create security event log entry for dashboard visibility
      const logEntry = {
        message: `Security Event: ${eventConfig.description}`,
        level: this.mapSeverityToLogLevel(eventConfig.severity),
        service: this.config.application.name,
        tags: {
          event_type: eventConfig.eventType,
          severity: eventConfig.severity,
          source: eventConfig.source,
          environment: this.config.application.environment,
          model: context.model || 'unknown',
          user_id: context.userId || 'anonymous',
        },
        attributes: {
          security_assessment: eventConfig.metadata.assessment,
          threats: eventConfig.metadata.threats,
          compliance_violations: eventConfig.metadata.complianceViolations,
          timestamp: new Date().toISOString(),
          context: context,
        },
      };

      // Send log to Datadog for dashboard visibility
      await this.logsApi.submitLog({
        body: [logEntry],
      });

      // Update dashboard metrics
      await this.updateDashboardMetrics(eventConfig);
    } catch (error) {
      console.error('Failed to surface security event on dashboard:', error);
    }
  }

  /**
   * Creates high-priority incidents for compliance violations
   */
  async createSecurityIncident(
    assessment: SecurityAssessment,
    context: SecurityEventContext
  ): Promise<string> {
    try {
      // Build alert-like object for incident creation
      const securityAlert = {
        id: `security-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ruleId: 'security-assessment-rule',
        severity: this.mapSecuritySeverityToAlert(assessment.riskLevel),
        title: `Security Threat Detected: ${assessment.threats.map(t => t.type).join(', ')}`,
        description: this.buildSecurityDescription(assessment),
        timestamp: new Date(),
        tags: {
          event_type: 'security-threat',
          risk_level: assessment.riskLevel,
          model: context.model || 'unknown',
          environment: this.config.application.environment,
        },
        context: {
          threats: assessment.threats.length,
          compliance_violations: assessment.complianceViolations.length,
          sensitive_data_found: assessment.sensitiveDataFound,
          user_id: context.userId || 'anonymous',
          session_id: context.sessionId || 'unknown',
          input_text: context.inputText ? context.inputText.substring(0, 200) : '',
          output_text: context.outputText ? context.outputText.substring(0, 200) : '',
        },
      };

      // Create incident with additional security context
      const incidentId = await this.incidentManager.createIncident(securityAlert, {
        security_assessment: JSON.stringify(assessment),
        threat_types: assessment.threats.map(t => t.type).join(','),
        compliance_regulations: assessment.complianceViolations.map(v => v.regulation).join(','),
        mitigation_required: 'true',
        escalation_required: assessment.riskLevel === 'critical' ? 'true' : 'false',
      });

      this.securityMetrics.incidentsCreated++;
      
      return incidentId;
    } catch (error) {
      throw new Error(`Failed to create security incident: ${error}`);
    }
  }

  /**
   * Maintains audit trail for security pattern analysis
   */
  createAuditTrailEntry(
    eventConfig: SecurityEventConfig,
    context: SecurityEventContext
  ): AuditTrailEntry {
    const auditEntry: AuditTrailEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      eventType: eventConfig.eventType,
      action: 'security_assessment',
      resource: context.model || 'llm_application',
      details: {
        severity: eventConfig.severity,
        threats: eventConfig.metadata.threats,
        compliance_violations: eventConfig.metadata.complianceViolations,
        sensitive_data_found: eventConfig.metadata.assessment.sensitiveDataFound,
        risk_level: eventConfig.metadata.assessment.riskLevel,
        input_length: context.inputText?.length || 0,
        output_length: context.outputText?.length || 0,
        session_id: context.sessionId,
      },
      outcome: 'success',
    };

    if (context.userId) {
      auditEntry.userId = context.userId;
    }

    return auditEntry;
  }

  /**
   * Gets security events for analysis and reporting
   */
  async getSecurityEvents(
    timeRange: { start: Date; end: Date },
    eventType?: string,
    severity?: string
  ): Promise<SecurityEventSummary[]> {
    try {
      // Build query for security logs
      const query = this.buildSecurityLogQuery(timeRange, eventType, severity);
      
      const response = await this.logsApi.listLogs({
        body: {
          filter: {
            query,
            from: timeRange.start.toISOString(),
            to: timeRange.end.toISOString(),
          },
          sort: 'timestamp',
          page: {
            limit: 1000,
          },
        },
      });

      return response.data?.map(log => ({
        id: log.id || 'unknown',
        timestamp: new Date(log.attributes?.timestamp || Date.now()),
        eventType: (log.attributes?.tags as any)?.event_type || 'unknown',
        severity: (log.attributes?.tags as any)?.severity || 'unknown',
        description: log.attributes?.message || '',
        source: (log.attributes?.tags as any)?.source || 'unknown',
        userId: (log.attributes?.tags as any)?.user_id,
        model: (log.attributes?.tags as any)?.model,
      })) || [];
    } catch (error) {
      throw new Error(`Failed to get security events: ${error}`);
    }
  }

  /**
   * Gets audit trail entries for compliance reporting
   */
  getAuditTrail(
    timeRange?: { start: Date; end: Date },
    userId?: string,
    eventType?: string
  ): AuditTrailEntry[] {
    let filteredTrail = this.auditTrail;

    if (timeRange) {
      filteredTrail = filteredTrail.filter(entry => 
        entry.timestamp >= timeRange.start && entry.timestamp <= timeRange.end
      );
    }

    if (userId) {
      filteredTrail = filteredTrail.filter(entry => entry.userId === userId);
    }

    if (eventType) {
      filteredTrail = filteredTrail.filter(entry => entry.eventType === eventType);
    }

    return filteredTrail.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Gets security metrics and statistics
   */
  getSecurityMetrics(): SecurityMetrics {
    return { ...this.securityMetrics };
  }

  /**
   * Analyzes security patterns from audit trail
   */
  analyzeSecurityPatterns(): SecurityPatternAnalysis {
    const recentEntries = this.auditTrail.filter(entry => 
      entry.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    );

    const threatTypes = new Map<string, number>();
    const userActivity = new Map<string, number>();
    const modelActivity = new Map<string, number>();
    
    recentEntries.forEach(entry => {
      // Count threat types
      if (entry.details.threats) {
        entry.details.threats.forEach((threat: any) => {
          threatTypes.set(threat.type, (threatTypes.get(threat.type) || 0) + 1);
        });
      }

      // Count user activity
      if (entry.userId) {
        userActivity.set(entry.userId, (userActivity.get(entry.userId) || 0) + 1);
      }

      // Count model activity
      if (entry.details.model) {
        modelActivity.set(entry.details.model, (modelActivity.get(entry.details.model) || 0) + 1);
      }
    });

    return {
      timeRange: {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      totalEvents: recentEntries.length,
      threatTypeDistribution: Object.fromEntries(threatTypes),
      userActivityDistribution: Object.fromEntries(userActivity),
      modelActivityDistribution: Object.fromEntries(modelActivity),
      riskTrends: this.calculateRiskTrends(recentEntries),
      recommendations: this.generateSecurityRecommendations(recentEntries),
    };
  }

  /**
   * Builds security event configuration from assessment
   */
  private buildSecurityEventConfig(
    assessment: SecurityAssessment,
    context: SecurityEventContext
  ): SecurityEventConfig {
    let eventType: SecurityEventConfig['eventType'];
    
    if (assessment.complianceViolations.length > 0) {
      eventType = 'compliance-violation';
    } else if (assessment.threats.some(t => t.severity === 'critical' || t.severity === 'high')) {
      eventType = 'threat-detected';
    } else {
      eventType = 'anomaly-detected';
    }

    return {
      eventType,
      severity: assessment.riskLevel,
      source: context.source || this.config.application.name,
      description: this.buildEventDescription(assessment, context),
      metadata: {
        assessment,
        threats: assessment.threats,
        complianceViolations: assessment.complianceViolations,
        context,
      },
    };
  }

  /**
   * Builds event description from assessment and context
   */
  private buildEventDescription(assessment: SecurityAssessment, context: SecurityEventContext): string {
    const parts: string[] = [];
    
    if (assessment.threats.length > 0) {
      parts.push(`${assessment.threats.length} security threat(s) detected`);
    }
    
    if (assessment.complianceViolations.length > 0) {
      parts.push(`${assessment.complianceViolations.length} compliance violation(s) found`);
    }
    
    if (assessment.sensitiveDataFound) {
      parts.push('sensitive data exposure detected');
    }

    const description = parts.join(', ');
    return `${description} in ${context.source || 'LLM application'}`;
  }

  /**
   * Builds security description for incidents
   */
  private buildSecurityDescription(assessment: SecurityAssessment): string {
    const threatDescriptions = assessment.threats.map(t => 
      `${t.type} (${t.severity}): ${t.description}`
    ).join('; ');
    
    const complianceDescriptions = assessment.complianceViolations.map(v => 
      `${v.regulation}: ${v.description}`
    ).join('; ');

    let description = `Risk Level: ${assessment.riskLevel}`;
    
    if (threatDescriptions) {
      description += `\nThreats: ${threatDescriptions}`;
    }
    
    if (complianceDescriptions) {
      description += `\nCompliance Violations: ${complianceDescriptions}`;
    }
    
    if (assessment.sensitiveDataFound) {
      description += '\nSensitive data exposure detected';
    }

    return description;
  }

  /**
   * Updates security metrics
   */
  private updateSecurityMetrics(eventConfig: SecurityEventConfig): void {
    this.securityMetrics.totalEvents++;
    this.securityMetrics.lastEventTime = new Date();
    
    if (eventConfig.severity === 'critical') {
      this.securityMetrics.criticalEvents++;
    }
    
    if (eventConfig.eventType === 'compliance-violation') {
      this.securityMetrics.complianceViolations++;
    }
  }

  /**
   * Determines if an incident should be created for the assessment
   */
  private shouldCreateIncident(assessment: SecurityAssessment): boolean {
    // Create incidents for high/critical risks or compliance violations
    return assessment.riskLevel === 'high' || 
           assessment.riskLevel === 'critical' || 
           assessment.complianceViolations.length > 0;
  }

  /**
   * Maps security severity to alert severity
   */
  private mapSecuritySeverityToAlert(riskLevel: string): 'info' | 'warning' | 'error' | 'critical' {
    switch (riskLevel) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
      default:
        return 'info';
    }
  }

  /**
   * Maps severity to log level
   */
  private mapSeverityToLogLevel(severity: string): string {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
      default:
        return 'info';
    }
  }

  /**
   * Sends security log to Datadog
   */
  private async sendSecurityLog(
    eventConfig: SecurityEventConfig,
    context: SecurityEventContext,
    incidentId: string | null
  ): Promise<void> {
    const logEntry = {
      message: `Security Event: ${eventConfig.description}`,
      level: this.mapSeverityToLogLevel(eventConfig.severity),
      service: this.config.application.name,
      tags: {
        event_type: eventConfig.eventType,
        severity: eventConfig.severity,
        source: eventConfig.source,
        environment: this.config.application.environment,
        incident_id: incidentId || 'none',
      },
      attributes: eventConfig.metadata,
    };

    await this.logsApi.submitLog({
      body: [logEntry],
    });
  }

  /**
   * Updates dashboard metrics for security events
   */
  private async updateDashboardMetrics(eventConfig: SecurityEventConfig): Promise<void> {
    // This would typically send custom metrics to Datadog
    // For now, we'll just log the metric update
    console.log(`Security metric updated: ${eventConfig.eventType} - ${eventConfig.severity}`);
  }

  /**
   * Builds security log query for Datadog
   */
  private buildSecurityLogQuery(
    timeRange: { start: Date; end: Date },
    eventType?: string,
    severity?: string
  ): string {
    const queryParts = [
      `service:${this.config.application.name}`,
      'tags.event_type:*security*',
    ];

    if (eventType) {
      queryParts.push(`tags.event_type:${eventType}`);
    }

    if (severity) {
      queryParts.push(`tags.severity:${severity}`);
    }

    return queryParts.join(' AND ');
  }

  /**
   * Calculates risk trends from audit entries
   */
  private calculateRiskTrends(entries: AuditTrailEntry[]): RiskTrend[] {
    const hourlyBuckets = new Map<string, { critical: number; high: number; medium: number; low: number }>();
    
    entries.forEach(entry => {
      const hour = new Date(entry.timestamp).toISOString().substring(0, 13); // YYYY-MM-DDTHH
      const bucket = hourlyBuckets.get(hour) || { critical: 0, high: 0, medium: 0, low: 0 };
      
      const riskLevel = entry.details.risk_level as string;
      if (riskLevel in bucket) {
        (bucket as any)[riskLevel]++;
      }
      
      hourlyBuckets.set(hour, bucket);
    });

    return Array.from(hourlyBuckets.entries()).map(([hour, counts]) => ({
      timestamp: new Date(hour + ':00:00.000Z'),
      ...counts,
    }));
  }

  /**
   * Generates security recommendations based on patterns
   */
  private generateSecurityRecommendations(entries: AuditTrailEntry[]): string[] {
    const recommendations: string[] = [];
    
    const criticalEvents = entries.filter(e => e.details.risk_level === 'critical').length;
    const complianceViolations = entries.filter(e => e.details.compliance_violations?.length > 0).length;
    
    if (criticalEvents > 5) {
      recommendations.push('High number of critical security events detected. Consider implementing additional input validation.');
    }
    
    if (complianceViolations > 0) {
      recommendations.push('Compliance violations detected. Review data handling procedures and user training.');
    }
    
    const uniqueUsers = new Set(entries.map(e => e.userId).filter(Boolean)).size;
    if (uniqueUsers < entries.length * 0.1) {
      recommendations.push('Security events concentrated among few users. Consider targeted security training.');
    }

    return recommendations;
  }
}

/**
 * Security event context information
 */
export interface SecurityEventContext {
  source?: string;
  model?: string;
  userId?: string;
  sessionId?: string;
  inputText?: string;
  outputText?: string;
  requestId?: string;
}

/**
 * Security event processing result
 */
export interface SecurityEventResult {
  eventId: string;
  severity: string;
  incidentCreated: boolean;
  incidentId: string | null;
  dashboardUpdated: boolean;
  auditTrailUpdated: boolean;
}

/**
 * Security event summary for reporting
 */
export interface SecurityEventSummary {
  id: string;
  timestamp: Date;
  eventType: string;
  severity: string;
  description: string;
  source: string;
  userId?: string;
  model?: string;
}

/**
 * Security metrics tracking
 */
export interface SecurityMetrics {
  totalEvents: number;
  criticalEvents: number;
  complianceViolations: number;
  incidentsCreated: number;
  lastEventTime: Date | null;
}

/**
 * Security pattern analysis results
 */
export interface SecurityPatternAnalysis {
  timeRange: { start: Date; end: Date };
  totalEvents: number;
  threatTypeDistribution: Record<string, number>;
  userActivityDistribution: Record<string, number>;
  modelActivityDistribution: Record<string, number>;
  riskTrends: RiskTrend[];
  recommendations: string[];
}

/**
 * Risk trend data point
 */
export interface RiskTrend {
  timestamp: Date;
  critical: number;
  high: number;
  medium: number;
  low: number;
}