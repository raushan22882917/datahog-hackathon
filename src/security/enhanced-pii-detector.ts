import { EventEmitter } from 'events';

export interface PIIDetectionResult {
  found: boolean;
  types: PIIType[];
  locations: PIILocation[];
  redactionRequired: boolean;
  complianceImpact: ComplianceImpact[];
  confidence: number;
  originalText: string;
  redactedText: string;
}

export interface PIIType {
  type: 'email' | 'phone' | 'credit_card' | 'ssn' | 'passport' | 'iban' | 'custom';
  pattern: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  region?: string;
  complianceFrameworks: string[];
}

export interface PIILocation {
  start: number;
  end: number;
  type: string;
  value: string;
  redactedValue: string;
  context: string;
}

export interface ComplianceImpact {
  framework: 'gdpr' | 'ccpa' | 'hipaa' | 'pci_dss' | 'data_localization';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  requiredActions: string[];
  auditRequired: boolean;
}

export interface RedactionConfig {
  level: 'partial' | 'full' | 'hash' | 'tokenize';
  preserveFormat: boolean;
  customMask?: string;
  auditTrail: boolean;
}

export interface SecurityIncident {
  id: string;
  type: 'pii_exposure' | 'compliance_violation' | 'data_breach' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedData: PIIType[];
  region: string;
  complianceFrameworks: string[];
  detectedAt: Date;
  userId?: string;
  sessionId?: string;
  remediationSteps: string[];
  escalationRequired: boolean;
}

const PII_PATTERNS = {
  email: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    severity: 'medium' as const,
    complianceFrameworks: ['gdpr', 'ccpa', 'hipaa']
  },
  phone: {
    pattern: /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
    severity: 'medium' as const,
    complianceFrameworks: ['gdpr', 'ccpa']
  },
  credit_card: {
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    severity: 'critical' as const,
    complianceFrameworks: ['pci_dss', 'gdpr']
  },
  ssn: {
    pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
    severity: 'critical' as const,
    complianceFrameworks: ['hipaa', 'ccpa']
  },
  passport: {
    pattern: /\b[A-Z]{1,2}[0-9]{6,9}\b/g,
    severity: 'high' as const,
    complianceFrameworks: ['gdpr', 'data_localization']
  },
  iban: {
    pattern: /\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4}[0-9]{7}([A-Z0-9]?){0,16}\b/g,
    severity: 'high' as const,
    complianceFrameworks: ['gdpr', 'pci_dss']
  }
};

const REGION_SPECIFIC_PATTERNS = {
  India: {
    aadhaar: {
      pattern: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
      severity: 'critical' as const,
      complianceFrameworks: ['data_localization', 'aadhaar_act']
    },
    pan: {
      pattern: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
      severity: 'high' as const,
      complianceFrameworks: ['data_localization', 'it_act']
    }
  },
  EU: {
    vat: {
      pattern: /\b[A-Z]{2}[0-9A-Z]{8,12}\b/g,
      severity: 'medium' as const,
      complianceFrameworks: ['gdpr']
    },
    nino: {
      pattern: /\b[A-Z]{2}[0-9]{6}[A-Z]{1}\b/g,
      severity: 'high' as const,
      complianceFrameworks: ['gdpr', 'data_protection_act']
    }
  }
};

export class EnhancedPIIDetector extends EventEmitter {
  private auditTrail: Array<{
    timestamp: Date;
    action: string;
    userId?: string;
    piiTypes: string[];
    redactionLevel: string;
    complianceImpact: string[];
  }> = [];

  constructor() {
    super();
  }

  async detectPII(
    text: string, 
    region?: string, 
    userId?: string,
    sessionId?: string
  ): Promise<PIIDetectionResult> {
    const detectedTypes: PIIType[] = [];
    const locations: PIILocation[] = [];
    const complianceImpacts: ComplianceImpact[] = [];
    let redactedText = text;
    let overallConfidence = 0;

    // Detect standard PII patterns
    for (const [type, config] of Object.entries(PII_PATTERNS)) {
      const matches = Array.from(text.matchAll(config.pattern));
      
      for (const match of matches) {
        if (match.index !== undefined) {
          const piiType: PIIType = {
            type: type as any,
            pattern: match[0],
            confidence: this.calculateConfidence(type, match[0]),
            severity: config.severity,
            complianceFrameworks: config.complianceFrameworks
          };

          const location: PIILocation = {
            start: match.index,
            end: match.index + match[0].length,
            type,
            value: match[0],
            redactedValue: this.redactValue(match[0], type),
            context: this.getContext(text, match.index, match[0].length)
          };

          detectedTypes.push(piiType);
          locations.push(location);
          overallConfidence = Math.max(overallConfidence, piiType.confidence);

          // Apply redaction
          redactedText = redactedText.replace(match[0], location.redactedValue);

          // Assess compliance impact
          const impact = this.assessComplianceImpact(piiType, region);
          complianceImpacts.push(...impact);
        }
      }
    }

    // Detect region-specific patterns
    if (region && REGION_SPECIFIC_PATTERNS[region as keyof typeof REGION_SPECIFIC_PATTERNS]) {
      const regionPatterns = REGION_SPECIFIC_PATTERNS[region as keyof typeof REGION_SPECIFIC_PATTERNS];
      
      for (const [type, config] of Object.entries(regionPatterns)) {
        const matches = Array.from(text.matchAll(config.pattern));
        
        for (const match of matches) {
          if (match.index !== undefined) {
            const piiType: PIIType = {
              type: 'custom',
              pattern: match[0],
              confidence: this.calculateConfidence(type, match[0]),
              severity: config.severity,
              region,
              complianceFrameworks: config.complianceFrameworks
            };

            const location: PIILocation = {
              start: match.index,
              end: match.index + match[0].length,
              type: `${region}_${type}`,
              value: match[0],
              redactedValue: this.redactValue(match[0], type),
              context: this.getContext(text, match.index, match[0].length)
            };

            detectedTypes.push(piiType);
            locations.push(location);
            overallConfidence = Math.max(overallConfidence, piiType.confidence);

            // Apply redaction
            redactedText = redactedText.replace(match[0], location.redactedValue);

            // Assess compliance impact
            const impact = this.assessComplianceImpact(piiType, region);
            complianceImpacts.push(...impact);
          }
        }
      }
    }

    const result: PIIDetectionResult = {
      found: detectedTypes.length > 0,
      types: detectedTypes,
      locations,
      redactionRequired: detectedTypes.some(t => t.severity === 'critical' || t.severity === 'high'),
      complianceImpact: complianceImpacts,
      confidence: overallConfidence,
      originalText: text,
      redactedText
    };

    // Log to audit trail
    this.logToAuditTrail('pii_detection', userId, detectedTypes.map(t => t.type), 'auto', complianceImpacts.map(c => c.framework));

    // Emit events for monitoring
    if (result.found) {
      this.emit('piiDetected', {
        userId,
        sessionId,
        types: detectedTypes,
        severity: this.getHighestSeverity(detectedTypes),
        region,
        complianceImpacts
      });

      // Create security incident for critical PII
      if (detectedTypes.some(t => t.severity === 'critical')) {
        const incident = await this.createSecurityIncident(detectedTypes, region, userId, sessionId);
        this.emit('securityIncident', incident);
      }
    }

    return result;
  }

  async redactSensitiveData(
    text: string, 
    config: RedactionConfig = { level: 'full', preserveFormat: true, auditTrail: true },
    userId?: string
  ): Promise<string> {
    const detection = await this.detectPII(text, undefined, userId);
    
    if (!detection.found) {
      return text;
    }

    let redactedText = text;
    
    // Apply redaction based on configuration
    for (const location of detection.locations) {
      const redactedValue = this.applyRedactionConfig(location.value, location.type, config);
      redactedText = redactedText.replace(location.value, redactedValue);
    }

    // Log redaction activity
    if (config.auditTrail) {
      this.logToAuditTrail(
        'redaction', 
        userId, 
        detection.types.map(t => t.type), 
        config.level,
        detection.complianceImpact.map(c => c.framework)
      );
    }

    return redactedText;
  }

  async createSecurityIncident(
    piiTypes: PIIType[],
    region?: string,
    userId?: string,
    sessionId?: string
  ): Promise<SecurityIncident> {
    const highestSeverity = this.getHighestSeverity(piiTypes);
    const allFrameworks = [...new Set(piiTypes.flatMap(t => t.complianceFrameworks))];
    
    const incident: SecurityIncident = {
      id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'pii_exposure',
      severity: highestSeverity,
      description: `PII exposure detected: ${piiTypes.map(t => t.type).join(', ')}`,
      affectedData: piiTypes,
      region: region || 'unknown',
      complianceFrameworks: allFrameworks,
      detectedAt: new Date(),
      userId: userId || 'anonymous',
      sessionId: sessionId || 'unknown',
      remediationSteps: this.generateRemediationSteps(piiTypes, allFrameworks),
      escalationRequired: highestSeverity === 'critical'
    };

    // Log incident creation
    this.logToAuditTrail('incident_created', userId, piiTypes.map(t => t.type), 'critical', allFrameworks);

    return incident;
  }

  getAuditTrail(userId?: string, startDate?: Date, endDate?: Date): Array<any> {
    let filtered = this.auditTrail;

    if (userId) {
      filtered = filtered.filter(entry => entry.userId === userId);
    }

    if (startDate) {
      filtered = filtered.filter(entry => entry.timestamp >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(entry => entry.timestamp <= endDate);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private calculateConfidence(type: string, value: string): number {
    // Enhanced confidence calculation based on pattern complexity and context
    const baseConfidence = {
      email: 0.9,
      phone: 0.8,
      credit_card: 0.95,
      ssn: 0.9,
      passport: 0.7,
      iban: 0.85
    };

    let confidence = baseConfidence[type as keyof typeof baseConfidence] || 0.7;

    // Adjust based on value characteristics
    if (type === 'credit_card' && this.isValidLuhn(value)) {
      confidence = 0.98;
    }

    if (type === 'email' && value.includes('.')) {
      confidence = Math.min(0.95, confidence + 0.05);
    }

    return confidence;
  }

  private isValidLuhn(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    let sum = 0;
    let isEven = false;

    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = parseInt(digits[i] || '0');

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  private redactValue(value: string, type: string): string {
    switch (type) {
      case 'email':
        const [local, domain] = value.split('@');
        return `${local?.charAt(0) || '*'}***@${domain || 'unknown'}`;
      
      case 'phone':
        return value.replace(/\d/g, '*').replace(/\*{4}$/, value.slice(-4));
      
      case 'credit_card':
        return `****-****-****-${value.slice(-4)}`;
      
      case 'ssn':
        return `***-**-${value.slice(-4)}`;
      
      default:
        return '*'.repeat(Math.min(value.length, 8));
    }
  }

  private getContext(text: string, start: number, length: number): string {
    const contextStart = Math.max(0, start - 20);
    const contextEnd = Math.min(text.length, start + length + 20);
    return text.substring(contextStart, contextEnd);
  }

  private assessComplianceImpact(piiType: PIIType, region?: string): ComplianceImpact[] {
    const impacts: ComplianceImpact[] = [];

    for (const framework of piiType.complianceFrameworks) {
      let severity = piiType.severity;
      let description = `${piiType.type} detected - ${framework} compliance review required`;
      let requiredActions: string[] = [];
      let auditRequired = false;

      switch (framework) {
        case 'gdpr':
          if (region === 'EU') {
            severity = 'critical';
            description = 'GDPR violation: PII processing without explicit consent';
            requiredActions = ['obtain_consent', 'implement_data_protection', 'notify_dpa'];
            auditRequired = true;
          }
          break;

        case 'pci_dss':
          if (piiType.type === 'credit_card') {
            severity = 'critical';
            description = 'PCI DSS violation: Credit card data exposure';
            requiredActions = ['secure_cardholder_data', 'implement_encryption', 'notify_acquirer'];
            auditRequired = true;
          }
          break;

        case 'data_localization':
          if (region === 'India') {
            severity = 'high';
            description = 'Data localization requirement: Sensitive data must remain in India';
            requiredActions = ['migrate_to_local_storage', 'update_data_flow'];
            auditRequired = true;
          }
          break;
      }

      impacts.push({
        framework: framework as any,
        severity,
        description,
        requiredActions,
        auditRequired
      });
    }

    return impacts;
  }

  private applyRedactionConfig(value: string, type: string, config: RedactionConfig): string {
    switch (config.level) {
      case 'partial':
        return this.redactValue(value, type);
      
      case 'full':
        return config.preserveFormat ? 
          '*'.repeat(value.length) : 
          '[REDACTED]';
      
      case 'hash':
        return `[HASH:${this.simpleHash(value)}]`;
      
      case 'tokenize':
        return `[TOKEN:${this.generateToken()}]`;
      
      default:
        return config.customMask || '[REDACTED]';
    }
  }

  private simpleHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }

  private generateToken(): string {
    return Math.random().toString(36).substr(2, 12).toUpperCase();
  }

  private getHighestSeverity(piiTypes: PIIType[]): 'low' | 'medium' | 'high' | 'critical' {
    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const highest = piiTypes.reduce((max, type) => {
      return severityOrder[type.severity] > severityOrder[max] ? type.severity : max;
    }, 'low' as 'low' | 'medium' | 'high' | 'critical');
    
    return highest;
  }

  private generateRemediationSteps(piiTypes: PIIType[], frameworks: string[]): string[] {
    const steps = new Set<string>();
    
    // General steps
    steps.add('Immediately secure the affected data');
    steps.add('Review and update data handling procedures');
    steps.add('Conduct security assessment');
    
    // Framework-specific steps
    if (frameworks.includes('gdpr')) {
      steps.add('Notify Data Protection Authority within 72 hours');
      steps.add('Inform affected individuals if high risk');
      steps.add('Document the incident for GDPR compliance');
    }
    
    if (frameworks.includes('pci_dss')) {
      steps.add('Notify payment card brands and acquirer');
      steps.add('Conduct forensic investigation');
      steps.add('Implement additional security controls');
    }
    
    if (piiTypes.some(t => t.severity === 'critical')) {
      steps.add('Escalate to senior management');
      steps.add('Consider engaging external security experts');
    }
    
    return Array.from(steps);
  }

  private logToAuditTrail(
    action: string,
    userId?: string,
    piiTypes: string[] = [],
    redactionLevel: string = 'none',
    complianceImpact: string[] = []
  ): void {
    this.auditTrail.push({
      timestamp: new Date(),
      action,
      userId: userId || 'anonymous',
      piiTypes,
      redactionLevel,
      complianceImpact
    });

    // Keep only last 10000 entries to prevent memory issues
    if (this.auditTrail.length > 10000) {
      this.auditTrail = this.auditTrail.slice(-10000);
    }
  }
}