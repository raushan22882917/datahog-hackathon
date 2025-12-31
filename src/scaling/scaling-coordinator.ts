// Scaling coordinator that manages instance discovery, aggregation, and load balancing

import { EventEmitter } from 'events';
import { InstanceDiscovery, InstanceInfo, DiscoveryConfig } from './instance-discovery';
import { TelemetryAggregator, AggregationConfig } from './telemetry-aggregator';
import { LoadBalancer, LoadBalancerConfig, RequestContext } from './load-balancer';
import { TelemetryEvent, ProcessedData } from '../interfaces';

/**
 * Scaling coordinator configuration
 */
export interface ScalingCoordinatorConfig {
  discovery: Partial<DiscoveryConfig>;
  aggregation: Partial<AggregationConfig>;
  loadBalancer: Partial<LoadBalancerConfig>;
  
  // Coordinator settings
  enableAutoScaling: boolean;
  scalingMetrics: string[];
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  cooldownPeriod: number; // milliseconds
  
  // Monitoring settings
  enableMetricsCollection: boolean;
  metricsCollectionInterval: number; // milliseconds
  
  // Failover settings
  enableAutomaticFailover: boolean;
  failoverDetectionInterval: number; // milliseconds
}

/**
 * Default scaling coordinator configuration
 */
export const DEFAULT_SCALING_CONFIG: ScalingCoordinatorConfig = {
  discovery: {},
  aggregation: {},
  loadBalancer: {},
  enableAutoScaling: false, // Disabled by default for safety
  scalingMetrics: ['cpu_usage', 'memory_usage', 'request_rate'],
  scaleUpThreshold: 0.8, // 80%
  scaleDownThreshold: 0.3, // 30%
  cooldownPeriod: 300000, // 5 minutes
  enableMetricsCollection: true,
  metricsCollectionInterval: 30000, // 30 seconds
  enableAutomaticFailover: true,
  failoverDetectionInterval: 60000 // 1 minute
};

/**
 * Scaling event types
 */
export interface ScalingEvent {
  type: 'scale-up' | 'scale-down' | 'failover' | 'instance-added' | 'instance-removed';
  timestamp: Date;
  instanceId?: string;
  reason: string;
  metadata: Record<string, any>;
}

/**
 * Scaling coordinator that manages all aspects of auto-scaling monitoring coverage
 */
export class ScalingCoordinator extends EventEmitter {
  private config: ScalingCoordinatorConfig;
  private instanceDiscovery: InstanceDiscovery;
  private telemetryAggregator: TelemetryAggregator;
  private loadBalancer: LoadBalancer;
  
  private isRunning: boolean = false;
  private metricsCollectionInterval?: NodeJS.Timeout;
  private failoverDetectionInterval?: NodeJS.Timeout;
  private lastScalingAction?: Date;
  private scalingEvents: ScalingEvent[] = [];

  constructor(config: Partial<ScalingCoordinatorConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_SCALING_CONFIG, ...config };
    
    // Initialize components
    this.instanceDiscovery = new InstanceDiscovery(this.config.discovery);
    this.telemetryAggregator = new TelemetryAggregator(this.config.aggregation);
    this.loadBalancer = new LoadBalancer(this.config.loadBalancer);
    
    this.setupEventHandlers();
  }

  /**
   * Set up event handlers between components
   */
  private setupEventHandlers(): void {
    // Instance discovery events
    this.instanceDiscovery.on('instanceDiscovered', (instance: InstanceInfo) => {
      this.handleInstanceDiscovered(instance);
    });

    this.instanceDiscovery.on('instanceRemoved', (instance: InstanceInfo) => {
      this.handleInstanceRemoved(instance);
    });

    this.instanceDiscovery.on('instanceHealthy', (instance: InstanceInfo) => {
      this.handleInstanceHealthy(instance);
    });

    this.instanceDiscovery.on('instanceUnhealthy', (instance: InstanceInfo) => {
      this.handleInstanceUnhealthy(instance);
    });

    // Load balancer events
    this.loadBalancer.on('instanceUnhealthy', (instanceId: string) => {
      this.handleLoadBalancerInstanceUnhealthy(instanceId);
    });

    this.loadBalancer.on('circuitBreakerOpened', (instanceId: string) => {
      this.handleCircuitBreakerOpened(instanceId);
    });

    // Telemetry aggregator events
    this.telemetryAggregator.on('metricAggregated', (metric: any) => {
      this.handleMetricAggregated(metric);
    });
  }

  /**
   * Start the scaling coordinator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Start all components
      await this.instanceDiscovery.start();
      this.telemetryAggregator.start();
      this.loadBalancer.start();

      // Start periodic tasks
      if (this.config.enableMetricsCollection) {
        this.startMetricsCollection();
      }

      if (this.config.enableAutomaticFailover) {
        this.startFailoverDetection();
      }

      this.emit('started');

    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the scaling coordinator
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop periodic tasks
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = undefined as any;
    }

    if (this.failoverDetectionInterval) {
      clearInterval(this.failoverDetectionInterval);
      this.failoverDetectionInterval = undefined as any;
    }

    // Stop all components
    await this.instanceDiscovery.stop();
    this.telemetryAggregator.stop();
    this.loadBalancer.stop();

    this.emit('stopped');
  }

  /**
   * Add telemetry data from an instance
   */
  addTelemetryData(instanceId: string, events: TelemetryEvent[]): void {
    this.telemetryAggregator.addTelemetryData(instanceId, events);
  }

  /**
   * Add processed data from an instance
   */
  addProcessedData(instanceId: string, data: ProcessedData): void {
    this.telemetryAggregator.addProcessedData(instanceId, data);
  }

  /**
   * Select instance for request using load balancer
   */
  selectInstanceForRequest(context: RequestContext) {
    return this.loadBalancer.selectInstance(context);
  }

  /**
   * Report request success to load balancer
   */
  reportRequestSuccess(instanceId: string, responseTime: number): void {
    this.loadBalancer.reportSuccess(instanceId, responseTime);
  }

  /**
   * Report request failure to load balancer
   */
  reportRequestFailure(instanceId: string, error: Error): void {
    this.loadBalancer.reportFailure(instanceId, error);
  }

  /**
   * Handle instance discovered
   */
  private handleInstanceDiscovered(instance: InstanceInfo): void {
    this.loadBalancer.addInstance(instance);
    this.telemetryAggregator.setInstanceWeight(instance);
    
    this.recordScalingEvent({
      type: 'instance-added',
      timestamp: new Date(),
      instanceId: instance.id,
      reason: 'Instance discovered by discovery service',
      metadata: {
        hostname: instance.hostname,
        region: instance.region,
        instanceType: instance.instanceType
      }
    });

    this.emit('instanceAdded', instance);
  }

  /**
   * Handle instance removed
   */
  private handleInstanceRemoved(instance: InstanceInfo): void {
    this.loadBalancer.removeInstance(instance.id);
    
    this.recordScalingEvent({
      type: 'instance-removed',
      timestamp: new Date(),
      instanceId: instance.id,
      reason: 'Instance removed by discovery service',
      metadata: {
        hostname: instance.hostname,
        lastSeen: instance.lastSeen
      }
    });

    this.emit('instanceRemoved', instance);
  }

  /**
   * Handle instance becoming healthy
   */
  private handleInstanceHealthy(instance: InstanceInfo): void {
    // Instance is already in load balancer, just emit event
    this.emit('instanceHealthy', instance);
  }

  /**
   * Handle instance becoming unhealthy
   */
  private handleInstanceUnhealthy(instance: InstanceInfo): void {
    // Check if we need to trigger failover
    if (this.config.enableAutomaticFailover) {
      this.checkFailoverNeeded();
    }

    this.emit('instanceUnhealthy', instance);
  }

  /**
   * Handle load balancer reporting instance as unhealthy
   */
  private handleLoadBalancerInstanceUnhealthy(instanceId: string): void {
    const instance = this.instanceDiscovery.getInstance(instanceId);
    if (instance) {
      this.emit('instanceUnhealthy', instance);
    }
  }

  /**
   * Handle circuit breaker opening
   */
  private handleCircuitBreakerOpened(instanceId: string): void {
    const instance = this.instanceDiscovery.getInstance(instanceId);
    
    this.recordScalingEvent({
      type: 'failover',
      timestamp: new Date(),
      instanceId,
      reason: 'Circuit breaker opened due to high failure rate',
      metadata: {
        hostname: instance?.hostname || 'unknown'
      }
    });

    this.emit('circuitBreakerOpened', instanceId);
  }

  /**
   * Handle aggregated metric
   */
  private handleMetricAggregated(metric: any): void {
    if (this.config.enableAutoScaling) {
      this.evaluateScalingDecision(metric);
    }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsCollectionInterval);
  }

  /**
   * Start failover detection
   */
  private startFailoverDetection(): void {
    this.failoverDetectionInterval = setInterval(() => {
      this.checkFailoverNeeded();
    }, this.config.failoverDetectionInterval);
  }

  /**
   * Collect metrics from all instances
   */
  private collectMetrics(): void {
    const instances = this.instanceDiscovery.getHealthyInstances();
    const aggregatorStats = this.telemetryAggregator.getStats();
    const loadBalancerStats = this.loadBalancer.getStats();

    const metrics = {
      timestamp: new Date(),
      instanceCount: instances.length,
      healthyInstances: loadBalancerStats.healthyInstances,
      totalConnections: loadBalancerStats.totalConnections,
      averageResponseTime: loadBalancerStats.averageResponseTime,
      aggregatedMetrics: aggregatorStats.aggregatedMetrics,
      dataPointsProcessed: aggregatorStats.dataPointsProcessed
    };

    this.emit('metricsCollected', metrics);
  }

  /**
   * Check if failover is needed
   */
  private checkFailoverNeeded(): void {
    const healthyInstances = this.instanceDiscovery.getHealthyInstances();
    const totalInstances = this.instanceDiscovery.getInstances();
    
    const healthyRatio = totalInstances.length > 0 ? 
      healthyInstances.length / totalInstances.length : 0;

    // Trigger failover if less than 50% of instances are healthy
    if (healthyRatio < 0.5 && totalInstances.length > 1) {
      this.recordScalingEvent({
        type: 'failover',
        timestamp: new Date(),
        reason: `Low healthy instance ratio: ${(healthyRatio * 100).toFixed(1)}%`,
        metadata: {
          healthyInstances: healthyInstances.length,
          totalInstances: totalInstances.length,
          healthyRatio
        }
      });

      this.emit('failoverTriggered', {
        healthyInstances: healthyInstances.length,
        totalInstances: totalInstances.length,
        healthyRatio
      });
    }
  }

  /**
   * Evaluate scaling decision based on metrics
   */
  private evaluateScalingDecision(metric: any): void {
    // Check cooldown period
    if (this.lastScalingAction) {
      const timeSinceLastAction = Date.now() - this.lastScalingAction.getTime();
      if (timeSinceLastAction < this.config.cooldownPeriod) {
        return; // Still in cooldown
      }
    }

    // Simple scaling logic based on metric values
    if (this.config.scalingMetrics.includes(metric.name)) {
      const value = metric.average || metric.value || 0;
      
      if (value > this.config.scaleUpThreshold) {
        this.triggerScaleUp(metric);
      } else if (value < this.config.scaleDownThreshold) {
        this.triggerScaleDown(metric);
      }
    }
  }

  /**
   * Trigger scale up
   */
  private triggerScaleUp(metric: any): void {
    this.lastScalingAction = new Date();
    
    this.recordScalingEvent({
      type: 'scale-up',
      timestamp: new Date(),
      reason: `Metric ${metric.name} exceeded scale-up threshold`,
      metadata: {
        metricName: metric.name,
        metricValue: metric.average || metric.value,
        threshold: this.config.scaleUpThreshold
      }
    });

    this.emit('scaleUpTriggered', metric);
  }

  /**
   * Trigger scale down
   */
  private triggerScaleDown(metric: any): void {
    this.lastScalingAction = new Date();
    
    this.recordScalingEvent({
      type: 'scale-down',
      timestamp: new Date(),
      reason: `Metric ${metric.name} below scale-down threshold`,
      metadata: {
        metricName: metric.name,
        metricValue: metric.average || metric.value,
        threshold: this.config.scaleDownThreshold
      }
    });

    this.emit('scaleDownTriggered', metric);
  }

  /**
   * Record scaling event
   */
  private recordScalingEvent(event: ScalingEvent): void {
    this.scalingEvents.push(event);
    
    // Limit event history
    if (this.scalingEvents.length > 1000) {
      this.scalingEvents.shift();
    }

    this.emit('scalingEvent', event);
  }

  /**
   * Get all discovered instances
   */
  getInstances(): InstanceInfo[] {
    return this.instanceDiscovery.getInstances();
  }

  /**
   * Get healthy instances
   */
  getHealthyInstances(): InstanceInfo[] {
    return this.instanceDiscovery.getHealthyInstances();
  }

  /**
   * Get scaling coordinator statistics
   */
  getStats(): {
    instances: ReturnType<InstanceDiscovery['getStats']>;
    aggregation: ReturnType<TelemetryAggregator['getStats']>;
    loadBalancer: ReturnType<LoadBalancer['getStats']>;
    scaling: {
      eventsCount: number;
      lastScalingAction?: Date;
      isInCooldown: boolean;
    };
  } {
    const isInCooldown = this.lastScalingAction ? 
      (Date.now() - this.lastScalingAction.getTime()) < this.config.cooldownPeriod : false;

    return {
      instances: this.instanceDiscovery.getStats(),
      aggregation: this.telemetryAggregator.getStats(),
      loadBalancer: this.loadBalancer.getStats(),
      scaling: {
        eventsCount: this.scalingEvents.length,
        ...(this.lastScalingAction && { lastScalingAction: this.lastScalingAction }),
        isInCooldown
      }
    };
  }

  /**
   * Get recent scaling events
   */
  getScalingEvents(limit: number = 50): ScalingEvent[] {
    return this.scalingEvents.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ScalingCoordinatorConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update component configurations
    if (updates.discovery) {
      this.instanceDiscovery.updateConfig(updates.discovery);
    }
    
    if (updates.aggregation) {
      this.telemetryAggregator.updateConfig(updates.aggregation);
    }
    
    if (updates.loadBalancer) {
      this.loadBalancer.updateConfig(updates.loadBalancer);
    }

    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ScalingCoordinatorConfig {
    return { ...this.config };
  }
}