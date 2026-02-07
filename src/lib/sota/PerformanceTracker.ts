// PERFORMANCE TRACKER - Real-Time Metrics & Analytics

import type { AnalyticsDashboardData, AIModel } from './types';

interface PerformanceMetric {
  id: string;
  timestamp: number;
  contentQualityScore: number;
  aeoScore: number;
  internalLinkDensity: number;
  semanticRichness: number;
  processingSpeed: number;
  wordCount: number;
  modelUsed: AIModel;
  cacheHit: boolean;
  keyword: string;
}

const STORAGE_KEY = 'sota_performance_metrics';
const MAX_METRICS = 500;

class PerformanceTracker {
  private metrics: PerformanceMetric[] = [];

  constructor() {
    this.loadFromStorage();
  }

  recordMetrics(metric: Omit<PerformanceMetric, 'id'>): void {
    const newMetric: PerformanceMetric = {
      ...metric,
      id: crypto.randomUUID()
    };

    this.metrics.push(newMetric);

    // Keep only last MAX_METRICS
    if (this.metrics.length > MAX_METRICS) {
      this.metrics = this.metrics.slice(-MAX_METRICS);
    }

    this.saveToStorage();
  }

  getAverageMetrics(): {
    avgQualityScore: number;
    avgAeoScore: number;
    avgLinkDensity: number;
    avgSemanticRichness: number;
    avgProcessingSpeed: number;
    avgWordCount: number;
  } {
    if (this.metrics.length === 0) {
      return {
        avgQualityScore: 0,
        avgAeoScore: 0,
        avgLinkDensity: 0,
        avgSemanticRichness: 0,
        avgProcessingSpeed: 0,
        avgWordCount: 0
      };
    }

    const sum = this.metrics.reduce(
      (acc, m) => ({
        qualityScore: acc.qualityScore + m.contentQualityScore,
        aeoScore: acc.aeoScore + m.aeoScore,
        linkDensity: acc.linkDensity + m.internalLinkDensity,
        semanticRichness: acc.semanticRichness + m.semanticRichness,
        processingSpeed: acc.processingSpeed + m.processingSpeed,
        wordCount: acc.wordCount + m.wordCount
      }),
      { qualityScore: 0, aeoScore: 0, linkDensity: 0, semanticRichness: 0, processingSpeed: 0, wordCount: 0 }
    );

    const count = this.metrics.length;
    return {
      avgQualityScore: Math.round(sum.qualityScore / count),
      avgAeoScore: Math.round(sum.aeoScore / count),
      avgLinkDensity: Math.round(sum.linkDensity / count),
      avgSemanticRichness: Math.round(sum.semanticRichness / count),
      avgProcessingSpeed: Math.round(sum.processingSpeed / count),
      avgWordCount: Math.round(sum.wordCount / count)
    };
  }

  getPerformanceTrend(days: number = 7): 'improving' | 'stable' | 'declining' {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const halfPoint = now - (days / 2) * 24 * 60 * 60 * 1000;

    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    if (recentMetrics.length < 4) return 'stable';

    const firstHalf = recentMetrics.filter(m => m.timestamp < halfPoint);
    const secondHalf = recentMetrics.filter(m => m.timestamp >= halfPoint);

    if (firstHalf.length === 0 || secondHalf.length === 0) return 'stable';

    const firstHalfAvg = firstHalf.reduce((sum, m) => sum + m.contentQualityScore, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, m) => sum + m.contentQualityScore, 0) / secondHalf.length;

    const diff = secondHalfAvg - firstHalfAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  getModelUsage(): Record<AIModel, number> {
    const usage: Record<AIModel, number> = {
      gemini: 0,
      openai: 0,
      anthropic: 0,
      openrouter: 0,
      groq: 0
    };

    this.metrics.forEach(m => {
      usage[m.modelUsed]++;
    });

    return usage;
  }

  getCacheHitRate(): number {
    if (this.metrics.length === 0) return 0;
    const hits = this.metrics.filter(m => m.cacheHit).length;
    return Math.round((hits / this.metrics.length) * 100);
  }

  getTopKeywords(limit: number = 10): { keyword: string; count: number }[] {
    const keywordCounts = new Map<string, number>();
    
    this.metrics.forEach(m => {
      const count = keywordCounts.get(m.keyword) || 0;
      keywordCounts.set(m.keyword, count + 1);
    });

    return Array.from(keywordCounts.entries())
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getQualityTrend(days: number = 30): { date: string; score: number }[] {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    
    const recentMetrics = this.metrics.filter(m => m.timestamp >= cutoff);
    
    // Group by date
    const dailyScores = new Map<string, number[]>();
    recentMetrics.forEach(m => {
      const date = new Date(m.timestamp).toISOString().split('T')[0];
      const scores = dailyScores.get(date) || [];
      scores.push(m.contentQualityScore);
      dailyScores.set(date, scores);
    });

    return Array.from(dailyScores.entries())
      .map(([date, scores]) => ({
        date,
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getDashboardData(): AnalyticsDashboardData {
    const avgMetrics = this.getAverageMetrics();
    
    return {
      totalGenerated: this.metrics.length,
      avgQualityScore: avgMetrics.avgQualityScore,
      avgWordCount: avgMetrics.avgWordCount,
      modelUsage: this.getModelUsage(),
      cacheHitRate: this.getCacheHitRate(),
      avgGenerationTime: avgMetrics.avgProcessingSpeed,
      topKeywords: this.getTopKeywords(),
      qualityTrend: this.getQualityTrend()
    };
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.metrics = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load performance metrics from storage:', error);
      this.metrics = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.metrics));
    } catch (error) {
      console.warn('Failed to save performance metrics to storage:', error);
    }
  }

  clearHistory(): void {
    this.metrics = [];
    localStorage.removeItem(STORAGE_KEY);
  }

  getRecentMetrics(count: number = 10): PerformanceMetric[] {
    return this.metrics.slice(-count).reverse();
  }
}

// Singleton instance
export const globalPerformanceTracker = new PerformanceTracker();

// Helper functions for calculating scores
export function calculateAEOScore(content: string): number {
  let score = 0;
  
  // Direct answer at beginning (40-160 chars in first paragraph)
  const firstParagraph = content.match(/<p[^>]*>(.*?)<\/p>/i)?.[1] || '';
  const plainFirst = firstParagraph.replace(/<[^>]*>/g, '');
  if (plainFirst.length >= 40 && plainFirst.length <= 200) {
    score += 20;
  }

  // Has FAQ section
  if (/<h[23][^>]*>.*?(?:faq|frequently asked)/i.test(content)) {
    score += 20;
  }

  // Has lists (good for snippets)
  const listCount = (content.match(/<[uo]l/gi) || []).length;
  score += Math.min(listCount * 10, 20);

  // Has tables (good for comparisons)
  const tableCount = (content.match(/<table/gi) || []).length;
  score += Math.min(tableCount * 15, 15);

  // Has structured headings
  const h2Count = (content.match(/<h2/gi) || []).length;
  const h3Count = (content.match(/<h3/gi) || []).length;
  if (h2Count >= 3 && h3Count >= 2) {
    score += 15;
  }

  // Has schema markup reference
  if (content.includes('schema.org') || content.includes('application/ld+json')) {
    score += 10;
  }

  return Math.min(score, 100);
}

export function calculateSemanticRichness(content: string, keywords: string[]): number {
  const textContent = content.replace(/<[^>]*>/g, ' ').toLowerCase();
  const words = textContent.split(/\s+/);
  
  let keywordsFound = 0;
  keywords.forEach(keyword => {
    if (textContent.includes(keyword.toLowerCase())) {
      keywordsFound++;
    }
  });

  const coverage = keywords.length > 0 ? (keywordsFound / keywords.length) * 100 : 0;
  
  // Also consider unique word ratio
  const uniqueWords = new Set(words.filter(w => w.length > 3));
  const uniqueRatio = (uniqueWords.size / words.length) * 100;
  
  return Math.round((coverage * 0.7) + (uniqueRatio * 0.3));
}

export function calculateLinkDensity(content: string, internalLinkCount: number): number {
  const textContent = content.replace(/<[^>]*>/g, ' ');
  const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
  
  // Ideal: 8-15 internal links per 2500 words
  const targetLinks = Math.round((wordCount / 2500) * 12);
  const ratio = Math.min(internalLinkCount / targetLinks, 1.5);
  
  return Math.round(Math.min(ratio * 100, 100));
}
