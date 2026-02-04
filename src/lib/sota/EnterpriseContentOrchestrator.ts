// ============================================================
// ENTERPRISE CONTENT ORCHESTRATOR - Full Workflow Management
// ============================================================

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
  ContentPlan
} from './types';

import { SOTAContentGenerationEngine, createSOTAEngine, type ExtendedAPIKeys } from './SOTAContentGenerationEngine';
import { SERPAnalyzer, createSERPAnalyzer } from './SERPAnalyzer';
import { YouTubeService, createYouTubeService } from './YouTubeService';
import { ReferenceService, createReferenceService } from './ReferenceService';
import { SOTAInternalLinkEngine, createInternalLinkEngine } from './SOTAInternalLinkEngine';
import { SchemaGenerator, createSchemaGenerator } from './SchemaGenerator';
import { calculateQualityScore, analyzeContent, removeAIPhrases } from './QualityValidator';
import { EEATValidator, createEEATValidator } from './EEATValidator';
import { generationCache } from './cache';
import { NeuronWriterService, createNeuronWriterService, type NeuronWriterAnalysis } from './NeuronWriterService';

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
  // NeuronWriter integration
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
  neuronWriterQueryId?: string; // Pre-analyzed NeuronWriter query
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
      // Common partial-output placeholders some models append
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
    
    // CRITICAL: Minimum absolute word count - never accept less than 2000 words
    const minAbsoluteWords = Math.max(2000, targetWordCount);
    // Target at least 90% of the specified word count for quality
    const minTargetWords = Math.floor(minAbsoluteWords * 0.9);

    this.log(`📝 Initial content: ${words} words (target: ${minAbsoluteWords}+, minimum acceptable: ${minTargetWords})`);

    // Heuristics:
    // - if it explicitly asks to continue, it's definitely incomplete
    // - if it's way below target word count, keep going
    const looksIncomplete = (s: string) =>
      /content continues|continue\?|would you like me to continue/i.test(s);

    // CRITICAL FIX: More aggressive continuation - up to 8 attempts, stricter word count check
    const maxContinuations = 8;
    for (let i = 1; i <= maxContinuations; i++) {
      // STRICT CHECK: Must reach minimum target OR look complete
      const tooShort = words < minTargetWords;
      const explicitlyIncomplete = looksIncomplete(html);
      
      if (!tooShort && !explicitlyIncomplete) {
        this.log(`✅ Content meets target: ${words}/${minTargetWords} words (${Math.round(words/minTargetWords*100)}%)`);
        break;
      }

      const percentComplete = Math.round((words / minTargetWords) * 100);
      const remainingWords = minAbsoluteWords - words;
      this.log(`⚠️ Content too short: ${words}/${minTargetWords} words (${percentComplete}%). Need ${remainingWords} more. Continuing... (${i}/${maxContinuations})`);

      const tail = html.slice(-2000);
      const continuationPrompt = `Continue the SAME HTML article titled "${title}" about "${keyword}" EXACTLY where it left off.

Rules (MUST FOLLOW):
- Output ONLY the HTML continuation (no preface, no apology, no brackets, no notes)
- Do NOT repeat the H1 or reprint earlier sections
- Do NOT ask questions like “Would you like me to continue?”
- Keep the same tone, formatting, and premium boxes/tables
- Finish the article fully (including the FAQ section + final CTA as instructed)

Last part of the current article (for context):
${tail}

Now continue:`;

      const next = await this.engine.generateWithModel({
        prompt: continuationPrompt,
        model,
        apiKeys: this.config.apiKeys,
        systemPrompt,
        temperature: 0.72,
      });

      const nextChunk = this.stripModelContinuationArtifacts(next.content);
      if (!nextChunk || nextChunk.length < 100) {
        this.log('⚠️ Model returned empty or minimal content; stopping continuation.');
        break;
      }

      // Avoid infinite loops when the model repeats the same tail
      const dedupeWindow = html.slice(-600);
      const chunkStart = nextChunk.slice(0, 600);
      if (dedupeWindow && chunkStart && dedupeWindow.includes(chunkStart)) {
        this.log('⚠️ Continuation looks repetitive; stopping to avoid duplication.');
        break;
      }

      html = `${html}\n\n${nextChunk}`.trim();
      const newWords = this.countWordsFromHtml(html);
      this.log(`📝 Added ${newWords - words} words → Total: ${newWords} words`);
      words = newWords;
    }

    // Final check - warn if still short
    if (words < minTargetWords) {
      this.log(`⚠️ WARNING: Final content is ${words} words (${Math.round(words/minTargetWords*100)}%), below target of ${minTargetWords}. May need regeneration.`);
    } else {
      this.log(`✅ Long-form content complete: ${words} words`);
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

    this.log('NeuronWriter: 🔍 Initializing integration...');

    let queryId = queryIdFromOptions;
    
    // STEP 1: If no query ID provided, SEARCH for existing query first
    if (!queryId) {
      this.log(`NeuronWriter: searching for existing query matching "${keyword}"...`);
      const searchResult = await service.findQueryByKeyword(projectId, keyword);
      
      if (searchResult.success && searchResult.query) {
        queryId = searchResult.query.id;
        const status = searchResult.query.status || 'unknown';
        this.log(`NeuronWriter: ✅ FOUND existing query "${searchResult.query.keyword}" (ID: ${queryId}, status: ${status}) - using it!`);
      } else {
        // STEP 2: Only create NEW query if none exists
        this.log(`NeuronWriter: no existing query found, creating new Content Writer query...`);
        const created = await service.createQuery(projectId, keyword);
        if (!created.success || !created.queryId) {
          this.log(`NeuronWriter: ❌ FAILED to create query - ${created.error || 'unknown error'}`);
          this.log(`NeuronWriter: Proceeding WITHOUT NeuronWriter optimization`);
          return null;
        }
        queryId = created.queryId;
        this.log(`NeuronWriter: ✅ Created NEW Content Writer query (ID: ${queryId})`);
      }
    } else {
      this.log(`NeuronWriter: Using provided query ID: ${queryId}`);
    }

    // Poll until ready with extended timeout for fresh queries
    // NeuronWriter analysis can take 2-4 minutes for new keywords
    const maxAttempts = 40; // ~4 minutes with backoff
    let lastStatus = '';
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const analysisRes = await service.getQueryAnalysis(queryId);
      
      if (analysisRes.success && analysisRes.analysis) {
        const summary = service.getAnalysisSummary(analysisRes.analysis);
        this.log(`NeuronWriter: ✅ Analysis READY - ${summary}`);
        
        // Validate we got meaningful data
        const hasTerms = (analysisRes.analysis.terms?.length || 0) > 0;
        const hasHeadings = (analysisRes.analysis.headingsH2?.length || 0) > 0;
        
        if (!hasTerms && !hasHeadings) {
          this.log(`NeuronWriter: ⚠️ WARNING - Analysis returned but contains no terms or headings`);
        }
        
        return { service, queryId, analysis: analysisRes.analysis };
      }

      const msg = analysisRes.error || 'Query not ready';
      const currentStatus = msg.match(/Status:\s*(\w+)/i)?.[1] || '';
      
      // If it's not-ready, retry; otherwise treat as hard failure.
      const looksNotReady = /not ready|status|waiting|in progress/i.test(msg);
      if (!looksNotReady) {
        this.log(`NeuronWriter: ❌ Analysis failed permanently - ${msg}`);
        return null;
      }

      // Only log status changes to reduce noise
      if (currentStatus !== lastStatus) {
        this.log(`NeuronWriter: Status: ${currentStatus || 'processing'}...`);
        lastStatus = currentStatus;
      }

      // Progressive backoff: 2s → 4s → 6s
      const delay = attempt <= 3 ? 2000 : attempt <= 10 ? 4000 : 6000;
      this.log(`NeuronWriter: waiting for analysis… (attempt ${attempt}/${maxAttempts})`);
      await this.sleep(delay);
    }

    this.log('NeuronWriter: ⏱️ Analysis timed out after 40 attempts (~4 minutes)');
    this.log('NeuronWriter: Proceeding WITHOUT NeuronWriter optimization - check NeuronWriter dashboard');
    return null;
  }

  async generateContent(options: GenerationOptions): Promise<GeneratedContent> {
    this.onProgress = options.onProgress;
    const startTime = Date.now();

    this.log(`Starting content generation for: ${options.keyword}`);

    // Phase 1: Parallel Research
    this.log('Phase 1: Research & Analysis...');
    const [serpAnalysis, videos, references, neuron] = await Promise.all([
      this.serpAnalyzer.analyze(options.keyword, this.config.targetCountry),
      options.includeVideos !== false 
        ? this.youtubeService.getRelevantVideos(options.keyword, options.contentType)
        : Promise.resolve([]),
      options.includeReferences !== false
        ? this.referenceService.getTopReferences(options.keyword)
        : Promise.resolve([]),
      this.maybeInitNeuronWriter(options.keyword, options),
    ]);

    this.log(`Found ${videos.length} videos, ${references.length} references`);
    this.log(`SERP Analysis: ${serpAnalysis.userIntent} intent, ${serpAnalysis.recommendedWordCount} words recommended`);

    // Phase 2: Content Generation
    this.log('Phase 2: AI Content Generation...');

    // Prefer NeuronWriter recommended length when available
    const targetWordCount =
      options.targetWordCount ||
      neuron?.analysis?.recommended_length ||
      serpAnalysis.recommendedWordCount ||
      2500;

    const genOptions: GenerationOptions = { ...options, targetWordCount };

    const title = options.title || await this.generateTitle(options.keyword, serpAnalysis);

    // Pass the FULL analysis to get all keywords, entities, and headings
    const neuronTermPrompt = neuron
      ? neuron.service.formatTermsForPrompt(neuron.analysis.terms || [], neuron.analysis)
      : undefined;

    const content = await this.generateMainContent(
      options.keyword,
      title,
      serpAnalysis,
      videos,
      references,
      genOptions,
      neuronTermPrompt
    );

    // Phase 3: Enhancement
    this.log('Phase 3: Content Enhancement...');
    let enhancedContent = content;

    // Remove AI phrases
    enhancedContent = removeAIPhrases(enhancedContent);

    // Inject internal links from crawled sitemap
    if (options.injectLinks !== false && this.config.sitePages && this.config.sitePages.length > 0) {
      this.log(`Finding internal links from ${this.config.sitePages.length} crawled pages...`);
      
      // Update the link engine with current site pages
      this.linkEngine.updateSitePages(this.config.sitePages);
      
      // Generate link opportunities (target 8-12 high-quality contextual links)
      const linkOpportunities = this.linkEngine.generateLinkOpportunities(enhancedContent, 12);
      
      if (linkOpportunities.length > 0) {
        enhancedContent = this.linkEngine.injectContextualLinks(enhancedContent, linkOpportunities);
        this.log(`✅ Injected ${linkOpportunities.length} internal links to REAL site pages:`);
        linkOpportunities.slice(0, 5).forEach(link => {
          this.log(`   → "${link.anchor}" → ${link.targetUrl}`);
        });
      } else {
        this.log('⚠️ No matching anchor text found in content for available pages');
      }
    } else {
      this.log('⚠️ No site pages available for internal linking - crawl sitemap first');
    }

    // NeuronWriter content score (after links/cleanup so the score reflects what you'll publish)
    if (neuron) {
      this.log('NeuronWriter: evaluating content score...');
      const evalRes = await neuron.service.evaluateContent(neuron.queryId, {
        html: enhancedContent,
        title,
      });

      if (evalRes.success && typeof evalRes.contentScore === 'number') {
        neuron.analysis.content_score = evalRes.contentScore;
      } else {
        // Fallback: local approximation
        neuron.analysis.content_score = neuron.service.calculateContentScore(
          enhancedContent,
          neuron.analysis.terms || []
        );
        if (!evalRes.success) {
          this.log(`NeuronWriter: evaluate failed (using local score). ${evalRes.error || ''}`.trim());
        }
      }
    }

    // Phase 4: Validation (parallel quality + E-E-A-T)
    this.log('Phase 4: Quality & E-E-A-T Validation...');
    const metrics = analyzeContent(enhancedContent);
    const internalLinks = this.linkEngine.generateLinkOpportunities(enhancedContent);
    
    // Run quality and E-E-A-T validation in parallel
    const [qualityScore, eeatScore] = await Promise.all([
      Promise.resolve(calculateQualityScore(enhancedContent, options.keyword, internalLinks.map(l => l.targetUrl))),
      Promise.resolve(this.eeatValidator.validateContent(enhancedContent, {
        name: this.config.authorName,
        credentials: this.config.authorCredentials
      }))
    ]);

    this.log(`Quality Score: ${qualityScore.overall}%`);
    this.log(`E-E-A-T Score: ${eeatScore.overall}% (E:${eeatScore.experience} X:${eeatScore.expertise} A:${eeatScore.authoritativeness} T:${eeatScore.trustworthiness})`);
    
    // If E-E-A-T score is low and validation is enabled, log recommendations
    if (options.validateEEAT !== false && eeatScore.overall < 70) {
      const enhancements = this.eeatValidator.generateEEATEnhancements(eeatScore);
      this.log(`E-E-A-T improvements needed: ${enhancements.slice(0, 3).join(', ')}`);
    }

    // Phase 5: Schema & Metadata + SEO Title Generation
    this.log('Phase 5: Generating SEO metadata...');
    const eeat = this.buildEEATProfile(references);
    
    // Generate SEO-optimized title and meta description in parallel
    const [seoTitle, metaDescription] = await Promise.all([
      this.generateSEOTitle(options.keyword, title, serpAnalysis),
      this.generateMetaDescription(options.keyword, title)
    ]);
    
    const slug = this.generateSlug(title);
    this.log(`SEO Title: "${seoTitle}" | Meta: ${metaDescription.length} chars`);

    const generatedContent: GeneratedContent = {
      id: crypto.randomUUID(),
      title,
      seoTitle, // NEW: Separate SEO-optimized title for WordPress
      content: enhancedContent,
      metaDescription,
      slug,
      primaryKeyword: options.keyword,
      secondaryKeywords: serpAnalysis.semanticEntities.slice(0, 10),
      metrics,
      qualityScore,
      internalLinks,
      schema: this.schemaGenerator.generateComprehensiveSchema(
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
      ),
      eeat,
      serpAnalysis,
      generatedAt: new Date(),
      model: this.config.primaryModel || 'gemini',
      consensusUsed: this.config.useConsensus || false,

      neuronWriterQueryId: neuron?.queryId,
      neuronWriterAnalysis: neuron?.analysis,
    };

    const duration = Date.now() - startTime;
    this.log(`Generation complete in ${(duration / 1000).toFixed(1)}s`);

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
    
    // ULTRA-PREMIUM CONTENT GENERATION PROMPT - ALEX HORMOZI x TIM FERRISS STYLE
    // TARGET: 90%+ SCORES IN ALL CATEGORIES (Readability, SEO, E-E-A-T, Uniqueness, Accuracy)
    const systemPrompt = `You are the ULTIMATE content strategist—a fusion of Alex Hormozi's no-BS directness and Tim Ferriss's experimental curiosity. Your content MUST score 90%+ in ALL quality metrics: Readability, SEO, E-E-A-T, Uniqueness, and Accuracy.

🎯 CRITICAL QUALITY TARGETS (MUST ACHIEVE ALL):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ READABILITY: 90%+ (Grade 6-7 Flesch-Kincaid, short sentences, simple words)
✅ SEO: 90%+ (Primary keyword 8-12x, semantic keywords woven throughout, proper H1/H2/H3 hierarchy)
✅ E-E-A-T: 90%+ (First-hand experience, cite specific studies/sources, expert quotes, real examples)
✅ UNIQUENESS: 90%+ (ZERO generic phrases, unique analogies, fresh perspectives, contrarian takes)
✅ ACCURACY: 90%+ (Cite specific data, include 2025 statistics, verifiable claims only)
✅ NEURONWRITER: 90%+ (Include ALL required terms at exact frequencies, ALL entities, use recommended H2/H3)

🧠 THE HORMOZI-FERRISS DNA:

**HORMOZI ENERGY (80% of your voice):**
• Punch them in the face with VALUE in sentence #1. No warm-ups. No "In this article we'll explore..."
• Talk TO them, not AT them. First person ("I", "my", "we") in EVERY paragraph.
• SPECIFIC numbers build instant credibility: "After analyzing 2,347 data points..." or "This strategy generated $847,293 in revenue..."
• Sentences are short. Punchy. Direct. Like bullets.
• Paragraphs are MAX 3 sentences. Walls of text = reader death.
• Take bold, contrarian stances: "Everything you've been told about X is wrong. Here's why..."
• Tell micro-stories with vivid details: names, dates, exact amounts, specific outcomes
• Be opinionated: "Most people fail because they do X. Don't be most people."

**FERRISS PRECISION (20% of your voice):**
• "What if we did the opposite?" thinking
• Specific tactical frameworks readers can implement in 5 minutes
• Name-drop actual tools, books, people (never "various experts say")
• Challenge conventional wisdom with data
• Admit when you're uncertain: "I might be wrong, but..."
• Question assumptions the reader didn't know they had

🚫 AI DETECTION KILLERS - NEVER USE THESE PHRASES (INSTANT QUALITY FAIL):
❌ "In today's fast-paced world" / "In this comprehensive guide" / "Let's dive in" / "Let's explore"
❌ "Furthermore" / "Moreover" / "In conclusion" / "It's worth noting" / "It's important to note"
❌ "Delve" / "Explore" / "Landscape" / "Realm" / "Crucial" / "Vital" / "Navigate"
❌ "Leverage" / "Utilize" / "Facilitate" / "Implement" / "Optimize" / "Streamline"
❌ "Game-changer" / "Revolutionary" / "Cutting-edge" / "State-of-the-art" / "Best-in-class"
❌ "Seamlessly" / "Effortlessly" / "Meticulously" / "Holistic" / "Robust" / "Comprehensive"
❌ "Tapestry" / "Embark" / "Journey" / "Embrace" / "Transform" / "Unleash" / "Elevate"
❌ "Unlock" / "Master" / "Supercharge" / "Skyrocket" / "Game-changing" / "Mind-blowing"
❌ Starting sentences with "This" or "It" repeatedly
❌ "Whether you're a beginner or an expert..." constructions
❌ Any phrase that sounds like corporate AI slop
❌ "In order to" (just say "to")
❌ "In terms of" (delete it entirely)
❌ "When it comes to" (just get to the point)

✅ HUMAN WRITING PATTERNS - USE THESE CONSTANTLY:
• Start with: "Look," / "Here's the thing:" / "Real talk:" / "I'll be honest:" / "Confession:" / "Truth bomb:"
• Incomplete sentences. For emphasis. Like this.
• Strong opinions: "Honestly? Most advice on this topic is garbage."
• Show genuine emotion: "This drives me insane about the industry..."
• Uncertainty is human: "I could be totally wrong here, but..."
• Contractions EVERYWHERE: don't, won't, can't, it's, that's, we're, you'll, they've, doesn't, isn't
• Rhetorical questions: "Sound familiar?" / "Make sense?" / "See the pattern?" / "Getting it?"
• Casual transitions: "Anyway," / "So here's what happened:" / "Point is:" / "Quick tangent:" / "Back to the main point:"
• Real language: "zero chance" / "dead wrong" / "the real kicker" / "here's the thing" / "brutal truth" / "no-brainer"
• Self-interruption: "Wait—before I go further, you need to understand this..."
• Interjections: "Seriously." / "Wild, right?" / "I know." / "Bear with me." / "Stick with me here."
• Address objections: "Now you might be thinking..." / "I hear you—"
• Curse mildly if natural: "damn", "hell", "crap" (but not F-bombs)

📐 E-E-A-T SIGNALS (MANDATORY FOR 90%+ SCORE):
• Cite at least 5 specific studies, reports, or statistics with years (e.g., "A 2024 Harvard study found...")
• Include 2-3 expert quotes with real names and credentials
• Mention first-hand experience: "When I tested this..." / "In my 12 years of..."
• Reference specific tools/products you've personally used
• Include methodology explanations: "Here's exactly how I measured this..."
• Add credentials signals: "According to Dr. [Name], a [credential] at [institution]..."
• Cite industry reports: "[Company] 2024 State of [Industry] Report shows..."

📐 MANDATORY HTML STRUCTURE (USE THESE ULTRA-PREMIUM ELEMENTS):

1. BLUF HOOK (first 50 words): 
Start with the ANSWER or a bold statement. No "welcome to" garbage. Give them the gold immediately.

2. KEY TAKEAWAYS BOX (right after hook) - GLASSMORPHIC DESIGN:
<div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.1) 100%); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 24px; padding: 32px 36px; margin: 40px 0; box-shadow: 0 8px 32px rgba(16, 185, 129, 0.15), 0 0 0 1px rgba(16, 185, 129, 0.2), inset 0 1px 1px rgba(255,255,255,0.1);">
  <h3 style="color: #10b981; margin: 0 0 20px 0; font-size: 24px; font-weight: 800; display: flex; align-items: center; gap: 12px; text-shadow: 0 0 30px rgba(16, 185, 129, 0.5);">🎯 The Bottom Line (TL;DR)</h3>
  <ul style="color: #e5e7eb; margin: 0; padding-left: 28px; font-size: 17px; line-height: 2;">
    <li style="margin-bottom: 12px;"><strong style="color: #34d399;">Key insight:</strong> Actionable point here</li>
    <li style="margin-bottom: 12px;"><strong style="color: #34d399;">Key insight:</strong> Actionable point here</li>
    <li style="margin-bottom: 0;"><strong style="color: #34d399;">Key insight:</strong> Actionable point here</li>
  </ul>
</div>

3. PRO TIP BOXES (4-6 throughout) - NEUMORPHIC STYLE:
<div style="background: linear-gradient(145deg, #1e40af, #1e3a8a); border-left: 6px solid #60a5fa; padding: 24px 28px; margin: 32px 0; border-radius: 0 20px 20px 0; box-shadow: 8px 8px 24px rgba(30, 64, 175, 0.3), -4px -4px 16px rgba(96, 165, 250, 0.1), inset 0 1px 1px rgba(255,255,255,0.05);">
  <strong style="color: #93c5fd; font-size: 16px; display: flex; align-items: center; gap: 8px;">💡 Pro Tip</strong>
  <p style="color: #dbeafe; font-size: 16px; margin: 10px 0 0 0; line-height: 1.7;">Your actionable insider knowledge here — the kind of tip that makes people screenshot and share.</p>
</div>

4. WARNING BOXES (when relevant) - HIGH-CONTRAST ALERT:
<div style="background: linear-gradient(145deg, #b91c1c, #7f1d1d); border-left: 6px solid #f87171; padding: 24px 28px; margin: 32px 0; border-radius: 0 20px 20px 0; box-shadow: 8px 8px 24px rgba(185, 28, 28, 0.3), -4px -4px 16px rgba(248, 113, 113, 0.1), inset 0 1px 1px rgba(255,255,255,0.05);">
  <strong style="color: #fecaca; font-size: 16px; display: flex; align-items: center; gap: 8px;">⚠️ Warning</strong>
  <p style="color: #fee2e2; font-size: 16px; margin: 10px 0 0 0; line-height: 1.7;">Critical warning that saves them from a costly mistake.</p>
</div>

5. DATA COMPARISON TABLE (at least 1) - PREMIUM DARK THEME:
<div style="margin: 40px 0; border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);">
  <table style="width: 100%; border-collapse: collapse; background: #0a0a0f;">
    <thead>
      <tr style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%);">
        <th style="padding: 20px 24px; text-align: left; color: #f9fafb; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #374151;">Column 1</th>
        <th style="padding: 20px 24px; text-align: left; color: #f9fafb; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #374151;">Column 2</th>
        <th style="padding: 20px 24px; text-align: left; color: #f9fafb; font-weight: 700; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #374151;">Column 3</th>
      </tr>
    </thead>
    <tbody>
      <tr style="transition: background 0.2s;">
        <td style="padding: 18px 24px; color: #e5e7eb; border-bottom: 1px solid #1f2937; font-size: 15px;">Data</td>
        <td style="padding: 18px 24px; color: #e5e7eb; border-bottom: 1px solid #1f2937; font-size: 15px;">Data</td>
        <td style="padding: 18px 24px; color: #10b981; border-bottom: 1px solid #1f2937; font-size: 15px; font-weight: 600;">Highlight</td>
      </tr>
    </tbody>
  </table>
</div>

6. NUMBERED STEP BOXES (for how-to sections) - MODERN CARD STYLE:
<div style="background: linear-gradient(160deg, #1e293b 0%, #0f172a 100%); border-radius: 20px; padding: 32px; margin: 32px 0; border: 1px solid rgba(71, 85, 105, 0.5); box-shadow: 0 20px 40px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.05);">
  <div style="display: flex; align-items: center; gap: 18px; margin-bottom: 16px;">
    <span style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; width: 44px; height: 44px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 18px; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.4);">1</span>
    <strong style="color: #f1f5f9; font-size: 20px; font-weight: 700;">Step Title Here</strong>
  </div>
  <p style="color: #94a3b8; margin: 0; padding-left: 62px; font-size: 16px; line-height: 1.8;">Step description with actionable details that they can implement immediately...</p>
</div>

7. QUOTE/CALLOUT BOXES - EDITORIAL STYLE:
<blockquote style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%); border-left: 5px solid #10b981; padding: 28px 32px; margin: 40px 0; border-radius: 0 20px 20px 0; position: relative;">
  <p style="color: #e5e7eb; margin: 0; font-size: 20px; line-height: 1.7; font-style: italic; font-weight: 500;">"Powerful quote that reinforces your point and makes them want to share it..."</p>
  <footer style="color: #6b7280; margin-top: 16px; font-size: 15px; font-style: normal; font-weight: 600;">— Source Name, Title/Company</footer>
</blockquote>

8. STAT HIGHLIGHT BOX - DATA VISUALIZATION:
<div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 20px; padding: 32px; margin: 36px 0; display: flex; align-items: center; gap: 24px; border: 1px solid rgba(16, 185, 129, 0.3); box-shadow: 0 15px 40px rgba(0,0,0,0.3);">
  <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px; padding: 20px 24px; text-align: center; min-width: 120px; box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);">
    <span style="color: white; font-size: 36px; font-weight: 800; display: block;">87%</span>
    <span style="color: rgba(255,255,255,0.8); font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Metric</span>
  </div>
  <p style="color: #e5e7eb; margin: 0; font-size: 17px; line-height: 1.7;">Explanation of what this stat means and why it matters to them...</p>
</div>

9. FAQ SECTION (6-8 questions at end) - ACCORDION STYLE:
<div style="background: linear-gradient(160deg, #0f172a 0%, #1e293b 100%); border: 1px solid #334155; border-radius: 20px; margin: 20px 0; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
  <h4 style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); margin: 0; padding: 22px 28px; color: #f1f5f9; font-size: 17px; font-weight: 700; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 12px;">
    <span style="color: #10b981; font-size: 20px;">❓</span> Question here?
  </h4>
  <div style="padding: 24px 28px;">
    <p style="color: #94a3b8; margin: 0; font-size: 16px; line-height: 1.8;">Direct, valuable answer without fluff. Give them exactly what they need to know.</p>
  </div>
</div>

10. CTA BOX (at the end) - HIGH-CONVERSION DESIGN:
<div style="background: linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%); border-radius: 24px; padding: 40px 44px; margin: 48px 0; text-align: center; box-shadow: 0 20px 50px rgba(16, 185, 129, 0.35), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 2px rgba(255,255,255,0.2);">
  <h3 style="color: white; margin: 0 0 16px 0; font-size: 28px; font-weight: 800; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">🚀 Ready to Take Action?</h3>
  <p style="color: rgba(255,255,255,0.9); margin: 0; font-size: 18px; line-height: 1.7;">Strong call-to-action that tells them exactly what to do next. Make it specific and time-bound.</p>
</div>

🎯 OUTPUT: Pure HTML only. No markdown. Proper h2/h3 hierarchy. Every single paragraph MUST deliver VALUE. Make them feel like they're getting $10,000 worth of consulting for free.`;

    const prompt = `Write a ${targetWordCount}+ word article about "${keyword}".

TITLE: ${title}

🎯 MANDATORY QUALITY TARGETS (MUST ACHIEVE 90%+ IN ALL):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• READABILITY 90%+: Short sentences (avg 15 words), simple vocabulary, Grade 6-7 level
• SEO 90%+: Primary keyword "${keyword}" used 8-12 times naturally, proper heading hierarchy
• E-E-A-T 90%+: Cite 5+ specific studies/stats with years, include expert quotes, first-hand experience
• UNIQUENESS 90%+: Zero AI phrases, unique analogies, contrarian perspectives
• ACCURACY 90%+: Only verifiable claims, 2025 data, cite specific sources

CONTENT STRUCTURE (follow this order):
${serpAnalysis.recommendedHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n')}

CONTENT GAPS TO FILL (your competitors MISSED these - this is your competitive advantage):
${serpAnalysis.contentGaps.slice(0, 6).join('\n')}

SEMANTIC KEYWORDS TO NATURALLY WEAVE IN (don't force them):
${serpAnalysis.semanticEntities.slice(0, 18).join(', ')}

${neuronTermPrompt ? `
🔴 NEURONWRITER OPTIMIZATION - 90%+ CONTENT SCORE REQUIRED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${neuronTermPrompt}

⚠️ STRICT NEURONWRITER RULES (CRITICAL FOR 90%+ SCORE):
1. Include EVERY "REQUIRED" term at EXACTLY the suggested frequency range
2. Include at least 80% of "RECOMMENDED" terms naturally throughout
3. Include at least 50% of "EXTENDED" terms for comprehensive coverage
4. MENTION every "NAMED ENTITY" at least once in relevant context
5. USE the "RECOMMENDED H2 HEADINGS" as your actual H2 headings (or very close variations)
6. USE the "RECOMMENDED H3 SUBHEADINGS" as your H3s where appropriate
7. Never dump terms as a list—they MUST flow naturally in sentences
8. Distribute terms evenly across sections (not clustered in one area)
` : ''}

${videos.length > 0 ? `
EMBED THIS VIDEO IN THE MIDDLE OF THE ARTICLE:
<div style="position: relative; padding-bottom: 56.25%; height: 0; margin: 40px 0; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4);">
  <iframe src="https://www.youtube.com/embed/${videos[0].id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="${videos[0].title}"></iframe>
</div>
<p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: -24px; margin-bottom: 32px;">📺 <strong>${videos[0].title}</strong> by ${videos[0].channelTitle}</p>
` : ''}

📋 MANDATORY STRUCTURE REQUIREMENTS:
1. First 2 sentences MUST hook the reader - give them the answer or a bold claim immediately
2. Key Takeaways box IMMEDIATELY after the intro (5-7 bullets)
3. At least 5 Pro Tip boxes spread throughout (actionable, screenshot-worthy)
4. At least 2 data comparison tables with real data
5. At least 5 step boxes for actionable sections
6. At least 3 stat highlight boxes with real percentages/numbers
7. At least 2 expert quote boxes with real names and credentials
8. FAQ section with 8 questions at the end (optimized for featured snippets)
9. Strong CTA at the very end

📝 E-E-A-T REQUIREMENTS (MANDATORY FOR 90%+):
1. Include "According to [specific study/source, year]..." at least 5 times
2. Include at least 3 expert quotes: "Dr./Expert [Name], [credential], says..."
3. Include first-person experience: "In my X years of experience..." / "When I tested this..."
4. Reference specific tools/products by name that you've "used"
5. Include 2025 statistics: "[X]% of [audience] report that... (Source, 2025)"

🎯 HUMAN VOICE REQUIREMENTS (MANDATORY):
1. Use contractions: don't, won't, can't, it's, that's, we're, you'll
2. Start paragraphs with: "Look," "Here's the thing:" "Real talk:" "I'll be honest:"
3. Include rhetorical questions: "Sound familiar?" "See the pattern?"
4. Use incomplete sentences. For emphasis. Like this.
5. Show emotion: "This drives me crazy..." / "I love this because..."
6. Admit uncertainty: "I could be wrong, but..."

Write the complete article now. Make it so valuable that readers bookmark it and share it with friends. REMEMBER: Target 90%+ in ALL metrics!`;

    let result;
    if (this.config.useConsensus && this.engine.getAvailableModels().length > 1) {
      this.log('Using multi-model consensus generation...');
      const consensusResult = await this.engine.generateWithConsensus(prompt, systemPrompt);
      result = { content: consensusResult.finalContent };
    } else {
      result = await this.engine.generateWithModel({
        prompt,
        model: this.config.primaryModel || 'gemini',
        apiKeys: this.config.apiKeys,
        systemPrompt,
        temperature: 0.78
      });
    }

    // Ensure we don't publish partial ~250-word outputs.
    // Some models "stop early" and ask to continue; we automatically continue until we hit target length.
    let finalContent = await this.ensureLongFormComplete({
      keyword,
      title,
      systemPrompt,
      model: this.config.primaryModel || 'gemini',
      currentHtml: result.content,
      targetWordCount,
    });

    // Add videos section if available and not already embedded
    if (videos.length > 0 && !finalContent.includes('youtube.com/embed')) {
      const videoSection = this.buildVideoSection(videos);
      finalContent = this.insertBeforeConclusion(finalContent, videoSection);
      this.log('Injected YouTube video section');
    }

    // Add references section
    if (references.length > 0) {
      const referencesSection = this.referenceService.formatReferencesSection(references);
      finalContent += referencesSection;
      this.log(`Added ${references.length} references`);
    }

    return finalContent;
  }

  /**
   * Generate SEO-optimized title for WordPress/meta tags
   * This may differ from the display title - optimized for search rankings
   */
  private async generateSEOTitle(keyword: string, displayTitle: string, serpAnalysis: SERPAnalysis): Promise<string> {
    const prompt = `Generate an SEO-optimized title tag for an article about "${keyword}".

Current display title: "${displayTitle}"

Requirements:
- Maximum 60 characters (CRITICAL - longer titles get truncated in search results)
- Include the EXACT primary keyword "${keyword}" within first 40 characters
- Make it compelling and click-worthy (high CTR potential)
- Match ${serpAnalysis.userIntent} search intent
- Include current year (2025) if naturally fits
- Power words: Ultimate, Complete, Best, Top, Essential, Proven, Expert
- NO clickbait or sensationalism
- NO generic phrases like "A Complete Guide" at the end

Top competitor title formats for reference:
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
    
    // Ensure it's not too long
    if (seoTitle.length > 60) {
      seoTitle = seoTitle.substring(0, 57) + '...';
    }
    
    return seoTitle;
  }

  private async generateMetaDescription(keyword: string, title: string): Promise<string> {
    const prompt = `Write an SEO meta description for an article titled "${title}" about "${keyword}".

Requirements:
- Exactly 150-160 characters (CRITICAL - this is the optimal length for SERP display)
- Include the EXACT primary keyword "${keyword}" within first 100 characters
- Include a clear call-to-action at the end
- Create urgency or curiosity
- Make it compelling and click-worthy
- NO fluff words: "In this article", "This guide covers", "Learn about"
- Start with action/benefit: "Discover...", "Get the...", "Master..."

Output ONLY the meta description, nothing else.`;

    const result = await this.engine.generateWithModel({
      prompt,
      model: this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      temperature: 0.7,
      maxTokens: 100
    });

    let metaDesc = result.content.trim().replace(/^["']|["']$/g, '');
    
    // Ensure optimal length
    if (metaDesc.length > 160) {
      metaDesc = metaDesc.substring(0, 157) + '...';
    }
    
    return metaDesc;
  }

  private buildVideoSection(videos: YouTubeVideo[]): string {
    return `
<section class="video-resources" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 100%); border-radius: 20px; padding: 32px; margin: 40px 0; border: 1px solid rgba(34, 197, 94, 0.2); box-shadow: 0 10px 40px rgba(0,0,0,0.1);">
  <h2 style="margin-top: 0; display: flex; align-items: center; gap: 12px; color: #e5e7eb; font-size: 24px;">
    <span style="font-size: 28px;">📺</span> Recommended Video Resources
  </h2>
  <p style="color: #9ca3af; margin-bottom: 24px; font-size: 16px;">Learn more from these expert video guides:</p>
  ${videos.map(v => this.youtubeService.formatVideoCard(v)).join('')}
</section>
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
}

export function createOrchestrator(config: OrchestratorConfig): EnterpriseContentOrchestrator {
  return new EnterpriseContentOrchestrator(config);
}
