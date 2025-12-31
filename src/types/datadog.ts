// Datadog integration type definitions

/**
 * Datadog metric structure
 */
export interface DatadogMetric {
  metric: string;
  points: [number, number][]; // [timestamp, value]
  tags: string[];
  type: 'gauge' | 'count' | 'rate';
}

/**
 * Datadog log structure
 */
export interface DatadogLog {
  timestamp: Date;
  level: string;
  message: string;
  service: string;
  tags: Record<string, string>;
  attributes: Record<string, any>;
}

/**
 * Datadog trace structure
 */
export interface DatadogTrace {
  traceId: string;
  spans: DatadogSpan[];
}

/**
 * Datadog span structure
 */
export interface DatadogSpan {
  spanId: string;
  parentId?: string;
  operationName: string;
  serviceName: string;
  startTime: number;
  duration: number;
  tags: Record<string, string>;
  logs?: SpanLog[];
}

/**
 * Span log entry
 */
export interface SpanLog {
  timestamp: number;
  fields: Record<string, any>;
}

/**
 * Datadog dashboard configuration
 */
export interface DatadogDashboard {
  id?: string;
  title: string;
  description: string;
  widgets: DashboardWidget[];
  templateVariables?: TemplateVariable[];
  layoutType: 'ordered' | 'free';
}

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  id?: string;
  definition: WidgetDefinition;
  layout?: WidgetLayout;
}

/**
 * Widget definition
 */
export interface WidgetDefinition {
  type: 'timeseries' | 'query_value' | 'toplist' | 'heatmap' | 'distribution';
  title: string;
  requests: WidgetRequest[];
  yAxis?: AxisConfig;
  markers?: Marker[];
}

/**
 * Widget request configuration
 */
export interface WidgetRequest {
  q: string; // Query string
  displayType?: 'line' | 'area' | 'bars';
  style?: LineStyle;
}

/**
 * Line style configuration
 */
export interface LineStyle {
  palette: string;
  lineType: 'solid' | 'dashed' | 'dotted';
  lineWidth: 'normal' | 'thick' | 'thin';
}

/**
 * Axis configuration
 */
export interface AxisConfig {
  min?: number;
  max?: number;
  scale?: 'linear' | 'log' | 'sqrt';
  includeZero?: boolean;
}

/**
 * Dashboard marker
 */
export interface Marker {
  value: string;
  displayType: 'error' | 'warning' | 'info' | 'ok';
  label?: string;
}

/**
 * Template variable
 */
export interface TemplateVariable {
  name: string;
  prefix?: string;
  availableValues?: string[];
  defaultValue?: string;
}

/**
 * Widget layout
 */
export interface WidgetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Datadog incident structure
 */
export interface DatadogIncident {
  id?: string;
  title: string;
  description: string;
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4' | 'SEV-5';
  state: 'active' | 'stable' | 'resolved';
  customerImpacted: boolean;
  customerImpactScope?: string;
  customerImpactStart?: Date;
  customerImpactEnd?: Date;
  detectedAt: Date;
  createdBy: string;
  assignedTo?: string;
  tags?: string[];
}

/**
 * Alert configuration for Datadog
 */
export interface DatadogAlert {
  id?: string;
  name: string;
  message: string;
  query: string;
  type: 'metric alert' | 'service check' | 'event alert' | 'process alert';
  options: AlertOptions;
  tags?: string[];
}

/**
 * Alert options
 */
export interface AlertOptions {
  thresholds: AlertThresholds;
  notifyAudit: boolean;
  requireFullWindow: boolean;
  notifyNoData: boolean;
  renotifyInterval?: number;
  timeoutH?: number;
  evaluationDelay?: number;
  newHostDelay?: number;
  escalationMessage?: string;
  includeTags?: boolean;
}

/**
 * Alert thresholds
 */
export interface AlertThresholds {
  critical: number;
  warning?: number;
  unknown?: number;
  ok?: number;
  criticalRecovery?: number;
  warningRecovery?: number;
}