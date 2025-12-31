import { SensitivityReport, SensitiveDataLocation } from '../interfaces';
import { DlpServiceClient } from '@google-cloud/dlp';

/**
 * Data Loss Prevention scanner using Google Cloud DLP API for detecting sensitive information
 */
export class DLPScanner {
  private dlpClient: DlpServiceClient;
  private projectId: string;
  private readonly sensitivePatterns: Map<string, RegExp>;

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-project-id';
    this.dlpClient = new DlpServiceClient();
    
    // Fallback patterns for offline/development use
    this.sensitivePatterns = new Map([
      // Credit card numbers (simplified Luhn algorithm check)
      ['CREDIT_CARD', /\b(?:\d{4}[-\s]?){3}\d{4}\b/g],
      
      // Social Security Numbers (US format)
      ['SSN', /\b\d{3}-?\d{2}-?\d{4}\b/g],
      
      // Email addresses
      ['EMAIL', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g],
      
      // Phone numbers (various formats)
      ['PHONE', /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g],
      
      // IP addresses
      ['IP_ADDRESS', /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g],
      
      // API keys (common patterns)
      ['API_KEY', /\b[A-Za-z0-9]{32,}\b/g],
      
      // Passport numbers (simplified)
      ['PASSPORT', /\b[A-Z]{1,2}[0-9]{6,9}\b/g],
      
      // Driver's license (simplified US format)
      ['DRIVERS_LICENSE', /\b[A-Z]{1,2}[0-9]{6,8}\b/g],
      
      // Bank account numbers (simplified)
      ['BANK_ACCOUNT', /\b[0-9]{8,17}\b/g],
      
      // Medical record numbers
      ['MEDICAL_RECORD', /\bMRN[-:\s]?[0-9]{6,10}\b/gi],
    ]);
  }

  /**
   * Scan text for sensitive data using Google Cloud DLP API
   */
  public async scanForSensitiveData(text: string): Promise<SensitivityReport> {
    try {
      // Use Google Cloud DLP API for real detection
      return await this.scanWithCloudDLP(text);
    } catch (error) {
      console.warn('Cloud DLP API unavailable, falling back to pattern matching:', error);
      // Fallback to pattern matching if Cloud DLP is unavailable
      return this.scanWithPatterns(text);
    }
  }

  /**
   * Scan using Google Cloud DLP API
   */
  private async scanWithCloudDLP(text: string): Promise<SensitivityReport> {
    const request = {
      parent: `projects/${this.projectId}`,
      inspectConfig: {
        infoTypes: [
          { name: 'CREDIT_CARD_NUMBER' },
          { name: 'US_SOCIAL_SECURITY_NUMBER' },
          { name: 'EMAIL_ADDRESS' },
          { name: 'PHONE_NUMBER' },
          { name: 'IP_ADDRESS' },
          { name: 'US_PASSPORT' },
          { name: 'US_DRIVERS_LICENSE_NUMBER' },
          { name: 'US_BANK_ROUTING_MICR' },
          { name: 'MEDICAL_RECORD_NUMBER' },
          { name: 'PERSON_NAME' },
          { name: 'DATE_OF_BIRTH' },
          { name: 'US_STATE' },
          { name: 'STREET_ADDRESS' }
        ],
        minLikelihood: 'POSSIBLE' as const,
        limits: {
          maxFindingsPerRequest: 100
        },
        includeQuote: true
      },
      item: {
        value: text
      }
    };

    const [response] = await this.dlpClient.inspectContent(request);
    const findings = response.result?.findings || [];

    const locations: SensitiveDataLocation[] = [];
    const foundTypes = new Set<string>();

    for (const finding of findings) {
      if (finding.location?.byteRange && finding.infoType?.name) {
        const start = Number(finding.location.byteRange.start || 0);
        const end = Number(finding.location.byteRange.end || 0);
        const confidence = this.mapDLPLikelihoodToConfidence(finding.likelihood);
        
        locations.push({
          type: this.mapDLPInfoTypeToInternal(finding.infoType.name),
          start,
          end,
          confidence
        });
        
        foundTypes.add(this.mapDLPInfoTypeToInternal(finding.infoType.name));
      }
    }

    return {
      hasSensitiveData: locations.length > 0,
      dataTypes: Array.from(foundTypes),
      confidence: this.calculateOverallConfidence(locations),
      locations
    };
  }

  /**
   * Fallback pattern-based scanning
   */
  private scanWithPatterns(text: string): SensitivityReport {
    const locations: SensitiveDataLocation[] = [];
    const foundTypes = new Set<string>();

    for (const [dataType, pattern] of Array.from(this.sensitivePatterns.entries())) {
      // Reset regex lastIndex to ensure proper matching
      pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Additional validation for certain types
        if (this.validateMatch(dataType, match[0])) {
          locations.push({
            type: dataType,
            start: match.index,
            end: match.index + match[0].length,
            confidence: this.calculateConfidence(dataType, match[0])
          });
          foundTypes.add(dataType);
        }
      }
    }

    return {
      hasSensitiveData: locations.length > 0,
      dataTypes: Array.from(foundTypes),
      confidence: this.calculateOverallConfidence(locations),
      locations
    };
  }

  /**
   * Map Google Cloud DLP likelihood to confidence score
   */
  private mapDLPLikelihoodToConfidence(likelihood?: string | number | null): number {
    if (likelihood === null || likelihood === undefined) {
      return 0.5;
    }
    const likelihoodStr = typeof likelihood === 'string' ? likelihood : String(likelihood);
    switch (likelihoodStr) {
      case 'VERY_LIKELY': return 0.95;
      case 'LIKELY': return 0.8;
      case 'POSSIBLE': return 0.6;
      case 'UNLIKELY': return 0.3;
      case 'VERY_UNLIKELY': return 0.1;
      default: return 0.5;
    }
  }

  /**
   * Map Google Cloud DLP info types to internal types
   */
  private mapDLPInfoTypeToInternal(dlpType: string): string {
    const mapping: Record<string, string> = {
      'CREDIT_CARD_NUMBER': 'CREDIT_CARD',
      'US_SOCIAL_SECURITY_NUMBER': 'SSN',
      'EMAIL_ADDRESS': 'EMAIL',
      'PHONE_NUMBER': 'PHONE',
      'IP_ADDRESS': 'IP_ADDRESS',
      'US_PASSPORT': 'PASSPORT',
      'US_DRIVERS_LICENSE_NUMBER': 'DRIVERS_LICENSE',
      'US_BANK_ROUTING_MICR': 'BANK_ACCOUNT',
      'MEDICAL_RECORD_NUMBER': 'MEDICAL_RECORD',
      'PERSON_NAME': 'PERSON_NAME',
      'DATE_OF_BIRTH': 'DATE_OF_BIRTH',
      'US_STATE': 'US_STATE',
      'STREET_ADDRESS': 'ADDRESS'
    };
    
    return mapping[dlpType] || dlpType;
  }

  /**
   * Additional validation for specific data types
   */
  private validateMatch(dataType: string, value: string): boolean {
    switch (dataType) {
      case 'CREDIT_CARD':
        return this.validateCreditCard(value);
      case 'EMAIL':
        return this.validateEmail(value);
      case 'SSN':
        return this.validateSSN(value);
      case 'API_KEY':
        return this.validateApiKey(value);
      default:
        return true;
    }
  }

  /**
   * Validate credit card using simplified Luhn algorithm
   */
  private validateCreditCard(cardNumber: string): boolean {
    const digits = cardNumber.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) {
      return false;
    }

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

  /**
   * Validate email format
   */
  private validateEmail(email: string): boolean {
    // More strict email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) && email.length <= 254;
  }

  /**
   * Validate SSN format and check for invalid patterns
   */
  private validateSSN(ssn: string): boolean {
    const digits = ssn.replace(/\D/g, '');
    
    // Invalid SSN patterns
    const invalidPatterns = [
      '000000000', '111111111', '222222222', '333333333',
      '444444444', '555555555', '666666666', '777777777',
      '888888888', '999999999'
    ];

    return digits.length === 9 && !invalidPatterns.includes(digits);
  }

  /**
   * Validate API key (basic heuristics)
   */
  private validateApiKey(key: string): boolean {
    // Basic heuristics for API keys
    return key.length >= 20 && 
           /[A-Za-z]/.test(key) && 
           /[0-9]/.test(key) &&
           !/\s/.test(key);
  }

  /**
   * Calculate confidence score for a specific match
   */
  private calculateConfidence(dataType: string, value: string): number {
    const baseConfidence: Record<string, number> = {
      'CREDIT_CARD': 0.9,
      'SSN': 0.85,
      'EMAIL': 0.95,
      'PHONE': 0.8,
      'IP_ADDRESS': 0.7,
      'API_KEY': 0.6,
      'PASSPORT': 0.75,
      'DRIVERS_LICENSE': 0.7,
      'BANK_ACCOUNT': 0.65,
      'MEDICAL_RECORD': 0.8
    };

    return baseConfidence[dataType] || 0.5;
  }

  /**
   * Calculate overall confidence based on all detected sensitive data
   */
  private calculateOverallConfidence(locations: SensitiveDataLocation[]): number {
    if (locations.length === 0) {
      return 0;
    }

    const totalConfidence = locations.reduce((sum, loc) => sum + loc.confidence, 0);
    return totalConfidence / locations.length;
  }

  /**
   * Get redacted version of text with sensitive data masked
   */
  public async redactSensitiveData(text: string, maskChar: string = '*'): Promise<string> {
    const report = await this.scanForSensitiveData(text);
    let redactedText = text;
    
    // Sort locations by start position in descending order to avoid index shifting
    const sortedLocations = report.locations.sort((a: SensitiveDataLocation, b: SensitiveDataLocation) => b.start - a.start);
    
    for (const location of sortedLocations) {
      const sensitiveValue = text.substring(location.start, location.end);
      const mask = maskChar.repeat(sensitiveValue.length);
      redactedText = redactedText.substring(0, location.start) + 
                   mask + 
                   redactedText.substring(location.end);
    }
    
    return redactedText;
  }
}