// Auto-scaling monitoring coverage module

export { 
  InstanceDiscovery, 
  DEFAULT_DISCOVERY_CONFIG 
} from './instance-discovery';

export { 
  TelemetryAggregator, 
  DEFAULT_AGGREGATION_CONFIG 
} from './telemetry-aggregator';

export { 
  LoadBalancer, 
  DEFAULT_LOAD_BALANCER_CONFIG 
} from './load-balancer';

export { 
  ScalingCoordinator, 
  DEFAULT_SCALING_CONFIG 
} from './scaling-coordinator';

// Export types
export type { 
  InstanceInfo, 
  DiscoveryConfig 
} from './instance-discovery';

export type { 
  AggregationConfig, 
  AggregatedMetric 
} from './telemetry-aggregator';

export type { 
  LoadBalancerConfig, 
  LoadBalancingStrategy, 
  RequestContext, 
  LoadBalancingResult 
} from './load-balancer';

export type { 
  ScalingCoordinatorConfig, 
  ScalingEvent 
} from './scaling-coordinator';

/**
 * Scaling utilities for quick setup
 */
export class ScalingUtils {
  /**
   * Create a basic scaling setup with sensible defaults
   */
  static createBasicSetup(options: {
    enableAutoScaling?: boolean;
    loadBalancingStrategy?: import('./load-balancer').LoadBalancingStrategy;
    discoveryMethod?: 'kubernetes' | 'static' | 'consul';
  } = {}) {
    const { 
      enableAutoScaling = false, 
      loadBalancingStrategy = 'health-aware',
      discoveryMethod = 'kubernetes'
    } = options;

    const config: Partial<import('./scaling-coordinator').ScalingCoordinatorConfig> = {
      enableAutoScaling,
      loadBalancer: {
        strategy: loadBalancingStrategy
      },
      discovery: {
        enableKubernetesDiscovery: discoveryMethod === 'kubernetes',
        enableConsulDiscovery: discoveryMethod === 'consul',
        enableStaticDiscovery: discoveryMethod === 'static'
      }
    };

    return new (require('./scaling-coordinator').ScalingCoordinator)(config);
  }

  /**
   * Create a development scaling setup with mock instances
   */
  static createDevelopmentSetup(instanceCount: number = 3) {
    const staticInstances: import('./instance-discovery').InstanceInfo[] = [];
    
    for (let i = 0; i < instanceCount; i++) {
      staticInstances.push({
        id: `dev-instance-${i}`,
        hostname: `dev-host-${i}.local`,
        ipAddress: `192.168.1.${10 + i}`,
        port: 8080 + i,
        region: 'dev-region',
        zone: `dev-zone-${i % 2}`,
        instanceType: 'development',
        status: 'running',
        metadata: {
          environment: 'development',
          weight: '1.0'
        },
        lastSeen: new Date(),
        startTime: new Date(Date.now() - Math.random() * 3600000),
        version: '1.0.0-dev',
        capabilities: ['telemetry-collection', 'detection-engine']
      });
    }

    const config: Partial<import('./scaling-coordinator').ScalingCoordinatorConfig> = {
      enableAutoScaling: false, // Disabled for development
      discovery: {
        enableKubernetesDiscovery: false,
        enableConsulDiscovery: false,
        enableStaticDiscovery: true,
        staticInstances,
        healthCheckInterval: 10000, // More frequent for development
        discoveryInterval: 30000
      },
      loadBalancer: {
        strategy: 'round-robin',
        enableHealthChecks: true,
        healthCheckInterval: 15000
      },
      aggregation: {
        windowSizes: [30, 60, 300], // Shorter windows for development
        flushInterval: 10000 // More frequent flushing
      }
    };

    return new (require('./scaling-coordinator').ScalingCoordinator)(config);
  }

  /**
   * Create a production scaling setup
   */
  static createProductionSetup(options: {
    enableAutoScaling?: boolean;
    scalingThresholds?: { up: number; down: number };
    loadBalancingStrategy?: import('./load-balancer').LoadBalancingStrategy;
  } = {}) {
    const { 
      enableAutoScaling = true,
      scalingThresholds = { up: 0.8, down: 0.3 },
      loadBalancingStrategy = 'health-aware'
    } = options;

    const config: Partial<import('./scaling-coordinator').ScalingCoordinatorConfig> = {
      enableAutoScaling,
      scaleUpThreshold: scalingThresholds.up,
      scaleDownThreshold: scalingThresholds.down,
      cooldownPeriod: 300000, // 5 minutes
      discovery: {
        enableKubernetesDiscovery: true,
        healthCheckInterval: 30000,
        discoveryInterval: 60000,
        instanceTtl: 300000
      },
      loadBalancer: {
        strategy: loadBalancingStrategy,
        enableHealthChecks: true,
        enableCircuitBreaker: true,
        enableFailover: true,
        maxRetries: 3
      },
      aggregation: {
        windowSizes: [60, 300, 900, 3600], // 1min, 5min, 15min, 1hour
        enablePercentiles: true,
        percentiles: [50, 90, 95, 99],
        retentionPeriod: 86400000 // 24 hours
      },
      enableAutomaticFailover: true,
      enableMetricsCollection: true
    };

    return new (require('./scaling-coordinator').ScalingCoordinator)(config);
  }
}

// Re-export types for convenience - already exported above