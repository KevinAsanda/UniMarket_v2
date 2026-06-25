// supabase/functions/review-listing/index.ts
// Supabase Edge Function: review-listing
// Uses Google Gemini 2.0 Flash API (free tier) for AI listing moderation.
// Secret required: GEMINI_API_KEY (set via: supabase secrets set GEMINI_API_KEY=your_key)
// Get a free API key at: https://aistudio.google.com/apikey

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorised' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request body
    const { productId } = await req.json();
    if (!productId) {
      return new Response(JSON.stringify({ error: 'productId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Read listing from DB using service-role key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('product_id, product_name, description, price, status')
      .eq('product_id', productId)
      .single();

    if (productError || !product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Call Google Gemini 2.0 Flash API (free tier)
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are a marketplace content moderator for a South African university student marketplace called UniMarket.

Review the following student listing and assess its safety and policy compliance:

Product Name: ${product.product_name}
Description: ${product.description || '(no description provided)'}
Price: R${product.price} ZAR

Policies:
- No counterfeit or luxury brand items (Rolex, fake iPhones, designer fakes)
- No weapons, drugs, or illegal items
- Prices above R5000 require extra scrutiny
- Items must be suitable for student use on a university campus

Respond ONLY in valid JSON with no markdown, no code blocks, just raw JSON with this exact structure:
{
  "risk": "low",
  "summary": "One sentence summary of your finding",
  "issues": ["list of specific issues or empty array"],
  "recommendation": "approve"
}
Valid values: risk must be "low", "medium", or "high". recommendation must be "approve", "review", or "reject".`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API error:', errorText);
      return new Response(JSON.stringify({ error: 'Gemini API call failed', detail: errorText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiData = await geminiResponse.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let review;
    try {
      // Strip any accidental markdown code fences if present
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      review = JSON.parse(cleaned);
    } catch {
      review = {
        risk: 'medium',
        summary: rawText.slice(0, 200),
        issues: ['Could not parse structured response from Gemini'],
        recommendation: 'review',
      };
    }

    // 5. Save review to listing_reviews table
    await supabaseAdmin.from('listing_reviews').upsert({
      product_id: productId,
      risk: review.risk,
      summary: review.summary,
      issues: review.issues,
      recommendation: review.recommendation,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: 'product_id' });

    return new Response(JSON.stringify(review), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('review-listing error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
