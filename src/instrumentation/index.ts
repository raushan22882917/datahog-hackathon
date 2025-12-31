export { GoogleCloudInstrumentationAgent } from './instrumentation-agent';
export { 
  AutoInstrumentationSystem,
  initializeAutoInstrumentation,
  getAutoInstrumentation,
  shutdownAutoInstrumentation
} from './auto-instrumentation';
export { ModelAdaptiveMonitor } from './model-adaptive-monitor';
export { CICDIntegrationSystem } from './cicd-integration';
export type { 
  DeploymentPattern,
  EnvironmentInfo,
  AutoInstrumentationConfig
} from './auto-instrumentation';
export type {
  ModelCharacteristics,
  ModelCapability,
  AdaptiveMonitoringStrategy,
  MetricCollectionRule,
  AlertThreshold,
  SamplingStrategy,
  SamplingCondition
} from './model-adaptive-monitor';
export type {
  DeploymentHealthCheck,
  HealthCheckResult,
  DeploymentRecommendation,
  RollbackTrigger,
  CICDPlatformConfig,
  DeploymentValidation,
  MonitoringCoverage,
  ComponentCoverage,
  ConfigurationIssue
} from './cicd-integration';