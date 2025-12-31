import { client, v2 } from '@datadog/datadog-api-client';
import { MonitoringConfig } from '../interfaces';
import { Alert } from '../interfaces';
import { 
  IncidentConfig, 
  IncidentSeverity, 
  IncidentStatus, 
  IncidentField, 
  NotificationHandle 
} from './types';

/**
 * Manages Datadog incident creation and lifecycle for LLM monitoring alerts
 */
export class IncidentManager {
  private incidentsApi: v2.IncidentsApi;
  private config: MonitoringConfig;
  private teamRouting: Map<IncidentSeverity, string[]> = new Map();
  private incidentMetrics: Map<string, IncidentMetrics> = new Map();

  constructor(config: MonitoringConfig) {
    this.config = config;
    
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

    this.incidentsApi = new v2.IncidentsApi(configuration);
    
    // Initialize default team routing
    this.initializeTeamRouting();
  }

  /**
   * Creates an incident from an alert with rich context
   */
  async createIncident(alert: Alert, additionalContext?: Record<string, any>): Promise<string> {
    try {
      const severity = this.mapAlertSeverityToIncident(alert.severity);
      const incidentConfig = this.buildIncidentConfig(alert, severity, additionalContext);
      
      const response = await this.incidentsApi.createIncident({
        body: {
          data: {
            type: 'incidents',
            attributes: {
              title: incidentConfig.title,
              customerImpactScope: incidentConfig.customerImpactScope,
              customerImpacted: incidentConfig.customerImpacted,
              fields: this.convertFieldsToDatadog(incidentConfig.fields),
              notificationHandles: this.convertNotificationHandlesToDatadog(incidentConfig.notificationHandles),
            },
          },
        },
      });

      const incidentId = response.data.id!;
      
      // Track incident metrics
      this.trackIncidentCreation(incidentId, alert, severity);
      
      // Route to appropriate teams
      await this.routeIncident(incidentId, severity);
      
      return incidentId;
    } catch (error) {
      throw new Error(`Failed to create incident for alert ${alert.id}: ${error}`);
    }
  }

  /**
   * Updates an existing incident with new information
   */
  async updateIncident(
    incidentId: string, 
    updates: Partial<IncidentConfig>,
    status?: IncidentStatus
  ): Promise<void> {
    try {
      const updateData: any = {
        data: {
          type: 'incidents',
          id: incidentId,
          attributes: {},
        },
      };

      if (updates.title) {
        updateData.data.attributes.title = updates.title;
      }

      if (updates.customerImpactScope) {
        updateData.data.attributes.customerImpactScope = updates.customerImpactScope;
      }

      if (updates.customerImpacted !== undefined) {
        updateData.data.attributes.customerImpacted = updates.customerImpacted;
      }

      if (updates.fields) {
        updateData.data.attributes.fields = this.convertFieldsToDatadog(updates.fields);
      }

      if (status) {
        updateData.data.attributes.state = status;
      }

      await this.incidentsApi.updateIncident({
        incidentId,
        body: updateData,
      });

      // Update incident metrics
      this.updateIncidentMetrics(incidentId, status);
    } catch (error) {
      throw new Error(`Failed to update incident ${incidentId}: ${error}`);
    }
  }

  /**
   * Resolves an incident with root cause information
   */
  async resolveIncident(
    incidentId: string, 
    rootCause: string, 
    resolutionNotes?: string
  ): Promise<void> {
    try {
      const resolutionTime = new Date();
      const incidentMetrics = this.incidentMetrics.get(incidentId);
      
      // Calculate resolution time
      const resolutionDuration = incidentMetrics 
        ? resolutionTime.getTime() - incidentMetrics.createdAt.getTime()
        : 0;

      // Update incident with resolution information
      await this.updateIncident(incidentId, {
        fields: [
          { name: 'root_cause', value: rootCause },
          { name: 'resolution_notes', value: resolutionNotes || '' },
          { name: 'resolution_time_ms', value: resolutionDuration.toString() },
          { name: 'resolved_at', value: resolutionTime.toISOString() },
        ],
      }, 'resolved');

      // Update metrics
      if (incidentMetrics) {
        incidentMetrics.resolvedAt = resolutionTime;
        incidentMetrics.resolutionTimeMs = resolutionDuration;
        incidentMetrics.rootCause = rootCause;
      }
    } catch (error) {
      throw new Error(`Failed to resolve incident ${incidentId}: ${error}`);
    }
  }

  /**
   * Gets incident details including metrics and timeline
   */
  async getIncident(incidentId: string): Promise<IncidentDetails> {
    try {
      const response = await this.incidentsApi.getIncident({
        incidentId,
        include: ['attachments'],
      });

      const incident = response.data;
      const metrics = this.incidentMetrics.get(incidentId);

      return {
        id: incident.id!,
        title: incident.attributes?.title || '',
        status: incident.attributes?.state as IncidentStatus || 'active',
        severity: this.extractSeverityFromFields(incident.attributes?.fields || {}),
        createdAt: new Date(incident.attributes?.created || Date.now()),
        updatedAt: new Date(incident.attributes?.modified || Date.now()),
        customerImpacted: incident.attributes?.customerImpacted || false,
        customerImpactScope: incident.attributes?.customerImpactScope || '',
        fields: this.convertFieldsFromDatadog(incident.attributes?.fields || {}),
        metrics: metrics || null,
      };
    } catch (error) {
      throw new Error(`Failed to get incident ${incidentId}: ${error}`);
    }
  }

  /**
   * Lists incidents for the LLM application
   */
  async listIncidents(
    status?: IncidentStatus,
    severity?: IncidentSeverity,
    limit: number = 50
  ): Promise<IncidentSummary[]> {
    try {
      const queryParams: any = {
        pageSize: limit,
      };

      // Add filters if provided
      const filters: string[] = [`service:${this.config.application.name}`];
      
      if (status) {
        filters.push(`state:${status}`);
      }
      
      if (severity) {
        filters.push(`severity:${severity}`);
      }

      if (filters.length > 0) {
        queryParams.filter = filters.join(' AND ');
      }

      const response = await this.incidentsApi.listIncidents(queryParams);

      return response.data?.map(incident => ({
        id: incident.id!,
        title: incident.attributes?.title || '',
        status: incident.attributes?.state as IncidentStatus || 'active',
        severity: this.extractSeverityFromFields(incident.attributes?.fields || {}),
        createdAt: new Date(incident.attributes?.created || Date.now()),
        customerImpacted: incident.attributes?.customerImpacted || false,
      })) || [];
    } catch (error) {
      throw new Error(`Failed to list incidents: ${error}`);
    }
  }

  /**
   * Configures team routing for different severity levels
   */
  configureTeamRouting(routing: Map<IncidentSeverity, string[]>): void {
    this.teamRouting = new Map(routing);
  }

  /**
   * Gets incident metrics and statistics
   */
  getIncidentStatistics(): IncidentStatistics {
    const allMetrics = Array.from(this.incidentMetrics.values());
    
    const totalIncidents = allMetrics.length;
    const resolvedIncidents = allMetrics.filter(m => m.resolvedAt).length;
    const activeIncidents = totalIncidents - resolvedIncidents;
    
    const resolutionTimes = allMetrics
      .filter(m => m.resolutionTimeMs)
      .map(m => m.resolutionTimeMs!);
    
    const avgResolutionTime = resolutionTimes.length > 0 
      ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length
      : 0;

    const severityBreakdown = allMetrics.reduce((acc, metrics) => {
      acc[metrics.severity] = (acc[metrics.severity] || 0) + 1;
      return acc;
    }, {} as Record<IncidentSeverity, number>);

    return {
      totalIncidents,
      activeIncidents,
      resolvedIncidents,
      avgResolutionTimeMs: avgResolutionTime,
      severityBreakdown,
      resolutionRate: totalIncidents > 0 ? resolvedIncidents / totalIncidents : 0,
    };
  }

  /**
   * Builds incident configuration from alert
   */
  private buildIncidentConfig(
    alert: Alert, 
    severity: IncidentSeverity, 
    additionalContext?: Record<string, any>
  ): IncidentConfig {
    const fields: IncidentField[] = [
      { name: 'alert_id', value: alert.id },
      { name: 'rule_id', value: alert.ruleId },
      { name: 'severity', value: severity },
      { name: 'service', value: this.config.application.name },
      { name: 'environment', value: this.config.application.environment },
      { name: 'alert_timestamp', value: alert.timestamp.toISOString() },
    ];

    // Add alert context
    Object.entries(alert.context).forEach(([key, value]) => {
      fields.push({ name: `context_${key}`, value: String(value) });
    });

    // Add alert tags
    Object.entries(alert.tags).forEach(([key, value]) => {
      fields.push({ name: `tag_${key}`, value: value });
    });

    // Add additional context if provided
    if (additionalContext) {
      Object.entries(additionalContext).forEach(([key, value]) => {
        fields.push({ name: `additional_${key}`, value: String(value) });
      });
    }

    return {
      title: `${alert.title} - ${this.config.application.name}`,
      customerImpactScope: this.determineCustomerImpact(severity, alert),
      customerImpacted: severity === 'SEV-1' || severity === 'SEV-2',
      fields,
      notificationHandles: this.getNotificationHandles(severity),
    };
  }

  /**
   * Maps alert severity to incident severity
   */
  private mapAlertSeverityToIncident(alertSeverity: string): IncidentSeverity {
    switch (alertSeverity.toLowerCase()) {
      case 'critical':
        return 'SEV-1';
      case 'error':
        return 'SEV-2';
      case 'warning':
        return 'SEV-3';
      case 'info':
        return 'SEV-4';
      default:
        return 'SEV-5';
    }
  }

  /**
   * Determines customer impact scope based on severity and alert
   */
  private determineCustomerImpact(severity: IncidentSeverity, alert: Alert): string {
    if (severity === 'SEV-1') {
      return 'All customers affected - service unavailable';
    } else if (severity === 'SEV-2') {
      return 'Some customers affected - degraded performance';
    } else if (severity === 'SEV-3') {
      return 'Potential customer impact - monitoring required';
    } else {
      return 'No customer impact - internal monitoring';
    }
  }

  /**
   * Gets notification handles for a given severity
   */
  private getNotificationHandles(severity: IncidentSeverity): NotificationHandle[] {
    const teams = this.teamRouting.get(severity) || [];
    return teams.map(team => ({
      displayName: team,
      handle: `@${team}`,
    }));
  }

  /**
   * Routes incident to appropriate teams based on severity
   */
  private async routeIncident(incidentId: string, severity: IncidentSeverity): Promise<void> {
    const teams = this.teamRouting.get(severity);
    if (!teams || teams.length === 0) {
      return;
    }

    try {
      // Add notification handles to the incident
      const notificationHandles = this.getNotificationHandles(severity);
      
      await this.updateIncident(incidentId, {
        notificationHandles,
      });
    } catch (error) {
      console.error(`Failed to route incident ${incidentId} to teams:`, error);
    }
  }

  /**
   * Tracks incident creation metrics
   */
  private trackIncidentCreation(incidentId: string, alert: Alert, severity: IncidentSeverity): void {
    this.incidentMetrics.set(incidentId, {
      incidentId,
      alertId: alert.id,
      severity,
      createdAt: new Date(),
      resolvedAt: null,
      resolutionTimeMs: null,
      rootCause: null,
    });
  }

  /**
   * Updates incident metrics
   */
  private updateIncidentMetrics(incidentId: string, status?: IncidentStatus): void {
    const metrics = this.incidentMetrics.get(incidentId);
    if (metrics && status === 'resolved' && !metrics.resolvedAt) {
      metrics.resolvedAt = new Date();
      metrics.resolutionTimeMs = metrics.resolvedAt.getTime() - metrics.createdAt.getTime();
    }
  }

  /**
   * Initializes default team routing configuration
   */
  private initializeTeamRouting(): void {
    this.teamRouting.set('SEV-1', ['on-call-engineer', 'engineering-manager', 'product-manager']);
    this.teamRouting.set('SEV-2', ['on-call-engineer', 'engineering-team']);
    this.teamRouting.set('SEV-3', ['engineering-team']);
    this.teamRouting.set('SEV-4', ['monitoring-team']);
    this.teamRouting.set('SEV-5', ['monitoring-team']);
  }

  /**
   * Converts internal fields to Datadog format
   */
  private convertFieldsToDatadog(fields: IncidentField[]): Record<string, any> {
    return fields.reduce((acc, field) => {
      acc[field.name] = { value: field.value };
      return acc;
    }, {} as Record<string, any>);
  }

  /**
   * Converts Datadog fields to internal format
   */
  private convertFieldsFromDatadog(fields: Record<string, any>): IncidentField[] {
    return Object.entries(fields).map(([name, fieldData]) => ({
      name,
      value: fieldData.value || String(fieldData),
    }));
  }

  /**
   * Converts internal notification handles to Datadog format
   */
  private convertNotificationHandlesToDatadog(handles: NotificationHandle[]): any[] {
    return handles.map(handle => ({
      displayName: handle.displayName,
      handle: handle.handle,
    }));
  }

  /**
   * Extracts severity from incident fields
   */
  private extractSeverityFromFields(fields: Record<string, any>): IncidentSeverity {
    const severityField = fields.severity;
    if (severityField && severityField.value) {
      return severityField.value as IncidentSeverity;
    }
    return 'SEV-5'; // Default severity
  }
}

/**
 * Incident metrics tracking
 */
interface IncidentMetrics {
  incidentId: string;
  alertId: string;
  severity: IncidentSeverity;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionTimeMs: number | null;
  rootCause: string | null;
}

/**
 * Detailed incident information
 */
export interface IncidentDetails {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  createdAt: Date;
  updatedAt: Date;
  customerImpacted: boolean;
  customerImpactScope: string;
  fields: IncidentField[];
  metrics: IncidentMetrics | null;
}

/**
 * Incident summary for listing
 */
export interface IncidentSummary {
  id: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  createdAt: Date;
  customerImpacted: boolean;
}

/**
 * Incident statistics
 */
export interface IncidentStatistics {
  totalIncidents: number;
  activeIncidents: number;
  resolvedIncidents: number;
  avgResolutionTimeMs: number;
  severityBreakdown: Record<IncidentSeverity, number>;
  resolutionRate: number;
}