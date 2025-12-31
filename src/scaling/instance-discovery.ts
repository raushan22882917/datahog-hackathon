// Instance discovery and management for auto-scaling monitoring coverage

import { EventEmitter } from 'events';

/**
 * Instance information
 */
export interface InstanceInfo {
  id: string;
  hostname: string;
  ipAddress: string;
  port: number;
  region: string;
  zone: string;
  instanceType: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'unhealthy';
  metadata: Record<string, string>;
  lastSeen: Date;
  startTime: Date;
  version: string;
  capabilities: string[];
}

/**
 * Discovery configuration
 */
export interface DiscoveryConfig {
  // Discovery methods
  enableKubernetesDiscovery: boolean;
  enableConsulDiscovery: boolean;
  enableEtcdDiscovery: boolean;
  enableStaticDiscovery: boolean;
  
  // Kubernetes settings
  kubernetesNamespace?: string;
  kubernetesLabelSelector?: string;
  
  // Consul settings
  consulAddress?: string;
  consulServiceName?: string;
  
  // Static instance list
  staticInstances?: InstanceInfo[];
  
  // Health check settings
  healthCheckInterval: number; // milliseconds
  healthCheckTimeout: number; // milliseconds
  unhealthyThreshold: number; // consecutive failures
  
  // Discovery intervals
  discoveryInterval: number; // milliseconds
  instanceTtl: number; // milliseconds
}

/**
 * Default discovery configuration
 */
export const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig = {
  enableKubernetesDiscovery: true,
  enableConsulDiscovery: false,
  enableEtcdDiscovery: false,
  enableStaticDiscovery: true,
  healthCheckInterval: 30000, // 30 seconds
  healthCheckTimeout: 5000, // 5 seconds
  unhealthyThreshold: 3,
  discoveryInterval: 60000, // 1 minute
  instanceTtl: 300000, // 5 minutes
  staticInstances: []
};

/**
 * Instance discovery service for monitoring coverage
 */
export class InstanceDiscovery extends EventEmitter {
  private config: DiscoveryConfig;
  private instances: Map<string, InstanceInfo> = new Map();
  private healthCheckCounts: Map<string, number> = new Map();
  private discoveryInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(config: Partial<DiscoveryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_DISCOVERY_CONFIG, ...config };
  }

  /**
   * Start instance discovery
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Initial discovery
    await this.performDiscovery();

    // Set up periodic discovery
    this.discoveryInterval = setInterval(async () => {
      try {
        await this.performDiscovery();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.discoveryInterval);

    // Set up health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.healthCheckInterval);

    this.emit('started');
  }

  /**
   * Stop instance discovery
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined as any;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined as any;
    }

    this.emit('stopped');
  }

  /**
   * Perform instance discovery using configured methods
   */
  private async performDiscovery(): Promise<void> {
    const discoveredInstances: InstanceInfo[] = [];

    // Kubernetes discovery
    if (this.config.enableKubernetesDiscovery) {
      const k8sInstances = await this.discoverKubernetesInstances();
      discoveredInstances.push(...k8sInstances);
    }

    // Consul discovery
    if (this.config.enableConsulDiscovery) {
      const consulInstances = await this.discoverConsulInstances();
      discoveredInstances.push(...consulInstances);
    }

    // Static discovery
    if (this.config.enableStaticDiscovery && this.config.staticInstances) {
      discoveredInstances.push(...this.config.staticInstances);
    }

    // Update instance registry
    this.updateInstanceRegistry(discoveredInstances);

    // Clean up stale instances
    this.cleanupStaleInstances();
  }

  /**
   * Discover instances from Kubernetes
   */
  private async discoverKubernetesInstances(): Promise<InstanceInfo[]> {
    // In a real implementation, this would use the Kubernetes API
    // For now, we'll simulate discovery
    
    const mockInstances: InstanceInfo[] = [];
    
    // Simulate finding pods in a deployment
    const podCount = Math.floor(Math.random() * 5) + 2; // 2-6 pods
    
    for (let i = 0; i < podCount; i++) {
      const instance: InstanceInfo = {
        id: `k8s-pod-${i}`,
        hostname: `llm-monitor-${i}.default.svc.cluster.local`,
        ipAddress: `10.244.0.${10 + i}`,
        port: 8080,
        region: 'us-central1',
        zone: `us-central1-${String.fromCharCode(97 + (i % 3))}`, // a, b, c
        instanceType: 'kubernetes-pod',
        status: 'running',
        metadata: {
          namespace: this.config.kubernetesNamespace || 'default',
          deployment: 'llm-observability-monitor',
          podName: `llm-monitor-${i}`,
          nodeId: `node-${Math.floor(i / 2)}`
        },
        lastSeen: new Date(),
        startTime: new Date(Date.now() - Math.random() * 3600000), // Started within last hour
        version: '1.0.0',
        capabilities: ['telemetry-collection', 'detection-engine', 'security-analysis']
      };
      
      mockInstances.push(instance);
    }

    return mockInstances;
  }

  /**
   * Discover instances from Consul
   */
  private async discoverConsulInstances(): Promise<InstanceInfo[]> {
    // In a real implementation, this would query Consul's service catalog
    // For now, we'll return an empty array
    return [];
  }

  /**
   * Update the instance registry with discovered instances
   */
  private updateInstanceRegistry(discoveredInstances: InstanceInfo[]): void {
    const currentTime = new Date();
    
    for (const instance of discoveredInstances) {
      const existingInstance = this.instances.get(instance.id);
      
      if (existingInstance) {
        // Update existing instance
        const updatedInstance: InstanceInfo = {
          ...existingInstance,
          ...instance,
          lastSeen: currentTime
        };
        
        this.instances.set(instance.id, updatedInstance);
        this.emit('instanceUpdated', updatedInstance);
      } else {
        // New instance discovered
        const newInstance: InstanceInfo = {
          ...instance,
          lastSeen: currentTime
        };
        
        this.instances.set(instance.id, newInstance);
        this.emit('instanceDiscovered', newInstance);
      }
    }
  }

  /**
   * Clean up instances that haven't been seen recently
   */
  private cleanupStaleInstances(): void {
    const currentTime = new Date();
    const staleThreshold = currentTime.getTime() - this.config.instanceTtl;
    
    for (const [instanceId, instance] of this.instances.entries()) {
      if (instance.lastSeen.getTime() < staleThreshold) {
        this.instances.delete(instanceId);
        this.healthCheckCounts.delete(instanceId);
        this.emit('instanceRemoved', instance);
      }
    }
  }

  /**
   * Perform health checks on all known instances
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.instances.values()).map(
      instance => this.checkInstanceHealth(instance)
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Check health of a specific instance
   */
  private async checkInstanceHealth(instance: InstanceInfo): Promise<void> {
    try {
      // In a real implementation, this would make an HTTP request to the instance
      // For now, we'll simulate health checks
      const isHealthy = await this.simulateHealthCheck(instance);
      
      if (isHealthy) {
        // Reset failure count
        this.healthCheckCounts.set(instance.id, 0);
        
        if (instance.status === 'unhealthy') {
          instance.status = 'running';
          this.instances.set(instance.id, instance);
          this.emit('instanceHealthy', instance);
        }
      } else {
        // Increment failure count
        const failureCount = (this.healthCheckCounts.get(instance.id) || 0) + 1;
        this.healthCheckCounts.set(instance.id, failureCount);
        
        if (failureCount >= this.config.unhealthyThreshold && instance.status !== 'unhealthy') {
          instance.status = 'unhealthy';
          this.instances.set(instance.id, instance);
          this.emit('instanceUnhealthy', instance);
        }
      }
    } catch (error) {
      this.emit('healthCheckError', { instance, error });
    }
  }

  /**
   * Simulate health check (replace with real HTTP check in production)
   */
  private async simulateHealthCheck(instance: InstanceInfo): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Simulate occasional failures
    return Math.random() > 0.05; // 95% success rate
  }

  /**
   * Get all discovered instances
   */
  getInstances(): InstanceInfo[] {
    return Array.from(this.instances.values());
  }

  /**
   * Get instances by status
   */
  getInstancesByStatus(status: InstanceInfo['status']): InstanceInfo[] {
    return this.getInstances().filter(instance => instance.status === status);
  }

  /**
   * Get healthy instances
   */
  getHealthyInstances(): InstanceInfo[] {
    return this.getInstancesByStatus('running');
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): InstanceInfo | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Manually register an instance
   */
  registerInstance(instance: InstanceInfo): void {
    this.instances.set(instance.id, {
      ...instance,
      lastSeen: new Date()
    });
    this.emit('instanceRegistered', instance);
  }

  /**
   * Manually unregister an instance
   */
  unregisterInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (instance) {
      this.instances.delete(instanceId);
      this.healthCheckCounts.delete(instanceId);
      this.emit('instanceUnregistered', instance);
      return true;
    }
    return false;
  }

  /**
   * Get discovery statistics
   */
  getStats(): {
    totalInstances: number;
    healthyInstances: number;
    unhealthyInstances: number;
    instancesByRegion: Record<string, number>;
    instancesByType: Record<string, number>;
    averageUptime: number;
  } {
    const instances = this.getInstances();
    const currentTime = new Date();
    
    const stats = {
      totalInstances: instances.length,
      healthyInstances: instances.filter(i => i.status === 'running').length,
      unhealthyInstances: instances.filter(i => i.status === 'unhealthy').length,
      instancesByRegion: {} as Record<string, number>,
      instancesByType: {} as Record<string, number>,
      averageUptime: 0
    };

    let totalUptime = 0;
    
    for (const instance of instances) {
      // Count by region
      stats.instancesByRegion[instance.region] = 
        (stats.instancesByRegion[instance.region] || 0) + 1;
      
      // Count by type
      stats.instancesByType[instance.instanceType] = 
        (stats.instancesByType[instance.instanceType] || 0) + 1;
      
      // Calculate uptime
      const uptime = currentTime.getTime() - instance.startTime.getTime();
      totalUptime += uptime;
    }

    if (instances.length > 0) {
      stats.averageUptime = totalUptime / instances.length;
    }

    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<DiscoveryConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): DiscoveryConfig {
    return { ...this.config };
  }
}