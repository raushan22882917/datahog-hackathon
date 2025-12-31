import { SecurityAssessment, SecurityThreat, ComplianceViolation } from '../types';
import { SecurityAnalyzer as ISecurityAnalyzer, InjectionRisk, SensitivityReport } from '../interfaces';
import { PromptInjectionDetector } from './prompt-injection-detector';
import { ContentAnalyzer } from './content-analyzer';
import { DLPScanner } from './dlp-scanner';

/**
 * Main security analyzer that coordinates threat detection across multiple domains
 */
export class SecurityAnalyzer implements ISecurityAnalyzer {
  private promptInjectionDetector: PromptInjectionDetector;
  private contentAnalyzer: ContentAnalyzer;
  private dlpScanner: DLPScanner;

  constructor() {
    this.promptInjectionDetector = new PromptInjectionDetector();
    this.contentAnalyzer = new ContentAnalyzer();
    this.dlpScanner = new DLPScanner();
  }

  /**
   * Analyze user input for security threats
   */
  public async analyzeInput(input: string): Promise<SecurityAssessment> {
    const threats: SecurityThreat[] = [];
    const complianceViolations: ComplianceViolation[] = [];

    // 1. Check for prompt injection attempts
    const injectionRisk = await this.detectPromptInjection(input);
    if (injectionRisk.riskLevel !== 'low') {
      threats.push({
        type: 'prompt-injection',
        severity: injectionRisk.riskLevel,
        description: `Prompt injection detected: ${injectionRisk.indicators.join(', ')}`,
        confidence: injectionRisk.confidence,
        mitigation: injectionRisk.mitigation
      });
    }

    // 2. Check for harmful content
    const harmfulThreats = this.contentAnalyzer.analyzeHarmfulContent(input);
    threats.push(...harmfulThreats);

    // 3. Check for bias
    const biasThreats = this.contentAnalyzer.analyzeBias(input);
    threats.push(...biasThreats);

    // 4. Check for sensitive data exposure
    const sensitivityReport = await this.scanForSensitiveData(input);
    if (sensitivityReport.hasSensitiveData) {
      threats.push({
        type: 'data-exposure',
        severity: this.determineSensitivitySeverity(sensitivityReport),
        description: `Sensitive data detected: ${sensitivityReport.dataTypes.join(', ')}`,
        confidence: sensitivityReport.confidence,
        mitigation: 'Remove or redact sensitive information before processing'
      });

      // Add compliance violations for sensitive data
      complianceViolations.push(...this.checkComplianceViolations(sensitivityReport));
    }

    // Determine overall risk level
    const riskLevel = this.calculateOverallRiskLevel(threats);

    return {
      riskLevel,
      threats,
      sensitiveDataFound: sensitivityReport.hasSensitiveData,
      complianceViolations
    };
  }

  /**
   * Analyze model output for security issues
   */
  public async analyzeOutput(output: string): Promise<SecurityAssessment> {
    const threats: SecurityThreat[] = [];
    const complianceViolations: ComplianceViolation[] = [];

    // 1. Check for harmful content in output
    const harmfulThreats = this.contentAnalyzer.analyzeHarmfulContent(output);
    threats.push(...harmfulThreats);

    // 2. Check for bias in output
    const biasThreats = this.contentAnalyzer.analyzeBias(output);
    threats.push(...biasThreats);

    // 3. Check if output contains sensitive data (data leakage)
    const sensitivityReport = await this.scanForSensitiveData(output);
    if (sensitivityReport.hasSensitiveData) {
      threats.push({
        type: 'data-exposure',
        severity: 'high', // Data leakage in output is always high severity
        description: `Potential data leakage: ${sensitivityReport.dataTypes.join(', ')}`,
        confidence: sensitivityReport.confidence,
        mitigation: 'Review and redact output before returning to user'
      });

      complianceViolations.push(...this.checkComplianceViolations(sensitivityReport));
    }

    // 4. Check for potential prompt leakage (system instructions in output)
    const promptLeakageRisk = this.detectPromptLeakage(output);
    if (promptLeakageRisk.riskLevel !== 'low') {
      threats.push({
        type: 'prompt-injection',
        severity: promptLeakageRisk.riskLevel,
        description: 'Potential system prompt leakage detected in output',
        confidence: promptLeakageRisk.confidence,
        mitigation: 'Review output for system instruction leakage'
      });
    }

    const riskLevel = this.calculateOverallRiskLevel(threats);

    return {
      riskLevel,
      threats,
      sensitiveDataFound: sensitivityReport.hasSensitiveData,
      complianceViolations
    };
  }

  /**
   * Detect prompt injection attempts
   */
  public async detectPromptInjection(prompt: string): Promise<InjectionRisk> {
    return this.promptInjectionDetector.detectPromptInjection(prompt);
  }

  /**
   * Scan for sensitive data
   */
  public async scanForSensitiveData(text: string): Promise<SensitivityReport> {
    return this.dlpScanner.scanForSensitiveData(text);
  }

  /**
   * Detect potential prompt leakage in model outputs
   */
  private detectPromptLeakage(output: string): InjectionRisk {
    const leakagePatterns = [
      /system\s+(prompt|instruction|rule)/i,
      /you\s+are\s+(an?\s+)?(ai|assistant|model)/i,
      /your\s+(role|purpose|function)\s+is/i,
      /\[SYSTEM\]/i,
      /\[INSTRUCTION\]/i,
      /follow\s+these\s+(rules|instructions)/i
    ];

    const indicators: string[] = [];
    let riskScore = 0;

    for (const pattern of leakagePatterns) {
      if (pattern.test(output)) {
        const match = output.match(pattern);
        if (match) {
          indicators.push(`Potential prompt leakage: "${match[0]}"`);
          riskScore += 0.3;
        }
      }
    }

    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 0.6) {
      riskLevel = 'high';
    } else if (riskScore >= 0.3) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      riskLevel,
      confidence: Math.min(riskScore, 1.0),
      indicators,
      mitigation: riskLevel !== 'low' ? 
        'Review output for system prompt leakage and implement output filtering' : 
        'Continue monitoring'
    };
  }

  /**
   * Determine severity based on sensitivity report
   */
  private determineSensitivitySeverity(report: SensitivityReport): 'low' | 'medium' | 'high' | 'critical' {
    const highRiskTypes = ['CREDIT_CARD', 'SSN', 'PASSPORT', 'MEDICAL_RECORD'];
    const mediumRiskTypes = ['EMAIL', 'PHONE', 'DRIVERS_LICENSE', 'BANK_ACCOUNT'];

    const hasHighRisk = report.dataTypes.some(type => highRiskTypes.includes(type));
    const hasMediumRisk = report.dataTypes.some(type => mediumRiskTypes.includes(type));

    if (hasHighRisk) {
      return report.confidence > 0.8 ? 'critical' : 'high';
    } else if (hasMediumRisk) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Check for compliance violations based on detected sensitive data
   */
  private checkComplianceViolations(report: SensitivityReport): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    // GDPR violations
    if (report.dataTypes.some(type => ['EMAIL', 'PHONE', 'IP_ADDRESS'].includes(type))) {
      violations.push({
        regulation: 'GDPR',
        violationType: 'Personal Data Processing',
        description: 'Processing of personal data without explicit consent',
        severity: 'high'
      });
    }

    // HIPAA violations
    if (report.dataTypes.includes('MEDICAL_RECORD')) {
      violations.push({
        regulation: 'HIPAA',
        violationType: 'PHI Exposure',
        description: 'Potential exposure of Protected Health Information',
        severity: 'critical'
      });
    }

    // PCI DSS violations
    if (report.dataTypes.includes('CREDIT_CARD')) {
      violations.push({
        regulation: 'PCI DSS',
        violationType: 'Cardholder Data Exposure',
        description: 'Credit card information detected in unencrypted context',
        severity: 'critical'
      });
    }

    // SOX violations
    if (report.dataTypes.includes('BANK_ACCOUNT')) {
      violations.push({
        regulation: 'SOX',
        violationType: 'Financial Data Exposure',
        description: 'Financial information detected without proper controls',
        severity: 'high'
      });
    }

    return violations;
  }

  /**
   * Calculate overall risk level based on all detected threats
   */
  private calculateOverallRiskLevel(threats: SecurityThreat[]): 'low' | 'medium' | 'high' | 'critical' {
    if (threats.length === 0) {
      return 'low';
    }

    const severityScores = {
      'low': 1,
      'medium': 2,
      'high': 3,
      'critical': 4
    };

    const maxSeverity = Math.max(...threats.map(t => severityScores[t.severity]));
    const avgConfidence = threats.reduce((sum, t) => sum + t.confidence, 0) / threats.length;

    // Adjust based on confidence
    let adjustedScore = maxSeverity;
    if (avgConfidence < 0.5) {
      adjustedScore = Math.max(1, adjustedScore - 1);
    }

    if (adjustedScore >= 4) return 'critical';
    if (adjustedScore >= 3) return 'high';
    if (adjustedScore >= 2) return 'medium';
    return 'low';
  }
}