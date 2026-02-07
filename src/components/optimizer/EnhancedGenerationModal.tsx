// ENHANCED GENERATION MODAL - SOTA Progress Tracking

import { useState, useEffect, useRef } from 'react';
import { 
  Loader2, Check, AlertCircle, Sparkles, X, 
  Brain, Search, Youtube, BookOpen, FileText, 
  Link2, Shield, Zap, Target, Clock, TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GenerationStep {
  id: string;
  label: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  message?: string;
  duration?: number;
  icon: React.ReactNode;
}

interface GeneratingItem {
  id: string;
  title: string;
  keyword: string;
  status: 'pending' | 'generating' | 'completed' | 'error';
  progress: number;
  currentStep?: string;
  error?: string;
}

interface EnhancedGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: GeneratingItem[];
  currentItemIndex: number;
  overallProgress: number;
  steps: GenerationStep[];
  error?: string;
}

const DEFAULT_STEPS: GenerationStep[] = [
  { 
    id: 'research', 
    label: 'SERP Analysis', 
    description: 'Analyzing top-ranking content',
    status: 'pending',
    icon: <Search className="w-4 h-4" />
  },
  { 
    id: 'videos', 
    label: 'YouTube Discovery', 
    description: 'Finding relevant video content',
    status: 'pending',
    icon: <Youtube className="w-4 h-4" />
  },
  { 
    id: 'references', 
    label: 'Reference Gathering', 
    description: 'Collecting authoritative sources',
    status: 'pending',
    icon: <BookOpen className="w-4 h-4" />
  },
  { 
    id: 'outline', 
    label: 'Content Outline', 
    description: 'Structuring the article',
    status: 'pending',
    icon: <FileText className="w-4 h-4" />
  },
  { 
    id: 'content', 
    label: 'AI Generation', 
    description: 'Creating comprehensive content',
    status: 'pending',
    icon: <Brain className="w-4 h-4" />
  },
  { 
    id: 'enhance', 
    label: 'Content Enhancement', 
    description: 'Optimizing for readability',
    status: 'pending',
    icon: <Sparkles className="w-4 h-4" />
  },
  { 
    id: 'links', 
    label: 'Internal Linking', 
    description: 'Adding strategic links',
    status: 'pending',
    icon: <Link2 className="w-4 h-4" />
  },
  { 
    id: 'validate', 
    label: 'Quality Validation', 
    description: 'Ensuring content standards',
    status: 'pending',
    icon: <Target className="w-4 h-4" />
  },
  { 
    id: 'schema', 
    label: 'Schema Generation', 
    description: 'Creating structured data',
    status: 'pending',
    icon: <Shield className="w-4 h-4" />
  },
];

export function EnhancedGenerationModal({
  isOpen,
  onClose,
  items,
  currentItemIndex,
  overallProgress,
  steps = DEFAULT_STEPS,
  error
}: EnhancedGenerationModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [itemStartTimes, setItemStartTimes] = useState<Record<string, number>>({});
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setElapsedTime(0);
      startTimeRef.current = null;
      return;
    }

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    // Track start time for each item
    const currentItem = items[currentItemIndex];
    if (currentItem && currentItem.status === 'generating' && !itemStartTimes[currentItem.id]) {
      setItemStartTimes(prev => ({
        ...prev,
        [currentItem.id]: Date.now()
      }));
    }
  }, [currentItemIndex, items, itemStartTimes]);

  if (!isOpen) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const completedItems = items.filter(i => i.status === 'completed').length;
  const failedItems = items.filter(i => i.status === 'error').length;
  const totalItems = items.length;
  const currentItem = items[currentItemIndex];
  const hasError = failedItems > 0 || !!error;
  const isComplete = completedItems === totalItems && !error;

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const currentStep = steps.find(s => s.status === 'running');

  // Estimate remaining time based on average
  const avgTimePerItem = elapsedTime / Math.max(completedItems, 1);
  const remainingItems = totalItems - completedItems;
  const estimatedRemaining = Math.round(avgTimePerItem * remainingItems);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl shadow-primary/10">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center relative",
                hasError ? "bg-destructive/20" : isComplete ? "bg-green-500/20" : "bg-primary/20"
              )}>
                {hasError ? (
                  <AlertCircle className="w-7 h-7 text-destructive" />
                ) : isComplete ? (
                  <Check className="w-7 h-7 text-green-400" />
                ) : (
                  <>
                    <Brain className="w-7 h-7 text-primary" />
                    <div className="absolute inset-0 rounded-2xl border-2 border-primary/50 animate-pulse" />
                  </>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {hasError ? 'Generation Error' : isComplete ? 'Generation Complete!' : 'Generating Content'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {completedItems} of {totalItems} articles • {formatTime(elapsedTime)} elapsed
                </p>
              </div>
            </div>
            {(isComplete || hasError) && (
              <button
                onClick={onClose}
                className="p-2.5 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted/50 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Overall Progress */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Overall Progress</span>
              </div>
              <span className="text-2xl font-bold text-primary">{overallProgress}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden relative">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500 ease-out relative overflow-hidden",
                  hasError ? "bg-destructive" : "bg-gradient-to-r from-primary to-green-500"
                )}
                style={{ width: `${overallProgress}%` }}
              >
                {!isComplete && !hasError && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                )}
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {completedItems > 0 && remainingItems > 0 
                  ? `~${formatTime(estimatedRemaining)} remaining` 
                  : 'Calculating...'}
              </span>
              <span>
                {completedItems} completed • {failedItems > 0 ? `${failedItems} failed • ` : ''}{remainingItems} remaining
              </span>
            </div>
          </div>
        </div>

        {/* Current Item */}
        {currentItem && (
          <div className="p-4 border-b border-border bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                {currentItem.status === 'generating' ? (
                  <Loader2 className="w-5 h-5 text-primary animate-spin" />
                ) : currentItem.status === 'completed' ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : currentItem.status === 'error' ? (
                  <X className="w-5 h-5 text-destructive" />
                ) : (
                  <Clock className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground truncate">{currentItem.title}</div>
                <div className="text-sm text-muted-foreground truncate">{currentItem.keyword}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-primary">{currentItem.progress}%</div>
                {currentStep && (
                  <div className="text-xs text-muted-foreground">{currentStep.label}</div>
                )}
              </div>
            </div>
            {/* Item Progress */}
            <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${currentItem.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="p-4 max-h-[300px] overflow-y-auto">
          <div className="grid grid-cols-3 gap-2">
            {steps.map((step) => (
              <div 
                key={step.id}
                className={cn(
                  "p-3 rounded-xl transition-all border",
                  step.status === 'running' && "bg-primary/10 border-primary/50 shadow-lg shadow-primary/10",
                  step.status === 'completed' && "bg-green-500/10 border-green-500/30",
                  step.status === 'error' && "bg-destructive/10 border-destructive/30",
                  step.status === 'pending' && "bg-muted/30 border-border/50",
                  step.status === 'skipped' && "bg-muted/20 border-border/30 opacity-50"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn(
                    "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0",
                    step.status === 'pending' && "bg-muted text-muted-foreground",
                    step.status === 'running' && "bg-primary text-primary-foreground",
                    step.status === 'completed' && "bg-green-500 text-white",
                    step.status === 'error' && "bg-destructive text-white",
                    step.status === 'skipped' && "bg-muted text-muted-foreground"
                  )}>
                    {step.status === 'running' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : step.status === 'completed' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : step.status === 'error' ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  <span className={cn(
                    "text-xs font-medium truncate",
                    step.status === 'running' && "text-primary",
                    step.status === 'completed' && "text-green-400",
                    step.status === 'error' && "text-destructive",
                    step.status === 'pending' && "text-muted-foreground",
                    step.status === 'skipped' && "text-muted-foreground"
                  )}>
                    {step.label}
                  </span>
                </div>
                {step.message && (
                  <div className="text-xs text-muted-foreground truncate pl-8">
                    {step.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Item Queue */}
        {items.length > 1 && (
          <div className="p-4 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Zap className="w-3 h-3" />
              Generation Queue ({completedItems}/{totalItems})
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex-shrink-0 w-2.5 h-2.5 rounded-full transition-all",
                    item.status === 'completed' && "bg-green-500",
                    item.status === 'generating' && "bg-primary animate-pulse scale-125",
                    item.status === 'error' && "bg-destructive",
                    item.status === 'pending' && "bg-muted-foreground/30"
                  )}
                  title={item.title}
                />
              ))}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-4 mx-4 mb-4 bg-destructive/10 border border-destructive/30 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Generation Error</div>
                <p className="text-sm text-destructive/80 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/20">
          {isComplete ? (
            <button
              onClick={onClose}
              className="w-full px-6 py-3.5 bg-gradient-to-r from-primary to-green-500 text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
            >
              <Sparkles className="w-5 h-5" />
              View Generated Content
            </button>
          ) : hasError ? (
            <button
              onClick={onClose}
              className="w-full px-6 py-3.5 bg-muted text-foreground font-semibold rounded-xl hover:bg-muted/80 transition-all"
            >
              Close
            </button>
          ) : (
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">
                {currentStep 
                  ? `${currentStep.label}: ${currentStep.description}...` 
                  : 'Initializing generation pipeline...'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}

export default EnhancedGenerationModal;
