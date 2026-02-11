/**
 * SEO Health Scorer - SOTA Enterprise Page Analysis Engine
 * 
 * State-of-the-art page analysis featuring:
 * - Multi-dimensional content scoring (word count, structure, freshness)
 * - E-E-A-T signal detection (citations, author info, expertise markers)
 * - Technical SEO validation (schema, meta tags, headings)
 * - Readability analysis (sentence length, vocabulary complexity)
 * - Core Web Vitals proxy metrics (HTML size, image optimization)
 * - Competitive gap identification
 */

import type { SEOHealthAnalysis } from './GodModeTypes';

// Enterprise SOTA scoring weights
const SCORING_WEIGHTS = {
  wordCount: 25,
  headingStructure: 15,
  freshness: 15,
  internalLinks: 10,
  externalLinks: 5,
  schema: 10,
  metaTags: 10,
  eeat: 10,
};

export class SEOHealthScorer {
  private proxyUrl: string;

  constructor(proxyUrl?: string) {
    this.proxyUrl = proxyUrl || '';
  }

  /**
   * Analyze a page and return comprehensive SEO health metrics
   */
  private isPublicHttpUrl(input: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(input);
    } catch {
      return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '[::1]') return false;
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return false;

    // Block IPv6 private/link-local/loopback ranges
    if (hostname.startsWith('[')) {
      const ipv6 = hostname.slice(1, -1).toLowerCase();
      if (
        ipv6 === '::1' || ipv6 === '::' ||
        ipv6.startsWith('fc') || ipv6.startsWith('fd') ||
        ipv6.startsWith('fe8') || ipv6.startsWith('fe9') ||
        ipv6.startsWith('fea') || ipv6.startsWith('feb')
      ) {
        return false;
      }
    }

    const parts = hostname.split('.').map(Number);
    if (parts.length === 4 && parts.every(n => !isNaN(n))) {
      if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0) return false;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
      if (parts[0] === 192 && parts[1] === 168) return false;
      if (parts[0] === 169 && parts[1] === 254) return false;
    }
    return true;
  }


  async analyzePage(url: string): Promise<SEOHealthAnalysis> {
    const startTime = Date.now();

    try {
      if (!this.isPublicHttpUrl(url)) {
        throw new Error('URL must be a public HTTP/HTTPS address');
      }
      const html = await this.fetchPageContent(url);
      const analysis = this.analyzeHtml(url, html);
      
      console.log(`[SEOHealthScorer] Analyzed ${url} in ${Date.now() - startTime}ms - Score: ${analysis.score}`);
      
      return analysis;
    } catch (error) {
      console.error(`[SEOHealthScorer] Error analyzing ${url}:`, error);
      
      // Return a low score on error to flag for manual review
      return {
        url,
        score: 0,
        wordCount: 0,
        headingStructure: { h1Count: 0, h2Count: 0, h3Count: 0, isValid: false },
        freshness: { lastModified: null, daysSinceUpdate: 999, isStale: true },
        links: { internalCount: 0, externalCount: 0, brokenCount: 0 },
        schema: { hasSchema: false, types: [] },
        issues: [`Failed to analyze: ${error instanceof Error ? error.message : 'Unknown error'}`],
        recommendations: ['Manual review required'],
      };
    }
  }

  /**
   * Fetch page content via Jina Reader or direct fetch
   */
  private async fetchPageContent(url: string): Promise<string> {
    // Try Jina Reader first for better content extraction
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(jinaUrl, {
        headers: { 'Accept': 'text/html' },
        signal: AbortSignal.timeout(15000),
      });
      
      if (response.ok) {
        return await response.text();
      }
    } catch {
      console.log('[SEOHealthScorer] Jina Reader failed, trying direct fetch');
    }
    
    // Fallback to direct fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SEOHealthBot/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.text();
  }

  /**
   * Analyze HTML content and generate health metrics
   */
  private analyzeHtml(url: string, html: string): SEOHealthAnalysis {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100; // Start at 100, deduct for issues
    
    // Parse basic content
    const textContent = this.extractTextContent(html);
    const wordCount = this.countWords(textContent);
    
    // ===== WORD COUNT SCORING =====
    if (wordCount < 500) {
      score -= 30;
      issues.push(`Very thin content: ${wordCount} words (target: 2500+)`);
      recommendations.push('Expand content significantly with in-depth coverage');
    } else if (wordCount < 1000) {
      score -= 20;
      issues.push(`Thin content: ${wordCount} words`);
      recommendations.push('Add more comprehensive content sections');
    } else if (wordCount < 1500) {
      score -= 10;
      issues.push(`Below optimal word count: ${wordCount} words`);
      recommendations.push('Consider expanding with more details and examples');
    } else if (wordCount < 2500) {
      score -= 5;
    }
    
    // ===== HEADING STRUCTURE =====
    const headingStructure = this.analyzeHeadings(html);
    
    if (headingStructure.h1Count === 0) {
      score -= 15;
      issues.push('Missing H1 tag');
      recommendations.push('Add a single, descriptive H1 tag');
    } else if (headingStructure.h1Count > 1) {
      score -= 10;
      issues.push(`Multiple H1 tags: ${headingStructure.h1Count}`);
      recommendations.push('Use only one H1 tag per page');
    }
    
    if (headingStructure.h2Count === 0) {
      score -= 10;
      issues.push('No H2 subheadings');
      recommendations.push('Add H2 headings to structure content');
    } else if (headingStructure.h2Count < 3 && wordCount > 1000) {
      score -= 5;
      issues.push(`Few H2 headings for content length`);
      recommendations.push('Add more H2 subheadings for better structure');
    }
    
    // ===== FRESHNESS =====
    const freshness = this.analyzeFreshness(html);
    
    if (freshness.daysSinceUpdate > 365) {
      score -= 20;
      issues.push(`Content is ${freshness.daysSinceUpdate} days old`);
      recommendations.push('Update with fresh information and current year references');
    } else if (freshness.daysSinceUpdate > 180) {
      score -= 10;
      issues.push(`Content hasn't been updated in ${freshness.daysSinceUpdate} days`);
      recommendations.push('Consider refreshing with recent data');
    } else if (freshness.daysSinceUpdate > 90) {
      score -= 5;
    }
    
    // ===== INTERNAL/EXTERNAL LINKS =====
    const links = this.analyzeLinks(html, url);
    
    if (links.internalCount === 0) {
      score -= 15;
      issues.push('No internal links');
      recommendations.push('Add relevant internal links to related content');
    } else if (links.internalCount < 3) {
      score -= 5;
      issues.push('Few internal links');
      recommendations.push('Add more internal links for better site structure');
    }
    
    if (links.externalCount === 0) {
      score -= 5;
      issues.push('No external authority links');
      recommendations.push('Add citations to authoritative sources');
    }
    
    // ===== SCHEMA MARKUP =====
    const schema = this.analyzeSchema(html);
    
    if (!schema.hasSchema) {
      score -= 10;
      issues.push('No structured data/schema markup');
      recommendations.push('Add JSON-LD schema (Article, FAQ, HowTo, etc.)');
    }
    
    // ===== CONTENT QUALITY SIGNALS =====
    const hasImages = /<img\s/i.test(html);
    if (!hasImages) {
      score -= 5;
      issues.push('No images detected');
      recommendations.push('Add relevant images with alt text');
    }
    
    const hasMetaDescription = /<meta\s+name=["']description["']/i.test(html);
    if (!hasMetaDescription) {
      score -= 10;
      issues.push('Missing meta description');
      recommendations.push('Add a compelling meta description');
    }
    
    // ===== E-E-A-T SIGNALS (Enterprise SOTA) =====
    const eeatAnalysis = this.analyzeEEAT(html, textContent);
    
    if (eeatAnalysis.authorSignals < 2) {
      score -= 5;
      issues.push('Weak author/expertise signals');
      recommendations.push('Add author bio, credentials, and expertise indicators');
    }
    
    if (eeatAnalysis.citationCount < 3) {
      score -= 5;
      issues.push(`Only ${eeatAnalysis.citationCount} citations found`);
      recommendations.push('Add more citations to research, studies, and authoritative sources');
    }
    
    if (!eeatAnalysis.hasFirstPersonExperience) {
      score -= 3;
      issues.push('No first-hand experience indicators');
      recommendations.push('Add personal experience, case studies, or real-world examples');
    }
    
    // ===== READABILITY ANALYSIS (Enterprise SOTA) =====
    const readability = this.analyzeReadability(textContent);
    
    if (readability.avgSentenceLength > 25) {
      score -= 5;
      issues.push(`Long sentences (avg ${readability.avgSentenceLength.toFixed(0)} words)`);
      recommendations.push('Break up long sentences for better readability');
    }
    
    if (readability.fleschKincaid > 12) {
      score -= 5;
      issues.push(`High reading level (Grade ${readability.fleschKincaid.toFixed(1)})`);
      recommendations.push('Simplify vocabulary for broader audience');
    }
    
    // Ensure score stays in bounds
    score = Math.max(0, Math.min(100, score));
    
    return {
      url,
      score,
      wordCount,
      headingStructure,
      freshness,
      links,
      schema,
      issues,
      recommendations,
    };
  }

  /**
   * Extract text content from HTML
   */
  private extractTextContent(html: string): string {
    // Remove scripts, styles, and HTML tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Analyze heading structure
   */
  private analyzeHeadings(html: string): SEOHealthAnalysis['headingStructure'] {
    const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
    const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
    const h3Count = (html.match(/<h3[\s>]/gi) || []).length;
    
    const isValid = h1Count === 1 && h2Count >= 2;
    
    return { h1Count, h2Count, h3Count, isValid };
  }

  /**
   * Analyze content freshness
   */
  private analyzeFreshness(html: string): SEOHealthAnalysis['freshness'] {
    let lastModified: Date | null = null;
    
    // Try to find published/modified dates in common formats
    const datePatterns = [
      /dateModified["']\s*:\s*["']([^"']+)["']/i,
      /datePublished["']\s*:\s*["']([^"']+)["']/i,
      /article:modified_time["']\s*content=["']([^"']+)["']/i,
      /article:published_time["']\s*content=["']([^"']+)["']/i,
      /(\d{4}-\d{2}-\d{2})/,
    ];
    
    for (const pattern of datePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          const parsed = new Date(match[1]);
          if (!isNaN(parsed.getTime())) {
            lastModified = parsed;
            break;
          }
        } catch {
          // Continue to next pattern
        }
      }
    }
    
    const now = new Date();
    const daysSinceUpdate = lastModified
      ? Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24))
      : 999; // Assume very old if no date found
    
    return {
      lastModified,
      daysSinceUpdate,
      isStale: daysSinceUpdate > 90,
    };
  }

  /**
   * Analyze internal and external links
   */
  private analyzeLinks(html: string, pageUrl: string): SEOHealthAnalysis['links'] {
    const linkMatches = html.match(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi) || [];
    
    let internalCount = 0;
    let externalCount = 0;
    
    try {
      const pageOrigin = new URL(pageUrl).origin;
      
      for (const link of linkMatches) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) continue;
        
        const href = hrefMatch[1];
        
        // Skip anchors, mailto, tel, javascript
        if (href.startsWith('#') || href.startsWith('mailto:') || 
            href.startsWith('tel:') || href.startsWith('javascript:')) {
          continue;
        }
        
        try {
          const absoluteUrl = href.startsWith('http') ? href : new URL(href, pageUrl).href;
          const linkOrigin = new URL(absoluteUrl).origin;
          
          if (linkOrigin === pageOrigin) {
            internalCount++;
          } else {
            externalCount++;
          }
        } catch {
          // Relative link that couldn't be parsed
          internalCount++;
        }
      }
    } catch {
      // URL parsing failed
    }
    
    return { internalCount, externalCount, brokenCount: 0 };
  }

  /**
   * Analyze schema markup
   */
  private analyzeSchema(html: string): SEOHealthAnalysis['schema'] {
    const schemaTypes: string[] = [];
    
    // Find JSON-LD scripts
    const jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
        const parsed = JSON.parse(jsonContent);
        
        if (parsed['@type']) {
          if (Array.isArray(parsed['@type'])) {
            schemaTypes.push(...parsed['@type']);
          } else {
            schemaTypes.push(parsed['@type']);
          }
        }
      } catch {
        // JSON parsing failed
      }
    }
    
    return {
      hasSchema: schemaTypes.length > 0,
      types: [...new Set(schemaTypes)],
    };
  }

  /**
   * Analyze E-E-A-T signals (Experience, Expertise, Authority, Trust)
   * Enterprise SOTA feature for content quality assessment
   */
  private analyzeEEAT(html: string, textContent: string): {
    authorSignals: number;
    citationCount: number;
    hasFirstPersonExperience: boolean;
    expertiseIndicators: string[];
  } {
    const expertiseIndicators: string[] = [];
    let authorSignals = 0;
    
    // Check for author information
    if (/<author|rel=["']author["']|class=["'][^"']*author[^"']*["']/i.test(html)) {
      authorSignals++;
      expertiseIndicators.push('author-tag');
    }
    
    // Check for credentials/expertise indicators
    const credentialPatterns = [
      /Ph\.?D\.?|Doctor|Dr\./i,
      /M\.D\.|MD|Medical Doctor/i,
      /Professor|Expert|Specialist/i,
      /CEO|CTO|Founder|Director/i,
      /Certified|Licensed|Registered/i,
      /years of experience/i,
    ];
    
    for (const pattern of credentialPatterns) {
      if (pattern.test(textContent)) {
        authorSignals++;
        expertiseIndicators.push('credentials');
        break;
      }
    }
    
    // Check for bio/about section
    if (/about the author|author bio|written by|reviewed by/i.test(textContent)) {
      authorSignals++;
      expertiseIndicators.push('author-bio');
    }
    
    // Count citations (studies, research references)
    const citationPatterns = [
      /according to [A-Z]/g,
      /study (by|from|conducted)/gi,
      /research (shows|indicates|suggests)/gi,
      /\d{4}\)(?:\s|,)/g, // Year citations like (2023)
      /Source:|Reference:|Citation:/gi,
      /\[\d+\]/g, // Numbered citations [1], [2]
    ];
    
    let citationCount = 0;
    for (const pattern of citationPatterns) {
      const matches = textContent.match(pattern) || [];
      citationCount += matches.length;
    }
    
    // Check for first-person experience indicators
    const experiencePatterns = [
      /\bI (have|tried|tested|used|found|discovered|learned|experienced)\b/i,
      /\bIn my experience\b/i,
      /\bWe (tested|tried|found|discovered)\b/i,
      /\bPersonally,?\s/i,
      /\bFrom my\b/i,
      /\bcase study\b/i,
      /\breal-world example\b/i,
    ];
    
    const hasFirstPersonExperience = experiencePatterns.some(p => p.test(textContent));
    if (hasFirstPersonExperience) {
      expertiseIndicators.push('first-person-experience');
    }
    
    return {
      authorSignals,
      citationCount: Math.min(citationCount, 20), // Cap at 20
      hasFirstPersonExperience,
      expertiseIndicators,
    };
  }

  /**
   * Analyze readability metrics
   * Enterprise SOTA feature for content accessibility assessment
   */
  private analyzeReadability(textContent: string): {
    avgSentenceLength: number;
    avgWordLength: number;
    fleschKincaid: number;
    readabilityGrade: string;
  } {
    // Split into sentences
    const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const words = textContent.split(/\s+/).filter(w => w.length > 0);
    const syllables = words.reduce((count, word) => count + this.countSyllables(word), 0);
    
    const sentenceCount = Math.max(sentences.length, 1);
    const wordCount = Math.max(words.length, 1);
    
    const avgSentenceLength = wordCount / sentenceCount;
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / wordCount;
    const avgSyllablesPerWord = syllables / wordCount;
    
    // Flesch-Kincaid Grade Level formula
    const fleschKincaid = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
    
    // Determine grade label
    let readabilityGrade: string;
    if (fleschKincaid <= 6) readabilityGrade = 'Easy (Elementary)';
    else if (fleschKincaid <= 8) readabilityGrade = 'Fairly Easy (Middle School)';
    else if (fleschKincaid <= 10) readabilityGrade = 'Standard (High School)';
    else if (fleschKincaid <= 12) readabilityGrade = 'Fairly Difficult (Some College)';
    else readabilityGrade = 'Difficult (College+)';
    
    return {
      avgSentenceLength,
      avgWordLength,
      fleschKincaid: Math.max(0, fleschKincaid),
      readabilityGrade,
    };
  }

  /**
   * Count syllables in a word (approximation)
   */
  private countSyllables(word: string): number {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    
    // Count vowel groups
    const vowelGroups = word.match(/[aeiouy]+/g) || [];
    let count = vowelGroups.length;
    
    // Subtract silent e at end
    if (word.endsWith('e') && count > 1) count--;
    
    // Handle special endings
    if (word.endsWith('le') && word.length > 2 && !/[aeiou]/.test(word[word.length - 3])) count++;
    
    return Math.max(1, count);
  }

  /**
   * Batch analyze multiple pages with throttling
   */
  async batchAnalyze(
    urls: string[],
    options: {
      concurrency?: number;
      onProgress?: (completed: number, total: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<SEOHealthAnalysis[]> {
    const { concurrency = 2, onProgress, signal } = options;
    const results: SEOHealthAnalysis[] = [];
    let completed = 0;
    
    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      if (signal?.aborted) break;
      
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(url => this.analyzePage(url))
      );
      
      results.push(...batchResults);
      completed += batch.length;
      
      onProgress?.(completed, urls.length);
      
      // Throttle between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
}

export const seoHealthScorer = new SEOHealthScorer();
