// QUALITY VALIDATOR - Multi-Layer Content Validation

import type { QualityScore, ContentMetrics } from './types';

// AI trigger phrases to detect and remove
const AI_TRIGGER_PHRASES = [
  'as an ai',
  'as a language model',
  'i can\'t browse the web',
  'in this article',
  'this article will',
  'we will explore',

  'in conclusion',
  'it\'s important to note',
  'it is worth noting',
  'as we can see',
  'in today\'s world',
  'in the ever-evolving',
  'in this comprehensive guide',
  'delve into',
  'delves into',
  'dive deep into',
  'at the end of the day',
  'first and foremost',
  'needless to say',
  'without further ado',
  'in a nutshell',
  'the bottom line is',
  'to summarize',
  'in summary',
  'to sum up',
  'as mentioned earlier',
  'as previously mentioned',
  'it goes without saying',
  'interestingly enough',
  'as a matter of fact',
  'for all intents and purposes',
  'revolutionize',
  'game-changer',
  'cutting-edge',
  'state-of-the-art',
  'leverage',
  'synergy',
  'paradigm shift',
  'holistic approach',
  'robust solution',
  'seamlessly',
  'empower',
  'utilize'
];

function countSyllables(word: string): number {
  word = word.toLowerCase().trim().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let prevIsVowel = false;

  for (let i = 0; i < word.length; i++) {
    const isVowel = vowels.includes(word[i]);
    if (isVowel && !prevIsVowel) count++;
    prevIsVowel = isVowel;
  }

  if (word.endsWith('e') && !word.endsWith('le') && count > 1) count--;
  if (word.endsWith('ed') && !word.endsWith('ted') && !word.endsWith('ded') && count > 1) count--;
  if (word.endsWith('es') && !word.endsWith('ses') && !word.endsWith('zes') && count > 1) count--;

  return Math.max(1, count);
}

function calculateFleschKincaid(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  if (sentences.length === 0 || words.length === 0) return 0;
  
  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  
  const avgWordsPerSentence = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;
  
  // Flesch-Kincaid Grade Level
  return 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
}

export function analyzeContent(content: string): ContentMetrics {
  // Strip HTML tags for text analysis
  const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  const words = textContent.split(/\s+/).filter(w => w.length > 0);
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = content.split(/<\/p>|<br\s*\/?>\s*<br\s*\/?>/gi).filter(p => p.trim().length > 0);
  
  // Count headings
  const h1Count = (content.match(/<h1[^>]*>/gi) || []).length;
  const h2Count = (content.match(/<h2[^>]*>/gi) || []).length;
  const h3Count = (content.match(/<h3[^>]*>/gi) || []).length;
  const headingCount = h1Count + h2Count + h3Count;
  
  // Count images
  const imageCount = (content.match(/<img[^>]*>/gi) || []).length;
  
  // Count links
  const linkCount = (content.match(/<a[^>]*href/gi) || []).length;
  
  // Calculate readability
  const readabilityGrade = calculateFleschKincaid(textContent);
  
  // Estimated read time (average 200 words per minute)
  const estimatedReadTime = Math.ceil(words.length / 200);
  
  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    paragraphCount: paragraphs.length,
    headingCount,
    imageCount,
    linkCount,
    keywordDensity: 0, // Calculate separately with keyword
    readabilityGrade,
    estimatedReadTime
  };
}

export function calculateKeywordDensity(content: string, keyword: string): number {
  const textContent = content.replace(/<[^>]*>/g, ' ').toLowerCase();
  const words = textContent.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;

  const keywordLower = keyword.toLowerCase().trim();
  const keywordParts = keywordLower.split(/\s+/);

  if (keywordParts.length === 1) {
    const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = textContent.match(regex);
    return ((matches?.length || 0) / words.length) * 100;
  }

  const fullText = words.join(' ');
  const escaped = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
  const matches = fullText.match(regex);
  return ((matches?.length || 0) / words.length) * 100;
}

export function detectAITriggerPhrases(content: string): string[] {
  const lowerContent = content.toLowerCase();
  return AI_TRIGGER_PHRASES.filter(phrase => lowerContent.includes(phrase));
}

export function calculateQualityScore(
  content: string,
  keyword: string,
  existingLinks: string[] = []
): QualityScore {
  const metrics = analyzeContent(content);
  const aiPhrases = detectAITriggerPhrases(content);
  const keywordDensity = calculateKeywordDensity(content, keyword);
  const contentLower = content.toLowerCase();
  const textContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const internalLinks = existingLinks.length;

  const improvements: string[] = [];

  // --- READABILITY (0-100) ---
  const readabilityScore = (() => {
    let score = 0;
    if (metrics.readabilityGrade >= 5 && metrics.readabilityGrade <= 10) {
      score += 50;
    } else if (metrics.readabilityGrade >= 4 && metrics.readabilityGrade <= 12) {
      score += 35;
      improvements.push('Adjust reading level closer to grade 6-9');
    } else {
      score += 15;
      improvements.push(metrics.readabilityGrade > 12 ? 'Simplify language significantly' : 'Add more depth');
    }

    const avgWordsPerSentence = metrics.wordCount / Math.max(metrics.sentenceCount, 1);
    if (avgWordsPerSentence <= 20) score += 20;
    else if (avgWordsPerSentence <= 25) score += 12;
    else { score += 5; improvements.push('Shorten sentences for readability'); }

    const avgWordsPerParagraph = metrics.wordCount / Math.max(metrics.paragraphCount, 1);
    if (avgWordsPerParagraph >= 30 && avgWordsPerParagraph <= 150) score += 15;
    else if (avgWordsPerParagraph < 30) score += 10;
    else { score += 5; improvements.push('Break up long paragraphs'); }

    const hasContractions = /\b(don't|won't|can't|it's|that's|we're|you'll|they've|doesn't|isn't|wasn't|aren't|couldn't|wouldn't|shouldn't)\b/i.test(textContent);
    if (hasContractions) score += 8;

    const hasQuestions = /\?/.test(textContent);
    if (hasQuestions) score += 7;

    return Math.min(100, score);
  })();

  // --- SEO (0-100) ---
  const seoScore = (() => {
    let score = 0;

    if (keywordDensity >= 0.8 && keywordDensity <= 3.0) score += 30;
    else if (keywordDensity >= 0.5 && keywordDensity <= 4.0) { score += 20; improvements.push('Fine-tune keyword density'); }
    else { score += 5; improvements.push(`Adjust keyword density (currently ${keywordDensity.toFixed(1)}%)`); }

    if (metrics.headingCount >= 8) score += 25;
    else if (metrics.headingCount >= 5) score += 20;
    else if (metrics.headingCount >= 3) { score += 12; improvements.push('Add more headings for structure'); }
    else { score += 4; improvements.push('Add H2/H3 headings throughout'); }

    if (internalLinks >= 8) score += 20;
    else if (internalLinks >= 5) score += 15;
    else if (internalLinks >= 2) { score += 8; improvements.push('Add more internal links'); }
    else { score += 2; improvements.push('Add internal links to related content'); }

    if (metrics.wordCount >= 2500) score += 15;
    else if (metrics.wordCount >= 1500) { score += 10; improvements.push('Increase word count to 2500+'); }
    else { score += 3; improvements.push(`Word count too low (${metrics.wordCount})`); }

    const keywordInHeadings = (content.match(/<h[1-3][^>]*>.*?<\/h[1-3]>/gi) || [])
      .some(h => h.toLowerCase().includes(keyword.toLowerCase()));
    if (keywordInHeadings) score += 10;

    return Math.min(100, score);
  })();

  // --- E-E-A-T (0-100) ---
  const eeatScore = (() => {
    let score = 40;

    const citationMatches = contentLower.match(/according to|study\b|research\b|report\b|published|journal|university|institute/g);
    const citationCount = citationMatches?.length || 0;
    if (citationCount >= 8) score += 15;
    else if (citationCount >= 4) score += 10;
    else if (citationCount >= 1) score += 5;

    const expertMatches = contentLower.match(/\bdr\.|\bprofessor\b|\bphd\b|\bmd\b|\bexpert\b|\bspecialist\b/g);
    const expertCount = expertMatches?.length || 0;
    if (expertCount >= 4) score += 12;
    else if (expertCount >= 2) score += 8;
    else if (expertCount >= 1) score += 4;

    const experienceSignals = contentLower.match(/\bi personally\b|\bmy experience\b|\bwhen i\b|\bi tested\b|\bi found\b|\bi've\b|\bin my \d/g);
    const experienceCount = experienceSignals?.length || 0;
    if (experienceCount >= 3) score += 12;
    else if (experienceCount >= 1) score += 7;

    const hasSpecificData = /\d{1,3}(?:\.\d+)?%/.test(content);
    const hasYearRefs = /20(?:2[3-9]|3\d)/.test(content);
    if (hasSpecificData) score += 8;
    if (hasYearRefs) score += 6;

    const hasLimitations = /caveat|limitation|drawback|downside|however|one thing to note|keep in mind/i.test(textContent);
    if (hasLimitations) score += 7;

    if (aiPhrases.length === 0) score += 5;
    else if (aiPhrases.length <= 2) score += 2;
    else score -= aiPhrases.length;

    return Math.min(100, Math.max(0, score));
  })();

  // --- UNIQUENESS (0-100) ---
  const uniquenessScore = (() => {
    let score = 85;

    score -= aiPhrases.length * 4;
    if (aiPhrases.length > 0) {
      improvements.push(`Remove AI phrases: ${aiPhrases.slice(0, 3).join(', ')}`);
    }

    const hasOpinions = /\bhonestly\b|\bi think\b|\bi believe\b|\bin my view\b|\breal talk\b|\bhere's the thing\b/i.test(textContent);
    if (hasOpinions) score += 8;

    const hasAnalogies = /\blike\s+a\b|\bimagine\b|\bthink of it as\b|\bpicture this\b/i.test(textContent);
    if (hasAnalogies) score += 5;

    const hasShortSentences = textContent.split(/[.!?]/).filter(s => s.trim().split(/\s+/).length <= 5 && s.trim().length > 0).length;
    if (hasShortSentences >= 5) score += 4;

    return Math.min(100, Math.max(60, score));
  })();

  // --- FACT ACCURACY (0-100) ---
  const factAccuracyScore = (() => {
    let score = 72;

    const statMatches = content.match(/\d+(?:\.\d+)?%|\d+(?:,\d{3})+|\d+\s*(?:million|billion|thousand)/g);
    const statCount = statMatches?.length || 0;
    if (statCount >= 8) score += 14;
    else if (statCount >= 4) score += 10;
    else if (statCount >= 1) score += 5;

    const yearMatches = content.match(/20\d{2}/g);
    const yearCount = new Set(yearMatches || []).size;
    if (yearCount >= 3) score += 8;
    else if (yearCount >= 1) score += 4;

    const hasSourceNames = /\b(?:harvard|stanford|mit|oxford|mayo clinic|cdc|who|nih|fda|gartner|mckinsey|forrester|statista|pew research)\b/i.test(textContent);
    if (hasSourceNames) score += 8;

    return Math.min(100, score);
  })();

  // --- OVERALL (weighted average) ---
  const overall = Math.round(
    readabilityScore * 0.20 +
    seoScore * 0.25 +
    eeatScore * 0.25 +
    uniquenessScore * 0.15 +
    factAccuracyScore * 0.15
  );

  return {
    overall: Math.min(100, Math.max(0, overall)),
    readability: readabilityScore,
    seo: seoScore,
    eeat: eeatScore,
    uniqueness: uniquenessScore,
    factAccuracy: factAccuracyScore,
    passed: overall >= 85,
    improvements
  };
}

export function removeAIPhrases(content: string): string {
  let cleaned = content;

  // Remove common AI-tells with light contextual safety:
  // - remove as standalone phrases / transitions
  // - avoid nuking substrings inside words
  for (const phrase of AI_TRIGGER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Match phrase with optional punctuation and surrounding whitespace
    const regex = new RegExp(`(^|[\s>])(${escaped})([\s,.:;!?)<]|$)`, 'gi');
    cleaned = cleaned.replace(regex, (_m, p1, _p2, p3) => `${p1}${p3}`);
  }

  cleaned = cleaned
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s{2,}/g, '> ')
    .replace(/\s{2,}</g, ' <')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?]){2,}/g, '$1');

  return cleaned.trim();
}



/**
 * Final cheap polish: ensures scannability for WordPress HTML.
 * - collapses long paragraphs
 * - standardizes spacing
 */
export function polishReadability(html: string): string {
  let out = html;

  out = out.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');
  out = out.replace(/\n{3,}/g, '\n\n');

  // Split overly long <p> blocks
  out = out.replace(/<p>([\s\S]*?)<\/p>/gi, (m, inner) => {
    const plain = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (plain.split(' ').length <= 75) return m;

    const sentences = inner.split(/(?<=[.!?])\s+/);
    let cur = '';
    const paras: string[] = [];
    for (const s of sentences) {
      const next = (cur ? cur + ' ' : '') + s;
      const wc = next.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      if (wc > 70 && cur) {
        paras.push(`<p>${cur.trim()}</p>`);
        cur = s;
      } else {
        cur = next;
      }
    }
    if (cur.trim()) paras.push(`<p>${cur.trim()}</p>`);
    return paras.join('');
  });

  return out;
}
