import { client, v1 } from '@datadog/datadog-api-client';
import { MonitoringConfig } from '../interfaces';
import { 
  DashboardConfig, 
  DashboardTemplate, 
  Widget, 
  WidgetDefinition,
  TemplateVariable 
} from './types';

/**
 * Manages Datadog dashboard creation and updates for LLM monitoring
 */
export class DashboardManager {
  private dashboardsApi: v1.DashboardsApi;
  private config: MonitoringConfig;
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map();

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

    this.dashboardsApi = new v1.DashboardsApi(configuration);
  }

  /**
   * Creates a dashboard from a template
   */
  async createDashboard(template: DashboardTemplate, customConfig?: Partial<DashboardConfig>): Promise<string> {
    const dashboardConfig = this.generateDashboardConfig(template);
    
    // Merge custom configuration if provided
    if (customConfig) {
      Object.assign(dashboardConfig, customConfig);
    }

    try {
      const response = await this.dashboardsApi.createDashboard({
        body: {
          title: dashboardConfig.title,
          description: dashboardConfig.description,
          widgets: dashboardConfig.widgets.map(this.convertWidgetToDatadog),
          templateVariables: dashboardConfig.templateVars.map(this.convertTemplateVarToDatadog),
          layoutType: dashboardConfig.layoutType as any,
          tags: dashboardConfig.tags,
          isReadOnly: false,
        },
      });

      const dashboardId = response.id!;
      
      // Set up auto-refresh for this dashboard
      this.setupAutoRefresh(dashboardId);
      
      return dashboardId;
    } catch (error) {
      throw new Error(`Failed to create dashboard: ${error}`);
    }
  }

  /**
   * Updates an existing dashboard
   */
  async updateDashboard(dashboardId: string, config: Partial<DashboardConfig>): Promise<void> {
    try {
      // Get current dashboard
      const currentDashboard = await this.dashboardsApi.getDashboard({
        dashboardId,
      });

      // Create update payload with required fields
      const updatePayload = {
        title: config.title || currentDashboard.title!,
        description: config.description || currentDashboard.description || '',
        widgets: config.widgets ? config.widgets.map(this.convertWidgetToDatadog) : currentDashboard.widgets!,
        templateVariables: config.templateVars ? 
          config.templateVars.map(this.convertTemplateVarToDatadog) : 
          (currentDashboard.templateVariables || []),
        layoutType: currentDashboard.layoutType!,
        tags: config.tags || (currentDashboard as any).tags || [],
      };

      await this.dashboardsApi.updateDashboard({
        dashboardId,
        body: updatePayload,
      });
    } catch (error) {
      throw new Error(`Failed to update dashboard ${dashboardId}: ${error}`);
    }
  }

  /**
   * Deletes a dashboard
   */
  async deleteDashboard(dashboardId: string): Promise<void> {
    try {
      // Stop auto-refresh if active
      this.stopAutoRefresh(dashboardId);
      
      await this.dashboardsApi.deleteDashboard({
        dashboardId,
      });
    } catch (error) {
      throw new Error(`Failed to delete dashboard ${dashboardId}: ${error}`);
    }
  }

  /**
   * Lists all dashboards with LLM monitoring tags
   */
  async listLLMDashboards(): Promise<Array<{ id: string; title: string; url: string }>> {
    try {
      const response = await this.dashboardsApi.listDashboards({
        filterShared: false,
        filterDeleted: false,
      });

      return response.dashboards
        ?.filter(dashboard => {
          const tags = (dashboard as any).tags as string[] | undefined;
          return tags?.some((tag: string) => tag.includes('llm-monitoring'));
        })
        .map(dashboard => ({
          id: dashboard.id!,
          title: dashboard.title!,
          url: (dashboard as any).url!,
        })) || [];
    } catch (error) {
      throw new Error(`Failed to list dashboards: ${error}`);
    }
  }

  /**
   * Sets up auto-refresh for a dashboard (every 30 seconds as per requirements)
   */
  private setupAutoRefresh(dashboardId: string): void {
    // Clear existing refresh if any
    this.stopAutoRefresh(dashboardId);

    const refreshInterval = setInterval(async () => {
      try {
        // Trigger dashboard refresh by updating its modified time
        await this.refreshDashboard(dashboardId);
      } catch (error) {
        console.error(`Failed to refresh dashboard ${dashboardId}:`, error);
      }
    }, 30000); // 30 seconds as per requirement 2.4

    this.refreshIntervals.set(dashboardId, refreshInterval);
  }

  /**
   * Stops auto-refresh for a dashboard
   */
  private stopAutoRefresh(dashboardId: string): void {
    const interval = this.refreshIntervals.get(dashboardId);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(dashboardId);
    }
  }

  /**
   * Refreshes dashboard data
   */
  private async refreshDashboard(dashboardId: string): Promise<void> {
    // In a real implementation, this would trigger a data refresh
    // For now, we'll just update the dashboard's modified time
    const currentTime = new Date().toISOString();
    
    try {
      const dashboard = await this.dashboardsApi.getDashboard({ dashboardId });
      
      // Add a hidden template variable with current timestamp to force refresh
      const refreshVar = {
        name: 'refresh_timestamp',
        prefix: 'refresh',
        availableValues: [currentTime],
        defaultValue: currentTime,
      };

      const existingVars = dashboard.templateVariables || [];
      const updatedVars = existingVars.filter(v => v.name !== 'refresh_timestamp');
      updatedVars.push(refreshVar);

      await this.dashboardsApi.updateDashboard({
        dashboardId,
        body: {
          ...dashboard,
          templateVariables: updatedVars,
        },
      });
    } catch (error) {
      // Log error but don't throw to avoid breaking the refresh cycle
      console.error(`Dashboard refresh failed for ${dashboardId}:`, error);
    }
  }

  /**
   * Generates dashboard configuration based on template
   */
  private generateDashboardConfig(template: DashboardTemplate): DashboardConfig {
    const baseConfig = {
      tags: ['llm-monitoring', `template:${template}`, `environment:${this.config.application.environment}`],
      layoutType: 'ordered' as const,
      templateVars: this.getCommonTemplateVars(),
    };

    switch (template) {
      case 'llm-overview':
        return {
          ...baseConfig,
          title: `LLM Overview - ${this.config.application.name}`,
          description: 'Comprehensive overview of LLM application performance and health',
          widgets: this.getLLMOverviewWidgets(),
        };

      case 'security-monitoring':
        return {
          ...baseConfig,
          title: `LLM Security Monitoring - ${this.config.application.name}`,
          description: 'Security threats, compliance violations, and audit trails for LLM applications',
          widgets: this.getSecurityMonitoringWidgets(),
        };

      case 'cost-analysis':
        return {
          ...baseConfig,
          title: `LLM Cost Analysis - ${this.config.application.name}`,
          description: 'Cost tracking, budget monitoring, and optimization insights',
          widgets: this.getCostAnalysisWidgets(),
        };

      case 'performance-metrics':
        return {
          ...baseConfig,
          title: `LLM Performance Metrics - ${this.config.application.name}`,
          description: 'Detailed performance metrics and operational insights',
          widgets: this.getPerformanceMetricsWidgets(),
        };

      default:
        throw new Error(`Unknown dashboard template: ${template}`);
    }
  }

  /**
   * Gets common template variables for all dashboards
   */
  private getCommonTemplateVars(): TemplateVariable[] {
    return [
      {
        name: 'environment',
        prefix: 'environment',
        availableValues: ['development', 'staging', 'production'],
        defaultValue: this.config.application.environment,
      },
      {
        name: 'service',
        prefix: 'service',
        availableValues: [this.config.application.name],
        defaultValue: this.config.application.name,
      },
      {
        name: 'model',
        prefix: 'model',
        availableValues: ['*'],
        defaultValue: '*',
      },
    ];
  }

  /**
   * Gets widgets for LLM overview dashboard
   */
  private getLLMOverviewWidgets(): Widget[] {
    return [
      {
        id: 'response_time',
        definition: {
          type: 'timeseries',
          title: 'Response Time',
          requests: [{
            q: `avg:llm.response_time{service:${this.config.application.name}} by {model}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Milliseconds', includeZero: true },
        },
      },
      {
        id: 'throughput',
        definition: {
          type: 'timeseries',
          title: 'Request Throughput',
          requests: [{
            q: `sum:llm.requests.count{service:${this.config.application.name}} by {model}.as_rate()`,
            displayType: 'line',
          }],
          yaxis: { label: 'Requests/sec', includeZero: true },
        },
      },
      {
        id: 'error_rate',
        definition: {
          type: 'timeseries',
          title: 'Error Rate',
          requests: [{
            q: `sum:llm.errors.count{service:${this.config.application.name}} by {model}.as_rate()`,
            displayType: 'line',
          }],
          yaxis: { label: 'Errors/sec', includeZero: true },
        },
      },
      {
        id: 'token_usage',
        definition: {
          type: 'timeseries',
          title: 'Token Usage',
          requests: [{
            q: `sum:llm.tokens.total{service:${this.config.application.name}} by {model}`,
            displayType: 'area',
          }],
          yaxis: { label: 'Tokens', includeZero: true },
        },
      },
    ];
  }

  /**
   * Gets widgets for security monitoring dashboard
   */
  private getSecurityMonitoringWidgets(): Widget[] {
    return [
      {
        id: 'security_threats',
        definition: {
          type: 'timeseries',
          title: 'Security Threats Detected',
          requests: [{
            q: `sum:llm.security.threats{service:${this.config.application.name}} by {threat_type}`,
            displayType: 'bars',
          }],
          yaxis: { label: 'Threat Count', includeZero: true },
        },
      },
      {
        id: 'prompt_injections',
        definition: {
          type: 'query_value',
          title: 'Prompt Injection Attempts',
          requests: [{
            q: `sum:llm.security.prompt_injection{service:${this.config.application.name}}`,
          }],
        },
      },
      {
        id: 'sensitive_data',
        definition: {
          type: 'timeseries',
          title: 'Sensitive Data Exposure',
          requests: [{
            q: `sum:llm.security.sensitive_data{service:${this.config.application.name}} by {data_type}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Incidents', includeZero: true },
        },
      },
      {
        id: 'compliance_violations',
        definition: {
          type: 'toplist',
          title: 'Compliance Violations',
          requests: [{
            q: `top(sum:llm.security.compliance_violations{service:${this.config.application.name}} by {regulation}, 10, 'sum', 'desc')`,
          }],
        },
      },
    ];
  }

  /**
   * Gets widgets for cost analysis dashboard
   */
  private getCostAnalysisWidgets(): Widget[] {
    return [
      {
        id: 'total_cost',
        definition: {
          type: 'query_value',
          title: 'Total Cost (Current Period)',
          requests: [{
            q: `sum:llm.cost.total{service:${this.config.application.name}}`,
          }],
        },
      },
      {
        id: 'cost_by_model',
        definition: {
          type: 'timeseries',
          title: 'Cost by Model',
          requests: [{
            q: `sum:llm.cost.by_model{service:${this.config.application.name}} by {model}`,
            displayType: 'area',
          }],
          yaxis: { label: 'Cost ($)', includeZero: true },
        },
      },
      {
        id: 'budget_usage',
        definition: {
          type: 'timeseries',
          title: 'Budget Usage',
          requests: [{
            q: `sum:llm.cost.budget_usage{service:${this.config.application.name}} by {budget_name}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Percentage', max: 100, includeZero: true },
          markers: [
            { value: '80', displayType: 'warning', label: 'Warning Threshold' },
            { value: '95', displayType: 'error', label: 'Critical Threshold' },
          ],
        },
      },
      {
        id: 'cost_trends',
        definition: {
          type: 'timeseries',
          title: 'Cost Trends',
          requests: [{
            q: `sum:llm.cost.daily{service:${this.config.application.name}}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Daily Cost ($)', includeZero: true },
        },
      },
    ];
  }

  /**
   * Gets widgets for performance metrics dashboard
   */
  private getPerformanceMetricsWidgets(): Widget[] {
    return [
      {
        id: 'latency_percentiles',
        definition: {
          type: 'timeseries',
          title: 'Response Time Percentiles',
          requests: [
            {
              q: `avg:llm.response_time.p50{service:${this.config.application.name}}`,
              displayType: 'line',
            },
            {
              q: `avg:llm.response_time.p95{service:${this.config.application.name}}`,
              displayType: 'line',
            },
            {
              q: `avg:llm.response_time.p99{service:${this.config.application.name}}`,
              displayType: 'line',
            },
          ],
          yaxis: { label: 'Milliseconds', includeZero: true },
        },
      },
      {
        id: 'success_rate',
        definition: {
          type: 'timeseries',
          title: 'Success Rate',
          requests: [{
            q: `(sum:llm.requests.success{service:${this.config.application.name}} / sum:llm.requests.total{service:${this.config.application.name}}) * 100`,
            displayType: 'line',
          }],
          yaxis: { label: 'Percentage', max: 100, includeZero: true },
        },
      },
      {
        id: 'token_efficiency',
        definition: {
          type: 'timeseries',
          title: 'Token Efficiency',
          requests: [{
            q: `avg:llm.tokens.efficiency{service:${this.config.application.name}} by {model}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Tokens/Request', includeZero: true },
        },
      },
      {
        id: 'model_accuracy',
        definition: {
          type: 'timeseries',
          title: 'Model Accuracy Trends',
          requests: [{
            q: `avg:llm.accuracy.score{service:${this.config.application.name}} by {model}`,
            displayType: 'line',
          }],
          yaxis: { label: 'Accuracy Score', max: 1, includeZero: true },
        },
      },
    ];
  }

  /**
   * Converts internal widget format to Datadog API format
   */
  private convertWidgetToDatadog(widget: Widget): any {
    return {
      id: widget.id,
      definition: {
        type: widget.definition.type,
        title: widget.definition.title,
        requests: widget.definition.requests.map(req => ({
          q: req.q,
          display_type: req.displayType,
          style: req.style,
          metadata: req.metadata,
        })),
        yaxis: widget.definition.yaxis,
        markers: widget.definition.markers,
        events: widget.definition.events,
      },
      layout: widget.layout,
    };
  }

  /**
   * Converts internal template variable format to Datadog API format
   */
  private convertTemplateVarToDatadog(templateVar: TemplateVariable): any {
    return {
      name: templateVar.name,
      prefix: templateVar.prefix,
      availableValues: templateVar.availableValues,
      default: templateVar.defaultValue,
    };
  }

  /**
   * Cleanup method to stop all auto-refresh intervals
   */
  public cleanup(): void {
    for (const [dashboardId] of this.refreshIntervals) {
      this.stopAutoRefresh(dashboardId);
    }
  }
}