import { EventEmitter } from 'events';

export type SupportedLanguage = 'en' | 'hi' | 'es' | 'fr';
export type SupportedRegion = 'US' | 'EU' | 'India' | 'APAC';
export type UserRole = 'admin' | 'developer' | 'end_user';

export interface GlobalContext {
  userId: string;
  language: SupportedLanguage;
  region: SupportedRegion;
  userRole: UserRole;
  complianceRequirements: string[];
  currency: string;
  dataResidencyRules: DataResidencyRule[];
  sessionId: string;
  timestamp: Date;
}

export interface LanguageInfo {
  detected: SupportedLanguage;
  confidence: number;
  translationRequired: boolean;
  culturalContext: string[];
}

export interface RegionInfo {
  detected: SupportedRegion;
  confidence: number;
  ipAddress?: string;
  timezone: string;
  complianceFrameworks: string[];
}

export interface ComplianceCheck {
  region: SupportedRegion;
  dataType: string;
  allowed: boolean;
  requirements: string[];
  violations: ComplianceViolation[];
  auditRequired: boolean;
}

export interface ComplianceViolation {
  type: 'gdpr' | 'data_localization' | 'pii_exposure' | 'cross_border_transfer';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requiredActions: string[];
  deadline?: Date;
}

export interface DataResidencyRule {
  region: SupportedRegion;
  dataTypes: string[];
  storageLocation: string;
  processingLocation: string;
  transferRestrictions: string[];
}

export interface GlobalHealthScore {
  overall: number;
  components: {
    latency: number;
    cost: number;
    safety: number;
    errors: number;
  };
  regional: RegionalHealthScore[];
  trend: HealthTrend;
  issues: HealthIssue[];
  lastCalculated: Date;
}

export interface RegionalHealthScore {
  region: SupportedRegion;
  score: number;
  issues: string[];
  trend: 'improving' | 'stable' | 'degrading';
  metrics: {
    latency: number;
    cost: number;
    safety: number;
    errors: number;
  };
}

export interface HealthTrend {
  direction: 'improving' | 'stable' | 'degrading';
  rate: number;
  confidence: number;
  predictedScore: number;
  timeToTarget?: number;
}

export interface HealthIssue {
  region: SupportedRegion;
  category: 'latency' | 'cost' | 'safety' | 'errors';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: number;
  recommendations: string[];
}

const LANGUAGE_CONFIGS = {
  en: {
    name: 'English',
    region: 'US' as SupportedRegion,
    currency: 'USD',
    complianceRequirements: ['SOC2', 'CCPA'],
    culturalContext: ['western', 'individualistic']
  },
  hi: {
    name: 'Hindi',
    region: 'India' as SupportedRegion,
    currency: 'INR',
    complianceRequirements: ['Data Localization', 'IT Act 2000'],
    culturalContext: ['indian', 'collectivistic', 'hierarchical']
  },
  es: {
    name: 'Spanish',
    region: 'EU' as SupportedRegion,
    currency: 'EUR',
    complianceRequirements: ['GDPR', 'Data Protection Act'],
    culturalContext: ['european', 'latin', 'relationship-oriented']
  },
  fr: {
    name: 'French',
    region: 'EU' as SupportedRegion,
    currency: 'EUR',
    complianceRequirements: ['GDPR', 'CNIL'],
    culturalContext: ['european', 'formal', 'privacy-conscious']
  }
};

const REGION_CONFIGS = {
  US: {
    name: 'United States',
    currency: 'USD',
    timezone: 'America/New_York',
    complianceFrameworks: ['SOC2', 'CCPA', 'HIPAA'],
    dataResidency: {
      storageLocation: 'us-central1',
      processingLocation: 'us-central1',
      transferRestrictions: ['no_china', 'no_russia']
    }
  },
  EU: {
    name: 'European Union',
    currency: 'EUR',
    timezone: 'Europe/London',
    complianceFrameworks: ['GDPR', 'Data Protection Act', 'ePrivacy'],
    dataResidency: {
      storageLocation: 'europe-west1',
      processingLocation: 'europe-west1',
      transferRestrictions: ['no_third_countries_without_adequacy']
    }
  },
  India: {
    name: 'India',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    complianceFrameworks: ['Data Localization', 'IT Act 2000', 'SPDI Rules'],
    dataResidency: {
      storageLocation: 'asia-south1',
      processingLocation: 'asia-south1',
      transferRestrictions: ['critical_data_local_only']
    }
  },
  APAC: {
    name: 'Asia Pacific',
    currency: 'USD',
    timezone: 'Asia/Singapore',
    complianceFrameworks: ['PDPA', 'Privacy Act', 'PIPEDA'],
    dataResidency: {
      storageLocation: 'asia-southeast1',
      processingLocation: 'asia-southeast1',
      transferRestrictions: ['country_specific_rules']
    }
  }
};

export class GlobalContextManager extends EventEmitter {
  private userContexts: Map<string, GlobalContext> = new Map();
  private healthScoreCache: GlobalHealthScore | null = null;
  private healthScoreLastUpdated: Date | null = null;
  private readonly HEALTH_SCORE_TTL = 60000; // 1 minute

  constructor() {
    super();
    this.startHealthScoreUpdater();
  }

  setUserLanguage(userId: string, language: SupportedLanguage): void {
    const context = this.getUserContext(userId);
    const languageConfig = LANGUAGE_CONFIGS[language];
    
    context.language = language;
    context.complianceRequirements = languageConfig.complianceRequirements;
    context.currency = languageConfig.currency;
    
    // Auto-suggest region based on language
    if (!context.region || context.region !== languageConfig.region) {
      this.setUserRegion(userId, languageConfig.region);
    }
    
    this.userContexts.set(userId, context);
    this.emit('languageChanged', { userId, language, context });
    
    // Trigger compliance check for EU languages
    if (languageConfig.region === 'EU') {
      this.emit('complianceAlert', {
        type: 'gdpr',
        message: 'GDPR compliance monitoring activated',
        userId,
        context
      });
    }
  }

  setUserRegion(userId: string, region: SupportedRegion): void {
    const context = this.getUserContext(userId);
    const regionConfig = REGION_CONFIGS[region];
    
    context.region = region;
    context.currency = regionConfig.currency;
    context.complianceRequirements = regionConfig.complianceFrameworks;
    context.dataResidencyRules = this.getDataResidencyRules(region);
    
    this.userContexts.set(userId, context);
    this.emit('regionChanged', { userId, region, context });
    
    // Trigger region-specific compliance alerts
    if (region === 'EU') {
      this.emit('complianceAlert', {
        type: 'gdpr',
        message: 'EU region selected - GDPR compliance monitoring activated',
        userId,
        context
      });
    } else if (region === 'India') {
      this.emit('complianceAlert', {
        type: 'data_localization',
        message: 'India region selected - Data localization requirements enforced',
        userId,
        context
      });
    }
  }

  setUserRole(userId: string, role: UserRole): void {
    const context = this.getUserContext(userId);
    context.userRole = role;
    this.userContexts.set(userId, context);
    this.emit('roleChanged', { userId, role, context });
  }

  getGlobalContext(userId: string): GlobalContext {
    return this.getUserContext(userId);
  }

  detectLanguage(text: string): LanguageInfo {
    // Simple language detection based on character patterns
    // In production, use Google Cloud Translation API
    
    const hindiPattern = /[\u0900-\u097F]/;
    const spanishPattern = /[ñáéíóúü]/i;
    const frenchPattern = /[àâäéèêëïîôöùûüÿç]/i;
    
    if (hindiPattern.test(text)) {
      return {
        detected: 'hi',
        confidence: 0.9,
        translationRequired: false,
        culturalContext: LANGUAGE_CONFIGS.hi.culturalContext
      };
    } else if (spanishPattern.test(text)) {
      return {
        detected: 'es',
        confidence: 0.8,
        translationRequired: false,
        culturalContext: LANGUAGE_CONFIGS.es.culturalContext
      };
    } else if (frenchPattern.test(text)) {
      return {
        detected: 'fr',
        confidence: 0.8,
        translationRequired: false,
        culturalContext: LANGUAGE_CONFIGS.fr.culturalContext
      };
    } else {
      return {
        detected: 'en',
        confidence: 0.7,
        translationRequired: false,
        culturalContext: LANGUAGE_CONFIGS.en.culturalContext
      };
    }
  }

  detectRegion(ipAddress?: string, timezone?: string): RegionInfo {
    // Simple region detection based on IP/timezone
    // In production, use GeoIP services
    
    if (timezone?.includes('Europe')) {
      return {
        detected: 'EU',
        confidence: 0.9,
        timezone: timezone,
        complianceFrameworks: REGION_CONFIGS.EU.complianceFrameworks
      };
    } else if (timezone?.includes('Asia/Kolkata')) {
      return {
        detected: 'India',
        confidence: 0.95,
        timezone: timezone,
        complianceFrameworks: REGION_CONFIGS.India.complianceFrameworks
      };
    } else if (timezone?.includes('Asia')) {
      return {
        detected: 'APAC',
        confidence: 0.8,
        timezone: timezone || 'Asia/Singapore',
        complianceFrameworks: REGION_CONFIGS.APAC.complianceFrameworks
      };
    } else {
      return {
        detected: 'US',
        confidence: 0.7,
        timezone: timezone || 'America/New_York',
        complianceFrameworks: REGION_CONFIGS.US.complianceFrameworks
      };
    }
  }

  checkComplianceRequirements(region: SupportedRegion, dataType: string): ComplianceCheck {
    const regionConfig = REGION_CONFIGS[region];
    const violations: ComplianceViolation[] = [];
    
    // Check GDPR requirements for EU
    if (region === 'EU' && dataType.includes('pii')) {
      violations.push({
        type: 'gdpr',
        severity: 'high',
        description: 'PII data processing in EU requires explicit consent',
        requiredActions: ['obtain_consent', 'implement_data_protection'],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });
    }
    
    // Check data localization for India
    if (region === 'India' && dataType.includes('sensitive')) {
      violations.push({
        type: 'data_localization',
        severity: 'critical',
        description: 'Sensitive data must be stored within India',
        requiredActions: ['migrate_to_local_storage', 'update_data_flow'],
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
    }
    
    return {
      region,
      dataType,
      allowed: violations.length === 0,
      requirements: regionConfig.complianceFrameworks,
      violations,
      auditRequired: violations.some(v => v.severity === 'critical')
    };
  }

  async calculateGlobalHealthScore(): Promise<GlobalHealthScore> {
    // Check cache first
    if (this.healthScoreCache && this.healthScoreLastUpdated) {
      const age = Date.now() - this.healthScoreLastUpdated.getTime();
      if (age < this.HEALTH_SCORE_TTL) {
        return this.healthScoreCache;
      }
    }
    
    // Calculate fresh health score
    const regionalScores = await this.calculateRegionalHealthScores();
    const components = this.aggregateHealthComponents(regionalScores);
    const overall = this.calculateOverallScore(components);
    const trend = this.calculateHealthTrend(regionalScores);
    const issues = this.identifyHealthIssues(regionalScores);
    
    const healthScore: GlobalHealthScore = {
      overall,
      components,
      regional: regionalScores,
      trend,
      issues,
      lastCalculated: new Date()
    };
    
    // Update cache
    this.healthScoreCache = healthScore;
    this.healthScoreLastUpdated = new Date();
    
    this.emit('healthScoreUpdated', healthScore);
    return healthScore;
  }

  private getUserContext(userId: string): GlobalContext {
    if (!this.userContexts.has(userId)) {
      const defaultContext: GlobalContext = {
        userId,
        language: 'en',
        region: 'US',
        userRole: 'end_user',
        complianceRequirements: LANGUAGE_CONFIGS.en.complianceRequirements,
        currency: 'USD',
        dataResidencyRules: this.getDataResidencyRules('US'),
        sessionId: this.generateSessionId(),
        timestamp: new Date()
      };
      this.userContexts.set(userId, defaultContext);
    }
    return this.userContexts.get(userId)!;
  }

  private getDataResidencyRules(region: SupportedRegion): DataResidencyRule[] {
    const regionConfig = REGION_CONFIGS[region];
    return [{
      region,
      dataTypes: ['pii', 'sensitive', 'financial'],
      storageLocation: regionConfig.dataResidency.storageLocation,
      processingLocation: regionConfig.dataResidency.processingLocation,
      transferRestrictions: regionConfig.dataResidency.transferRestrictions
    }];
  }

  private async calculateRegionalHealthScores(): Promise<RegionalHealthScore[]> {
    // Mock implementation - in production, fetch real metrics from Datadog
    return [
      {
        region: 'US',
        score: 89,
        issues: [],
        trend: 'stable',
        metrics: { latency: 94, cost: 82, safety: 96, errors: 90 }
      },
      {
        region: 'EU',
        score: 91,
        issues: [],
        trend: 'improving',
        metrics: { latency: 96, cost: 85, safety: 98, errors: 92 }
      },
      {
        region: 'India',
        score: 83,
        issues: ['Cost Spike', 'Latency Issues'],
        trend: 'degrading',
        metrics: { latency: 88, cost: 68, safety: 94, errors: 86 }
      },
      {
        region: 'APAC',
        score: 85,
        issues: ['Minor Cost Increase'],
        trend: 'stable',
        metrics: { latency: 90, cost: 75, safety: 93, errors: 87 }
      }
    ];
  }

  private aggregateHealthComponents(regionalScores: RegionalHealthScore[]) {
    const totalRegions = regionalScores.length;
    return {
      latency: Math.round(regionalScores.reduce((sum, r) => sum + r.metrics.latency, 0) / totalRegions),
      cost: Math.round(regionalScores.reduce((sum, r) => sum + r.metrics.cost, 0) / totalRegions),
      safety: Math.round(regionalScores.reduce((sum, r) => sum + r.metrics.safety, 0) / totalRegions),
      errors: Math.round(regionalScores.reduce((sum, r) => sum + r.metrics.errors, 0) / totalRegions)
    };
  }

  private calculateOverallScore(components: any): number {
    // Weighted average: safety and errors are more important
    return Math.round(
      (components.latency * 0.2) +
      (components.cost * 0.2) +
      (components.safety * 0.3) +
      (components.errors * 0.3)
    );
  }

  private calculateHealthTrend(regionalScores: RegionalHealthScore[]): HealthTrend {
    const improvingCount = regionalScores.filter(r => r.trend === 'improving').length;
    const degradingCount = regionalScores.filter(r => r.trend === 'degrading').length;
    
    let direction: 'improving' | 'stable' | 'degrading';
    if (improvingCount > degradingCount) {
      direction = 'improving';
    } else if (degradingCount > improvingCount) {
      direction = 'degrading';
    } else {
      direction = 'stable';
    }
    
    return {
      direction,
      rate: Math.abs(improvingCount - degradingCount) / regionalScores.length,
      confidence: 0.8,
      predictedScore: 88 // Mock prediction
    };
  }

  private identifyHealthIssues(regionalScores: RegionalHealthScore[]): HealthIssue[] {
    const issues: HealthIssue[] = [];
    
    regionalScores.forEach(regional => {
      regional.issues.forEach(issue => {
        let category: 'latency' | 'cost' | 'safety' | 'errors' = 'cost';
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        
        if (issue.toLowerCase().includes('cost')) {
          category = 'cost';
          severity = issue.toLowerCase().includes('spike') ? 'high' : 'medium';
        } else if (issue.toLowerCase().includes('latency')) {
          category = 'latency';
          severity = 'medium';
        }
        
        issues.push({
          region: regional.region,
          category,
          severity,
          description: issue,
          impact: severity === 'high' ? 15 : 5,
          recommendations: this.getRecommendations(category, severity)
        });
      });
    });
    
    return issues;
  }

  private getRecommendations(category: string, severity: string): string[] {
    const recommendations: Record<string, string[]> = {
      cost: [
        'Review token usage patterns',
        'Implement request caching',
        'Optimize model selection',
        'Set up budget alerts'
      ],
      latency: [
        'Check network connectivity',
        'Review model configuration',
        'Implement request batching',
        'Consider regional deployment'
      ],
      safety: [
        'Review security policies',
        'Update content filters',
        'Audit user permissions',
        'Enhance monitoring rules'
      ],
      errors: [
        'Check error logs',
        'Review API quotas',
        'Update error handling',
        'Implement retry logic'
      ]
    };
    
    return recommendations[category] || ['Contact support team'];
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startHealthScoreUpdater(): void {
    // Update health score every minute
    setInterval(async () => {
      try {
        await this.calculateGlobalHealthScore();
      } catch (error) {
        console.error('Failed to update health score:', error);
      }
    }, this.HEALTH_SCORE_TTL);
  }
}