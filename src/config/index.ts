// Configuration management with validation using Joi

import Joi from 'joi';
import { MonitoringConfig } from '../interfaces';

/**
 * Configuration validation schema
 */
const configSchema = Joi.object({
  googleCloud: Joi.object({
    projectId: Joi.string().required(),
    location: Joi.string().required(),
    credentials: Joi.string().optional()
  }).required(),
  
  datadog: Joi.object({
    apiKey: Joi.string().required(),
    appKey: Joi.string().required(),
    site: Joi.string().default('datadoghq.com')
  }).required(),
  
  application: Joi.object({
    name: Joi.string().required(),
    version: Joi.string().required(),
    environment: Joi.string().valid('development', 'staging', 'production').required()
  }).required(),
  
  telemetry: Joi.object({
    batchSize: Joi.number().integer().min(1).max(1000).default(100),
    flushInterval: Joi.number().integer().min(1000).max(60000).default(5000),
    maxRetries: Joi.number().integer().min(0).max(10).default(3),
    retryDelay: Joi.number().integer().min(100).max(10000).default(1000)
  }).default(),
  
  security: Joi.object({
    enableDlpScanning: Joi.boolean().default(true),
    sensitiveDataTypes: Joi.array().items(Joi.string()).default([
      'PERSON_NAME',
      'EMAIL_ADDRESS',
      'PHONE_NUMBER',
      'CREDIT_CARD_NUMBER',
      'US_SOCIAL_SECURITY_NUMBER'
    ]),
    confidenceThreshold: Joi.number().min(0).max(1).default(0.8)
  }).default(),
  
  cost: Joi.object({
    currency: Joi.string().length(3).default('USD'),
    budgets: Joi.array().items(Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      limit: Joi.number().positive().required(),
      period: Joi.string().valid('daily', 'weekly', 'monthly').required(),
      alertThresholds: Joi.array().items(Joi.number().min(0).max(100)).default([50, 80, 95])
    })).default([]),
    alertThresholds: Joi.array().items(Joi.number().min(0).max(100)).default([50, 80, 95])
  }).default()
});

/**
 * Environment variable mapping
 */
const environmentMapping = {
  // Google Cloud
  'GOOGLE_CLOUD_PROJECT_ID': 'googleCloud.projectId',
  'GOOGLE_CLOUD_LOCATION': 'googleCloud.location',
  'GOOGLE_APPLICATION_CREDENTIALS': 'googleCloud.credentials',
  
  // Datadog
  'DATADOG_API_KEY': 'datadog.apiKey',
  'DATADOG_APP_KEY': 'datadog.appKey',
  'DATADOG_SITE': 'datadog.site',
  
  // Application
  'APP_NAME': 'application.name',
  'APP_VERSION': 'application.version',
  'APP_ENVIRONMENT': 'application.environment',
  
  // Telemetry
  'TELEMETRY_BATCH_SIZE': 'telemetry.batchSize',
  'TELEMETRY_FLUSH_INTERVAL': 'telemetry.flushInterval',
  'TELEMETRY_MAX_RETRIES': 'telemetry.maxRetries',
  'TELEMETRY_RETRY_DELAY': 'telemetry.retryDelay',
  
  // Security
  'SECURITY_ENABLE_DLP': 'security.enableDlpScanning',
  'SECURITY_CONFIDENCE_THRESHOLD': 'security.confidenceThreshold',
  
  // Cost
  'COST_CURRENCY': 'cost.currency'
};

/**
 * Real implementation flags from environment
 */
export const RealImplementationFlags = {
  useRealVertexAI: process.env.USE_REAL_VERTEX_AI === 'true',
  useRealDatadog: process.env.USE_REAL_DATADOG === 'true',
  useRealDLP: process.env.USE_REAL_DLP === 'true',
  enableMockFallback: process.env.ENABLE_MOCK_FALLBACK === 'true',
  enableVerboseLogging: process.env.ENABLE_VERBOSE_LOGGING === 'true',
  enableTelemetryDump: process.env.ENABLE_TELEMETRY_DUMP === 'true'
};

/**
 * Load configuration from environment variables
 */
function loadFromEnvironment(): Partial<MonitoringConfig> {
  const config: any = {};
  
  for (const [envVar, configPath] of Object.entries(environmentMapping)) {
    const value = process.env[envVar];
    if (value !== undefined) {
      setNestedProperty(config, configPath, parseEnvironmentValue(value));
    }
  }
  
  return config;
}

/**
 * Parse environment variable value to appropriate type
 */
function parseEnvironmentValue(value: string): any {
  // Try to parse as number
  const numValue = Number(value);
  if (!isNaN(numValue)) {
    return numValue;
  }
  
  // Try to parse as boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  
  // Try to parse as JSON array
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      // Fall through to string
    }
  }
  
  return value;
}

/**
 * Set nested property in object using dot notation
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue;
    
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey) {
    current[lastKey] = value;
  }
}

/**
 * Validate and load configuration
 */
export function loadConfig(overrides?: Partial<MonitoringConfig>): MonitoringConfig {
  // Start with environment variables
  const envConfig = loadFromEnvironment();
  
  // Merge with overrides
  const rawConfig = {
    ...envConfig,
    ...overrides
  };
  
  // Validate configuration
  const { error, value } = configSchema.validate(rawConfig, {
    allowUnknown: false,
    stripUnknown: true
  });
  
  if (error) {
    throw new Error(`Configuration validation failed: ${error.message}`);
  }
  
  return value as MonitoringConfig;
}

/**
 * Get default configuration for development
 */
export function getDefaultConfig(): Partial<MonitoringConfig> {
  return {
    application: {
      name: 'llm-observability-monitor',
      version: '1.0.0',
      environment: 'development'
    },
    telemetry: {
      batchSize: 10, // Smaller batch size for development
      flushInterval: 2000, // More frequent flushing for development
      maxRetries: 2,
      retryDelay: 500
    },
    security: {
      enableDlpScanning: false, // Disabled by default in development
      sensitiveDataTypes: ['EMAIL_ADDRESS', 'PHONE_NUMBER'],
      confidenceThreshold: 0.7
    },
    cost: {
      currency: 'USD',
      budgets: [],
      alertThresholds: [75, 90, 95]
    }
  };
}

/**
 * Validate configuration without loading
 */
export function validateConfig(config: any): { isValid: boolean; errors: string[] } {
  const { error } = configSchema.validate(config, {
    allowUnknown: false,
    stripUnknown: false
  });
  
  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message)
    };
  }
  
  return {
    isValid: true,
    errors: []
  };
}

/**
 * Configuration utilities
 */
export const ConfigUtils = {
  loadConfig,
  getDefaultConfig,
  validateConfig,
  loadFromEnvironment
};