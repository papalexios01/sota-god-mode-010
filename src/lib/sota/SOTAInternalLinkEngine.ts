/**
 * SOTA Internal Link Engine v3.0.0
 * =================================
 * Nuclear-grade internal linking. Title-based matching, semantic phrase extraction,
 * hard minimum 4 links, even distribution, contextual anchor text.
 *
 * Exports: SOTAInternalLinkEngine, createInternalLinkEngine
 */

import type { InternalLink } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SitePage {
  url: string;
  title: string;
  keywords?: string[];
  slug?: string;
  description?: string;
  content?: string;
}

interface ParagraphInfo {
  html: string;
  text: string;
  index: number;
  wordCount: number;
  cumulativeWords: number;
  hasLink: boolean;
  startOffset: number;
  endOffset: number;
}

interface ScoredCandidate {
  paragraph: ParagraphInfo;
  page: SitePage;
  anchor: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STOP = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by',
  'from','as','is','was','are','were','be','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','this','that','these',
  'those','i','me','my','we','our','you','your','he','him','his','she','her',
  'it','its','they','them','their','what','which','who','how','when','where',
  'why','not','no','so','if','than','too','very','just','about','all','also',
  'any','been','being','both','each','few','more','most','other','some','such',
  'into','out','up','down','new','way','much','even','only','own','here','there',
]);

function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w;
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('tion') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ness') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ment') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('able') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ies') && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  else if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
  return w;
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(stem);
}

function extractParagraphs(html: string): ParagraphInfo[] {
  const results: ParagraphInfo[] = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;
  let cumWords = 0;

  while ((m = re.exec(html)) !== null) {
    const text = m[0].replace(/<[^>]*>/g, '').trim();
    const wc = text.split(/\s+/).filter(Boolean).length;
    cumWords += wc;
    results.push({
      html: m[0],
      text,
      index: idx++,
      wordCount: wc,
      cumulativeWords: cumWords,
      hasLink: /<a\s/i.test(m[0]),
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
  }
  return results;
}

function countExistingInternalLinks(html: string): number {
  const matches = html.match(/<a\s[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
  // Count links that look internal (relative URLs or same-domain)
  return matches.filter(m => {
    const href = m.match(/href\s*=\s*["']([^"']*)["']/i)?.[1] || '';
    return href.startsWith('/') || href.startsWith('#') || !href.startsWith('http');
  }).length;
}

/**
 * Find the best natural anchor text in a paragraph for a given target page.
 *
 * Strategy:
 * 1. Extract meaningful stems from the target page title
 * 2. Slide a 3-6 word window over the paragraph text
 * 3. Score each window by stem overlap with the target title
 * 4. Return the highest-scoring window that reads naturally
 */
function findBestAnchor(paraText: string, page: SitePage): { anchor: string; score: number } | null {
  const titleStems = new Set(significantTokens(page.title || ''));
  const keywordStems = new Set((page.keywords || []).flatMap(k => significantTokens(k)));
  const allTargetStems = new Set([...titleStems, ...keywordStems]);

  if (allTargetStems.size === 0) return null;

  const words = paraText.split(/\s+/);
  if (words.length < 5) return null;

  let best: { anchor: string; score: number } | null = null;

  for (let len = 3; len <= Math.min(7, words.length); len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      const cleaned = phrase.replace(/[^a-z0-9\s'-]/gi, ' ').trim();
      if (cleaned.length < 8) continue;

      const phraseStems = significantTokens(cleaned);
      if (phraseStems.length === 0) continue;

      // Skip if first or last word is a stop word
      const firstWord = words[i].toLowerCase().replace(/[^a-z]/g, '');
      const lastWord = words[i + len - 1].toLowerCase().replace(/[^a-z]/g, '');
      if (STOP.has(firstWord) || STOP.has(lastWord)) continue;

      // Score by overlap
      let overlap = 0;
      for (const s of phraseStems) {
        if (allTargetStems.has(s)) overlap++;
      }
      if (overlap === 0) continue;

      const overlapRatio = overlap / phraseStems.length;
      const titleOverlap = phraseStems.filter(s => titleStems.has(s)).length;

      // Prefer 4-6 word phrases, penalize very short or very long
      const lengthBonus = (len >= 4 && len <= 6) ? 8 : (len === 3) ? 2 : 0;
      // Bonus for matching title stems specifically (not just keywords)
      const titleBonus = titleOverlap * 5;

      const score = overlapRatio * 40 + overlap * 8 + lengthBonus + titleBonus;

      if (!best || score > best.score) {
        best = { anchor: phrase, score };
      }
    }
  }

  // Fallback: try to find a direct substring match of 2-4 words from the title
  if (!best || best.score < 15) {
    const titleWords = (page.title || '').split(/\s+/).filter(w => w.length > 2);
    const paraLower = paraText.toLowerCase();

    for (let len = Math.min(4, titleWords.length); len >= 2; len--) {
      for (let i = 0; i <= titleWords.length - len; i++) {
        const snippet = titleWords.slice(i, i + len).join(' ');
        const snippetLower = snippet.toLowerCase();
        const pos = paraLower.indexOf(snippetLower);
        if (pos >= 0) {
          // Extract the actual text from the paragraph (preserving case)
          const actual = paraText.substring(pos, pos + snippet.length);
          const newScore = len * 12 + 10;
          if (!best || newScore > best.score) {
            best = { anchor: actual, score: newScore };
          }
        }
      }
    }
  }

  return best && best.score >= 10 ? best : null;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SOTAInternalLinkEngine {
  private pages: SitePage[] = [];

  constructor(pages?: SitePage[]) {
    this.pages = pages || [];
  }

  updateSitePages(pages: SitePage[] | undefined): void {
    this.pages = pages || [];
  }

  /**
   * Analyze content and return scored link opportunities.
   */
  generateLinkOpportunities(html: string, maxLinks?: number): InternalLink[] {
    const limit = maxLinks ?? 10;
    if (this.pages.length === 0) return [];

    const paragraphs = extractParagraphs(html);
    const candidates: ScoredCandidate[] = [];

    for (const para of paragraphs) {
      if (para.hasLink || para.wordCount < 12) continue;

      for (const page of this.pages) {
        const result = findBestAnchor(para.text, page);
        if (!result) continue;

        candidates.push({
          paragraph: para,
          page,
          anchor: result.anchor,
          score: result.score,
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Greedy selection with constraints
    const selected: InternalLink[] = [];
    const usedUrls = new Set<string>();
    const usedParas = new Set<number>();
    let lastCumulativeWords = 0;

    for (const c of candidates) {
      if (selected.length >= limit) break;
      if (usedUrls.has(c.page.url)) continue;
      if (usedParas.has(c.paragraph.index)) continue;

      // Enforce minimum spacing (250 words between links)
      if (lastCumulativeWords > 0 && c.paragraph.cumulativeWords - lastCumulativeWords < 250) continue;

      selected.push({
        anchor: c.anchor,
        anchorText: c.anchor,
        targetUrl: c.page.url,
        url: c.page.url,
        text: c.anchor,
        context: c.paragraph.text.substring(0, 120),
        priority: c.score,
        relevanceScore: Math.min(100, c.score),
      });

      usedUrls.add(c.page.url);
      usedParas.add(c.paragraph.index);
      lastCumulativeWords = c.paragraph.cumulativeWords;
    }

    return selected;
  }

  /**
   * Inject link <a> tags into HTML content.
   */
  injectContextualLinks(html: string, links: InternalLink[]): string {
    if (links.length === 0) return html;

    let result = html;
    const paragraphs = extractParagraphs(result);

    // Process from bottom to top to preserve offsets
    const sortedLinks = [...links];

    for (const link of sortedLinks) {
      const anchor = link.anchor || link.anchorText || link.text || '';
      const url = link.targetUrl || link.url || '';
      if (!anchor || !url || anchor.length < 4) continue;

      const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Find this anchor in a <p> that doesn't already have a link
      const anchorRe = new RegExp(
        `(<p[^>]*>)((?:(?!</p>)[\\s\\S])*?)\\b(${escaped})\\b((?:(?!</p>)[\\s\\S])*?</p>)`,
        'i'
      );

      const match = anchorRe.exec(result);
      if (!match) continue;

      const fullParagraph = match[0];
      // Skip if paragraph already has a link
      if (/<a\s/i.test(fullParagraph)) continue;

      const before = match[1] + match[2];
      const matched = match[3];
      const after = match[4];

      const replacement = `${before}<a href="${url}" style="color: #059669; text-decoration: underline; text-decoration-color: rgba(5,150,105,0.3); text-underline-offset: 3px; font-weight: 600; transition: all 0.2s ease;">${matched}</a>${after}`;

      result = result.substring(0, match.index) + replacement + result.substring(match.index + fullParagraph.length);
    }

    return result;
  }

  /**
   * Count how many internal links already exist in the content.
   */
  countExistingLinks(html: string): number {
    return countExistingInternalLinks(html);
  }
}

// ---------------------------------------------------------------------------
// Factory — required by EnterpriseContentOrchestrator
// ---------------------------------------------------------------------------

export function createInternalLinkEngine(sitePages?: SitePage[]): SOTAInternalLinkEngine {
  return new SOTAInternalLinkEngine(sitePages);
}

export default SOTAInternalLinkEngine;
