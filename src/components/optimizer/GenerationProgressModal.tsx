// GENERATION PROGRESS MODAL - Real-Time Generation Status

import { useState, useEffect } from 'react';
import { Loader2, Check, AlertCircle, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GenerationStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
}

interface GenerationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  keyword: string;
  steps: GenerationStep[];
  progress: number;
  currentPhase: string;
  error?: string;
}

const DEFAULT_STEPS: GenerationStep[] = [
  { id: 'research', label: 'SERP Analysis & Research', status: 'pending' },
  { id: 'videos', label: 'YouTube Video Discovery', status: 'pending' },
  { id: 'references', label: 'Reference Gathering', status: 'pending' },
  { id: 'outline', label: 'Content Outline Generation', status: 'pending' },
  { id: 'content', label: 'AI Content Generation', status: 'pending' },
  { id: 'enhance', label: 'Content Enhancement', status: 'pending' },
  { id: 'links', label: 'Internal Link Injection', status: 'pending' },
  { id: 'validate', label: 'Quality Validation', status: 'pending' },
  { id: 'schema', label: 'Schema.org Generation', status: 'pending' },
];

export function GenerationProgressModal({
  isOpen,
  onClose,
  keyword,
  steps = DEFAULT_STEPS,
  progress,
  currentPhase,
  error
}: GenerationProgressModalProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const completedSteps = steps.filter(s => s.status === 'completed').length;
  const hasError = steps.some(s => s.status === 'error') || !!error;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                hasError ? "bg-destructive/20" : "bg-primary/20"
              )}>
                {hasError ? (
                  <AlertCircle className="w-5 h-5 text-destructive" />
                ) : progress === 100 ? (
                  <Check className="w-5 h-5 text-primary" />
                ) : (
                  <Sparkles className="w-5 h-5 text-primary animate-pulse" />
                )}
              </div>
              <div>
                <h2 className="font-bold text-foreground">
                  {hasError ? 'Generation Failed' : progress === 100 ? 'Generation Complete' : 'Generating Content'}
                </h2>
                <p className="text-sm text-muted-foreground truncate max-w-[250px]">
                  {keyword}
                </p>
              </div>
            </div>
            {(progress === 100 || hasError) && (
              <button
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{currentPhase}</span>
              <span className="text-foreground font-medium">{progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-300",
                  hasError ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{completedSteps}/{steps.length} steps</span>
              <span>{formatTime(elapsedTime)} elapsed</span>
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="p-6 max-h-[400px] overflow-y-auto">
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-all",
                  step.status === 'running' && "bg-primary/10 border border-primary/30",
                  step.status === 'completed' && "bg-muted/30",
                  step.status === 'error' && "bg-destructive/10 border border-destructive/30"
                )}
              >
                <div className="flex-shrink-0">
                  {step.status === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  {step.status === 'running' && (
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  )}
                  {step.status === 'completed' && (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {step.status === 'error' && (
                    <div className="w-6 h-6 rounded-full bg-destructive flex items-center justify-center">
                      <X className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "text-sm font-medium",
                    step.status === 'pending' && "text-muted-foreground",
                    step.status === 'running' && "text-primary",
                    step.status === 'completed' && "text-foreground",
                    step.status === 'error' && "text-destructive"
                  )}>
                    {step.label}
                  </div>
                  {step.message && (
                    <div className="text-xs text-muted-foreground truncate">
                      {step.message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 mx-6 mb-6 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-border">
          {progress === 100 ? (
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              View Generated Content
            </button>
          ) : hasError ? (
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-muted text-foreground font-semibold rounded-xl hover:bg-muted/80 transition-colors"
            >
              Close
            </button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Please wait while we generate your content...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default GenerationProgressModal;
