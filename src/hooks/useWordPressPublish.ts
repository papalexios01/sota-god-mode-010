// ============================================================
// WORDPRESS PUBLISHING HOOK - Supabase Edge Function Integration
// ============================================================

import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured, getSupabaseAnonKey, getSupabaseUrl } from '@/integrations/supabase/client';
import { useOptimizerStore } from '@/lib/store';

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
    }
  ): Promise<PublishResult> => {
    setIsPublishing(true);
    setPublishResult(null);

    try {
      // Validate WordPress config
      if (!config.wpUrl || !config.wpUsername || !config.wpAppPassword) {
        throw new Error('WordPress not configured. Add WordPress URL, username, and application password in Setup.');
      }

      // Try Supabase function first
      if (supabase && isSupabaseConfigured()) {
        const safeSlug = options?.slug ? options.slug.replace(/^\/+/, '') : undefined;

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
        };

        const { data, error } = await supabase.functions.invoke('wordpress-publish', {
          body: {
            ...body,
          },
        });

        if (error) {
          // Supabase sometimes returns a generic network error here (CORS/OPTIONS mismatch on the function)
          // Try a minimal direct call that avoids extra headers like `apikey` / `x-client-info`.
          if (/Failed to send a request to the Edge Function/i.test(error.message)) {
            const supabaseUrl = getSupabaseUrl();
            const anonKey = getSupabaseAnonKey();

            if (supabaseUrl && anonKey) {
              try {
                const fnUrl = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/wordpress-publish`;
                const res = await fetch(fnUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${anonKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                  },
                  body: JSON.stringify(body),
                });

                const json = await res.json().catch(() => null);
                if (json?.success) {
                  const result: PublishResult = {
                    success: true,
                    postId: json.post?.id,
                    postUrl: json.post?.url,
                  };
                  setPublishResult(result);
                  return result;
                }

                const msg = json?.error || `Edge Function request failed (${res.status})`;
                throw new Error(msg);
              } catch (e) {
                // Fall through to the original error for consistent messaging
                console.warn('[WordPressPublish] Fallback invoke failed:', e);
              }
            }
          }

          throw new Error(error.message);
        }

        if (!data?.success) {
          throw new Error(data?.error || 'Failed to publish to WordPress');
        }

        const result: PublishResult = {
          success: true,
          postId: data.post?.id,
          postUrl: data.post?.url,
        };

        setPublishResult(result);
        return result;
      }

      // Fallback: Direct API call (may fail due to CORS)
      const baseUrl = config.wpUrl.replace(/\/+$/, '');
      const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;
      const authString = btoa(`${config.wpUsername}:${config.wpAppPassword}`);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          status: options?.status || 'draft',
          excerpt: options?.excerpt,
          slug: options?.slug,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WordPress API error: ${response.status} - ${errorText}`);
      }

      const post = await response.json();
      const result: PublishResult = {
        success: true,
        postId: post.id,
        postUrl: post.link,
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
