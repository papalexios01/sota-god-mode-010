// CONTENT INTELLIGENCE DASHBOARD - Analytics & Metrics UI

import { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, TrendingDown, Minus,
  Zap, Clock, Target, FileText, Link, Brain,
  RefreshCw, Trash2, Download
} from 'lucide-react';
import { globalPerformanceTracker, type AnalyticsDashboardData } from '@/lib/sota';
import { cn } from '@/lib/utils';

interface ContentIntelligenceDashboardProps {
  onRefresh?: () => void;
}

export function ContentIntelligenceDashboard({ onRefresh }: ContentIntelligenceDashboardProps) {
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [trend, setTrend] = useState<'improving' | 'stable' | 'declining'>('stable');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setIsLoading(true);
    try {
      const dashboardData = globalPerformanceTracker.getDashboardData();
      setData(dashboardData);
      setTrend(globalPerformanceTracker.getPerformanceTrend());
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all performance history?')) {
      globalPerformanceTracker.clearHistory();
      loadData();
    }
  };

  const handleExportData = () => {
    const exportData = globalPerformanceTracker.getDashboardData();
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `content-analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
        Loading analytics...
      </div>
    );
  }

  const TrendIcon = trend === 'improving' ? TrendingUp : trend === 'declining' ? TrendingDown : Minus;
  const trendColor = trend === 'improving' ? 'text-green-400' : trend === 'declining' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Content Intelligence</h2>
            <p className="text-sm text-muted-foreground">Performance metrics & optimization insights</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50"
            title="Refresh"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleExportData}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50"
            title="Export Data"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={handleClearHistory}
            className="p-2 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted/50"
            title="Clear History"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Total Generated"
          value={data.totalGenerated.toString()}
          subtext="articles"
        />
        <StatCard
          icon={Target}
          label="Avg Quality Score"
          value={`${data.avgQualityScore}%`}
          subtext={data.avgQualityScore >= 85 ? 'Excellent' : data.avgQualityScore >= 70 ? 'Good' : 'Needs Improvement'}
          highlight={data.avgQualityScore >= 85}
        />
        <StatCard
          icon={Clock}
          label="Avg Generation Time"
          value={`${(data.avgGenerationTime / 1000).toFixed(1)}s`}
          subtext="per article"
        />
        <StatCard
          icon={Zap}
          label="Cache Hit Rate"
          value={`${data.cacheHitRate}%`}
          subtext="efficiency"
          highlight={data.cacheHitRate >= 30}
        />
      </div>

      {/* Performance Trend */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">Performance Trend</h3>
          <span className={cn('flex items-center gap-1 text-sm font-medium', trendColor)}>
            <TrendIcon className="w-4 h-4" />
            {trend.charAt(0).toUpperCase() + trend.slice(1)}
          </span>
        </div>
        
        {data.qualityTrend.length > 0 ? (
          <div className="h-40 flex items-end gap-1">
            {data.qualityTrend.map((point, index) => (
              <div key={index} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                  style={{ height: `${point.score}%` }}
                  title={`${point.date}: ${point.score}%`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(point.date).getDate()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
            No trend data available yet. Generate more content to see trends.
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Model Usage */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            AI Model Usage
          </h3>
          <div className="space-y-3">
            {Object.entries(data.modelUsage)
              .filter(([_, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([model, count]) => {
                const total = Object.values(data.modelUsage).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? (count / total) * 100 : 0;
                return (
                  <div key={model} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-foreground capitalize">{model}</span>
                      <span className="text-muted-foreground">{count} ({percentage.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            {Object.values(data.modelUsage).every(v => v === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No model usage data yet
              </p>
            )}
          </div>
        </div>

        {/* Top Keywords */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Top Keywords
          </h3>
          {data.topKeywords.length > 0 ? (
            <div className="space-y-2">
              {data.topKeywords.slice(0, 8).map((item, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1 mr-2">
                    {item.keyword}
                  </span>
                  <span className="text-muted-foreground bg-muted px-2 py-0.5 rounded text-xs">
                    {item.count}x
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No keywords generated yet
            </p>
          )}
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <QuickStat
          label="Avg Word Count"
          value={data.avgWordCount.toLocaleString()}
          target="2,500"
          good={data.avgWordCount >= 2000}
        />
        <QuickStat
          label="Internal Links"
          value={Math.round((data.avgWordCount / 250)).toString()}
          target="8-15"
          good={data.avgWordCount / 250 >= 8}
        />
        <QuickStat
          label="Content Quality"
          value={`${data.avgQualityScore}%`}
          target="85%+"
          good={data.avgQualityScore >= 85}
        />
      </div>
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subtext, 
  highlight = false 
}: { 
  icon: React.ElementType;
  label: string;
  value: string;
  subtext: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-card border rounded-xl p-4 transition-all",
      highlight ? "border-primary/50 bg-primary/5" : "border-border"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("w-4 h-4", highlight ? "text-primary" : "text-muted-foreground")} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold", highlight ? "text-primary" : "text-foreground")}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">{subtext}</div>
    </div>
  );
}

function QuickStat({ 
  label, 
  value, 
  target, 
  good 
}: { 
  label: string; 
  value: string; 
  target: string; 
  good: boolean;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-3 text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-lg font-bold", good ? "text-green-400" : "text-yellow-400")}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground">Target: {target}</div>
    </div>
  );
}

export default ContentIntelligenceDashboard;
