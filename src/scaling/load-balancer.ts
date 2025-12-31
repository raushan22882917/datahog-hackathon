// Load balancing and failover for monitoring components

import { EventEmitter } from 'events';
import { InstanceInfo } from './instance-discovery';

/**
 * Load balancing strategy
 */
export type LoadBalancingStrategy = 
  | 'round-robin' 
  | 'least-connections' 
  | 'weighted-round-robin'
  | 'random'
  | 'consistent-hashing'
  | 'health-aware';

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  
  // Health checking
  enableHealthChecks: boolean;
  healthCheckInterval: number; // milliseconds
  healthCheckTimeout: number; // milliseconds
  maxFailures: number;
  
  // Failover settings
  enableFailover: boolean;
  failoverTimeout: number; // milliseconds
  maxRetries: number;
  
  // Connection settings
  maxConnectionsPerInstance: number;
  connectionTimeout: number; // milliseconds
  
  // Sticky sessions
  enableStickySessions: boolean;
  sessionAffinityKey?: string;
  
  // Circuit breaker
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number; // failure rate 0-1
  circuitBreakerTimeout: number; // milliseconds
}

/**
 * Default load balancer configuration
 */
export const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig = {
  strategy: 'health-aware',
  enableHealthChecks: true,
  healthCheckInterval: 30000, // 30 seconds
  healthCheckTimeout: 5000, // 5 seconds
  maxFailures: 3,
  enableFailover: true,
  failoverTimeout: 10000, // 10 seconds
  maxRetries: 3,
  maxConnectionsPerInstance: 100,
  connectionTimeout: 5000, // 5 seconds
  enableStickySessions: false,
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 0.5, // 50% failure rate
  circuitBreakerTimeout: 60000 // 1 minute
};

/**
 * Instance health status
 */
interface InstanceHealth {
  instanceId: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  lastHealthCheck: Date;
  responseTime: number;
  connectionCount: number;
  circuitBreakerOpen: boolean;
  circuitBreakerOpenTime?: Date;
}

/**
 * Request context for load balancing
 */
export interface RequestContext {
  id: string;
  sessionId?: string;
  userId?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

/**
 * Load balancing result
 */
export interface LoadBalancingResult {
  instance: InstanceInfo;
  health: InstanceHealth;
  strategy: LoadBalancingStrategy;
  retryCount: number;
}

/**
 * Load balancer for monitoring components
 */
export class LoadBalancer extends EventEmitter {
  private config: LoadBalancerConfig;
  private instances: Map<string, InstanceInfo> = new Map();
  private instanceHealth: Map<string, InstanceHealth> = new Map();
  private roundRobinIndex: number = 0;
  private sessionAffinity: Map<string, string> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: Partial<LoadBalancerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_LOAD_BALANCER_CONFIG, ...config };
  }

  /**
   * Start the load balancer
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }

    this.emit('started');
  }

  /**
   * Stop the load balancer
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined as any;
    }

    this.emit('stopped');
  }

  /**
   * Add instance to load balancer
   */
  addInstance(instance: InstanceInfo): void {
    this.instances.set(instance.id, instance);
    
    if (!this.instanceHealth.has(instance.id)) {
      this.instanceHealth.set(instance.id, {
        instanceId: instance.id,
        isHealthy: true,
        consecutiveFailures: 0,
        lastHealthCheck: new Date(),
        responseTime: 0,
        connectionCount: 0,
        circuitBreakerOpen: false
      });
    }

    this.emit('instanceAdded', instance);
  }

  /**
   * Remove instance from load balancer
   */
  removeInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.instances.delete(instanceId);
      this.instanceHealth.delete(instanceId);
      
      // Clean up session affinity
      for (const [sessionId, affinityInstanceId] of this.sessionAffinity.entries()) {
        if (affinityInstanceId === instanceId) {
          this.sessionAffinity.delete(sessionId);
        }
      }

      this.emit('instanceRemoved', instance);
      return true;
    }
    return false;
  }

  /**
   * Select instance for request using configured strategy
   */
  selectInstance(context: RequestContext): LoadBalancingResult | null {
    const availableInstances = this.getAvailableInstances();
    
    if (availableInstances.length === 0) {
      return null;
    }

    let selectedInstance: InstanceInfo | null = null;
    let retryCount = 0;

    // Try to select an instance with retries
    while (retryCount < this.config.maxRetries && !selectedInstance) {
      selectedInstance = this.selectInstanceByStrategy(availableInstances, context);
      
      if (selectedInstance) {
        const health = this.instanceHealth.get(selectedInstance.id);
        if (health && this.isInstanceAvailable(health)) {
          return {
            instance: selectedInstance,
            health,
            strategy: this.config.strategy,
            retryCount
          };
        }
      }
      
      retryCount++;
    }

    return null;
  }

  /**
   * Select instance based on configured strategy
   */
  private selectInstanceByStrategy(
    instances: InstanceInfo[], 
    context: RequestContext
  ): InstanceInfo | null {
    switch (this.config.strategy) {
      case 'round-robin':
        return this.selectRoundRobin(instances);
      
      case 'least-connections':
        return this.selectLeastConnections(instances);
      
      case 'weighted-round-robin':
        return this.selectWeightedRoundRobin(instances);
      
      case 'random':
        return this.selectRandom(instances);
      
      case 'consistent-hashing':
        return this.selectConsistentHashing(instances, context);
      
      case 'health-aware':
        return this.selectHealthAware(instances);
      
      default:
        return this.selectRoundRobin(instances);
    }
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for round-robin selection');
    }
    const instance = instances[this.roundRobinIndex % instances.length]!;
    this.roundRobinIndex = (this.roundRobinIndex + 1) % instances.length;
    return instance;
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for least connections selection');
    }
    let selectedInstance = instances[0]!;
    let minConnections = this.instanceHealth.get(selectedInstance.id)?.connectionCount || 0;

    for (const instance of instances) {
      const health = this.instanceHealth.get(instance.id);
      const connections = health?.connectionCount || 0;
      
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  /**
   * Weighted round-robin selection
   */
  private selectWeightedRoundRobin(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for weighted round-robin selection');
    }
    
    // Simple implementation - in production, this would use proper weighted selection
    const weights = instances.map(instance => {
      const weight = parseFloat(instance.metadata.weight || '1');
      return Math.max(weight, 0.1); // Minimum weight
    });

    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < instances.length; i++) {
      random -= weights[i]!;
      if (random <= 0) {
        return instances[i]!;
      }
    }

    return instances[instances.length - 1]!;
  }

  /**
   * Random selection
   */
  private selectRandom(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for random selection');
    }
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex]!;
  }

  /**
   * Consistent hashing selection
   */
  private selectConsistentHashing(instances: InstanceInfo[], context: RequestContext): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for consistent hashing selection');
    }
    // Simple hash-based selection using session ID or user ID
    const key = context.sessionId || context.userId || context.id;
    const hash = this.simpleHash(key);
    const index = hash % instances.length;
    return instances[index]!;
  }

  /**
   * Health-aware selection
   */
  private selectHealthAware(instances: InstanceInfo[]): InstanceInfo {
    if (instances.length === 0) {
      throw new Error('No instances available for health-aware selection');
    }
    
    // Prefer instances with better health metrics
    const healthyInstances = instances.filter(instance => {
      const health = this.instanceHealth.get(instance.id);
      return health && health.isHealthy && !health.circuitBreakerOpen;
    });

    if (healthyInstances.length === 0) {
      return this.selectRoundRobin(instances);
    }

    // Select instance with lowest response time among healthy instances
    let bestInstance = healthyInstances[0]!;
    let bestResponseTime = this.instanceHealth.get(bestInstance.id)?.responseTime || Infinity;

    for (const instance of healthyInstances) {
      const health = this.instanceHealth.get(instance.id);
      const responseTime = health?.responseTime || Infinity;
      
      if (responseTime < bestResponseTime) {
        bestResponseTime = responseTime;
        bestInstance = instance;
      }
    }

    return bestInstance;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get available instances (healthy and not circuit-broken)
   */
  private getAvailableInstances(): InstanceInfo[] {
    return Array.from(this.instances.values()).filter(instance => {
      const health = this.instanceHealth.get(instance.id);
      return health && this.isInstanceAvailable(health);
    });
  }

  /**
   * Check if instance is available for requests
   */
  private isInstanceAvailable(health: InstanceHealth): boolean {
    if (!health.isHealthy) {
      return false;
    }

    if (health.circuitBreakerOpen) {
      // Check if circuit breaker should be closed
      if (health.circuitBreakerOpenTime) {
        const now = new Date();
        const timeSinceOpen = now.getTime() - health.circuitBreakerOpenTime.getTime();
        
        if (timeSinceOpen > this.config.circuitBreakerTimeout) {
          health.circuitBreakerOpen = false;
          health.circuitBreakerOpenTime = undefined as any;
          this.emit('circuitBreakerClosed', health.instanceId);
          return true;
        }
      }
      return false;
    }

    return health.connectionCount < this.config.maxConnectionsPerInstance;
  }

  /**
   * Report request success
   */
  reportSuccess(instanceId: string, responseTime: number): void {
    const health = this.instanceHealth.get(instanceId);
    if (health) {
      health.consecutiveFailures = 0;
      health.responseTime = responseTime;
      health.isHealthy = true;
      
      this.emit('requestSuccess', { instanceId, responseTime });
    }
  }

  /**
   * Report request failure
   */
  reportFailure(instanceId: string, error: Error): void {
    const health = this.instanceHealth.get(instanceId);
    if (health) {
      health.consecutiveFailures++;
      
      if (health.consecutiveFailures >= this.config.maxFailures) {
        health.isHealthy = false;
        this.emit('instanceUnhealthy', instanceId);
      }

      // Check circuit breaker
      if (this.config.enableCircuitBreaker) {
        const failureRate = health.consecutiveFailures / (health.consecutiveFailures + 1);
        
        if (failureRate >= this.config.circuitBreakerThreshold && !health.circuitBreakerOpen) {
          health.circuitBreakerOpen = true;
          health.circuitBreakerOpenTime = new Date();
          this.emit('circuitBreakerOpened', instanceId);
        }
      }

      this.emit('requestFailure', { instanceId, error });
    }
  }

  /**
   * Increment connection count for instance
   */
  incrementConnections(instanceId: string): void {
    const health = this.instanceHealth.get(instanceId);
    if (health) {
      health.connectionCount++;
    }
  }

  /**
   * Decrement connection count for instance
   */
  decrementConnections(instanceId: string): void {
    const health = this.instanceHealth.get(instanceId);
    if (health) {
      health.connectionCount = Math.max(0, health.connectionCount - 1);
    }
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform health checks on all instances
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.instances.values()).map(
      instance => this.checkInstanceHealth(instance)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Check health of specific instance
   */
  private async checkInstanceHealth(instance: InstanceInfo): Promise<void> {
    const health = this.instanceHealth.get(instance.id);
    if (!health) return;

    try {
      const startTime = Date.now();
      
      // In a real implementation, this would make an HTTP request
      const isHealthy = await this.simulateHealthCheck(instance);
      
      const responseTime = Date.now() - startTime;
      
      if (isHealthy) {
        health.isHealthy = true;
        health.consecutiveFailures = 0;
        health.responseTime = responseTime;
      } else {
        health.consecutiveFailures++;
        if (health.consecutiveFailures >= this.config.maxFailures) {
          health.isHealthy = false;
        }
      }

      health.lastHealthCheck = new Date();

    } catch (error) {
      health.consecutiveFailures++;
      if (health.consecutiveFailures >= this.config.maxFailures) {
        health.isHealthy = false;
      }
      
      this.emit('healthCheckError', { instanceId: instance.id, error });
    }
  }

  /**
   * Simulate health check (replace with real implementation)
   */
  private async simulateHealthCheck(instance: InstanceInfo): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Simulate occasional failures
    return Math.random() > 0.05; // 95% success rate
  }

  /**
   * Get load balancer statistics
   */
  getStats(): {
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    circuitBreakerOpen: number;
    totalConnections: number;
    averageResponseTime: number;
    strategy: LoadBalancingStrategy;
  } {
    const healthStats = Array.from(this.instanceHealth.values());
    
    const totalConnections = healthStats.reduce((sum, health) => sum + health.connectionCount, 0);
    const healthyInstances = healthStats.filter(h => h.isHealthy);
    const averageResponseTime = healthyInstances.length > 0 
      ? healthyInstances.reduce((sum, h) => sum + h.responseTime, 0) / healthyInstances.length
      : 0;

    return {
      totalInstances: this.instances.size,
      healthyInstances: healthStats.filter(h => h.isHealthy).length,
      unhealthyInstances: healthStats.filter(h => !h.isHealthy).length,
      circuitBreakerOpen: healthStats.filter(h => h.circuitBreakerOpen).length,
      totalConnections,
      averageResponseTime,
      strategy: this.config.strategy
    };
  }

  /**
   * Get instance health information
   */
  getInstanceHealth(instanceId: string): InstanceHealth | undefined {
    return this.instanceHealth.get(instanceId);
  }

  /**
   * Get all instance health information
   */
  getAllInstanceHealth(): InstanceHealth[] {
    return Array.from(this.instanceHealth.values());
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): LoadBalancerConfig {
    return { ...this.config };
  }
}