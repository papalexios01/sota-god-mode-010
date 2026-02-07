import { useState, useCallback } from 'react';
import { useOptimizerStore } from '@/lib/store';
import { getSupabaseConfig } from '@/lib/supabaseClient';

interface PublishResult {
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

export function useWordPressPublish() {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const { config } = useOptimizerStore();

  const publish = useCallback(async (
    title: string,
    content: string,
    options?: {
      excerpt?: string;
      status?: 'draft' | 'publish' | 'pending' | 'private';
      slug?: string;
      metaDescription?: string;
      seoTitle?: string;
      sourceUrl?: string;
      existingPostId?: number;
    }
  ): Promise<PublishResult> => {
    setIsPublishing(true);
    setPublishResult(null);

    try {
      if (!config.wpUrl || !config.wpUsername || !config.wpAppPassword) {
        throw new Error('WordPress not configured. Add WordPress URL, username, and application password in Setup.');
      }

      try {
        const parsed = new URL(config.wpUrl.startsWith('http') ? config.wpUrl : `https://${config.wpUrl}`);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('WordPress URL must use HTTP or HTTPS');
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('HTTP')) throw e;
        throw new Error('Invalid WordPress URL format');
      }

      const safeSlug = options?.slug ? options.slug.replace(/^\/+/, '').split('/').pop() : undefined;

      const body = {
        wpUrl: config.wpUrl,
        username: config.wpUsername,
        appPassword: config.wpAppPassword,
        title,
        content,
        excerpt: options?.excerpt,
        status: options?.status || 'draft',
        slug: safeSlug,
        metaDescription: options?.metaDescription,
        seoTitle: options?.seoTitle,
        sourceUrl: options?.sourceUrl,
        existingPostId: options?.existingPostId,
      };

      const { url: supabaseUrl, anonKey: supabaseKey, configured, issues } = getSupabaseConfig();

      if (!configured) {
        const detail = issues.length ? ` (${issues.join('; ')})` : '';
        throw new Error(
          `Supabase not configured. Open Setup → Supabase and add your project URL + anon key, then reload.${detail}`
        );
      }

      const apiUrl = `${supabaseUrl}/functions/v1/wordpress-publish`;

      const maxAttempts = 3;
      let lastError: Error | null = null;
      let data: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(90000),
          });

          const responseText = await response.text();

          if (!responseText || responseText.trim().length === 0) {
            throw new Error(
              `Server returned empty response (HTTP ${response.status}). Try again.`
            );
          }

          try {
            data = JSON.parse(responseText);
          } catch {
            if (response.status >= 500) {
              throw new Error(`Server error (HTTP ${response.status}). Try again in a moment.`);
            }
            throw new Error(
              `Invalid response from server (HTTP ${response.status}): ${responseText.slice(0, 200)}`
            );
          }

          break;
        } catch (fetchError) {
          lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
          const isRetryable = !lastError.message.includes('not configured') &&
            !lastError.message.includes('Invalid WordPress URL') &&
            lastError.name !== 'AbortError';
          if (attempt < maxAttempts - 1 && isRetryable) {
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          if (lastError.name === 'TimeoutError' || lastError.message?.includes('timeout')) {
            throw new Error('WordPress publish timed out after 90 seconds. The post may be too large.');
          }
          throw lastError;
        }
      }

      if (!data?.success) {
        const serverError = (data?.error as string) || '';
        const statusCode = data?.status as number;
        let errorMsg = serverError || lastError?.message || 'Failed to publish to WordPress';

        if (statusCode === 401 || serverError.includes('Authentication')) {
          errorMsg = 'WordPress authentication failed. Check your username and application password in Setup.';
        } else if (statusCode === 403) {
          errorMsg = 'Permission denied. Ensure the WordPress user has publishing capabilities.';
        } else if (statusCode === 404) {
          errorMsg = 'WordPress REST API not found. Ensure permalinks are enabled.';
        }

        throw new Error(errorMsg);
      }

      const post = data.post as Record<string, unknown> | undefined;
      const result: PublishResult = {
        success: true,
        postId: post?.id as number | undefined,
        postUrl: post?.url as string | undefined,
      };

      setPublishResult(result);
      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const result: PublishResult = {
        success: false,
        error: errorMsg,
      };
      setPublishResult(result);
      return result;
    } finally {
      setIsPublishing(false);
    }
  }, [config]);

  const clearResult = useCallback(() => {
    setPublishResult(null);
  }, []);

  return {
    publish,
    isPublishing,
    publishResult,
    clearResult,
    isConfigured: !!(config.wpUrl && config.wpUsername && config.wpAppPassword),
  };
}
