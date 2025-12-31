// Datadog-specific type definitions

/**
 * Datadog dashboard configuration
 */
export interface DashboardConfig {
  title: string;
  description: string;
  templateVars: TemplateVariable[];
  layoutType: 'ordered' | 'free';
  widgets: Widget[];
  tags: string[];
}

/**
 * Dashboard template variable
 */
export interface TemplateVariable {
  name: string;
  prefix: string;
  availableValues: string[];
  defaultValue: string;
}

/**
 * Dashboard widget configuration
 */
export interface Widget {
  id: string;
  definition: WidgetDefinition;
  layout?: WidgetLayout;
}

/**
 * Widget layout for free layout dashboards
 */
export interface WidgetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Widget definition types
 */
export interface WidgetDefinition {
  type: 'timeseries' | 'query_value' | 'toplist' | 'heatmap' | 'distribution' | 'log_stream';
  title: string;
  requests: WidgetRequest[];
  yaxis?: YAxis;
  markers?: Marker[];
  events?: EventOverlay[];
}

/**
 * Widget request configuration
 */
export interface WidgetRequest {
  q: string; // Query string
  displayType?: 'line' | 'area' | 'bars';
  style?: LineStyle;
  metadata?: RequestMetadata[];
}

/**
 * Line style configuration
 */
export interface LineStyle {
  palette: string;
  type: 'solid' | 'dashed' | 'dotted';
  width: 'normal' | 'thick' | 'thin';
}

/**
 * Y-axis configuration
 */
export interface YAxis {
  label?: string;
  scale?: 'linear' | 'log' | 'sqrt';
  min?: number;
  max?: number;
  includeZero?: boolean;
}

/**
 * Dashboard marker for annotations
 */
export interface Marker {
  value: string;
  displayType: 'error' | 'warning' | 'info' | 'ok';
  label?: string;
}

/**
 * Event overlay configuration
 */
export interface EventOverlay {
  q: string;
  tagsExecution: 'and' | 'or';
}

/**
 * Request metadata for additional context
 */
export interface RequestMetadata {
  expression: string;
  aliasName?: string;
}

/**
 * Dashboard template types
 */
export type DashboardTemplate = 'llm-overview' | 'security-monitoring' | 'cost-analysis' | 'performance-metrics';

/**
 * Datadog incident configuration
 */
export interface IncidentConfig {
  title: string;
  customerImpactScope: string;
  customerImpacted: boolean;
  fields: IncidentField[];
  notificationHandles: NotificationHandle[];
}

/**
 * Incident field configuration
 */
export interface IncidentField {
  name: string;
  value: string;
}

/**
 * Notification handle for incident routing
 */
export interface NotificationHandle {
  displayName: string;
  handle: string;
}

/**
 * Incident severity levels
 */
export type IncidentSeverity = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4' | 'SEV-5';

/**
 * Incident status types
 */
export type IncidentStatus = 'active' | 'stable' | 'resolved';

/**
 * Security event configuration
 */
export interface SecurityEventConfig {
  eventType: 'threat-detected' | 'compliance-violation' | 'anomaly-detected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  metadata: Record<string, any>;
}

/**
 * Audit trail entry
 */
export interface AuditTrailEntry {
  id: string;
  timestamp: Date;
  eventType: string;
  userId?: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  outcome: 'success' | 'failure' | 'partial';
}