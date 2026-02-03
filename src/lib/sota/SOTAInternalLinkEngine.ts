// ============================================================
// SOTA INTERNAL LINK ENGINE v3.0 - ENTERPRISE CONTEXTUAL LINKING
// 100% real URLs from crawled sitemap with 3-7 word rich anchors
// ============================================================

import type { InternalLink } from './types';

export interface SitePage {
  url: string;
  title: string;
  keywords?: string[];
  category?: string;
}

interface AnchorCandidate {
  anchor: string;
  page: SitePage;
  startIndex: number;
  endIndex: number;
  score: number;
  context: string;
}

export class SOTAInternalLinkEngine {
  private sitePages: SitePage[];
  private stopWords: Set<string>;

  constructor(sitePages: SitePage[] = []) {
    this.sitePages = sitePages;
    this.stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
      'which', 'who', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
      'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then'
    ]);
  }

  updateSitePages(pages: SitePage[]): void {
    this.sitePages = pages;
    console.log(`[InternalLinkEngine] Updated with ${pages.length} site pages`);
  }

  /**
   * Generate HIGH-QUALITY internal link opportunities
   * Only returns links with 3-7 word contextual anchor text
   */
  generateLinkOpportunities(content: string, maxLinks: number = 10): InternalLink[] {
    if (this.sitePages.length === 0) {
      console.log('[InternalLinkEngine] No site pages available - skipping internal links');
      return [];
    }

    console.log(`[InternalLinkEngine] Scanning content for links to ${this.sitePages.length} pages`);
    
    // Strip existing links to avoid re-linking
    const contentWithoutLinks = content.replace(/<a[^>]*>.*?<\/a>/gi, '');
    const plainText = this.stripHtml(contentWithoutLinks);
    
    const candidates: AnchorCandidate[] = [];
    const usedUrls = new Set<string>();
    const usedRanges: Array<[number, number]> = [];

    // For each page, find the BEST contextual anchor in the content
    for (const page of this.sitePages) {
      const pageAnchors = this.findContextualAnchors(plainText, page);
      
      for (const anchor of pageAnchors) {
        // Check if this range overlaps with existing anchors
        const overlaps = usedRanges.some(([start, end]) => 
          (anchor.startIndex >= start && anchor.startIndex < end) ||
          (anchor.endIndex > start && anchor.endIndex <= end)
        );
        
        if (!overlaps && !usedUrls.has(page.url)) {
          candidates.push(anchor);
        }
      }
    }

    // Sort by score (highest first) and take top N
    const sortedCandidates = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLinks);

    // Convert to InternalLink format
    const links: InternalLink[] = sortedCandidates.map(c => {
      usedUrls.add(c.page.url);
      usedRanges.push([c.startIndex, c.endIndex]);
      
      return {
        anchor: c.anchor,
        targetUrl: c.page.url,
        context: c.context,
        priority: Math.min(100, c.score),
        relevanceScore: Math.min(100, c.score)
      };
    });

    console.log(`[InternalLinkEngine] Found ${links.length} high-quality link opportunities`);
    links.forEach(l => console.log(`  → "${l.anchor}" → ${l.targetUrl}`));
    
    return links;
  }

  /**
   * Find contextual 3-7 word anchor phrases that match a page topic
   */
  private findContextualAnchors(text: string, page: SitePage): AnchorCandidate[] {
    const candidates: AnchorCandidate[] = [];
    const textLower = text.toLowerCase();
    
    // Extract page topic keywords from title and URL
    const titleWords = this.extractKeywordsFromTitle(page.title);
    const slugWords = this.extractKeywordsFromSlug(page.url);
    const pageKeywords = [...new Set([...titleWords, ...slugWords, ...(page.keywords || [])])];
    
    if (pageKeywords.length === 0) return [];

    // Split text into sentences for context extraction
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const sentenceStart = text.indexOf(sentence);
      if (sentenceStart === -1) continue;
      
      // Find phrases containing page keywords
      for (const keyword of pageKeywords) {
        if (keyword.length < 4) continue;
        
        const keywordIndex = sentenceLower.indexOf(keyword.toLowerCase());
        if (keywordIndex === -1) continue;
        
        // Extract 3-7 word phrase around the keyword
        const phrase = this.extractPhraseAroundKeyword(sentence, keywordIndex, keyword.length);
        
        if (phrase && phrase.wordCount >= 3 && phrase.wordCount <= 7) {
          const globalStart = sentenceStart + phrase.startOffset;
          const globalEnd = globalStart + phrase.text.length;
          
          // Score based on relevance
          const score = this.calculateAnchorScore(phrase.text, page, pageKeywords);
          
          if (score >= 40) {
            candidates.push({
              anchor: phrase.text,
              page,
              startIndex: globalStart,
              endIndex: globalEnd,
              score,
              context: sentence.trim().substring(0, 150)
            });
          }
        }
      }
    }
    
    // Return best candidate for this page
    return candidates.sort((a, b) => b.score - a.score).slice(0, 1);
  }

  /**
   * Extract a natural 3-7 word phrase around a keyword
   */
  private extractPhraseAroundKeyword(
    sentence: string, 
    keywordIndex: number, 
    keywordLength: number
  ): { text: string; wordCount: number; startOffset: number } | null {
    const words = sentence.split(/\s+/);
    const positions: Array<{ word: string; start: number; end: number }> = [];
    
    let pos = 0;
    for (const word of words) {
      const start = sentence.indexOf(word, pos);
      positions.push({ word, start, end: start + word.length });
      pos = start + word.length;
    }
    
    // Find which word contains the keyword
    let keywordWordIndex = -1;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].start <= keywordIndex && positions[i].end >= keywordIndex) {
        keywordWordIndex = i;
        break;
      }
    }
    
    if (keywordWordIndex === -1) return null;
    
    // Try different phrase lengths (prefer 4-5 words)
    const phraseLengths = [5, 4, 6, 3, 7];
    
    for (const len of phraseLengths) {
      // Try centering the phrase around the keyword
      const halfLen = Math.floor(len / 2);
      let startIdx = Math.max(0, keywordWordIndex - halfLen);
      let endIdx = Math.min(positions.length - 1, startIdx + len - 1);
      
      // Adjust if we hit the end
      if (endIdx - startIdx + 1 < len) {
        startIdx = Math.max(0, endIdx - len + 1);
      }
      
      const phraseWords = positions.slice(startIdx, endIdx + 1);
      if (phraseWords.length < 3) continue;
      
      const phraseText = phraseWords.map(p => p.word).join(' ');
      const cleanPhrase = this.cleanAnchorText(phraseText);
      
      if (cleanPhrase && this.isValidAnchor(cleanPhrase)) {
        return {
          text: cleanPhrase,
          wordCount: cleanPhrase.split(/\s+/).length,
          startOffset: phraseWords[0].start
        };
      }
    }
    
    return null;
  }

  /**
   * Clean and normalize anchor text
   */
  private cleanAnchorText(text: string): string {
    return text
      .replace(/^[^a-zA-Z0-9]+/, '') // Remove leading punctuation
      .replace(/[^a-zA-Z0-9]+$/, '') // Remove trailing punctuation
      .replace(/\s+/g, ' ')          // Normalize whitespace
      .trim();
  }

  /**
   * Validate that anchor text is high quality
   */
  private isValidAnchor(text: string): boolean {
    const words = text.split(/\s+/);
    
    // Must be 3-7 words
    if (words.length < 3 || words.length > 7) return false;
    
    // At least 2 meaningful words (not stop words)
    const meaningfulWords = words.filter(w => 
      w.length > 2 && !this.stopWords.has(w.toLowerCase())
    );
    if (meaningfulWords.length < 2) return false;
    
    // No weird characters
    if (/[<>{}[\]|\\^]/.test(text)) return false;
    
    // Not too short or too long
    if (text.length < 15 || text.length > 70) return false;
    
    return true;
  }

  /**
   * Calculate relevance score for anchor-page match
   */
  private calculateAnchorScore(anchor: string, page: SitePage, pageKeywords: string[]): number {
    let score = 50; // Base score
    const anchorLower = anchor.toLowerCase();
    const titleLower = page.title.toLowerCase();
    
    // Title word match bonus
    const titleWords = titleLower.split(/\s+/).filter(w => w.length > 3);
    const anchorWords = anchorLower.split(/\s+/);
    
    for (const titleWord of titleWords) {
      if (anchorWords.some(aw => aw.includes(titleWord) || titleWord.includes(aw))) {
        score += 15;
      }
    }
    
    // Keyword match bonus
    for (const keyword of pageKeywords) {
      if (anchorLower.includes(keyword.toLowerCase())) {
        score += 20;
      }
    }
    
    // Phrase naturalness bonus (4-5 words is ideal)
    const wordCount = anchor.split(/\s+/).length;
    if (wordCount === 4 || wordCount === 5) {
      score += 10;
    }
    
    // Penalize very short anchors
    if (anchor.length < 20) {
      score -= 15;
    }
    
    return Math.min(100, score);
  }

  /**
   * Extract meaningful keywords from page title
   */
  private extractKeywordsFromTitle(title: string): string[] {
    return title
      .toLowerCase()
      .split(/[\s\-_:,|]+/)
      .filter(w => w.length > 3 && !this.stopWords.has(w))
      .slice(0, 5);
  }

  /**
   * Extract keywords from URL slug
   */
  private extractKeywordsFromSlug(url: string): string[] {
    try {
      const pathname = new URL(url).pathname;
      const slug = pathname.split('/').filter(Boolean).pop() || '';
      return slug
        .split(/[\-_]+/)
        .filter(w => w.length > 3 && !this.stopWords.has(w.toLowerCase()));
    } catch {
      return [];
    }
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Inject internal links into HTML content
   * Uses exact matching to find and replace anchor text
   */
  injectContextualLinks(content: string, links: InternalLink[]): string {
    if (links.length === 0) return content;
    
    let modifiedContent = content;
    const injectedAnchors = new Set<string>();
    let injectedCount = 0;

    // Sort by anchor length (longer first) to avoid partial replacements
    const sortedLinks = [...links].sort((a, b) => 
      (b.anchor?.length || 0) - (a.anchor?.length || 0)
    );

    for (const link of sortedLinks) {
      const anchor = link.anchor || '';
      if (!anchor || !link.targetUrl) continue;
      if (injectedAnchors.has(anchor.toLowerCase())) continue;
      
      try {
        // Create regex that matches the anchor but NOT inside existing links
        const escapedAnchor = this.escapeRegex(anchor);
        
        // Match anchor text that is NOT inside an <a> tag
        // Use negative lookbehind for <a...> and negative lookahead for </a>
        const regex = new RegExp(
          `(?<!<a[^>]*>)(?<![">])\\b(${escapedAnchor})\\b(?![^<]*<\\/a>)`,
          'i'
        );
        
        const match = modifiedContent.match(regex);
        if (match && match.index !== undefined) {
          const actualText = modifiedContent.substring(match.index, match.index + match[0].length);
          
          // Create the link with helpful title attribute
          const linkHtml = `<a href="${link.targetUrl}" title="Learn more about ${anchor}">${actualText}</a>`;
          
          modifiedContent = 
            modifiedContent.slice(0, match.index) + 
            linkHtml + 
            modifiedContent.slice(match.index + match[0].length);
          
          injectedAnchors.add(anchor.toLowerCase());
          injectedCount++;
          
          console.log(`[InternalLinkEngine] ✅ Linked: "${anchor}" → ${link.targetUrl}`);
        }
      } catch (e) {
        console.warn(`[InternalLinkEngine] Regex error for "${anchor}":`, e);
      }
    }

    console.log(`[InternalLinkEngine] Successfully injected ${injectedCount}/${links.length} links`);
    return modifiedContent;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Get topic clusters from site pages
   */
  identifyTopicClusters(): Map<string, SitePage[]> {
    const clusters = new Map<string, SitePage[]>();

    for (const page of this.sitePages) {
      const category = page.category || 'general';
      if (!clusters.has(category)) {
        clusters.set(category, []);
      }
      clusters.get(category)!.push(page);
    }

    return clusters;
  }

  /**
   * Get suggested internal links for a specific page
   */
  getSuggestedLinksForPage(currentUrl: string): SitePage[] {
    const current = this.sitePages.find(p => p.url === currentUrl);
    if (!current) return [];

    return this.sitePages
      .filter(p => p.url !== currentUrl)
      .map(page => ({
        page,
        score: this.calculatePageSimilarity(current, page)
      }))
      .filter(item => item.score > 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(item => item.page);
  }

  private calculatePageSimilarity(page1: SitePage, page2: SitePage): number {
    let score = 0;

    // Same category
    if (page1.category && page1.category === page2.category) {
      score += 40;
    }

    // Keyword overlap
    if (page1.keywords && page2.keywords) {
      const overlap = page1.keywords.filter(k => page2.keywords!.includes(k)).length;
      score += overlap * 15;
    }

    // Title word overlap
    const words1 = new Set(page1.title.toLowerCase().split(' '));
    const words2 = new Set(page2.title.toLowerCase().split(' '));
    const titleOverlap = [...words1].filter(w => words2.has(w) && !this.stopWords.has(w)).length;
    score += titleOverlap * 10;

    return score;
  }
}

export function createInternalLinkEngine(sitePages?: SitePage[]): SOTAInternalLinkEngine {
  return new SOTAInternalLinkEngine(sitePages || []);
}
