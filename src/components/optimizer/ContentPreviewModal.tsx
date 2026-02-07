// CONTENT PREVIEW MODAL - Rich Content Preview

import { useState } from 'react';
import { X, Copy, Check, Download, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GeneratedContent } from '@/lib/sota';

interface ContentPreviewModalProps {
  content: GeneratedContent | null;
  onClose: () => void;
  onPublish?: (content: GeneratedContent) => void;
}

export function ContentPreviewModal({ content, onClose, onPublish }: ContentPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'seo' | 'schema'>('preview');
  const [copied, setCopied] = useState(false);

  if (!content) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content.content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${content.slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{content.title}</h2>
            <p className="text-sm text-muted-foreground">
              {content.metrics.wordCount.toLocaleString()} words • 
              {content.metrics.estimatedReadTime} min read • 
              Quality: {content.qualityScore.overall}%
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={handleCopy}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
              title="Copy HTML"
            >
              {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
              title="Download HTML"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(['preview', 'html', 'seo', 'schema'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab
                  ? "text-primary border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'preview' && (
            <div 
              className="prose prose-invert prose-green max-w-none"
              dangerouslySetInnerHTML={{ __html: content.content }}
            />
          )}

          {activeTab === 'html' && (
            <pre className="bg-muted/30 p-4 rounded-lg overflow-auto text-sm text-foreground font-mono whitespace-pre-wrap">
              {content.content}
            </pre>
          )}

          {activeTab === 'seo' && (
            <div className="space-y-6">
              {/* Meta Info */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Meta Information</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Title:</span>
                    <span className="ml-2 text-foreground">{content.title}</span>
                    <span className={cn(
                      "ml-2 text-xs px-2 py-0.5 rounded",
                      content.title.length <= 60 ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {content.title.length}/60 chars
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Meta Description:</span>
                    <p className="text-foreground mt-1">{content.metaDescription}</p>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      content.metaDescription.length >= 120 && content.metaDescription.length <= 160 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-yellow-500/20 text-yellow-400"
                    )}>
                      {content.metaDescription.length}/160 chars
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">URL Slug:</span>
                    <span className="ml-2 text-primary">/{content.slug}</span>
                  </div>
                </div>
              </div>

              {/* Quality Score Breakdown */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Quality Score Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ScoreBar label="Overall" value={content.qualityScore.overall} />
                  <ScoreBar label="Readability" value={content.qualityScore.readability} />
                  <ScoreBar label="SEO" value={content.qualityScore.seo} />
                  <ScoreBar label="E-E-A-T" value={content.qualityScore.eeat} />
                  <ScoreBar label="Uniqueness" value={content.qualityScore.uniqueness} />
                  <ScoreBar label="Fact Accuracy" value={content.qualityScore.factAccuracy} />
                </div>
                {content.qualityScore.improvements.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-sm font-medium text-foreground mb-2">Suggested Improvements</h4>
                    <ul className="space-y-1">
                      {content.qualityScore.improvements.map((improvement, i) => (
                        <li key={i} className="text-sm text-yellow-400 flex items-start gap-2">
                          <span>•</span>
                          {improvement}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Keywords */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-foreground">Keywords</h3>
                <div>
                  <span className="text-muted-foreground text-sm">Primary:</span>
                  <span className="ml-2 px-3 py-1 bg-primary/20 text-primary rounded-lg text-sm">
                    {content.primaryKeyword}
                  </span>
                </div>
                {content.secondaryKeywords.length > 0 && (
                  <div>
                    <span className="text-muted-foreground text-sm">Secondary:</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {content.secondaryKeywords.map((kw, i) => (
                        <span key={i} className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Internal Links */}
              {content.internalLinks.length > 0 && (
                <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-foreground">Internal Links ({content.internalLinks.length})</h3>
                  <div className="space-y-2">
                    {content.internalLinks.slice(0, 10).map((link, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-primary">{link.anchor}</span>
                        <span className="text-muted-foreground truncate max-w-[200px]">{link.targetUrl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Schema.org Structured Data</h3>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(content.schema, null, 2));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-2 px-3 py-1 bg-muted rounded-lg text-sm text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  Copy Schema
                </button>
              </div>
              <pre className="bg-muted/30 p-4 rounded-lg overflow-auto text-sm text-foreground font-mono whitespace-pre-wrap">
                {JSON.stringify(content.schema, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {onPublish && (
          <div className="p-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onPublish(content)}
              className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Publish to WordPress
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default ContentPreviewModal;
