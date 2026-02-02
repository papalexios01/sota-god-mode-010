import { useRef, useState } from "react";
import { useOptimizerStore } from "@/lib/store";
import { 
  BookOpen, FileText, Target, RefreshCw, FolderOpen, Image,
  Zap, Plus, Upload, Link, Trash2, AlertCircle, ArrowRight,
  BarChart3, Search, Sparkles, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/integrations/supabase/client";
import { crawlSitemapUrls } from "@/lib/sitemap/crawlSitemap";

const tabs = [
  { id: "bulk", label: "📚 Bulk Planner", icon: BookOpen },
  { id: "single", label: "📝 Single Article", icon: FileText },
  { id: "gap", label: "🎯 Gap Analysis", icon: Target },
  { id: "refresh", label: "🔄 Quick Refresh", icon: RefreshCw },
  { id: "hub", label: "🗂️ Content Hub", icon: FolderOpen },
  { id: "image", label: "🖼️ Image Gen", icon: Image },
];

export function ContentStrategy() {
  const [activeTab, setActiveTab] = useState("bulk");
  const { 
    godModeEnabled, setGodModeEnabled,
    priorityOnlyMode, setPriorityOnlyMode,
    priorityUrls, addPriorityUrl, removePriorityUrl,
    excludedUrls, setExcludedUrls,
    excludedCategories, setExcludedCategories,
    sitemapUrls, setSitemapUrls,
    addContentItem,
    setCurrentStep
  } = useOptimizerStore();

  const [broadTopic, setBroadTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [singleUrl, setSingleUrl] = useState("");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [newPriorityUrl, setNewPriorityUrl] = useState("");
  const [newPriority, setNewPriority] = useState<'critical' | 'high' | 'medium' | 'low'>('medium');
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawledUrls, setCrawledUrls] = useState<string[]>([]);
  const [crawlFoundCount, setCrawlFoundCount] = useState(0);
  const [crawlStatus, setCrawlStatus] = useState<string>("");
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const crawlRunIdRef = useRef(0);

  // Filter to keep only blog post URLs (exclude images, feeds, categories, tags, etc.)
  const filterBlogPostUrls = (urls: string[]): string[] => {
    const excludePatterns = [
      /\/wp-content\//i,
      /\/wp-includes\//i,
      /\/wp-admin\//i,
      /\/feed\/?$/i,
      /\/rss\/?$/i,
      /\/atom\/?$/i,
      /\/category\//i,
      /\/tag\//i,
      /\/author\//i,
      /\/page\/\d+/i,
      /\/attachment\//i,
      /\/trackback\/?$/i,
      /\.(jpg|jpeg|png|gif|webp|svg|ico|pdf|zip|mp3|mp4|avi|mov)$/i,
      /\/sitemap[^/]*\.xml/i,
      /\/robots\.txt$/i,
      /\/favicon/i,
      /\/cdn-cgi\//i,
      /\/cart\/?$/i,
      /\/checkout\/?$/i,
      /\/my-account\/?$/i,
      /\/privacy-policy\/?$/i,
      /\/terms/i,
      /\/contact\/?$/i,
      /\/about\/?$/i,
      /\/search\/?/i,
      /\?/,  // exclude URLs with query params
    ];
    
    return urls.filter(url => {
      // Must have a path beyond just the domain
      try {
        const parsed = new URL(url);
        const path = parsed.pathname;
        // Skip homepage
        if (path === '/' || path === '') return false;
        // Skip if matches any exclude pattern
        for (const pattern of excludePatterns) {
          if (pattern.test(url)) return false;
        }
        return true;
      } catch {
        return false;
      }
    });
  };

  const fetchSitemapText = async (targetUrl: string): Promise<string> => {
    const trimmed = targetUrl.trim();

    const fetchWithTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), ms);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } catch (e) {
        // Normalize AbortError so users don't see "signal is aborted without reason"
        if (e instanceof DOMException && e.name === "AbortError") {
          throw new Error(`Request timed out after ${Math.round(ms / 1000)}s`);
        }
        throw e;
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    // ✅ SOTA fix: use first-party endpoint.
    // - Preview: handled by Vite middleware (vite.config.ts)
    // - Production: handled by Cloudflare Pages Function (functions/api/fetch-sitemap.ts)
    const localUrl = `/api/fetch-sitemap?url=${encodeURIComponent(trimmed)}`;
    const resp = await fetchWithTimeout(localUrl, { method: "GET" }, 55000);
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`fetch-sitemap failed (${resp.status}): ${text.slice(0, 200)}`);
    }
    return text;
  };

  const handleGenerateContentPlan = () => {
    if (!broadTopic.trim()) return;
    // Add pillar content
    addContentItem({
      title: `Pillar: ${broadTopic}`,
      type: 'pillar',
      status: 'pending',
      primaryKeyword: broadTopic,
    });
    // Add some cluster content
    const clusters = ['Beginner Guide', 'Advanced Tips', 'Common Mistakes', 'Best Practices'];
    clusters.forEach(cluster => {
      addContentItem({
        title: `${broadTopic} - ${cluster}`,
        type: 'cluster',
        status: 'pending',
        primaryKeyword: `${broadTopic} ${cluster.toLowerCase()}`,
      });
    });
    setBroadTopic("");
    setCurrentStep(3);
  };

  const handleAddKeywords = () => {
    if (!keywords.trim()) return;
    const lines = keywords.split('\n').filter(k => k.trim());
    lines.forEach(keyword => {
      addContentItem({
        title: keyword.trim(),
        type: 'single',
        status: 'pending',
        primaryKeyword: keyword.trim(),
      });
    });
    setKeywords("");
  };

  const handleAddPriorityUrl = () => {
    if (!newPriorityUrl.trim()) return;
    addPriorityUrl(newPriorityUrl.trim(), newPriority);
    setNewPriorityUrl("");
  };

  const handleCrawlSitemap = async () => {
    if (!sitemapUrl.trim()) return;

    const runId = (crawlRunIdRef.current += 1);
    setIsCrawling(true);
    setCrawledUrls([]);
    setCrawlFoundCount(0);
    setCrawlStatus("Starting…");
    setSelectedUrls(new Set());

    try {
      const allUrls = await crawlSitemapUrls(sitemapUrl.trim(), fetchSitemapText, {
        concurrency: 10,
        onProgress: (p) => {
          if (crawlRunIdRef.current !== runId) return;
          setCrawlFoundCount(p.discoveredUrls);
          setCrawlStatus(
            `Sitemaps: ${p.processedSitemaps} done • ${p.queuedSitemaps} queued • URLs: ${p.discoveredUrls}`
          );
        },
        onUrlsBatch: (batch) => {
          if (crawlRunIdRef.current !== runId) return;
          const filtered = filterBlogPostUrls(batch);
          setCrawledUrls((prev) => {
            const merged = [...prev, ...filtered];
            return Array.from(new Set(merged));
          });
        },
      });

      if (allUrls.length === 0) {
        throw new Error("No page URLs found in sitemap");
      }

      if (crawlRunIdRef.current !== runId) return;

      // Filter to blog posts only
      const blogPostUrls = filterBlogPostUrls(allUrls);
      setCrawledUrls(blogPostUrls);
      setSitemapUrls(blogPostUrls);
      setCrawlFoundCount(blogPostUrls.length);
      setCrawlStatus(`Done • ${blogPostUrls.length.toLocaleString()} blog posts (filtered from ${allUrls.length.toLocaleString()} total)`);
      toast.success(`Found ${blogPostUrls.length} blog post URLs!`);
    } catch (error) {
      console.error("[Sitemap] Crawl error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to crawl sitemap");
    } finally {
      setIsCrawling(false);
    }
  };

  const toggleUrlSelection = (url: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      return next;
    });
  };

  const selectAllUrls = () => {
    setSelectedUrls(new Set(crawledUrls));
  };

  const deselectAllUrls = () => {
    setSelectedUrls(new Set());
  };

  const handleAddSelectedToRewrite = () => {
    if (selectedUrls.size === 0) return;
    
    selectedUrls.forEach(url => {
      // Extract a title from the URL
      const urlPath = new URL(url).pathname;
      const slug = urlPath.split('/').filter(Boolean).pop() || 'untitled';
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      
      addContentItem({
        title: `Rewrite: ${title}`,
        type: 'refresh',
        status: 'pending',
        primaryKeyword: title.toLowerCase(),
        url: url,
      });
    });
    
    toast.success(`Added ${selectedUrls.size} URLs to rewrite queue!`);
    setSelectedUrls(new Set());
    setCurrentStep(3);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-primary" />
          2. Content Strategy & Planning
        </h1>
        <p className="text-muted-foreground mt-1">
          Plan, generate, and optimize your content with AI-powered tools.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-card border border-border rounded-2xl p-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-card border border-border rounded-2xl p-6">
        {activeTab === "bulk" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Bulk Content Planner</h3>
                <p className="text-sm text-muted-foreground">
                  Enter a broad topic to generate a pillar page and cluster content plan.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Broad Topic</label>
              <input
                type="text"
                value={broadTopic}
                onChange={(e) => setBroadTopic(e.target.value)}
                placeholder="e.g., 'Sustainable Living' or 'Python Programming'"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={handleGenerateContentPlan}
              disabled={!broadTopic.trim()}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5" />
              🚀 Generate Content Plan
            </button>
          </div>
        )}

        {activeTab === "single" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Single Article Generator</h3>
                <p className="text-sm text-muted-foreground">
                  Enter primary keywords (one per line) to generate articles.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Primary Keywords (one per line)
              </label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="best running shoes 2026&#10;how to train for marathon&#10;running injury prevention"
                rows={5}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddKeywords}
                disabled={!keywords.trim()}
                className="flex-1 px-6 py-3 bg-muted text-foreground font-semibold rounded-xl hover:bg-muted/80 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                ➕ Add to Queue
              </button>
              <button
                onClick={() => { handleAddKeywords(); setCurrentStep(3); }}
                className="px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 flex items-center gap-2"
              >
                Go to Review <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeTab === "gap" && (
          <div className="space-y-6">
            {/* God Mode Section */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={godModeEnabled}
                  onChange={(e) => setGodModeEnabled(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-border text-primary focus:ring-primary/50"
                />
                <div>
                  <span className="font-semibold text-foreground">💤 God Mode (Autonomous Maintenance)</span>
                  <p className="text-sm text-muted-foreground mt-1">
                    Automatically scans your sitemap, prioritizes critical pages, and performs surgical SEO/Fact updates forever.
                  </p>
                </div>
              </label>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={priorityOnlyMode}
                onChange={(e) => setPriorityOnlyMode(e.target.checked)}
                className="w-5 h-5 rounded border-border text-primary focus:ring-primary/50"
              />
              <div>
                <span className="font-medium text-foreground">🎯 Priority Only Mode</span>
                <p className="text-xs text-muted-foreground">
                  Restricts God Mode to ONLY optimize URLs in your Priority Queue. Ignores sitemap scan.
                </p>
              </div>
            </label>

            {/* Priority URL Queue */}
            <div className="border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-foreground flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  PRIORITY URL QUEUE
                </h4>
                <span className="text-sm text-muted-foreground">{priorityUrls.length} Total</span>
              </div>

              <div className="space-y-3">
                <div className="flex gap-2">
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground"
                  >
                    <option value="critical">critical</option>
                    <option value="high">high</option>
                    <option value="medium">medium</option>
                    <option value="low">low</option>
                  </select>
                  <input
                    type="url"
                    value={newPriorityUrl}
                    onChange={(e) => setNewPriorityUrl(e.target.value)}
                    placeholder="Enter URL to Optimize"
                    className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    onClick={handleAddPriorityUrl}
                    disabled={!newPriorityUrl.trim()}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {priorityUrls.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {priorityUrls.map(url => (
                      <div key={url.id} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium",
                          url.priority === 'critical' && "bg-red-500/20 text-red-400",
                          url.priority === 'high' && "bg-orange-500/20 text-orange-400",
                          url.priority === 'medium' && "bg-yellow-500/20 text-yellow-400",
                          url.priority === 'low' && "bg-green-500/20 text-green-400"
                        )}>
                          {url.priority}
                        </span>
                        <span className="flex-1 truncate text-foreground">{url.url}</span>
                        <button 
                          onClick={() => removePriorityUrl(url.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  💡 Pro Tip: URLs added here will be prioritized over automatic sitemap scanning.
                </p>
              </div>
            </div>

            {/* Exclusion Controls */}
            <div className="border border-border rounded-xl p-4">
              <h4 className="font-semibold text-foreground mb-3">🚫 Exclusion Controls</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Exclude URLs (one per line)
                  </label>
                  <textarea
                    value={excludedUrls.join('\n')}
                    onChange={(e) => setExcludedUrls(e.target.value.split('\n').filter(u => u.trim()))}
                    rows={4}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none"
                    placeholder="/privacy-policy&#10;/terms-of-service"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Exclude Categories (one per line)
                  </label>
                  <textarea
                    value={excludedCategories.join('\n')}
                    onChange={(e) => setExcludedCategories(e.target.value.split('\n').filter(c => c.trim()))}
                    rows={4}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground resize-none"
                    placeholder="uncategorized&#10;archive"
                  />
                </div>
              </div>
            </div>

            {sitemapUrls.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm">
                <AlertCircle className="w-5 h-5" />
                Sitemap Required: Please crawl your sitemap in the "Quick Refresh" tab first.
              </div>
            )}
          </div>
        )}

        {activeTab === "refresh" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Quick Refresh & Validate</h3>
                <p className="text-sm text-muted-foreground">
                  Update existing content with fresh data and improved SEO.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                Single URL
              </button>
              <button className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:text-foreground">
                Bulk via Sitemap
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Post URL to Refresh</label>
              <input
                type="url"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                placeholder="https://your-site.com/post-to-refresh"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              disabled={!singleUrl.trim()}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-5 h-5" />
              🔄 Refresh & Validate
            </button>
          </div>
        )}

        {activeTab === "hub" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <FolderOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Content Hub & Rewrite Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  Crawl your sitemap, analyze content health, and generate strategic rewrites.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Sitemap URL</label>
              <input
                type="url"
                value={sitemapUrl}
                onChange={(e) => setSitemapUrl(e.target.value)}
                placeholder="https://your-site.com/sitemap.xml"
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <button
              onClick={handleCrawlSitemap}
              disabled={!sitemapUrl.trim() || isCrawling}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCrawling ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Crawling… ({crawlFoundCount.toLocaleString()} URLs)
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  🔍 Crawl Sitemap
                </>
              )}
            </button>

            {isCrawling && crawlStatus && (
              <div className="text-xs text-muted-foreground">{crawlStatus}</div>
            )}

            {/* Show crawled URLs with checkboxes */}
            {(crawledUrls.length > 0 || crawlFoundCount > 0) && (
              <div className="mt-4 p-4 bg-muted/50 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-foreground">
                    ✅ Found {crawledUrls.length.toLocaleString()} Blog Posts
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAllUrls}
                      className="px-3 py-1 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllUrls}
                      className="px-3 py-1 text-xs bg-muted text-muted-foreground rounded-lg hover:bg-muted/80"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                
                {selectedUrls.size > 0 && (
                  <div className="mb-3 flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-3 py-2">
                    <span className="text-sm text-primary font-medium">
                      {selectedUrls.size} URL{selectedUrls.size !== 1 ? 's' : ''} selected
                    </span>
                    <button
                      onClick={handleAddSelectedToRewrite}
                      className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Rewrite Queue
                    </button>
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {crawledUrls.map((url, idx) => (
                    <label
                      key={idx}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                        selectedUrls.has(url) ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUrls.has(url)}
                        onChange={() => toggleUrlSelection(url)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                      />
                      <span className="text-sm text-foreground truncate flex-1">{url}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "image" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
                <Image className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">SOTA Image Generator</h3>
                <p className="text-sm text-muted-foreground">
                  Generate high-quality images using DALL-E 3 or Gemini Imagen.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Image Prompt</label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="A professional photo of..."
                rows={3}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Number of Images</label>
                <select
                  value={imageCount}
                  onChange={(e) => setImageCount(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground"
                >
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground"
                >
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="4:3">4:3 (Standard)</option>
                </select>
              </div>
            </div>
            <button
              disabled={!imagePrompt.trim()}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              🎨 Generate Images
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
