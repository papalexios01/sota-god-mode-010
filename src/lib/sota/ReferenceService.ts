// REFERENCE SERVICE - Citation Management & Validation

import type { Reference } from './types';

const AUTHORITY_DOMAINS: Record<string, number> = {
  // Government & Education
  '.gov': 95,
  '.edu': 90,
  
  // Major Publications
  'nytimes.com': 88,
  'wsj.com': 87,
  'reuters.com': 89,
  'bbc.com': 86,
  'theguardian.com': 85,
  'forbes.com': 82,
  'hbr.org': 88,
  
  // Tech & Industry
  'techcrunch.com': 80,
  'wired.com': 78,
  'arstechnica.com': 79,
  'theverge.com': 77,
  
  // Academic & Research
  'nature.com': 95,
  'sciencedirect.com': 92,
  'pubmed.ncbi.nlm.nih.gov': 94,
  'scholar.google.com': 90,
  'arxiv.org': 88,
  
  // Industry Standards
  'w3.org': 95,
  'ietf.org': 94,
  'iso.org': 95,
  
  // Statistics
  'statista.com': 85,
  'pewresearch.org': 88,
  'gallup.com': 86
};

export class ReferenceService {
  private serperApiKey: string;

  constructor(serperApiKey: string) {
    this.serperApiKey = serperApiKey;
  }

  async searchReferences(
    query: string, 
    type: 'all' | 'academic' | 'news' | 'industry' = 'all',
    maxResults: number = 10
  ): Promise<Reference[]> {
    if (!this.serperApiKey) {
      console.warn('No Serper API key provided for reference search');
      return [];
    }

    // Build search query based on type
    let searchQuery = query;
    if (type === 'academic') {
      searchQuery = `${query} site:edu OR site:gov OR site:pubmed.ncbi.nlm.nih.gov OR site:scholar.google.com`;
    } else if (type === 'news') {
      searchQuery = `${query} site:reuters.com OR site:bbc.com OR site:nytimes.com`;
    } else if (type === 'industry') {
      searchQuery = `${query} research study statistics data`;
    }

    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': this.serperApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          q: searchQuery,
          num: maxResults * 2 // Request more to filter
        })
      });

      if (!response.ok) {
        throw new Error(`Serper API error: ${response.status}`);
      }

      const data = await response.json();
      const results = data.organic || [];

      return results
        .map((result: Record<string, unknown>) => this.parseReference(result))
        .filter((ref: Reference) => ref.authorityScore >= 60)
        .slice(0, maxResults);
    } catch (error) {
      console.error('Error searching references:', error);
      return [];
    }
  }

  private parseReference(result: Record<string, unknown>): Reference {
    const url = result.link as string || '';
    const domain = this.extractDomain(url);
    
    return {
      title: result.title as string || '',
      url,
      type: this.classifyReferenceType(url),
      domain,
      publishedDate: result.date as string || undefined,
      authorityScore: this.calculateAuthorityScore(url)
    };
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  private classifyReferenceType(url: string): Reference['type'] {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return 'blog';
    }

    const academicDomains = ['scholar.google.com', 'pubmed.ncbi.nlm.nih.gov', 'arxiv.org', 'sciencedirect.com', 'nature.com'];
    const newsDomains = ['reuters.com', 'bbc.com', 'nytimes.com', 'wsj.com', 'theguardian.com'];
    const industryDomains = ['techcrunch.com', 'wired.com', 'forbes.com', 'hbr.org', 'arstechnica.com', 'theverge.com'];

    if (hostname.endsWith('.edu') || academicDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return 'academic';
    if (hostname.endsWith('.gov')) return 'government';
    if (newsDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return 'news';
    if (industryDomains.some(d => hostname === d || hostname.endsWith('.' + d))) return 'industry';

    return 'blog';
  }

  calculateAuthorityScore(url: string): number {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return 50;
    }

    for (const [domain, score] of Object.entries(AUTHORITY_DOMAINS)) {
      if (domain.startsWith('.')) {
        if (hostname.endsWith(domain) || hostname.endsWith(domain.slice(1))) {
          return score;
        }
      } else {
        if (hostname === domain || hostname.endsWith('.' + domain)) {
          return score;
        }
      }
    }

    if (hostname.endsWith('.gov') || hostname.split('.').some(p => p === 'gov')) return 90;
    if (hostname.endsWith('.edu') || hostname.split('.').some(p => p === 'edu')) return 85;
    if (hostname.endsWith('.org')) return 70;

    return 50;
  }

  async validateReference(url: string): Promise<{ valid: boolean; status?: number }> {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      });
      return { valid: response.ok, status: response.status };
    } catch {
      // Assume valid if we can't check (CORS, timeout, etc.)
      return { valid: true };
    }
  }

  formatReferencesSection(references: Reference[]): string {
    if (references.length === 0) return '';

    const sortedRefs = [...references].sort((a, b) => b.authorityScore - a.authorityScore);

    const typeLabel = (ref: Reference): string => {
      if (ref.type === 'academic') return ' [Academic]';
      if (ref.type === 'government') return ' [Official]';
      return '';
    };

    const listItems = sortedRefs.map((ref) => {
      const safeTitle = ref.title.replace(/"/g, '&quot;');
      const label = typeLabel(ref);
      return `<li><a href="${ref.url}" rel="noopener noreferrer">${safeTitle}</a> &mdash; <em>${ref.domain}</em>${label}</li>`;
    }).join('\n    ');

    return `\n<hr>\n<h2>References &amp; Sources</h2>\n<ol>\n    ${listItems}\n</ol>\n`;
  }

  formatInlineCitation(reference: Reference, index: number): string {
    return `<sup><a href="${reference.url}" rel="noopener noreferrer">[${index + 1}]</a></sup>`;
  }

  async getTopReferences(keyword: string, count: number = 8): Promise<Reference[]> {
    // Search across different types
    const [academic, industry, news] = await Promise.all([
      this.searchReferences(keyword, 'academic', Math.ceil(count / 2)),
      this.searchReferences(keyword, 'industry', Math.ceil(count / 3)),
      this.searchReferences(keyword, 'news', Math.ceil(count / 4))
    ]);

    // Combine and deduplicate
    const all = [...academic, ...industry, ...news];
    const unique = all.filter((ref, index, self) =>
      index === self.findIndex(r => r.url === ref.url)
    );

    // Sort by authority and return top results
    return unique
      .sort((a, b) => b.authorityScore - a.authorityScore)
      .slice(0, count);
  }
}

export function createReferenceService(serperApiKey: string): ReferenceService {
  return new ReferenceService(serperApiKey);
}
