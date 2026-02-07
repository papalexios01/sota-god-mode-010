// E-E-A-T VALIDATOR - Experience, Expertise, Authoritativeness, Trustworthiness

export interface EEATScore {
  overall: number;
  experience: number;
  expertise: number;
  authoritativeness: number;
  trustworthiness: number;
  improvements: string[];
  signals: EEATSignal[];
}

export interface EEATSignal {
  type: 'experience' | 'expertise' | 'authoritativeness' | 'trustworthiness';
  signal: string;
  found: boolean;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

// Signal patterns for E-E-A-T detection
const EXPERIENCE_SIGNALS = [
  { pattern: /I('ve| have) (personally|actually|directly)/i, importance: 'high' as const, signal: 'First-person experience' },
  { pattern: /in my experience/i, importance: 'high' as const, signal: 'Personal experience statement' },
  { pattern: /after (testing|trying|using) (for|over) (\d+|several|many)/i, importance: 'high' as const, signal: 'Duration of experience' },
  { pattern: /when I (was|worked|started)/i, importance: 'medium' as const, signal: 'Professional background' },
  { pattern: /hands-on|first-hand/i, importance: 'medium' as const, signal: 'Direct experience claim' },
  { pattern: /case study|real(-| )world example/i, importance: 'high' as const, signal: 'Case study or real example' },
  { pattern: /client|customer|project we (did|completed)/i, importance: 'medium' as const, signal: 'Professional project reference' },
];

const EXPERTISE_SIGNALS = [
  { pattern: /according to (research|studies|data)/i, importance: 'high' as const, signal: 'Research-backed claims' },
  { pattern: /\d+(\.\d+)?%/g, importance: 'medium' as const, signal: 'Statistical data' },
  { pattern: /study (from|by|published)/i, importance: 'high' as const, signal: 'Academic study citation' },
  { pattern: /(university|institute|research center)/i, importance: 'high' as const, signal: 'Academic institution reference' },
  { pattern: /expert(s)? (say|recommend|suggest)/i, importance: 'medium' as const, signal: 'Expert citation' },
  { pattern: /technical|scientific|methodology/i, importance: 'medium' as const, signal: 'Technical terminology' },
  { pattern: /(best practice|industry standard)/i, importance: 'medium' as const, signal: 'Industry standard reference' },
  { pattern: /\[\d+\]|\(\d{4}\)/g, importance: 'high' as const, signal: 'Academic citation format' },
];

const AUTHORITATIVENESS_SIGNALS = [
  { pattern: /\.gov|\.edu|\.org/i, importance: 'critical' as const, signal: 'Authoritative domain reference' },
  { pattern: /(official|government|federal)/i, importance: 'high' as const, signal: 'Official source reference' },
  { pattern: /(peer-reviewed|published in)/i, importance: 'high' as const, signal: 'Peer-reviewed content' },
  { pattern: /(award|certified|accredited)/i, importance: 'medium' as const, signal: 'Credentials or awards' },
  { pattern: /(recognized|leading|established)/i, importance: 'low' as const, signal: 'Authority language' },
  { pattern: /founder|CEO|director|professor/i, importance: 'medium' as const, signal: 'Authority figure title' },
  { pattern: /years of experience|decade/i, importance: 'medium' as const, signal: 'Experience duration' },
];

const TRUSTWORTHINESS_SIGNALS = [
  { pattern: /updated|last (updated|reviewed|modified)/i, importance: 'high' as const, signal: 'Content freshness indicator' },
  { pattern: /(fact.?check|verified|reviewed by)/i, importance: 'critical' as const, signal: 'Fact-checking claim' },
  { pattern: /disclosure|affiliate|sponsored/i, importance: 'high' as const, signal: 'Transparency disclosure' },
  { pattern: /privacy policy|terms of service/i, importance: 'medium' as const, signal: 'Legal documentation' },
  { pattern: /contact us|customer support/i, importance: 'medium' as const, signal: 'Contact information' },
  { pattern: /money.?back|guarantee|refund/i, importance: 'medium' as const, signal: 'Trust guarantee' },
  { pattern: /(pros and cons|disadvantages|limitations)/i, importance: 'high' as const, signal: 'Balanced perspective' },
  { pattern: /however|on the other hand|that said/i, importance: 'medium' as const, signal: 'Nuanced discussion' },
];

export class EEATValidator {
  validateContent(content: string, authorInfo?: { name: string; credentials?: string[] }): EEATScore {
    const signals: EEATSignal[] = [];
    const improvements: string[] = [];

    // Check Experience signals
    const experienceResults = this.checkSignals(content, EXPERIENCE_SIGNALS, 'experience');
    signals.push(...experienceResults.signals);
    
    // Check Expertise signals
    const expertiseResults = this.checkSignals(content, EXPERTISE_SIGNALS, 'expertise');
    signals.push(...expertiseResults.signals);
    
    // Check Authoritativeness signals
    const authorityResults = this.checkSignals(content, AUTHORITATIVENESS_SIGNALS, 'authoritativeness');
    signals.push(...authorityResults.signals);
    
    // Check Trustworthiness signals
    const trustResults = this.checkSignals(content, TRUSTWORTHINESS_SIGNALS, 'trustworthiness');
    signals.push(...trustResults.signals);

    // Calculate scores
    const experience = this.calculateScore(experienceResults.found, experienceResults.total);
    const expertise = this.calculateScore(expertiseResults.found, expertiseResults.total);
    const authoritativeness = this.calculateScore(authorityResults.found, authorityResults.total);
    const trustworthiness = this.calculateScore(trustResults.found, trustResults.total);

    // Generate improvements
    if (experience < 60) {
      improvements.push('Add first-person experience statements and real-world examples');
    }
    if (expertise < 60) {
      improvements.push('Include more statistics, research citations, and data-backed claims');
    }
    if (authoritativeness < 60) {
      improvements.push('Reference authoritative sources (.gov, .edu, peer-reviewed)');
    }
    if (trustworthiness < 60) {
      improvements.push('Add update dates, fact-checking notices, and balanced perspectives');
    }

    let authorityBoost = 0;
    if (authorInfo?.credentials && authorInfo.credentials.length > 0) {
      authorityBoost = Math.min(15, authorInfo.credentials.length * 5);
      signals.push({
        type: 'authoritativeness',
        signal: `Author credentials: ${authorInfo.credentials.join(', ')}`,
        found: true,
        importance: 'high'
      });
    }

    const adjustedAuthority = Math.min(100, authoritativeness + authorityBoost);

    const overall = Math.round(
      (experience * 0.2) +
      (expertise * 0.3) +
      (adjustedAuthority * 0.25) +
      (trustworthiness * 0.25)
    );

    return {
      overall: Math.min(100, overall),
      experience,
      expertise,
      authoritativeness: adjustedAuthority,
      trustworthiness,
      improvements,
      signals
    };
  }

  private checkSignals(
    content: string,
    patterns: Array<{ pattern: RegExp; importance: 'critical' | 'high' | 'medium' | 'low'; signal: string }>,
    type: EEATSignal['type']
  ): { signals: EEATSignal[]; found: number; total: number } {
    const signals: EEATSignal[] = [];
    let found = 0;

    patterns.forEach(({ pattern, importance, signal }) => {
      const matches = content.match(pattern);
      const isFound = matches !== null && matches.length > 0;
      
      signals.push({
        type,
        signal,
        found: isFound,
        importance
      });

      if (isFound) {
        // Weight by importance
        const weight = importance === 'critical' ? 2 : importance === 'high' ? 1.5 : importance === 'medium' ? 1 : 0.5;
        found += weight;
      }
    });

    return { signals, found, total: patterns.length };
  }

  private calculateScore(found: number, total: number): number {
    if (total === 0) return 0;
    // Max weighted score is approximately total * 1.25 (average weight)
    const maxWeighted = total * 1.25;
    return Math.min(100, Math.round((found / maxWeighted) * 100));
  }

  generateEEATEnhancements(score: EEATScore): string[] {
    const enhancements: string[] = [];

    if (score.experience < 70) {
      enhancements.push('Add a "My Experience" or case study section');
      enhancements.push('Include specific timeframes ("After 6 months of testing...")');
    }

    if (score.expertise < 70) {
      enhancements.push('Add data tables with specific statistics');
      enhancements.push('Include quotes from industry experts');
      enhancements.push('Reference peer-reviewed studies');
    }

    if (score.authoritativeness < 70) {
      enhancements.push('Add author bio with credentials');
      enhancements.push('Link to .gov or .edu sources');
      enhancements.push('Include expert reviewer section');
    }

    if (score.trustworthiness < 70) {
      enhancements.push('Add "Last Updated" date');
      enhancements.push('Include a balanced pros/cons section');
      enhancements.push('Add affiliate/sponsorship disclosures if applicable');
    }

    return enhancements;
  }

  getEEATBadge(score: number): { text: string; color: string } {
    if (score >= 90) return { text: 'Excellent E-E-A-T', color: 'green' };
    if (score >= 75) return { text: 'Good E-E-A-T', color: 'blue' };
    if (score >= 60) return { text: 'Moderate E-E-A-T', color: 'yellow' };
    if (score >= 40) return { text: 'Needs Improvement', color: 'orange' };
    return { text: 'Poor E-E-A-T', color: 'red' };
  }
}

export function createEEATValidator(): EEATValidator {
  return new EEATValidator();
}

// Quick validation function
export function validateEEAT(content: string, authorInfo?: { name: string; credentials?: string[] }): EEATScore {
  const validator = new EEATValidator();
  return validator.validateContent(content, authorInfo);
}
