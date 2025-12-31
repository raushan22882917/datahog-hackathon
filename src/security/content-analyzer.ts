import { SecurityThreat } from '../types';

/**
 * Analyzes content for harmful, biased, or inappropriate material
 */
export class ContentAnalyzer {
  private readonly harmfulPatterns: RegExp[];
  private readonly biasIndicators: string[];
  private readonly toxicityKeywords: string[];

  constructor() {
    // Patterns for detecting harmful content
    this.harmfulPatterns = [
      // Violence and threats
      /\b(kill|murder|assassinate|eliminate|destroy|harm|hurt|attack|violence)\b/i,
      /\b(bomb|explosive|weapon|gun|knife|poison|toxic)\b/i,
      
      // Hate speech indicators
      /\b(hate|racist|sexist|homophobic|transphobic|xenophobic)\b/i,
      
      // Self-harm indicators
      /\b(suicide|self-harm|cutting|overdose|end\s+it\s+all)\b/i,
      
      // Illegal activities
      /\b(illegal|criminal|fraud|scam|hack|steal|piracy)\b/i,
      
      // Adult content
      /\b(explicit|sexual|pornographic|nude|nsfw)\b/i,
    ];

    this.biasIndicators = [
      // Gender bias
      'men are better', 'women are worse', 'girls can\'t', 'boys don\'t',
      
      // Racial bias
      'people of color', 'white people are', 'asian people are',
      
      // Age bias
      'old people', 'young people are', 'millennials are',
      
      // Religious bias
      'muslims are', 'christians are', 'jews are', 'atheists are',
      
      // Socioeconomic bias
      'poor people', 'rich people are', 'homeless people',
    ];

    this.toxicityKeywords = [
      'stupid', 'idiot', 'moron', 'dumb', 'worthless', 'pathetic',
      'loser', 'failure', 'disgusting', 'horrible', 'terrible',
      'awful', 'hate', 'despise', 'detest', 'abhor'
    ];
  }

  /**
   * Analyze content for harmful material
   */
  public analyzeHarmfulContent(content: string): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    const lowerContent = content.toLowerCase();

    // Check for harmful patterns
    for (const pattern of this.harmfulPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        threats.push({
          type: 'harmful-content',
          severity: this.determineSeverity(matches[0]),
          description: `Potentially harmful content detected: "${matches[0]}"`,
          confidence: 0.8,
          mitigation: 'Review content for policy violations. Consider content filtering or human review.'
        });
      }
    }

    // Check for bias indicators
    for (const indicator of this.biasIndicators) {
      if (lowerContent.includes(indicator.toLowerCase())) {
        threats.push({
          type: 'bias',
          severity: 'medium',
          description: `Potential bias detected: content contains "${indicator}"`,
          confidence: 0.6,
          mitigation: 'Review for potential bias. Consider bias detection training or diverse review panels.'
        });
      }
    }

    // Check for toxicity
    const toxicityScore = this.calculateToxicityScore(lowerContent);
    if (toxicityScore > 0.3) {
      threats.push({
        type: 'harmful-content',
        severity: toxicityScore > 0.7 ? 'high' : 'medium',
        description: `High toxicity score detected: ${toxicityScore.toFixed(2)}`,
        confidence: toxicityScore,
        mitigation: 'Content may be toxic or offensive. Consider content moderation or filtering.'
      });
    }

    return threats;
  }

  /**
   * Analyze content for bias
   */
  public analyzeBias(content: string): SecurityThreat[] {
    const threats: SecurityThreat[] = [];
    const lowerContent = content.toLowerCase();

    // Detailed bias analysis
    const biasTypes = {
      gender: ['he is better', 'she is worse', 'men are', 'women are'],
      racial: ['race is', 'ethnicity determines', 'people of color are'],
      age: ['older people', 'younger people', 'generation'],
      religious: ['religion makes', 'believers are', 'faith determines'],
      socioeconomic: ['class determines', 'wealth makes', 'poverty causes']
    };

    for (const [biasType, indicators] of Object.entries(biasTypes)) {
      for (const indicator of indicators) {
        if (lowerContent.includes(indicator)) {
          threats.push({
            type: 'bias',
            severity: 'medium',
            description: `Potential ${biasType} bias detected in content`,
            confidence: 0.7,
            mitigation: `Review content for ${biasType} bias. Consider diverse perspectives and inclusive language.`
          });
        }
      }
    }

    return threats;
  }

  /**
   * Calculate toxicity score based on keyword presence and frequency
   */
  private calculateToxicityScore(content: string): number {
    let score = 0;
    const words = content.split(/\s+/);
    const totalWords = words.length;

    for (const keyword of this.toxicityKeywords) {
      const occurrences = (content.match(new RegExp(keyword, 'gi')) || []).length;
      if (occurrences > 0) {
        // Score based on frequency and severity
        score += (occurrences / totalWords) * 0.5;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Determine severity based on detected content
   */
  private determineSeverity(match: string): 'low' | 'medium' | 'high' | 'critical' {
    const highSeverityTerms = ['kill', 'murder', 'bomb', 'weapon', 'suicide', 'harm'];
    const mediumSeverityTerms = ['hate', 'attack', 'destroy', 'illegal', 'fraud'];
    
    const lowerMatch = match.toLowerCase();
    
    if (highSeverityTerms.some(term => lowerMatch.includes(term))) {
      return 'critical';
    } else if (mediumSeverityTerms.some(term => lowerMatch.includes(term))) {
      return 'high';
    } else {
      return 'medium';
    }
  }
}