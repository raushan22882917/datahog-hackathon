// Configuration system tests

import { loadConfig, getDefaultConfig, validateConfig } from './index';
import { MonitoringConfig } from '../interfaces';

describe('Configuration System', () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
    delete process.env.DATADOG_API_KEY;
    delete process.env.DATADOG_APP_KEY;
    delete process.env.APP_NAME;
    delete process.env.APP_VERSION;
    delete process.env.APP_ENVIRONMENT;
  });

  describe('loadConfig', () => {
    it('should load configuration with required fields', () => {
      const config: Partial<MonitoringConfig> = {
        googleCloud: {
          projectId: 'test-project',
          location: 'us-central1'
        },
        datadog: {
          apiKey: 'test-api-key',
          appKey: 'test-app-key'
        },
        application: {
          name: 'test-app',
          version: '1.0.0',
          environment: 'development'
        }
      };

      const result = loadConfig(config);
      
      expect(result.googleCloud.projectId).toBe('test-project');
      expect(result.datadog.apiKey).toBe('test-api-key');
      expect(result.application.name).toBe('test-app');
      expect(result.telemetry.batchSize).toBe(100); // Default value
    });

    it('should throw error for missing required fields', () => {
      const config: Partial<MonitoringConfig> = {
        googleCloud: {
          projectId: 'test-project',
          location: 'us-central1'
        }
        // Missing datadog and application config
      };

      expect(() => loadConfig(config)).toThrow('Configuration validation failed');
    });

    it('should load from environment variables', () => {
      process.env.GOOGLE_CLOUD_PROJECT_ID = 'env-project';
      process.env.GOOGLE_CLOUD_LOCATION = 'us-west1';
      process.env.DATADOG_API_KEY = 'env-api-key';
      process.env.DATADOG_APP_KEY = 'env-app-key';
      process.env.APP_NAME = 'env-app';
      process.env.APP_VERSION = '2.0.0';
      process.env.APP_ENVIRONMENT = 'production';

      const result = loadConfig();
      
      expect(result.googleCloud.projectId).toBe('env-project');
      expect(result.googleCloud.location).toBe('us-west1');
      expect(result.datadog.apiKey).toBe('env-api-key');
      expect(result.application.environment).toBe('production');
    });
  });

  describe('getDefaultConfig', () => {
    it('should return valid default configuration', () => {
      const defaultConfig = getDefaultConfig();
      
      expect(defaultConfig.application?.name).toBe('llm-observability-monitor');
      expect(defaultConfig.application?.environment).toBe('development');
      expect(defaultConfig.telemetry?.batchSize).toBe(10);
      expect(defaultConfig.security?.enableDlpScanning).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        googleCloud: {
          projectId: 'test-project',
          location: 'us-central1'
        },
        datadog: {
          apiKey: 'test-api-key',
          appKey: 'test-app-key'
        },
        application: {
          name: 'test-app',
          version: '1.0.0',
          environment: 'development'
        }
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid configuration', () => {
      const config = {
        googleCloud: {
          projectId: 'test-project'
          // Missing location
        },
        datadog: {
          apiKey: 'test-api-key'
          // Missing appKey
        },
        application: {
          name: 'test-app',
          version: '1.0.0',
          environment: 'invalid-env' // Invalid environment
        }
      };

      const result = validateConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});