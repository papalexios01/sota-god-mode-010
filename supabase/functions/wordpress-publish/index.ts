// ============================================================
// WORDPRESS PUBLISHING - REST API Integration
// Publish content directly to WordPress sites
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PublishRequest {
  wpUrl: string;
  username: string;
  appPassword: string;
  title: string;
  content: string;
  excerpt?: string;
  status?: 'draft' | 'publish' | 'pending' | 'private';
  categories?: number[];
  tags?: number[];
  featuredImage?: string;
  slug?: string;
  metaDescription?: string;
}

interface WordPressPost {
  id: number;
  link: string;
  status: string;
  title: { rendered: string };
  slug: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: PublishRequest = await req.json();
    const { 
      wpUrl, 
      username, 
      appPassword, 
      title, 
      content, 
      excerpt,
      status = 'draft',
      categories,
      tags,
      slug,
      metaDescription
    } = body;

    // Validate required fields
    if (!wpUrl || !username || !appPassword || !title || !content) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: wpUrl, username, appPassword, title, content' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean and format the WordPress URL
    let baseUrl = wpUrl.trim().replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) {
      baseUrl = `https://${baseUrl}`;
    }
    const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

    console.log(`[WordPress] Publishing to: ${apiUrl}`);

    // Create Basic Auth header
    const authString = `${username}:${appPassword}`;
    const authBase64 = btoa(authString);

    // Prepare the post data
    const postData: Record<string, unknown> = {
      title,
      content,
      status,
    };

    if (excerpt) postData.excerpt = excerpt;
    if (slug) postData.slug = slug;
    if (categories && categories.length > 0) postData.categories = categories;
    if (tags && tags.length > 0) postData.tags = tags;

    // Add Yoast SEO meta if meta description provided
    if (metaDescription) {
      postData.meta = {
        _yoast_wpseo_metadesc: metaDescription,
      };
    }

    // Make the API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authBase64}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    const responseText = await response.text();
    console.log(`[WordPress] Response status: ${response.status}`);

    if (!response.ok) {
      let errorMessage = `WordPress API error: ${response.status}`;
      
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorData.error || errorMessage;
        
        if (response.status === 401) {
          errorMessage = 'Authentication failed. Check your username and application password.';
        } else if (response.status === 403) {
          errorMessage = 'Permission denied. Ensure the user has publish capabilities.';
        } else if (response.status === 404) {
          errorMessage = 'WordPress REST API not found. Ensure permalinks are enabled and REST API is accessible.';
        }
      } catch {
        // Use default error message
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          status: response.status 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse successful response
    let post: WordPressPost;
    try {
      post = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid response from WordPress' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[WordPress] Successfully published post ID: ${post.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        post: {
          id: post.id,
          url: post.link,
          status: post.status,
          title: post.title?.rendered || title,
          slug: post.slug,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[WordPress] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
