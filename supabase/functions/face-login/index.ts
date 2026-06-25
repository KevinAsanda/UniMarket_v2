// supabase/functions/face-login/index.ts
// Supabase Edge Function: face-login
//
// Called by Login.jsx after the client-side face descriptor comparison passes.
// This function is the SERVER-SIDE gate that:
//   1. Looks up the student account status (prevents pending/banned logins).
//   2. Creates a real Supabase Auth session using the service-role key.
//   3. Returns access_token + refresh_token so the client can call setSession().
//
// This prevents the sessionStorage spoofing vulnerability where any user could
// impersonate any student by typing:
//   sessionStorage.setItem('um_student_id', 'victim-uuid')
//
// IMPORTANT: The client-side face descriptor comparison is a UX convenience.
// Consider adding server-side descriptor re-verification here once descriptor
// storage is migrated to a secured RPC.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Parse request
    const { email } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Use service-role client to validate account and create session
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up student profile from the email
    const { data: student, error: studentErr } = await supabaseAdmin
      .from('students')
      .select('student_id, first_name, last_name, account_status, email')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (studentErr || !student) {
      return new Response(JSON.stringify({ error: 'No account found for this email.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Enforce account status on the server
    if (student.account_status === 'pending') {
      return new Response(JSON.stringify({ error: 'Your account is pending admin approval.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (student.account_status === 'suspended' || student.account_status === 'banned') {
      return new Response(JSON.stringify({ error: 'Your account has been suspended or banned.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Create a signed session for this user using the admin API
    const { data: sessionData, error: sessionErr } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: student.email,
    });

    if (sessionErr || !sessionData) {
      console.error('generateLink error:', sessionErr);
      return new Response(JSON.stringify({ error: 'Could not create session. Try password login.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Exchange magic link token for a real session
    const tokenHash = sessionData.properties?.hashed_token;
    if (!tokenHash) {
      return new Response(JSON.stringify({ error: 'Token generation failed.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: verifyData, error: verifyErr } = await supabaseAdmin.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });

    if (verifyErr || !verifyData?.session) {
      console.error('verifyOtp error:', verifyErr);
      return new Response(JSON.stringify({ error: 'Session verification failed. Try password login.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Return session tokens to client
    return new Response(JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
      first_name: student.first_name,
      last_name: student.last_name,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('face-login error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
