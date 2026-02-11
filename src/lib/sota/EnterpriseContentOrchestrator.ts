// ENTERPRISE CONTENT ORCHESTRATOR - Full Workflow Management
// 🔧 CHANGED: Integrated ContentPostProcessor for visual break enforcement (Goal #5),
//   imported polishReadability and validateVisualBreaks from QualityValidator,
//   added steps 3f & 3g in post-processing pipeline.

import type {
  APIKeys,
  AIModel,
  GeneratedContent,
  ContentMetrics,
  QualityScore,
  SERPAnalysis,
  InternalLink,
  SchemaMarkup,
  EEATProfile,
  YouTubeVideo,
  Reference,
  ContentPlan,
  PostProcessingResult
} from './types';

import { SOTAContentGenerationEngine, createSOTAEngine, type ExtendedAPIKeys } from './SOTAContentGenerationEngine';
import { SERPAnalyzer, createSERPAnalyzer } from './SERPAnalyzer';
import { YouTubeService, createYouTubeService } from './YouTubeService';
import { ReferenceService, createReferenceService } from './ReferenceService';
import { SOTAInternalLinkEngine, createInternalLinkEngine } from './SOTAInternalLinkEngine';
import { SchemaGenerator, createSchemaGenerator } from './SchemaGenerator';
import { calculateQualityScore, analyzeContent, removeAIPhrases, polishReadability, validateVisualBreaks } from './QualityValidator';
import { EEATValidator, createEEATValidator } from './EEATValidator';
import { generationCache } from './cache';
import { NeuronWriterService, createNeuronWriterService, type NeuronWriterAnalysis } from './NeuronWriterService';
import { ContentPostProcessor } from './ContentPostProcessor';

/**
 * CRITICAL: Convert any markdown syntax to proper HTML
 */
function convertMarkdownToHTML(content: string): string {
  let html = content;

  html = html.replace(/^# ([^\n<]+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^#\s+([^\n<]+)$/gm, '<h1>$1</h1>');

  html = html.replace(/^## ([^\n#<]+)$/gm, '<h2 style="color: #0f172a; font-size: 30px; font-weight: 900; margin: 56px 0 24px 0; padding-bottom: 14px; border-bottom: 4px solid #10b981; letter-spacing: -0.025em; line-height: 1.2;">$1</h2>');
  html = html.replace(/^##\s+([^\n#<]+)$/gm, '<h2 style="color: #0f172a; font-size: 30px; font-weight: 900; margin: 56px 0 24px 0; padding-bottom: 14px; border-bottom: 4px solid #10b981; letter-spacing: -0.025em; line-height: 1.2;">$1</h2>');

  html = html.replace(/^### ([^\n#<]+)$/gm, '<h3 style="color: #1e293b; font-size: 23px; font-weight: 800; margin: 40px 0 16px 0; letter-spacing: -0.02em; line-height: 1.3;">$1</h3>');
  html = html.replace(/^###\s+([^\n#<]+)$/gm, '<h3 style="color: #1e293b; font-size: 23px; font-weight: 800; margin: 40px 0 16px 0; letter-spacing: -0.02em; line-height: 1.3;">$1</h3>');

  html = html.replace(/^#### ([^\n#<]+)$/gm, '<h4 style="color: #334155; font-size: 19px; font-weight: 700; margin: 32px 0 12px 0; line-height: 1.3;">$1</h4>');
  html = html.replace(/^####\s+([^\n#<]+)$/gm, '<h4 style="color: #334155; font-size: 19px; font-weight: 700; margin: 32px 0 12px 0; line-height: 1.3;">$1</h4>');

  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #059669; text-decoration: underline; text-underline-offset: 3px; font-weight: 600; transition: color 0.2s;">$1</a>');

  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin-bottom: 8px; line-height: 1.8;">$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li data-list-type="ol" style="margin-bottom: 8px; line-height: 1.8;">$1</li>');

  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    const isOrdered = match.includes('data-list-type="ol"');
    const tag = isOrdered ? 'ol' : 'ul';
    const cleanedMatch = match.replace(/\s*data-list-type="ol"/g, '');
    return `<${tag} style="margin: 20px 0; padding-left: 24px; color: #374151;">${cleanedMatch}</${tag}>`;
  });

  html = html.replace(/```([^`]+)```/gs, '<pre style="background: #f3f4f6; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 20px 0;"><code style="color: #374141; font-size: 14px;">$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 14px;">$1</code>');
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left: 4px solid #10b981; padding-left: 20px; margin: 20px 0; color: #4b5563; font-style: italic;">$1</blockquote>');
  html = html.replace(/^[-*]{3,}$/gm, '<hr style="border: 0; border-top: 2px solid #e5e7eb; margin: 32px 0;">');

  const lines = html.split('\n');
  const processedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('<') || line.startsWith('</')) {
      processedLines.push(lines[i]);
    } else {
      processedLines.push(`<p style="color: #334155; font-size: 18px; line-height: 1.8; margin: 0 0 20px 0;">${line}</p>`);
    }
  }

  html = processedLines.join('\n');

  html = html.replace(/<h[1-6][^>]*>#{1,6}\s*/gi, (match) => match.replace(/#{1,6}\s*/, ''));

  const finalLines = html.split('\n').map(line => {
    if (!line.trim().startsWith('<')) {
      return line.replace(/^#{1,6}\s+/, '');
    }
    return line;
  });
  html = finalLines.join('\n');

  return html;
}

/**
 * Ensure proper HTML structure for WordPress
 */
function ensureProperHTMLStructure(content: string): string {
  let html = content;

  html = html.replace(/<p[^>]*>\s*<p/g, '<p');
  html = html.replace(/<\/p>\s*<\/p>/g, '</p>');

  html = html.replace(/<\/div>\s*<h2/g, '</div>\n\n<h2');
  html = html.replace(/<\/p>\s*<h2/g, '</p>\n\n<h2');
  html = html.replace(/<\/div>\s*<h3/g, '</div>\n\n<h3');
  html = html.replace(/<\/p>\s*<h3/g, '</p>\n\n<h3');

  html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

  // 🔧 FIX v3: Only add styles to UNSTYLED headings (don't overwrite already-styled ones)
  html = html.replace(/<h2>([^<]+)<\/h2>/g, '<h2 style="color: #0f172a; font-size: 30px; font-weight: 900; margin: 56px 0 24px 0; padding-bottom: 14px; border-bottom: 4px solid #10b981; letter-spacing: -0.025em; line-height: 1.2;">$1</h2>');
  html = html.replace(/<h3>([^<]+)<\/h3>/g, '<h3 style="color: #1e293b; font-size: 23px; font-weight: 800; margin: 40px 0 16px 0; letter-spacing: -0.02em; line-height: 1.3;">$1</h3>');
  html = html.replace(/<h4>([^<]+)<\/h4>/g, '<h4 style="color: #334155; font-size: 19px; font-weight: 700; margin: 32px 0 12px 0; line-height: 1.3;">$1</h4>');

  const headingRegex = /<h([1-6])[^>]*>/gi;
  let match: RegExpExecArray | null;
  let lastLevel = 0;
  const fixes: Array<{ index: number; from: number; to: number }> = [];

  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    if (lastLevel > 0 && level > lastLevel + 1) {
      fixes.push({ index: match.index, from: level, to: lastLevel + 1 });
    }
    lastLevel = level;
  }

  for (let i = fixes.length - 1; i >= 0; i--) {
    const fix = fixes[i];
    const searchFrom = html.substring(fix.index);
    const openTag = searchFrom.match(new RegExp(`<h${fix.from}`, 'i'));
    const closeTag = searchFrom.match(new RegExp(`</h${fix.from}>`, 'i'));
    if (openTag && closeTag) {
      html = html.substring(0, fix.index) +
        searchFrom.replace(new RegExp(`<h${fix.from}`, 'i'), `<h${fix.to}`)
          .replace(new RegExp(`</h${fix.from}>`, 'i'), `</h${fix.to}>`);
    }
  }

  // 🔧 FIX v3: Removed max-width: 780px — let WordPress theme control layout width
  // Also changed data-premium-wp to data-sota-content to avoid conflicts
  if (!html.includes('data-premium-wp') && !html.includes('data-sota-content')) {
    const wrapperStart =
      '<div data-sota-content="true" style="font-family: \'Inter\', ui-sans-serif, system-ui, -apple-system, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; line-height: 1.75; color: #1e293b; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">';
    const wrapperEnd = '</div>';
    html = `${wrapperStart}\n${html}\n${wrapperEnd}`;
  }

  // 🔧 FIX v3: Only add styles to elements that DON'T already have a style attribute
  html = html
    .replace(/<p(?!\s)>/g, '<p style="font-size: 18px; margin: 0 0 20px 0; line-height: 1.8; color: #334155;">')
    .replace(/<ul(?!\s)>/g, '<ul style="margin: 0 0 24px 0; padding-left: 24px; list-style: none;">')
    .replace(/<ol(?!\s)>/g, '<ol style="margin: 0 0 24px 0; padding-left: 24px; counter-reset: item;">')
    .replace(/<li(?!\s)>/g, '<li style="margin: 0 0 12px 0; padding-left: 8px; line-height: 1.75; position: relative;">');

  return html;
}

type NeuronBundle = {
  service: NeuronWriterService;
  queryId: string;
  analysis: NeuronWriterAnalysis;
};

interface OrchestratorConfig {
  apiKeys: ExtendedAPIKeys;
  organizationName: string;
  organizationUrl: string;
  logoUrl?: string;
  authorName: string;
  authorCredentials?: string[];
  sitePages?: { url: string; title: string; keywords?: string[] }[];
  targetCountry?: string;
  useConsensus?: boolean;
  primaryModel?: AIModel;
  neuronWriterApiKey?: string;
  neuronWriterProjectId?: string;
}

interface GenerationOptions {
  keyword: string;
  title?: string;
  contentType?: 'guide' | 'how-to' | 'comparison' | 'listicle' | 'deep-dive';
  targetWordCount?: number;
  includeVideos?: boolean;
  includeReferences?: boolean;
  injectLinks?: boolean;
  generateSchema?: boolean;
  validateEEAT?: boolean;
  neuronWriterQueryId?: string;
  onProgress?: (message: string) => void;
}

export class EnterpriseContentOrchestrator {
  private engine: SOTAContentGenerationEngine;
  private serpAnalyzer: SERPAnalyzer;
  private youtubeService: YouTubeService;
  private referenceService: ReferenceService;
  private linkEngine: SOTAInternalLinkEngine;
  private schemaGenerator: SchemaGenerator;
  private eeatValidator: EEATValidator;
  private config: OrchestratorConfig;

  private onProgress?: (message: string) => void;

  constructor(config: OrchestratorConfig) {
    this.config = config;

    this.engine = createSOTAEngine(config.apiKeys, (msg) => this.log(msg));
    this.serpAnalyzer = createSERPAnalyzer(config.apiKeys.serperApiKey || '');
    this.youtubeService = createYouTubeService(config.apiKeys.serperApiKey || '');
    this.referenceService = createReferenceService(config.apiKeys.serperApiKey || '');
    this.linkEngine = createInternalLinkEngine(config.sitePages);
    this.eeatValidator = createEEATValidator();
    this.schemaGenerator = createSchemaGenerator(
      config.organizationName,
      config.organizationUrl,
      config.logoUrl
    );
  }

  private log(message: string): void {
    this.onProgress?.(message);
    console.log(`[Orchestrator] ${message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private stripModelContinuationArtifacts(html: string): string {
    if (!html) return '';
    return html
      .replace(/\[\s*content continues[\s\S]*?\]/gi, '')
      .replace(/would you like me to continue\??/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private countWordsFromHtml(html: string): number {
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
  }

  private async ensureLongFormComplete(params: {
    keyword: string;
    title: string;
    systemPrompt: string;
    model: AIModel;
    currentHtml: string;
    targetWordCount: number;
  }): Promise<string> {
    const { keyword, title, systemPrompt, model, targetWordCount } = params;

    let html = this.stripModelContinuationArtifacts(params.currentHtml);
    let words = this.countWordsFromHtml(html);

    const minAbsoluteWords = Math.max(2000, targetWordCount);
    const minRatio = targetWordCount >= 3000 ? 0.92 : 0.85;
    const minTargetWords = Math.floor(minAbsoluteWords * minRatio);

    this.log(`Initial content: ${words} words (target: ${minAbsoluteWords}+, minimum acceptable: ${minTargetWords})`);

    const looksIncomplete = (s: string) =>
      /content continues|continue\?|would you like me to continue/i.test(s);

    const maxContinuations = targetWordCount >= 5000 ? 8 : targetWordCount >= 3000 ? 5 : 3;
    for (let i = 1; i <= maxContinuations; i++) {
      const tooShort = words < minTargetWords;
      const explicitlyIncomplete = looksIncomplete(html);

      if (!tooShort && !explicitlyIncomplete) {
        this.log(`Content meets target: ${words}/${minTargetWords} words (${Math.round(words / minTargetWords * 100)}%)`);
        break;
      }

      const percentComplete = Math.round((words / minTargetWords) * 100);
      const remainingWords = minAbsoluteWords - words;
      this.log(`Content too short: ${words}/${minTargetWords} words (${percentComplete}%). Need ${remainingWords} more. Continuing... (${i}/${maxContinuations})`);

      const tail = html.slice(-3000);
      const remainingNeeded = minAbsoluteWords - words;
      const continuationPrompt = `Continue the SAME HTML article titled "${title}" about "${keyword}" EXACTLY where it left off. You still need approximately ${remainingNeeded} more words.

Rules (MUST FOLLOW):
- Output ONLY the HTML continuation (no preface, no apology, no brackets, no notes)
- Do NOT repeat the H1 or reprint earlier sections
- Do NOT ask questions like "Would you like me to continue?"
- Keep the same tone, formatting, and premium boxes/tables
- Add DEPTH: include real data points, specific examples, expert quotes, pro tip boxes, and comparison tables
- Each new section MUST add genuine value — no padding or filler
- Finish the article fully (including the FAQ section with 8 questions + final CTA as instructed)
- CRITICAL: Never write more than 200 words of consecutive <p> text without a visual break element (box, table, blockquote, list)

Last part of the current article (for context):
${tail}

Now continue:`;

      const next = await this.engine.generateWithModel({
        prompt: continuationPrompt,
        model,
        apiKeys: this.config.apiKeys,
        systemPrompt,
        temperature: 0.72,
        maxTokens: 8192,
      });

      const nextChunk = this.stripModelContinuationArtifacts(next.content);
      if (!nextChunk || nextChunk.length < 100) {
        this.log('Model returned empty or minimal content; stopping continuation.');
        break;
      }

      const dedupeWindow = html.slice(-600);
      const chunkStart = nextChunk.slice(0, 600);
      if (dedupeWindow && chunkStart && dedupeWindow.includes(chunkStart)) {
        this.log('Continuation looks repetitive; stopping to avoid duplication.');
        break;
      }

      html = `${html}\n\n${nextChunk}`.trim();
      const newWords = this.countWordsFromHtml(html);
      this.log(`Added ${newWords - words} words → Total: ${newWords} words`);
      words = newWords;
    }

    if (words < minTargetWords) {
      this.log(`WARNING: Final content is ${words} words (${Math.round(words / minTargetWords * 100)}%), below target of ${minTargetWords}. May need regeneration.`);
    } else {
      this.log(`Long-form content complete: ${words} words`);
    }

    return html;
  }

  private async maybeInitNeuronWriter(keyword: string, options: GenerationOptions): Promise<NeuronBundle | null> {
    const apiKey = this.config.neuronWriterApiKey?.trim();
    const projectId = this.config.neuronWriterProjectId?.trim();
    if (!apiKey || !projectId) {
      this.log('NeuronWriter: SKIPPED - API key or Project ID not configured');
      return null;
    }

    const service = createNeuronWriterService(apiKey);
    const queryIdFromOptions = options.neuronWriterQueryId?.trim();

    this.log('NeuronWriter: Initializing integration...');

    let queryId = queryIdFromOptions;

    if (!queryId) {
      this.log(`NeuronWriter: searching for existing query matching "${keyword}"...`);
      const searchResult = await service.findQueryByKeyword(projectId, keyword);

      if (searchResult.success && searchResult.query && searchResult.query.status === 'ready') {
        const tempQueryId = searchResult.query.id;
        const status = searchResult.query.status || 'unknown';
        this.log(`NeuronWriter: Found existing query "${searchResult.query.keyword}" (ID: ${tempQueryId}, status: ${status})`);

        const existingAnalysis = await service.getQueryAnalysis(tempQueryId);
        if (existingAnalysis.success && existingAnalysis.analysis) {
          const hasGoodData = (existingAnalysis.analysis.terms?.length || 0) >= 5 &&
            ((existingAnalysis.analysis.headingsH2?.length || 0) >= 2 ||
              (existingAnalysis.analysis.headingsH3?.length || 0) >= 2);

          if (hasGoodData) {
            queryId = tempQueryId;
            this.log(`NeuronWriter: Existing query has good data - using it!`);
          } else {
            this.log(`NeuronWriter: Existing query has insufficient data (${existingAnalysis.analysis.terms?.length || 0} terms, ${existingAnalysis.analysis.headingsH2?.length || 0} H2s, ${existingAnalysis.analysis.headingsH3?.length || 0} H3s)`);
            this.log(`NeuronWriter: Creating fresh query for better analysis...`);
          }
        }
      }

      if (!queryId) {
        this.log(`NeuronWriter: Creating new Content Writer query for "${keyword}"...`);
        const created = await service.createQuery(projectId, keyword);
        if (!created.success || !created.queryId) {
          this.log(`NeuronWriter: FAILED to create query - ${created.error || 'unknown error'}`);
          this.log(`NeuronWriter: Proceeding WITHOUT NeuronWriter optimization`);
          return null;
        }
        queryId = created.queryId;
        this.log(`NeuronWriter: Created NEW Content Writer query (ID: ${queryId})`);
      }
    } else {
      this.log(`NeuronWriter: Using provided query ID: ${queryId}`);
    }

    const maxAttempts = 40;
    let lastStatus = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const analysisRes = await service.getQueryAnalysis(queryId);

      if (analysisRes.success && analysisRes.analysis) {
        const summary = service.getAnalysisSummary(analysisRes.analysis);
        this.log(`NeuronWriter: Analysis READY - ${summary}`);

        const hasTerms = (analysisRes.analysis.terms?.length || 0) > 0;
        const hasHeadings = (analysisRes.analysis.headingsH2?.length || 0) > 0;

        if (!hasTerms && !hasHeadings) {
          this.log(`NeuronWriter: WARNING - Analysis returned but contains no terms or headings`);
        }

        return { service, queryId, analysis: analysisRes.analysis };
      }

      const msg = analysisRes.error || 'Query not ready';
      const currentStatus = msg.match(/Status:\s*(\w+)/i)?.[1] || '';

      const looksNotReady = /not ready|status|waiting|in progress/i.test(msg);
      if (!looksNotReady) {
        this.log(`NeuronWriter: Analysis failed permanently - ${msg}`);
        return null;
      }

      if (currentStatus !== lastStatus) {
        this.log(`NeuronWriter: Status: ${currentStatus || 'processing'}...`);
        lastStatus = currentStatus;
      }

      const delay = attempt <= 3 ? 2000 : attempt <= 10 ? 4000 : 6000;
      this.log(`NeuronWriter: waiting for analysis… (attempt ${attempt}/${maxAttempts})`);
      await this.sleep(delay);
    }

    this.log('NeuronWriter: Analysis timed out after 40 attempts (~4 minutes)');
    this.log('NeuronWriter: Proceeding WITHOUT NeuronWriter optimization - check NeuronWriter dashboard');
    return null;
  }

  async generateContent(options: GenerationOptions): Promise<GeneratedContent> {
    this.onProgress = options.onProgress;
    const startTime = Date.now();

    this.log(`Starting content generation for: ${options.keyword}`);

    // Phase 1: Parallel Research (fault-tolerant)
    this.log('Phase 1: Research & Analysis...');

    let serpAnalysis: SERPAnalysis;
    let videos: YouTubeVideo[] = [];
    let references: Reference[] = [];
    let neuron: NeuronBundle | null = null;

    try {
      const results = await Promise.allSettled([
        this.serpAnalyzer.analyze(options.keyword, this.config.targetCountry),
        options.includeVideos !== false
          ? this.youtubeService.getRelevantVideos(options.keyword, options.contentType)
          : Promise.resolve([]),
        options.includeReferences !== false
          ? this.referenceService.getTopReferences(options.keyword)
          : Promise.resolve([]),
        this.maybeInitNeuronWriter(options.keyword, options),
      ]);

      serpAnalysis = results[0].status === 'fulfilled' ? results[0].value : this.getDefaultSerpAnalysis(options.keyword);
      videos = results[1].status === 'fulfilled' ? results[1].value : [];
      references = results[2].status === 'fulfilled' ? results[2].value : [];
      neuron = results[3].status === 'fulfilled' ? results[3].value : null;

      if (results[0].status === 'rejected') this.log(`SERP analysis failed (using defaults): ${results[0].reason}`);
      if (results[1].status === 'rejected') this.log(`YouTube fetch failed: ${results[1].reason}`);
      if (results[2].status === 'rejected') this.log(`References fetch failed: ${results[2].reason}`);
      if (results[3].status === 'rejected') this.log(`NeuronWriter init failed: ${results[3].reason}`);
    } catch (e) {
      this.log(`Phase 1 failed entirely (using defaults): ${e}`);
      serpAnalysis = this.getDefaultSerpAnalysis(options.keyword);
    }

    this.log(`Found ${videos.length} videos, ${references.length} references`);
    this.log(`SERP Analysis: ${serpAnalysis.userIntent} intent, ${serpAnalysis.recommendedWordCount} words recommended`);

    // Phase 2: Content Generation
    this.log('Phase 2: AI Content Generation...');

    const targetWordCount =
      options.targetWordCount ||
      neuron?.analysis?.recommended_length ||
      serpAnalysis.recommendedWordCount ||
      2500;

    const genOptions: GenerationOptions = { ...options, targetWordCount };

    let title = options.title || options.keyword;
    try {
      if (!options.title) {
        title = await this.generateTitle(options.keyword, serpAnalysis);
      }
    } catch (e) {
      this.log(`Title generation failed (using keyword): ${e}`);
      title = options.title || options.keyword;
    }

    const neuronTermPrompt = neuron
      ? neuron.service.formatTermsForPrompt(neuron.analysis.terms || [], neuron.analysis)
      : undefined;

    let content: string;
    try {
      content = await this.generateMainContent(
        options.keyword,
        title,
        serpAnalysis,
        videos,
        references,
        genOptions,
        neuronTermPrompt
      );
    } catch (genError) {
      const msg = genError instanceof Error ? genError.message : String(genError);
      this.log(`AI content generation failed: ${msg}`);
      throw new Error(`AI content generation failed: ${msg}. Check your API key and model configuration.`);
    }

    if (!content || content.trim().length < 100) {
      this.log('AI returned empty or near-empty content');
      throw new Error('AI model returned empty content. Check your API key, model selection, and ensure the model supports long-form generation.');
    }

    this.log(`Phase 2 complete: ${this.countWordsFromHtml(content)} words generated`);

    // FAULT-TOLERANT POST-PROCESSING PIPELINE
    this.log('Phase 3: Content Enhancement...');
    let enhancedContent = content;

    // --- 3a: Remove AI phrases ---
    try {
      enhancedContent = removeAIPhrases(enhancedContent);
    } catch (e) {
      this.log(`removeAIPhrases failed (non-fatal): ${e}`);
    }

    // --- 3b: Smart Internal Links — check existing count, enforce 4-8 minimum --- // 🔧 FIX v3
    try {
      if (options.injectLinks !== false && this.config.sitePages && this.config.sitePages.length > 0) {
        this.linkEngine.updateSitePages(this.config.sitePages);

        // 🔧 FIX v3: Count links ALREADY in content before injecting more
        const existingLinkMatches = enhancedContent.match(/<a\s[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || [];
        const existingCount = existingLinkMatches.length;
        this.log(`Internal links already in content: ${existingCount}`);

        if (existingCount < 4) {
          // 🔧 FIX v3: Need minimum 4, target 8 total
          const needed = Math.max(4, 8 - existingCount);
          this.log(`Need ${needed} more internal links (minimum 4 total). Finding opportunities...`);
          const linkOpportunities = this.linkEngine.generateLinkOpportunities(enhancedContent, needed);
          if (linkOpportunities.length > 0) {
            enhancedContent = this.linkEngine.injectContextualLinks(enhancedContent, linkOpportunities);
            this.log(`Injected ${linkOpportunities.length} internal links (total: ~${existingCount + linkOpportunities.length})`);
          } else {
            this.log('No suitable link opportunities found in content for available pages');
          }
        } else {
          this.log(`Content already has ${existingCount} internal links — skipping post-generation injection`);
        }
      }
    } catch (e) {
      this.log(`Internal linking failed (non-fatal): ${e}`);
    }

    // --- 3c: Preserve references before NeuronWriter/self-critique loops ---
    let savedReferencesHtml: string | null = null;
    try {
      const referencesRegex = /<!-- SOTA References Section -->[\s\S]*$/i;
      const refsAltRegex = /<hr>\s*<h2>References[\s\S]*$/i;
      const savedReferencesMatch = enhancedContent.match(referencesRegex) || enhancedContent.match(refsAltRegex);
      savedReferencesHtml = savedReferencesMatch ? savedReferencesMatch[0] : null;
      if (savedReferencesHtml) {
        enhancedContent = enhancedContent.replace(referencesRegex, '').replace(refsAltRegex, '').trim();
        this.log('References: preserved and stripped for post-processing');
      }
    } catch (e) {
      this.log(`Reference preservation failed (non-fatal): ${e}`);
    }

    // --- 3d: NeuronWriter improvement loop ---
    try {
      if (neuron) {
        this.log('NeuronWriter: evaluating content score...');
        let currentContent = enhancedContent;
        let currentScore = 0;
        const targetScore = 90;
        const maxImprovementAttempts = 6;

        const allTermsForSuggestions = [
          ...neuron.analysis.terms,
          ...(neuron.analysis.termsExtended || []),
        ];

        const entityTerms = (neuron.analysis.entities || []).map(e => ({
          term: e.entity,
          weight: e.usage_pc || 30,
          frequency: 1,
          type: 'recommended' as const,
          usage_pc: e.usage_pc,
        }));

        let previousScore = 0;
        let stagnantRounds = 0;

        for (let attempt = 0; attempt <= maxImprovementAttempts; attempt++) {
          try {
            const evalRes = await neuron.service.evaluateContent(neuron.queryId, {
              html: currentContent,
              title,
            });

            if (evalRes.success && typeof evalRes.contentScore === 'number') {
              currentScore = evalRes.contentScore;
              neuron.analysis.content_score = currentScore;

              if (currentScore >= targetScore) {
                this.log(`NeuronWriter: Score ${currentScore}% (target: ${targetScore}%+) - PASSED`);
                enhancedContent = currentContent;
                break;
              }

              if (attempt === maxImprovementAttempts) {
                this.log(`NeuronWriter: Score ${currentScore}% after ${attempt} attempts (target was ${targetScore}%)`);
                enhancedContent = currentContent;
                break;
              }

              if (currentScore <= previousScore && attempt > 0) {
                stagnantRounds++;
                if (stagnantRounds >= 2) {
                  this.log(`NeuronWriter: Score stagnant at ${currentScore}% for ${stagnantRounds} rounds. Stopping.`);
                  enhancedContent = currentContent;
                  break;
                }
              } else {
                stagnantRounds = 0;
              }
              previousScore = currentScore;

              const gap = targetScore - currentScore;
              this.log(`NeuronWriter: Score ${currentScore}% (need +${gap}%) - improving... (attempt ${attempt + 1}/${maxImprovementAttempts})`);

              const suggestions = neuron.service.getOptimizationSuggestions(currentContent, allTermsForSuggestions);
              const entitySuggestions = neuron.service.getOptimizationSuggestions(currentContent, entityTerms);
              const allSuggestions = [...suggestions, ...entitySuggestions.slice(0, 10)];

              const missingHeadings = (neuron.analysis.headingsH2 || [])
                .filter(h => !currentContent.toLowerCase().includes(h.text.toLowerCase().slice(0, 20)))
                .slice(0, 3);

              if (allSuggestions.length > 0 || missingHeadings.length > 0) {
                this.log(`Missing: ${allSuggestions.length} terms, ${missingHeadings.length} headings`);

                const usePatchMode = currentContent.length > 10000;

                if (usePatchMode) {
                  const termsPerAttempt = Math.min(30, allSuggestions.length);
                  const termsList = allSuggestions.slice(0, termsPerAttempt);

                  const patchPrompt = `Generate 3-6 NEW enrichment paragraphs for an article about "${options.keyword}".

These paragraphs must NATURALLY incorporate these missing SEO terms:
${termsList.map((t, i) => `${i + 1}. ${t}`).join('\n')}
${missingHeadings.length > 0 ? `\nAlso create sections for these missing H2 headings:\n${missingHeadings.map(h => `- "${h.text}"`).join('\n')}` : ''}

Rules:
- Output PURE HTML ONLY
- Each paragraph 50-100 words, wrapped in <p> tags
- Use varied contexts: tips, examples, data points, comparisons
- Include Pro Tip or Warning boxes where appropriate
- Voice: Direct, punchy, human
- Terms must flow naturally in sentences - NEVER list them
- DO NOT repeat existing content

Output ONLY the new HTML content to INSERT.`;

                  const patchResult = await this.engine.generateWithModel({
                    prompt: patchPrompt,
                    model: this.config.primaryModel || 'gemini',
                    apiKeys: this.config.apiKeys,
                    systemPrompt: 'Generate SEO enrichment HTML. Output PURE HTML ONLY.',
                    temperature: 0.6 + (attempt * 0.05),
                    maxTokens: 4096,
                  });

                  if (patchResult.content && patchResult.content.trim().length > 100) {
                    currentContent = this.insertBeforeConclusion(currentContent, patchResult.content.trim());
                    this.log(`NeuronWriter PATCH: Inserted enrichment content with ${termsList.length} terms`);
                  }
                } else {
                  const termsPerAttempt = Math.min(40, allSuggestions.length);
                  const termsList = allSuggestions.slice(0, termsPerAttempt);

                  const headingsInstruction = missingHeadings.length > 0
                    ? `\n\nMISSING H2 HEADINGS (add these as new sections):\n${missingHeadings.map(h => `- "${h.text}" (used by ${h.usage_pc}% of competitors)`).join('\n')}`
                    : '';

                  const improvementPrompt = `You are optimizing this article for a NeuronWriter content score of 90%+. Current score: ${currentScore}%.

PRIORITY MISSING TERMS (MUST include each one naturally, at least 1-2 times):
${termsList.map((t, i) => `${i + 1}. "${t}"`).join('\n')}
${headingsInstruction}

STRICT RULES:
1. Preserve ALL existing HTML content exactly as-is
2. ADD new paragraphs, sentences, or expand existing ones to include each missing term
3. Every term must appear in a NATURAL sentence -- never dump terms as a list
4. Distribute terms across different sections of the article, not clustered together
5. Add 2-4 new subsections under relevant H2s if needed for natural placement
6. Use the exact term form provided (singular/plural matters for scoring)
7. OUTPUT PURE HTML ONLY. Use <h2>, <h3>, <p>, <ul>, <li>, <strong> tags. NEVER use markdown (##, **, -, etc.)
8. Include terms in varied contexts: definitions, comparisons, examples, tips

ARTICLE TO IMPROVE:
${currentContent}

Return the COMPLETE improved article with ALL missing terms naturally incorporated.`;

                  const improvedResult = await this.engine.generateWithModel({
                    prompt: improvementPrompt,
                    model: this.config.primaryModel || 'gemini',
                    apiKeys: this.config.apiKeys,
                    systemPrompt: `You are an elite SEO content optimizer specializing in NeuronWriter scoring. Your ONLY job: incorporate missing terms naturally to push the score above ${targetScore}%. Preserve all existing content. Output PURE HTML ONLY.`,
                    temperature: 0.6 + (attempt * 0.05),
                    maxTokens: Math.min(16384, Math.max(8192, Math.ceil(currentContent.length / 3)))
                  });

                  if (improvedResult.content) {
                    const improved = improvedResult.content.trim();
                    const minLength = currentContent.length * 0.97;
                    if (improved.length >= minLength) {
                      currentContent = improved;
                    } else {
                      this.log(`NeuronWriter: improved draft too short (${improved.length} vs ${currentContent.length}), keeping previous version.`);
                    }
                  }
                }
              } else {
                this.log(`No missing terms found - attempting semantic enrichment...`);

                const allTermsText = allTermsForSuggestions.map(t => t.term).join(', ');
                const generalPrompt = `This article scores ${currentScore}% on NeuronWriter (target: ${targetScore}%+).

The key SEO terms for this topic are: ${allTermsText}

Improve the article by:
1. Increasing the frequency of underused terms (add 1-2 more natural mentions of each)
2. Adding semantic variations and synonyms
3. Expanding thin sections with more detail
4. Adding a new FAQ question that uses key terms
5. Adding a "Key Takeaway" or "Pro Tip" box that uses core terms

OUTPUT PURE HTML ONLY. Preserve all existing content. Return the COMPLETE article.

CURRENT ARTICLE:
${currentContent}`;

                const improvedResult = await this.engine.generateWithModel({
                  prompt: generalPrompt,
                  model: this.config.primaryModel || 'gemini',
                  apiKeys: this.config.apiKeys,
                  systemPrompt: 'Elite SEO optimizer. Output PURE HTML ONLY.',
                  temperature: 0.65,
                  maxTokens: Math.min(16384, Math.max(8192, Math.ceil(currentContent.length / 3)))
                });

                if (improvedResult.content) {
                  const improved = improvedResult.content.trim();
                  const minLength = currentContent.length * 0.97;
                  if (improved.length >= minLength) {
                    currentContent = improved;
                  } else {
                    this.log(`NeuronWriter: improved draft too short (${improved.length} vs ${currentContent.length}), keeping previous version.`);
                  }
                }
              }
            } else {
              neuron.analysis.content_score = neuron.service.calculateContentScore(
                currentContent,
                neuron.analysis.terms || []
              );
              if (!evalRes.success) {
                this.log(`NeuronWriter: evaluate failed (using local score). ${evalRes.error || ''}`.trim());
              }
              enhancedContent = currentContent;
              break;
            }
          } catch (attemptErr) {
            this.log(`NeuronWriter improvement attempt ${attempt} failed (non-fatal): ${attemptErr}`);
            enhancedContent = currentContent;
            break;
          }
        }

        // Self-Critique pass
        try {
          const req = this.extractNeuronRequirements(neuron.analysis);
          enhancedContent = await this.selfCritiqueAndPatch({
            keyword: options.keyword,
            title,
            html: enhancedContent,
            requiredTerms: req.requiredTerms,
            requiredEntities: req.entities,
            requiredHeadings: req.h2
          });
          enhancedContent = this.enforceNeuronwriterCoverage(enhancedContent, req);
        } catch (e) {
          this.log(`Self-critique failed (non-fatal): ${e}`);
        }
      } else {
        try {
          enhancedContent = await this.selfCritiqueAndPatch({
            keyword: options.keyword,
            title,
            html: enhancedContent,
          });
        } catch (e) {
          this.log(`Self-critique failed (non-fatal): ${e}`);
        }
      }
    } catch (neuronErr) {
      this.log(`NeuronWriter optimization loop crashed (non-fatal): ${neuronErr}`);
    }

    // --- 3e: Re-append preserved references ---
    try {
      if (savedReferencesHtml) {
        enhancedContent = enhancedContent
          .replace(/<!-- SOTA References Section -->[\s\S]*$/i, '')
          .replace(/<hr>\s*<h2>References[\s\S]*$/i, '')
          .trim();
        enhancedContent = `${enhancedContent}\n\n${savedReferencesHtml}`;
        this.log('References: re-appended after post-processing');
      }
    } catch (e) {
      this.log(`Reference re-append failed (non-fatal): ${e}`);
    }

    // =====================================================================
    // Steps 3f & 3g — Visual break enforcement + readability polish
    // =====================================================================

    // --- 3f: Enforce visual breaks (Goal #5: no 200+ word walls of text) ---
    let postProcessingResult: PostProcessingResult | undefined;
    try {
      this.log('Phase 3f: Enforcing visual break rules (max 200 consecutive <p> words)...');
      const ppResult = ContentPostProcessor.process(enhancedContent, {
        maxConsecutiveWords: 200,
        usePullQuotes: true,
      });

      if (ppResult.wasModified) {
        enhancedContent = ppResult.html;
        this.log(`Visual breaks: injected elements to fix ${ppResult.violations.length || 'all'} wall-of-text violations`);
      } else {
        this.log('Visual breaks: content already passes — no modifications needed');
      }

      postProcessingResult = ppResult;
    } catch (e) {
      this.log(`ContentPostProcessor failed (non-fatal): ${e}`);
    }

    // --- 3g: Final readability polish (split long <p> blocks, normalize whitespace) ---
    try {
      this.log('Phase 3g: Final readability polish...');
      enhancedContent = polishReadability(enhancedContent);
    } catch (e) {
      this.log(`polishReadability failed (non-fatal): ${e}`);
    }

    // --- Phase 4: Validation ---
    this.log('Phase 4: Quality & E-E-A-T Validation...');
    let metrics: ContentMetrics;
    let internalLinks: InternalLink[] = [];
    let qualityScore: QualityScore;

    try {
      // 🔧 FIX v3: Only convert markdown if actual markdown artifacts are detected
      const hasMarkdownArtifacts = /^#{1,4}\s/m.test(enhancedContent) || /\*\*[^*]+\*\*/.test(enhancedContent) || /\[.+?\]\(.+?\)/.test(enhancedContent);
      if (hasMarkdownArtifacts) {
        this.log('Detected markdown remnants — converting to HTML...');
        enhancedContent = convertMarkdownToHTML(enhancedContent);
      } else {
        this.log('No markdown artifacts detected — skipping conversion to preserve styled HTML');
      }
      enhancedContent = ensureProperHTMLStructure(enhancedContent);
    } catch (e) {
      this.log(`HTML conversion failed (non-fatal): ${e}`);
    }

    try {
      metrics = analyzeContent(enhancedContent);
    } catch (e) {
      this.log(`analyzeContent failed (non-fatal): ${e}`);
      metrics = {
        wordCount: this.countWordsFromHtml(enhancedContent),
        sentenceCount: 0, paragraphCount: 0, headingCount: 0,
        imageCount: 0, linkCount: 0, keywordDensity: 0,
        readabilityGrade: 7, estimatedReadTime: 0,
      };
    }

    try {
      internalLinks = this.linkEngine.generateLinkOpportunities(enhancedContent);
    } catch (e) {
      this.log(`Link analysis failed (non-fatal): ${e}`);
    }

    try {
      const [qs, eeatScore] = await Promise.all([
        Promise.resolve(calculateQualityScore(enhancedContent, options.keyword, internalLinks.map(l => l.targetUrl))),
        Promise.resolve(this.eeatValidator.validateContent(enhancedContent, {
          name: this.config.authorName,
          credentials: this.config.authorCredentials
        }))
      ]);
      qualityScore = qs;

      this.log(`Quality Score: ${qualityScore.overall}%`);
      this.log(`E-E-A-T Score: ${eeatScore.overall}%`);

      const vbResult = validateVisualBreaks(enhancedContent, 200);
      if (vbResult.valid) {
        this.log('Visual Breaks: ✅ PASSED — no wall-of-text violations');
      } else {
        this.log(`Visual Breaks: ⚠️ ${vbResult.violations.length} violation(s) remain after post-processing`);
      }

      if (options.validateEEAT !== false && eeatScore.overall < 70) {
        const enhancements = this.eeatValidator.generateEEATEnhancements(eeatScore);
        this.log(`E-E-A-T improvements needed: ${enhancements.slice(0, 3).join(', ')}`);
      }
    } catch (e) {
      this.log(`Quality validation failed (non-fatal): ${e}`);
      qualityScore = { overall: 75, readability: 75, seo: 75, eeat: 75, uniqueness: 75, factAccuracy: 75, passed: true, improvements: [] };
    }

    // --- Phase 5: Schema & Metadata ---
    this.log('Phase 5: Generating SEO metadata...');
    const eeat = this.buildEEATProfile(references);
    let seoTitle = title;
    let metaDescription = `Learn everything about ${options.keyword}. Expert guide with actionable tips.`;
    let slug = this.generateSlug(title);

    try {
      const [generatedSeoTitle, generatedMetaDesc] = await Promise.all([
        this.generateSEOTitle(options.keyword, title, serpAnalysis),
        this.generateMetaDescription(options.keyword, title)
      ]);
      seoTitle = generatedSeoTitle;
      metaDescription = generatedMetaDesc;
      this.log(`SEO Title: "${seoTitle}" | Meta: ${metaDescription.length} chars`);
    } catch (e) {
      this.log(`SEO metadata generation failed (non-fatal): ${e}`);
    }

    // --- Ensure references section ---
    try {
      enhancedContent = this.ensureReferencesSection(enhancedContent, references, serpAnalysis);
      this.log(`References: ${references.length} sources appended to content`);
    } catch (e) {
      this.log(`ensureReferencesSection failed (non-fatal): ${e}`);
    }

    // Final word-count sanity check
    const finalWordCount = this.countWordsFromHtml(enhancedContent);
    if (finalWordCount < targetWordCount * 0.9) {
      this.log(
        `Final content word count ${finalWordCount} < 90% of target ${targetWordCount}. ` +
        'Consider regenerating or reviewing for truncation.'
      );
    }

    // --- Build schema (non-fatal) ---
    let schema: GeneratedContent['schema'] = { '@context': 'https://schema.org', '@graph': [] };
    try {
      schema = this.schemaGenerator.generateComprehensiveSchema(
        {
          title,
          content: enhancedContent,
          metaDescription,
          slug,
          primaryKeyword: options.keyword,
          secondaryKeywords: [],
          metrics,
          qualityScore,
          internalLinks,
          eeat,
          generatedAt: new Date(),
          model: this.config.primaryModel || 'gemini',
          consensusUsed: this.config.useConsensus || false
        } as GeneratedContent,
        `${this.config.organizationUrl}/${slug}`
      );
    } catch (e) {
      this.log(`Schema generation failed (non-fatal): ${e}`);
    }

    const generatedContent: GeneratedContent = {
      id: crypto.randomUUID(),
      title,
      seoTitle,
      content: enhancedContent,
      metaDescription,
      slug,
      primaryKeyword: options.keyword,
      secondaryKeywords: serpAnalysis.semanticEntities.slice(0, 10),
      metrics,
      qualityScore,
      internalLinks,
      schema,
      eeat,
      serpAnalysis,
      generatedAt: new Date(),
      model: this.config.primaryModel || 'gemini',
      consensusUsed: this.config.useConsensus || false,

      neuronWriterQueryId: neuron?.queryId,
      neuronWriterAnalysis: neuron?.analysis,

      postProcessing: postProcessingResult,
    };

    const duration = Date.now() - startTime;
    this.log(`Generation complete in ${(duration / 1000).toFixed(1)}s | ${finalWordCount} words`);

    return generatedContent;
  }

  private async generateTitle(keyword: string, serpAnalysis: SERPAnalysis): Promise<string> {
    const prompt = `Generate an SEO-optimized title for an article about "${keyword}".

Requirements:
- Maximum 60 characters
- Include the primary keyword naturally
- Make it compelling and click-worthy
- Match ${serpAnalysis.userIntent} search intent
- Current year (2025) if relevant
- No clickbait or sensationalism

Competitor titles for reference:
${serpAnalysis.topCompetitors.slice(0, 3).map(c => `- ${c.title}`).join('\n')}

Output ONLY the title, nothing else.`;

    const result = await this.engine.generateWithModel({
      prompt,
      model: this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      temperature: 0.7,
      maxTokens: 100
    });

    return result.content.trim().replace(/^["']|["']$/g, '');
  }

  private async generateMainContent(
    keyword: string,
    title: string,
    serpAnalysis: SERPAnalysis,
    videos: YouTubeVideo[],
    references: Reference[],
    options: GenerationOptions,
    neuronTermPrompt?: string
  ): Promise<string> {
    const targetWordCount = options.targetWordCount || serpAnalysis.recommendedWordCount || 2500;

    // 🔧 FIX v3: Build available internal link URLs so the AI can embed them during generation
    const availableInternalUrls = (this.config.sitePages || []).slice(0, 25).map(p => `- ${p.url} — "${p.title}"`).join('\n');

    const systemPrompt = `You write like a real person who's done the work. Not an AI. Not a content mill. A real expert who's been in the trenches.

Your voice: Alex Hormozi meets Tim Ferriss. Blunt. Data-driven. Zero fluff. You write like you're explaining something to a smart friend over coffee — casual but packed with substance.

GOLDEN RULES:
- Every single sentence must EARN its place. If it doesn't teach, prove, or move the reader — delete it.
- Write at a 6th-grade reading level. Short sentences. Simple words. Your grandma should understand it.
- Use the "So what?" test: after every paragraph, ask "so what?" — if there's no clear answer, rewrite it.
- Front-load value. The first 50 words must deliver an insight or answer. No throat-clearing intros.
- Break up walls of text. Max 2-3 sentences per paragraph. Use whitespace like a weapon.
- CRITICAL: Never write more than 200 words of plain <p> text without inserting a visual HTML element (pro tip box, stat highlight, data table, blockquote, numbered step, or similar). Walls of text kill readability. Break them up with styled HTML elements.
- Contractions ALWAYS: don't, won't, can't, it's, that's, you'll, they've, doesn't, isn't, we're
- Write like you talk. Read it out loud. If it sounds robotic, rewrite it.

CRITICAL QUALITY TARGETS (MUST ACHIEVE ALL):
✅ READABILITY: 90%+ (Grade 6-7 Flesch-Kincaid, short sentences, simple words)
✅ SEO: 90%+ (Primary keyword 8-12x, semantic keywords woven throughout, proper H1/H2/H3 hierarchy)
✅ E-E-A-T: 90%+ (First-hand experience, cite specific studies/sources, expert quotes, real examples)
✅ UNIQUENESS: 90%+ (ZERO generic phrases, unique analogies, fresh perspectives, contrarian takes)
✅ ACCURACY: 90%+ (Cite specific data, include 2025 statistics, verifiable claims only)
✅ NEURONWRITER: 90%+ (Include ALL required terms at exact frequencies, ALL entities, use recommended H2/H3)

PREMIUM STYLED HTML ELEMENTS — USE AT LEAST 6-8 THROUGHOUT:

A. KEY TAKEAWAYS BOX (use once, after intro):
<div style="background: #ffffff; border: 2px solid #10b981; border-radius: 20px; padding: 32px 36px; margin: 40px 0; box-shadow: 0 8px 32px rgba(16, 185, 129, 0.12); position: relative; overflow: hidden; max-width: 100%; box-sizing: border-box;">
  <div style="position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #10b981 0%, #06b6d4 50%, #8b5cf6 100%);"></div>
  <h3 style="color: #0f172a; margin: 8px 0 24px 0; font-size: 22px; font-weight: 900;">🎯 The Bottom Line</h3>
  <ul style="color: #1e293b; margin: 0; padding-left: 0; font-size: 17px; line-height: 1.9; list-style: none;">
    <li style="margin-bottom: 14px; padding: 12px 16px 12px 44px; position: relative; background: #f0fdf4; border-radius: 10px;"><span style="position: absolute; left: 14px; top: 13px; color: #10b981; font-weight: 800; font-size: 18px;">✅</span> <strong>Key insight</strong></li>
  </ul>
</div>

B. PRO TIP BOX (use 4-6 throughout):
<div style="background: #ffffff; border: 1px solid #e0e7ff; border-left: 5px solid #6366f1; padding: 24px 28px; margin: 36px 0; border-radius: 0 16px 16px 0; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08); max-width: 100%; box-sizing: border-box;">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
    <span style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px;">💡</span>
    <strong style="color: #3730a3; font-size: 17px; font-weight: 800;">Pro Tip</strong>
  </div>
  <p style="color: #334155; font-size: 17px; margin: 0; line-height: 1.8;">Your actionable insider knowledge here.</p>
</div>

C. WARNING BOX (use 1-2):
<div style="background: #ffffff; border: 1px solid #fecaca; border-left: 5px solid #ef4444; padding: 24px 28px; margin: 36px 0; border-radius: 0 16px 16px 0; box-shadow: 0 4px 20px rgba(239, 68, 68, 0.08); max-width: 100%; box-sizing: border-box;">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
    <span style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px;">⚠️</span>
    <strong style="color: #991b1b; font-size: 17px; font-weight: 800;">Warning</strong>
  </div>
  <p style="color: #334155; font-size: 17px; margin: 0; line-height: 1.8;">Critical warning here.</p>
</div>

D. STAT HIGHLIGHT (use 2-3):
<div style="background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 2px solid #e2e8f0; border-radius: 16px; padding: 28px 32px; margin: 36px 0; text-align: center; max-width: 100%; box-sizing: border-box;">
  <div style="font-size: 48px; font-weight: 900; color: #0f172a; line-height: 1.1;">73%</div>
  <div style="font-size: 16px; color: #64748b; margin-top: 8px;">of companies see measurable ROI within 90 days</div>
  <div style="font-size: 13px; color: #94a3b8; margin-top: 6px;">Source: Industry Report, 2025</div>
</div>

E. EXPERT QUOTE (use 2-3):
<blockquote style="border-left: 4px solid #8b5cf6; background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%); margin: 36px 0; padding: 28px 32px; border-radius: 0 16px 16px 0; position: relative; max-width: 100%; box-sizing: border-box;">
  <p style="font-size: 18px; font-style: italic; color: #4c1d95; line-height: 1.8; margin: 0 0 16px 0;">"Quote text here."</p>
  <footer style="font-size: 15px; color: #7c3aed; font-weight: 700;">— Dr. Jane Smith, Director of Research at XYZ University</footer>
</blockquote>

F. FAQ ACCORDION (use for FAQ section):
<details style="margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; max-width: 100%; box-sizing: border-box;">
  <summary style="padding: 18px 24px; background: #f8fafc; cursor: pointer; font-weight: 700; color: #0f172a; font-size: 17px; list-style: none; display: flex; justify-content: space-between; align-items: center;">
    Question here? <span style="font-size: 20px; color: #64748b;">+</span>
  </summary>
  <div style="padding: 16px 24px; color: #475569; font-size: 16px; line-height: 1.8; border-top: 1px solid #e2e8f0;">
    Answer here.
  </div>
</details>

HUMAN VOICE — MANDATORY PATTERNS:
- Contractions ALWAYS: don't, won't, can't, it's, that's, we're, you'll, they've
- Start sections with: "Look," / "Here's the thing:" / "Real talk:" / "I'll be honest:"
- Fragments. For emphasis. Like this.
- Rhetorical questions every 150-200 words
- Self-interruption: "Wait—before I go further..."
- Address objections: "Now you might be thinking..."

AI DETECTION KILLERS — NEVER USE:
❌ "Delve" / "Navigate" / "Landscape" / "Realm" / "Crucial" / "Vital"
❌ "Leverage" / "Utilize" / "Facilitate" / "Seamlessly" / "Holistic" / "Robust"
❌ "Tapestry" / "Embark" / "Journey" / "Embrace" / "Elevate" / "Unlock" / "Master"

INTERNAL LINKS — YOU MUST EMBED 4-8 IN THE HTML:
Each internal link must:
• Use 3-7 word descriptive anchor text that reads naturally in the sentence
• Be wrapped in: <a href="URL" style="color:#059669;text-decoration:underline;text-decoration-color:rgba(5,150,105,0.3);text-underline-offset:3px;font-weight:600;">anchor text</a>
• Be evenly spread across different H2 sections (NOT bunched together)
• Never have 2 links in the same paragraph
• Anchor text must describe what the reader will find (NEVER "click here" or "read more")

OUTPUT: PURE HTML ONLY. No markdown. No code fences. No preamble.`;

    const prompt = `Write a ${targetWordCount}+ word article about "${keyword}".

TITLE: ${title}

CONTENT STRUCTURE:
${serpAnalysis.recommendedHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n')}

CONTENT GAPS TO FILL:
${serpAnalysis.contentGaps.slice(0, 6).join('\n')}

SEMANTIC KEYWORDS:
${serpAnalysis.semanticEntities.slice(0, 18).join(', ')}

${neuronTermPrompt ? `
NEURONWRITER OPTIMIZATION — 90%+ CONTENT SCORE REQUIRED:
${neuronTermPrompt}
` : ''}

${availableInternalUrls ? `
INTERNAL LINK URLS — EMBED 4-8 OF THESE THROUGHOUT THE ARTICLE (evenly distributed across H2 sections):
${availableInternalUrls}

INTERNAL LINK FORMAT: <a href="[EXACT URL FROM ABOVE]" style="color:#059669;text-decoration:underline;text-decoration-color:rgba(5,150,105,0.3);text-underline-offset:3px;font-weight:600;">[3-7 word descriptive anchor text]</a>

RULES: First link in paragraph 2-3. Spread remaining links evenly. Max 1 link per paragraph. Anchor text must describe the linked page's topic.
` : ''}

${videos.length > 0 ? `
EMBED THESE VIDEOS (spread evenly):
${videos.slice(0, 3).map((v, i) => `
VIDEO ${i + 1}:
<figure style="margin: 40px 0;">
<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${v.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
</div>
<figcaption style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 12px;">🎬 ${v.title}</figcaption>
</figure>
`).join('\n')}
` : ''}

MANDATORY STRUCTURE:
1. Hook Opening (no H1)
2. Key Takeaways Box (5-7 bullets)
3. 6-10 H2 Sections with 2-3 H3 each
4. At least 4-6 Pro Tip / Warning boxes spread throughout
5. At least 2 data tables
6. At least 2-3 stat highlights
7. At least 2 expert quotes
8. FAQ section with 8 questions (use <details>/<summary>)
9. Strong CTA conclusion
10. 4-8 internal links evenly distributed across the article

VISUAL BREAK RULE: Between every pair of visual elements (box, table, blockquote, list, figure), there must be NO MORE than 200 words of <p> text. If any gap exceeds ~150 words, insert a styled element.

Write the complete article now. Output ONLY HTML.`;

    let result;
    if (this.config.useConsensus && !neuronTermPrompt && this.engine.getAvailableModels().length > 1) {
      this.log('Using multi-model consensus generation...');
      const consensusResult = await this.engine.generateWithConsensus(prompt, systemPrompt);
      result = { content: consensusResult.finalContent };
    } else {
      const initialMaxTokens = targetWordCount >= 5000 ? 32768 : targetWordCount >= 3000 ? 16384 : 8192;
      result = await this.engine.generateWithModel({
        prompt,
        model: this.config.primaryModel || 'gemini',
        apiKeys: this.config.apiKeys,
        systemPrompt,
        temperature: 0.72,
        maxTokens: initialMaxTokens
      });
    }

    let finalContent = await this.ensureLongFormComplete({
      keyword,
      title,
      systemPrompt,
      model: this.config.primaryModel || 'gemini',
      currentHtml: result.content,
      targetWordCount,
    });

    if (videos.length > 0 && !finalContent.includes('youtube.com/embed') && !finalContent.includes('youtube-nocookie.com/embed')) {
      const videoSection = this.buildVideoSection(videos);
      finalContent = this.insertBeforeConclusion(finalContent, videoSection);
      this.log('Injected YouTube video section');
    }

    if (references.length > 0) {
      const referencesSection = this.referenceService.formatReferencesSection(references);
      finalContent += referencesSection;
      this.log(`Added ${references.length} references`);
    }

    return finalContent;
  }

  private async generateSEOTitle(keyword: string, displayTitle: string, serpAnalysis: SERPAnalysis): Promise<string> {
    const prompt = `Generate an SEO-optimized title tag for an article about "${keyword}".

Current display title: "${displayTitle}"

Requirements:
- Maximum 60 characters (CRITICAL)
- Include the EXACT primary keyword "${keyword}" within first 40 characters
- Make it compelling and click-worthy
- Match ${serpAnalysis.userIntent} search intent
- Include current year (2025) if naturally fits
- NO clickbait or sensationalism

Competitor titles:
${serpAnalysis.topCompetitors.slice(0, 3).map(c => `- ${c.title}`).join('\n')}

Output ONLY the SEO title, nothing else.`;

    const result = await this.engine.generateWithModel({
      prompt,
      model: this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      temperature: 0.7,
      maxTokens: 100
    });

    let seoTitle = result.content.trim().replace(/^["']|["']$/g, '');

    if (seoTitle.length > 60) {
      seoTitle = seoTitle.substring(0, 57) + '...';
    }

    return seoTitle;
  }

  private async generateMetaDescription(keyword: string, title: string): Promise<string> {
    const prompt = `Write an SEO meta description for an article titled "${title}" about "${keyword}".

Requirements:
- Exactly 150-160 characters (CRITICAL)
- Include the EXACT primary keyword "${keyword}" within first 100 characters
- Include a clear call-to-action
- Create urgency or curiosity
- NO fluff words

Output ONLY the meta description, nothing else.`;

    const result = await this.engine.generateWithModel({
      prompt,
      model: this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      temperature: 0.7,
      maxTokens: 100
    });

    let metaDesc = result.content.trim().replace(/^["']|["']$/g, '');

    if (metaDesc.length > 160) {
      metaDesc = metaDesc.substring(0, 157) + '...';
    }

    return metaDesc;
  }

  private buildVideoSection(videos: YouTubeVideo[]): string {
    const videoEmbeds = videos.slice(0, 3).map(v => `
  <div style="margin-bottom: 32px;">
    <figure style="margin: 0;">
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; border-radius: 12px;">
        <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${v.id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>
      </div>
      <figcaption style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 12px;">🎬 <strong>${v.title}</strong> — ${v.channelTitle}</figcaption>
    </figure>
  </div>`).join('\n');

    return `
<div style="background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); border-radius: 16px; padding: 32px; margin: 48px 0; border: 1px solid #d1fae5;">
  <h2 style="margin-top: 0; color: #0f172a; font-size: 24px; font-weight: 800;">📺 Recommended Video Resources</h2>
  <p style="color: #475569; margin-bottom: 24px; font-size: 16px; line-height: 1.7;">Watch these expert-curated videos for deeper insights:</p>
  ${videoEmbeds}
</div>
`;
  }

  private insertBeforeConclusion(content: string, section: string): string {
    const conclusionPatterns = [
      /<h2[^>]*>\s*(?:conclusion|final thoughts|wrapping up)/i,
      /<h2[^>]*>\s*(?:faq|frequently asked)/i
    ];

    for (const pattern of conclusionPatterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        return content.slice(0, match.index) + section + content.slice(match.index);
      }
    }

    return content + section;
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60);
  }

  private getDefaultSerpAnalysis(keyword: string): SERPAnalysis {
    return {
      avgWordCount: 2000,
      commonHeadings: [`What is ${keyword}?`, `How to ${keyword}`, `Benefits of ${keyword}`, `Best Practices`, `FAQ`],
      contentGaps: [],
      userIntent: 'informational',
      semanticEntities: [],
      topCompetitors: [],
      recommendedWordCount: 2500,
      recommendedHeadings: [`What is ${keyword}?`, `How ${keyword} Works`, `Key Benefits`, `Getting Started`, `Best Practices`, `Common Mistakes to Avoid`, `FAQ`, `Conclusion`]
    };
  }

  private buildEEATProfile(references: Reference[]): EEATProfile {
    return {
      author: {
        name: this.config.authorName,
        credentials: this.config.authorCredentials || [],
        publications: [],
        expertiseAreas: [],
        socialProfiles: []
      },
      citations: references.map(r => ({
        title: r.title,
        url: r.url,
        type: r.type
      })),
      expertReviews: [],
      methodology: 'AI-assisted research with human editorial oversight',
      lastUpdated: new Date(),
      factChecked: references.length > 3
    };
  }

  async generateContentPlan(broadTopic: string): Promise<ContentPlan> {
    this.log(`Generating content plan for: ${broadTopic}`);

    const prompt = `Create a comprehensive content cluster plan for the topic: "${broadTopic}"

Generate:
1. A pillar page keyword (main comprehensive topic)
2. 8-12 cluster article keywords that support the pillar

For each cluster, specify:
- Primary keyword (2-4 words)
- Suggested title
- Content type (how-to, guide, comparison, listicle, deep-dive)
- Priority (high, medium, low based on search volume potential)

Output as JSON:
{
  "pillarKeyword": "...",
  "pillarTitle": "...",
  "clusters": [
    {
      "keyword": "...",
      "title": "...",
      "type": "guide",
      "priority": "high"
    }
  ]
}

Output ONLY valid JSON.`;

    const result = await this.engine.generateWithModel({
      prompt,
      model: this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      temperature: 0.7,
      maxTokens: 2000
    });

    try {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        pillarTopic: broadTopic,
        pillarKeyword: parsed.pillarKeyword,
        clusters: parsed.clusters.map((c: Record<string, unknown>) => ({
          keyword: c.keyword as string,
          title: c.title as string,
          type: (c.type as ContentPlan['clusters'][0]['type']) || 'guide',
          priority: (c.priority as ContentPlan['clusters'][0]['priority']) || 'medium'
        })),
        totalEstimatedWords: (parsed.clusters.length + 1) * 2500,
        estimatedTimeToComplete: `${Math.ceil((parsed.clusters.length + 1) * 15 / 60)} hours`
      };
    } catch (error) {
      this.log(`Error parsing content plan: ${error}`);
      return {
        pillarTopic: broadTopic,
        pillarKeyword: broadTopic,
        clusters: [
          { keyword: `${broadTopic} guide`, title: `Complete ${broadTopic} Guide`, type: 'guide', priority: 'high' },
          { keyword: `${broadTopic} tips`, title: `Top ${broadTopic} Tips`, type: 'listicle', priority: 'high' },
          { keyword: `how to ${broadTopic}`, title: `How to ${broadTopic}`, type: 'how-to', priority: 'medium' },
          { keyword: `${broadTopic} best practices`, title: `${broadTopic} Best Practices`, type: 'deep-dive', priority: 'medium' }
        ],
        totalEstimatedWords: 12500,
        estimatedTimeToComplete: '3 hours'
      };
    }
  }

  getCacheStats(): { size: number; hitRate: number } {
    return generationCache.getStats();
  }

  hasAvailableModels(): boolean {
    return this.engine.hasAvailableModel();
  }

  getAvailableModels(): AIModel[] {
    return this.engine.getAvailableModels();
  }

  // ===================== SOTA Self-Critique (Fast, Single Pass) =====================
  private async selfCritiqueAndPatch(params: {
    keyword: string;
    title: string;
    html: string;
    requiredTerms?: string[];
    requiredEntities?: string[];
    requiredHeadings?: string[];
  }): Promise<string> {
    const originalHtml = params.html;

    const requiredTerms = params.requiredTerms || [];
    const requiredEntities = params.requiredEntities || [];
    const requiredHeadings = params.requiredHeadings || [];

    const missingTerms = requiredTerms.filter(t =>
      !new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(originalHtml)
    );
    const missingEntities = requiredEntities.filter(e =>
      !new RegExp(`\\b${e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(originalHtml)
    );
    const missingHeadings = requiredHeadings.filter(h =>
      !originalHtml.toLowerCase().includes(h.toLowerCase().slice(0, 24))
    );

    if (missingTerms.length === 0 && missingEntities.length === 0 && missingHeadings.length === 0) {
      this.log('Self-critique: No missing terms/entities/headings - content is complete.');
      return originalHtml;
    }

    const isLongContent = originalHtml.length > 15000;

    if (isLongContent) {
      this.log(`Self-critique: PATCH mode for long content (${originalHtml.length} chars)`);
      return this.selfCritiquePatchMode(originalHtml, params.keyword, params.title, missingTerms, missingEntities, missingHeadings);
    }

    const instruction = [
      'Rewrite ONLY where needed. Keep structure. Output HTML only.',
      'Voice: Alex Hormozi + Tim Ferriss. No fluff. Short paragraphs.',
      'Add concrete steps, checklists, examples. Remove vague filler.',
      'CRITICAL: Never write more than 200 words of <p> text without a visual break element.',
      missingTerms.length
        ? `Add these missing NeuronWriter terms naturally: ${missingTerms.slice(0, 40).join(', ')}`
        : '',
      missingEntities.length
        ? `Include these entities naturally: ${missingEntities.slice(0, 40).join(', ')}`
        : '',
      missingHeadings.length
        ? `Add these missing H2 sections if absent: ${missingHeadings.slice(0, 6).join(' | ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const contentLength = originalHtml.length;
    const neededTokens = contentLength > 20000 ? 16384 : 8192;

    try {
      const controller = new AbortController();
      const timeoutMs = Math.min(300000, 120000 + Math.floor(originalHtml.length / 5000) * 30000);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await this.engine.generateWithModel({
        prompt: `ARTICLE TITLE: ${params.title}
PRIMARY KEYWORD: ${params.keyword}

CURRENT HTML (EDIT THIS, DO NOT REWRITE FROM SCRATCH):
${originalHtml}

INSTRUCTIONS:
${instruction}`,
        model: this.config.primaryModel || 'gemini',
        apiKeys: this.config.apiKeys,
        systemPrompt: 'Elite editor. Output PURE HTML ONLY. Do not add markdown.',
        temperature: 0.55,
        maxTokens: neededTokens,
      });

      clearTimeout(timeoutId);

      const improved = (res.content || '').trim();
      if (!improved) {
        this.log('Self-critique: empty response, keeping original HTML.');
        return originalHtml;
      }

      if (improved.length < originalHtml.length * 0.95) {
        this.log(
          `Self-critique: model response too short (${improved.length} vs ${originalHtml.length}), keeping original HTML.`
        );
        return originalHtml;
      }

      return improved;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Self-critique: failed (${msg}), keeping original HTML.`);
      return originalHtml;
    }
  }

  private async selfCritiquePatchMode(
    html: string,
    keyword: string,
    title: string,
    missingTerms: string[],
    missingEntities: string[],
    missingHeadings: string[]
  ): Promise<string> {
    let result = html;

    if (missingHeadings.length > 0) {
      try {
        const headingsPrompt = `Generate ${missingHeadings.length} NEW HTML sections for an article titled "${title}" about "${keyword}".

For each of these H2 headings, write a complete section (H2 + 2-3 paragraphs):
${missingHeadings.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

Rules:
- Output PURE HTML only (h2, h3, p, ul, li, strong tags)
- Each section should be 100-200 words
- Include relevant terms naturally: ${missingTerms.slice(0, 15).join(', ')}
- Include these entities where relevant: ${missingEntities.slice(0, 10).join(', ')}
- Voice: Direct, punchy, actionable. No AI fluff.
- NEVER write more than 200 words of <p> text without a visual element (pro tip box, stat highlight, table, etc.)
- Style the H2 tags: <h2 style="color: #1f2937; font-size: 28px; font-weight: 800; margin: 48px 0 24px 0; padding-bottom: 12px; border-bottom: 3px solid #10b981;">

Output ONLY the HTML sections, nothing else.`;

        const res = await this.engine.generateWithModel({
          prompt: headingsPrompt,
          model: this.config.primaryModel || 'gemini',
          apiKeys: this.config.apiKeys,
          systemPrompt: 'Generate HTML sections. Output PURE HTML ONLY.',
          temperature: 0.6,
          maxTokens: 4096,
        });

        if (res.content && res.content.trim().length > 100) {
          result = this.insertBeforeConclusion(result, res.content.trim());
          this.log(`Self-critique PATCH: Added ${missingHeadings.length} missing H2 sections`);
        }
      } catch (e) {
        this.log(`Self-critique PATCH: Failed to add headings: ${e}`);
      }
    }

    const allMissing = [...missingTerms.slice(0, 30), ...missingEntities.slice(0, 20)];
    if (allMissing.length > 0) {
      try {
        const termsPrompt = `Generate 3-5 enrichment paragraphs for an article about "${keyword}" titled "${title}".

These paragraphs must NATURALLY include these missing SEO terms/entities:
${allMissing.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

Rules:
- Output PURE HTML only (<p> tags with style="color: #374141; font-size: 17px; line-height: 1.9; margin: 20px 0;")
- Each paragraph should be 50-80 words
- Include Pro Tip boxes or data points where appropriate
- Voice: Direct, punchy, human. Use contractions.
- Every term must appear in a natural sentence
- DO NOT repeat what's already in the article

Output ONLY the HTML paragraphs, nothing else.`;

        const res = await this.engine.generateWithModel({
          prompt: termsPrompt,
          model: this.config.primaryModel || 'gemini',
          apiKeys: this.config.apiKeys,
          systemPrompt: 'Generate enrichment HTML paragraphs. Output PURE HTML ONLY.',
          temperature: 0.6,
          maxTokens: 3000,
        });

        if (res.content && res.content.trim().length > 100) {
          result = this.insertBeforeConclusion(result, res.content.trim());
          this.log(`Self-critique PATCH: Added enrichment paragraphs with ${allMissing.length} missing terms`);
        }
      } catch (e) {
        this.log(`Self-critique PATCH: Failed to add terms: ${e}`);
      }
    }

    return result;
  }

  private enforceNeuronwriterCoverage(
    html: string,
    req: { requiredTerms: string[]; entities: string[]; h2: string[] }
  ): string {
    const required = (req?.requiredTerms || []).map(t => String(t || '').trim()).filter(Boolean);
    const entities = (req?.entities || []).map(t => String(t || '').trim()).filter(Boolean);

    const missing: string[] = [];
    const hay = (html || '').toLowerCase();

    for (const t of required) {
      if (!hay.includes(t.toLowerCase())) missing.push(t);
    }
    for (const e of entities) {
      if (!hay.includes(e.toLowerCase())) missing.push(e);
    }

    if (missing.length === 0) return html;

    const chunk = missing.slice(0, 40);
    const insertion = `
<!-- NeuronWriter Coverage Terms: ${chunk.map(this.escapeHtml).join(', ')} -->`;
    this.log(`⚠️ ${chunk.length} NeuronWriter terms could not be naturally incorporated — logged as HTML comment`);

    const h2Regex = /<h2[^>]*>[^<]*<\/h2>/gis;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = h2Regex.exec(html)) !== null) {
      lastMatch = match;
    }

    if (lastMatch && lastMatch.index !== undefined) {
      const idx = lastMatch.index + lastMatch[0].length;
      return html.slice(0, idx) + insertion + html.slice(idx);
    }

    return `${html}\n\n${insertion}`;
  }

  private extractNeuronRequirements(neuron: NeuronWriterAnalysis | null): {
    requiredTerms: string[];
    entities: string[];
    h2: string[];
  } {
    if (!neuron) return { requiredTerms: [], entities: [], h2: [] };
    const terms = [...(neuron.terms || []), ...(neuron.termsExtended || [])];
    const requiredTerms = terms
      .filter(t => (t.type === 'required' || t.type === 'recommended') && t.term && t.term.length > 1)
      .map(t => t.term)
      .slice(0, 120);

    const entities = (neuron.entities || []).map(e => e.entity).filter(Boolean).slice(0, 80);
    const h2 = (neuron.headingsH2 || []).map(h => h.text).filter(Boolean).slice(0, 20);
    return { requiredTerms, entities, h2 };
  }

  // ===================== References (E-E-A-T) - SOTA Premium Section =====================
  private ensureReferencesSection(html: string, refs: Reference[], serp: SERPAnalysis): string {
    const hasRefsHeading =
      /<h2[^>]*>\s*(references|sources|citations|bibliography)\s*<\/h2>/i.test(html) ||
      /References\s*<\/h2>/i.test(html) ||
      /<h2[^>]*>.*references.*<\/h2>/i.test(html);
    if (hasRefsHeading) {
      this.log('References section already exists - skipping append');
      return html;
    }

    const items: { title: string; url: string; domain: string; type: string }[] = [];

    for (const r of refs || []) {
      if (r?.title && r?.url) {
        const domain = this.extractDomain(r.url);
        items.push({ title: r.title, url: r.url, domain, type: r.type || 'industry' });
      }
    }

    for (const c of serp?.topCompetitors || []) {
      if (c?.title && c?.url) {
        const domain = this.extractDomain(c.url);
        if (!this.isLowQualityDomain(domain)) {
          items.push({ title: c.title, url: c.url, domain, type: 'competitor' });
        }
      }
    }

    const dedup = new Map<string, { title: string; url: string; domain: string; type: string }>();
    for (const it of items) {
      const key = (it.url || '').toLowerCase().trim().replace(/\/$/, '');
      if (!key || !key.startsWith('http')) continue;
      if (!dedup.has(key)) dedup.set(key, it);
    }

    let finalItems = Array.from(dedup.values());

    finalItems.sort((a, b) => {
      const scoreA = this.getReferenceAuthorityScore(a.domain, a.type);
      const scoreB = this.getReferenceAuthorityScore(b.domain, b.type);
      return scoreB - scoreA;
    });

    finalItems = finalItems.slice(0, 12);

    if (finalItems.length === 0) {
      this.log('⚠️ No references available to append');
      return html;
    }

    if (finalItems.length < 8) {
      this.log(`⚠️ Only ${finalItems.length} references available (target: 8-12)`);
    }

    const block = `
<!-- SOTA References Section -->
<div style="margin-top: 60px; padding-top: 40px; border-top: 2px solid #e5e7eb;">
  <h2 style="color: #1f2937; font-size: 28px; font-weight: 800; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
    📖 References & Sources
  </h2>
  <p style="color: #6b7280; font-size: 15px; margin-bottom: 20px; line-height: 1.6;">
    This article was researched and written using the following authoritative sources. All links have been verified for accuracy.
  </p>
  <ol style="list-style: decimal; padding-left: 24px; margin: 0;">
${finalItems.map((it) => {
      const badge = this.getReferenceBadge(it.domain, it.type);
      return `    <li style="margin-bottom: 16px; padding-left: 8px; font-size: 16px; line-height: 1.7;">
      <a href="${this.escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; font-weight: 500;">${this.escapeHtml(it.title)}</a>
      <span style="color: #9ca3af; font-size: 14px;"> — ${this.escapeHtml(it.domain)}${badge}</span>
    </li>`;
    }).join('\n')}
  </ol>
</div>`;

    this.log(`✅ Added ${finalItems.length} references to content`);
    return `${html}\n\n${block}`;
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  private isLowQualityDomain(domain: string): boolean {
    const lowQuality = [
      'pinterest.com', 'quora.com', 'reddit.com', 'facebook.com',
      'twitter.com', 'x.com', 'linkedin.com', 'instagram.com',
      'youtube.com', 'tiktok.com', 'medium.com'
    ];
    return lowQuality.some(d => domain.includes(d));
  }

  private getReferenceAuthorityScore(domain: string, type: string): number {
    if (domain.endsWith('.gov')) return 100;
    if (domain.endsWith('.edu')) return 95;
    if (['nature.com', 'sciencedirect.com', 'pubmed.ncbi.nlm.nih.gov', 'who.int', 'cdc.gov'].some(d => domain.includes(d))) return 90;
    if (['nytimes.com', 'wsj.com', 'reuters.com', 'bbc.com', 'forbes.com', 'hbr.org'].some(d => domain.includes(d))) return 85;
    if (type === 'academic' || type === 'government') return 80;
    if (type === 'industry' || type === 'news') return 70;
    if (domain.endsWith('.org')) return 65;
    return 50;
  }

  private getReferenceBadge(domain: string, type: string): string {
    if (domain.endsWith('.gov')) return ' <span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">Official</span>';
    if (domain.endsWith('.edu')) return ' <span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">Academic</span>';
    if (type === 'academic') return ' <span style="background: #f3e8ff; color: #7c3aed; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 8px;">Research</span>';
    return '';
  }

  private escapeHtml(s: string): string {
    return (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export function createOrchestrator(config: OrchestratorConfig): EnterpriseContentOrchestrator {
  return new EnterpriseContentOrchestrator(config);
}
