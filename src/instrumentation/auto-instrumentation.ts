import { MonitoringConfig } from '../interfaces';
import { GoogleCloudInstrumentationAgent } from './instrumentation-agent';
import { DatadogTelemetryCollector } from '../telemetry/telemetry-collector';
import { LLMDataProcessor } from '../processing/data-processor';
import { DetectionEngine } from '../detection/detection-engine';
import { loadConfig, getDefaultConfig } from '../config';

/**
 * Deployment pattern detection
 */
export type DeploymentPattern = 'container' | 'serverless' | 'vm' | 'kubernetes' | 'local';

/**
 * Environment detection result
 */
export interface EnvironmentInfo {
  pattern: DeploymentPattern;
  platform: string;
  runtime: string;
  version: string;
  metadata: Record<string, string>;
}

/**
 * Auto-instrumentation configuration
 */
export interface AutoInstrumentationConfig {
  enabled: boolean;
  autoDetectEnvironment: boolean;
  minimalConfig: boolean;
  instrumentationLevel: 'basic' | 'standard' | 'comprehensive';
  excludePatterns: string[];
  includePatterns: string[];
}

/**
 * Automatic instrumentation system that provides zero-config setup
 * for LLM applications across different deployment patterns
 */
export class AutoInstrumentationSystem {
  private config: MonitoringConfig | null = null;
  private autoConfig: AutoInstrumentationConfig;
  private instrumentationAgent: GoogleCloudInstrumentationAgent | null = null;
  private telemetryCollector: DatadogTelemetryCollector | null = null;
  private dataProcessor: LLMDataProcessor | null = null;
  private detectionEngine: DetectionEngine | null = null;
  private isInitialized = false;

  constructor(autoConfig?: Partial<AutoInstrumentationConfig>) {
    this.autoConfig = {
      enabled: true,
      autoDetectEnvironment: true,
      minimalConfig: true,
      instrumentationLevel: 'standard',
      excludePatterns: ['**/node_modules/**', '**/test/**', '**/tests/**'],
      includePatterns: ['**/*.js', '**/*.ts'],
      ...autoConfig
    };
  }

  /**
   * Initialize automatic instrumentation with minimal configuration
   */
  async initialize(partialConfig?: Partial<MonitoringConfig>): Promise<void> {
    if (!this.autoConfig.enabled) {
      return;
    }

    try {
      // Detect environment if enabled
      const envInfo = this.autoConfig.autoDetectEnvironment 
        ? await this.detectEnvironment()
        : null;

      // Build configuration with auto-detected values
      const autoDetectedConfig = this.buildAutoConfiguration(envInfo);
      
      // Merge with provided config and defaults
      const finalConfig = this.mergeConfigurations(
        getDefaultConfig(),
        autoDetectedConfig,
        partialConfig || {}
      );

      // Validate and load final configuration
      this.config = loadConfig(finalConfig);

      // Initialize components based on instrumentation level
      await this.initializeComponents();

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Auto-instrumentation initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect the current deployment environment and pattern
   */
  async detectEnvironment(): Promise<EnvironmentInfo> {
    const metadata: Record<string, string> = {};
    
    // Detect container environment
    if (this.isContainerEnvironment()) {
      const containerInfo = await this.detectContainerInfo();
      return {
        pattern: containerInfo.isKubernetes ? 'kubernetes' : 'container',
        platform: containerInfo.platform,
        runtime: containerInfo.runtime,
        version: containerInfo.version,
        metadata: {
          ...metadata,
          ...containerInfo.metadata
        }
      };
    }

    // Detect serverless environment
    if (this.isServerlessEnvironment()) {
      const serverlessInfo = this.detectServerlessInfo();
      return {
        pattern: 'serverless',
        platform: serverlessInfo.platform,
        runtime: serverlessInfo.runtime,
        version: serverlessInfo.version,
        metadata: {
          ...metadata,
          ...serverlessInfo.metadata
        }
      };
    }

    // Detect VM environment
    if (this.isVMEnvironment()) {
      const vmInfo = this.detectVMInfo();
      return {
        pattern: 'vm',
        platform: vmInfo.platform,
        runtime: vmInfo.runtime,
        version: vmInfo.version,
        metadata: {
          ...metadata,
          ...vmInfo.metadata
        }
      };
    }

    // Default to local development
    return {
      pattern: 'local',
      platform: process.platform,
      runtime: 'node',
      version: process.version,
      metadata: {
        ...metadata,
        nodeVersion: process.version,
        arch: process.arch,
        pid: process.pid.toString()
      }
    };
  }

  /**
   * Check if running in container environment
   */
  private isContainerEnvironment(): boolean {
    // Check for container-specific environment variables
    return !!(
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.DOCKER_CONTAINER ||
      process.env.CONTAINER_NAME ||
      this.hasContainerCgroup()
    );
  }

  /**
   * Check for container cgroup indicators
   */
  private hasContainerCgroup(): boolean {
    try {
      const fs = require('fs');
      if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
        return cgroup.includes('docker') || cgroup.includes('kubepods');
      }
    } catch {
      // Ignore errors
    }
    return false;
  }

  /**
   * Detect container-specific information
   */
  private async detectContainerInfo(): Promise<{
    isKubernetes: boolean;
    platform: string;
    runtime: string;
    version: string;
    metadata: Record<string, string>;
  }> {
    const isKubernetes = !!(
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.KUBERNETES_PORT
    );

    const metadata: Record<string, string> = {};

    if (isKubernetes) {
      metadata.namespace = process.env.KUBERNETES_NAMESPACE || 'default';
      metadata.podName = process.env.HOSTNAME || 'unknown';
      metadata.serviceName = process.env.KUBERNETES_SERVICE_NAME || 'unknown';
    }

    if (process.env.DOCKER_CONTAINER) {
      metadata.containerId = process.env.DOCKER_CONTAINER;
    }

    return {
      isKubernetes,
      platform: isKubernetes ? 'kubernetes' : 'docker',
      runtime: 'node',
      version: process.version,
      metadata
    };
  }

  /**
   * Check if running in serverless environment
   */
  private isServerlessEnvironment(): boolean {
    return !!(
      process.env.FUNCTION_NAME || // Google Cloud Functions
      process.env.AWS_LAMBDA_FUNCTION_NAME || // AWS Lambda
      process.env.AZURE_FUNCTIONS_ENVIRONMENT || // Azure Functions
      process.env.VERCEL || // Vercel
      process.env.NETLIFY // Netlify Functions
    );
  }

  /**
   * Detect serverless-specific information
   */
  private detectServerlessInfo(): {
    platform: string;
    runtime: string;
    version: string;
    metadata: Record<string, string>;
  } {
    const metadata: Record<string, string> = {};

    if (process.env.FUNCTION_NAME) {
      // Google Cloud Functions
      metadata.functionName = process.env.FUNCTION_NAME;
      metadata.region = process.env.FUNCTION_REGION || 'unknown';
      return {
        platform: 'google-cloud-functions',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      // AWS Lambda
      metadata.functionName = process.env.AWS_LAMBDA_FUNCTION_NAME;
      metadata.region = process.env.AWS_REGION || 'unknown';
      metadata.runtime = process.env.AWS_EXECUTION_ENV || 'unknown';
      return {
        platform: 'aws-lambda',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.AZURE_FUNCTIONS_ENVIRONMENT) {
      // Azure Functions
      metadata.functionName = process.env.AZURE_FUNCTIONS_FUNCTION_NAME || 'unknown';
      return {
        platform: 'azure-functions',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.VERCEL) {
      // Vercel
      metadata.region = process.env.VERCEL_REGION || 'unknown';
      return {
        platform: 'vercel',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.NETLIFY) {
      // Netlify
      return {
        platform: 'netlify',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    return {
      platform: 'unknown-serverless',
      runtime: 'node',
      version: process.version,
      metadata
    };
  }

  /**
   * Check if running in VM environment
   */
  private isVMEnvironment(): boolean {
    return !!(
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.AWS_INSTANCE_ID ||
      process.env.AZURE_RESOURCE_GROUP
    );
  }

  /**
   * Detect VM-specific information
   */
  private detectVMInfo(): {
    platform: string;
    runtime: string;
    version: string;
    metadata: Record<string, string>;
  } {
    const metadata: Record<string, string> = {};

    if (process.env.GOOGLE_CLOUD_PROJECT) {
      metadata.project = process.env.GOOGLE_CLOUD_PROJECT;
      metadata.zone = process.env.GOOGLE_CLOUD_ZONE || 'unknown';
      return {
        platform: 'google-compute-engine',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.AWS_INSTANCE_ID) {
      metadata.instanceId = process.env.AWS_INSTANCE_ID;
      metadata.region = process.env.AWS_REGION || 'unknown';
      return {
        platform: 'aws-ec2',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    if (process.env.AZURE_RESOURCE_GROUP) {
      metadata.resourceGroup = process.env.AZURE_RESOURCE_GROUP;
      return {
        platform: 'azure-vm',
        runtime: 'node',
        version: process.version,
        metadata
      };
    }

    return {
      platform: 'unknown-vm',
      runtime: 'node',
      version: process.version,
      metadata
    };
  }

  /**
   * Build configuration based on environment detection
   */
  private buildAutoConfiguration(envInfo: EnvironmentInfo | null): Partial<MonitoringConfig> {
    if (!envInfo) {
      return {};
    }

    const config: Partial<MonitoringConfig> = {};

    // Set application configuration based on environment
    config.application = {
      name: this.detectApplicationName(),
      version: this.detectApplicationVersion(),
      environment: this.detectEnvironmentName(envInfo)
    };

    // Adjust telemetry configuration based on deployment pattern
    const telemetryConfig = this.getTelemetryConfigForPattern(envInfo.pattern);
    if (telemetryConfig) {
      config.telemetry = telemetryConfig;
    }

    // Set Google Cloud configuration if detected
    if (envInfo.metadata.project) {
      config.googleCloud = {
        projectId: envInfo.metadata.project,
        location: envInfo.metadata.zone || envInfo.metadata.region || 'us-central1'
      };
    }

    return config;
  }

  /**
   * Detect application name from various sources
   */
  private detectApplicationName(): string {
    return (
      process.env.APP_NAME ||
      process.env.SERVICE_NAME ||
      process.env.FUNCTION_NAME ||
      process.env.KUBERNETES_SERVICE_NAME ||
      require('../../package.json').name ||
      'llm-app'
    );
  }

  /**
   * Detect application version from various sources
   */
  private detectApplicationVersion(): string {
    return (
      process.env.APP_VERSION ||
      process.env.SERVICE_VERSION ||
      process.env.GIT_COMMIT ||
      require('../../package.json').version ||
      '1.0.0'
    );
  }

  /**
   * Detect environment name based on deployment info
   */
  private detectEnvironmentName(envInfo: EnvironmentInfo): string {
    if (process.env.NODE_ENV) {
      return process.env.NODE_ENV;
    }

    if (process.env.ENVIRONMENT) {
      return process.env.ENVIRONMENT;
    }

    // Infer from deployment pattern
    switch (envInfo.pattern) {
      case 'local':
        return 'development';
      case 'serverless':
      case 'kubernetes':
        return 'production';
      default:
        return 'staging';
    }
  }

  /**
   * Get telemetry configuration optimized for deployment pattern
   */
  private getTelemetryConfigForPattern(pattern: DeploymentPattern): MonitoringConfig['telemetry'] {
    switch (pattern) {
      case 'serverless':
        return {
          batchSize: 50, // Smaller batches for faster cold starts
          flushInterval: 2000, // More frequent flushing
          maxRetries: 2, // Fewer retries due to execution time limits
          retryDelay: 500
        };
      
      case 'kubernetes':
        return {
          batchSize: 200, // Larger batches for efficiency
          flushInterval: 10000, // Less frequent flushing
          maxRetries: 5,
          retryDelay: 2000
        };
      
      case 'container':
        return {
          batchSize: 100,
          flushInterval: 5000,
          maxRetries: 3,
          retryDelay: 1000
        };
      
      case 'local':
        return {
          batchSize: 10, // Small batches for development
          flushInterval: 1000, // Frequent flushing for immediate feedback
          maxRetries: 1,
          retryDelay: 500
        };
      
      default:
        return {
          batchSize: 100,
          flushInterval: 5000,
          maxRetries: 3,
          retryDelay: 1000
        };
    }
  }

  /**
   * Merge multiple configuration objects with proper precedence
   */
  private mergeConfigurations(
    ...configs: Partial<MonitoringConfig>[]
  ): Partial<MonitoringConfig> {
    const result: Partial<MonitoringConfig> = {};

    for (const config of configs) {
      this.deepMerge(result, config);
    }

    return result;
  }

  /**
   * Deep merge configuration objects
   */
  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * Initialize monitoring components based on instrumentation level
   */
  private async initializeComponents(): Promise<void> {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    // Always initialize instrumentation agent
    this.instrumentationAgent = new GoogleCloudInstrumentationAgent();
    await this.instrumentationAgent.initialize(this.config);

    // Initialize additional components based on level
    if (this.autoConfig.instrumentationLevel === 'standard' || 
        this.autoConfig.instrumentationLevel === 'comprehensive') {
      
      this.telemetryCollector = new DatadogTelemetryCollector(this.config);
      this.dataProcessor = new LLMDataProcessor();
    }

    if (this.autoConfig.instrumentationLevel === 'comprehensive') {
      this.detectionEngine = new DetectionEngine();
    }
  }

  /**
   * Get the instrumentation agent instance
   */
  getInstrumentationAgent(): GoogleCloudInstrumentationAgent {
    if (!this.instrumentationAgent) {
      throw new Error('Auto-instrumentation not initialized');
    }
    return this.instrumentationAgent;
  }

  /**
   * Get the telemetry collector instance
   */
  getTelemetryCollector(): DatadogTelemetryCollector | null {
    return this.telemetryCollector;
  }

  /**
   * Get the data processor instance
   */
  getDataProcessor(): LLMDataProcessor | null {
    return this.dataProcessor;
  }

  /**
   * Get the detection engine instance
   */
  getDetectionEngine(): DetectionEngine | null {
    return this.detectionEngine;
  }

  /**
   * Get current configuration
   */
  getConfig(): MonitoringConfig | null {
    return this.config;
  }

  /**
   * Check if auto-instrumentation is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Shutdown auto-instrumentation system
   */
  async shutdown(): Promise<void> {
    if (this.instrumentationAgent) {
      await this.instrumentationAgent.shutdown();
    }

    if (this.telemetryCollector) {
      await this.telemetryCollector.flush();
    }

    this.isInitialized = false;
  }
}

/**
 * Global auto-instrumentation instance
 */
let globalAutoInstrumentation: AutoInstrumentationSystem | null = null;

/**
 * Initialize global auto-instrumentation
 */
export async function initializeAutoInstrumentation(
  config?: Partial<MonitoringConfig>,
  autoConfig?: Partial<AutoInstrumentationConfig>
): Promise<AutoInstrumentationSystem> {
  if (globalAutoInstrumentation) {
    return globalAutoInstrumentation;
  }

  globalAutoInstrumentation = new AutoInstrumentationSystem(autoConfig);
  await globalAutoInstrumentation.initialize(config);
  
  return globalAutoInstrumentation;
}

/**
 * Get global auto-instrumentation instance
 */
export function getAutoInstrumentation(): AutoInstrumentationSystem | null {
  return globalAutoInstrumentation;
}

/**
 * Shutdown global auto-instrumentation
 */
export async function shutdownAutoInstrumentation(): Promise<void> {
  if (globalAutoInstrumentation) {
    await globalAutoInstrumentation.shutdown();
    globalAutoInstrumentation = null;
  }
}