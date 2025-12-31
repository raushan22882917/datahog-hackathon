import { InjectionRisk } from '../interfaces';

/**
 * Detects potential prompt injection attempts in user inputs
 */
export class PromptInjectionDetector {
  private readonly injectionPatterns: RegExp[];
  private readonly suspiciousKeywords: string[];

  constructor() {
    // Common prompt injection patterns
    this.injectionPatterns = [
      // Direct instruction overrides
      /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/i,
      /forget\s+(everything|all|previous|above)/i,
      /disregard\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/i,
      
      // Role manipulation
      /you\s+are\s+now\s+(a|an)\s+/i,
      /act\s+as\s+(a|an)\s+/i,
      /pretend\s+(to\s+be|you\s+are)\s+/i,
      /roleplay\s+as\s+/i,
      
      // System prompt extraction
      /show\s+me\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
      /what\s+(are\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
      /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?)/i,
      
      // Jailbreak attempts
      /developer\s+mode/i,
      /jailbreak/i,
      /bypass\s+(safety|security|filters?)/i,
      /override\s+(safety|security|filters?)/i,
      
      // Code execution attempts
      /execute\s+(code|script|command)/i,
      /run\s+(code|script|command)/i,
      /eval\s*\(/i,
      
      // Delimiter confusion
      /```[\s\S]*```/,
      /---[\s\S]*---/,
      /\[SYSTEM\]/i,
      /\[USER\]/i,
      /\[ASSISTANT\]/i,
    ];

    this.suspiciousKeywords = [
      'ignore', 'forget', 'disregard', 'override', 'bypass',
      'jailbreak', 'developer mode', 'admin mode', 'root access',
      'system prompt', 'hidden instructions', 'secret rules',
      'execute', 'eval', 'script', 'command', 'shell',
      'sudo', 'administrator', 'privilege escalation'
    ];
  }

  /**
   * Analyze input for potential prompt injection attempts
   */
  public detectPromptInjection(prompt: string): InjectionRisk {
    const indicators: string[] = [];
    let riskScore = 0;

    // Check for injection patterns
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(prompt)) {
        const match = prompt.match(pattern);
        if (match) {
          indicators.push(`Injection pattern detected: "${match[0]}"`);
          riskScore += 0.3;
        }
      }
    }

    // Check for suspicious keywords
    const lowerPrompt = prompt.toLowerCase();
    for (const keyword of this.suspiciousKeywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        indicators.push(`Suspicious keyword: "${keyword}"`);
        riskScore += 0.1;
      }
    }

    // Check for unusual formatting that might indicate injection
    if (this.hasUnusualFormatting(prompt)) {
      indicators.push('Unusual formatting detected (potential delimiter confusion)');
      riskScore += 0.2;
    }

    // Check for excessive length (potential overflow attack)
    if (prompt.length > 10000) {
      indicators.push('Unusually long input (potential overflow attack)');
      riskScore += 0.2;
    }

    // Check for repeated patterns (potential DoS)
    if (this.hasRepeatedPatterns(prompt)) {
      indicators.push('Repeated patterns detected (potential DoS attack)');
      riskScore += 0.15;
    }

    // Determine risk level based on score
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 0.8) {
      riskLevel = 'critical';
    } else if (riskScore >= 0.5) {
      riskLevel = 'high';
    } else if (riskScore >= 0.2) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      riskLevel,
      confidence: Math.min(riskScore, 1.0),
      indicators,
      mitigation: this.generateMitigation(riskLevel, indicators)
    };
  }

  /**
   * Check for unusual formatting that might indicate injection attempts
   */
  private hasUnusualFormatting(text: string): boolean {
    // Check for multiple consecutive special characters
    const specialCharPatterns = [
      /[`]{3,}/,  // Multiple backticks
      /[-]{3,}/,  // Multiple dashes
      /[=]{3,}/,  // Multiple equals
      /[*]{3,}/,  // Multiple asterisks
      /[#]{3,}/,  // Multiple hashes
    ];

    return specialCharPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check for repeated patterns that might indicate DoS attempts
   */
  private hasRepeatedPatterns(text: string): boolean {
    // Look for the same word/phrase repeated many times
    const words = text.split(/\s+/);
    const wordCounts = new Map<string, number>();

    for (const word of words) {
      if (word.length > 3) { // Only check words longer than 3 characters
        const count = wordCounts.get(word.toLowerCase()) || 0;
        wordCounts.set(word.toLowerCase(), count + 1);
        
        if (count > 10) { // Same word repeated more than 10 times
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate mitigation advice based on detected risks
   */
  private generateMitigation(riskLevel: string, indicators: string[]): string {
    if (riskLevel === 'critical' || riskLevel === 'high') {
      return 'Block this input immediately. Contains clear prompt injection attempts. ' +
             'Review and sanitize input before processing. Consider implementing stricter input validation.';
    } else if (riskLevel === 'medium') {
      return 'Flag for review. Contains suspicious patterns that may indicate injection attempts. ' +
             'Consider additional validation or human review before processing.';
    } else {
      return 'Monitor for patterns. Low risk but continue monitoring for escalation.';
    }
  }
}