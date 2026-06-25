// supabase/functions/payfast-notify/index.ts
// Handles PayFast ITN (Instant Transaction Notification) webhook.
// PayFast POSTs to this URL when a payment is completed/cancelled.
// Updates the order's payment_status in the database.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const PAYFAST_PASSPHRASE = Deno.env.get('PAYFAST_PASSPHRASE') ?? '';

// PayFast sandbox merchant details (override with real credentials via Supabase secrets)
const PAYFAST_MERCHANT_ID = Deno.env.get('PAYFAST_MERCHANT_ID') ?? '';
const PAYFAST_MERCHANT_KEY = Deno.env.get('PAYFAST_MERCHANT_KEY') ?? '';

/** Verify PayFast ITN signature */
async function verifySignature(params: Record<string, string>): Promise<boolean> {
  // Build parameter string (sorted alphabetically, excluding 'signature')
  const paramString = Object.keys(params)
    .filter((key) => key !== 'signature')
    .sort()
    .map((key) => `${key}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`)
    .join('&');

  const stringToHash = PAYFAST_PASSPHRASE
    ? `${paramString}&passphrase=${encodeURIComponent(PAYFAST_PASSPHRASE).replace(/%20/g, '+')}`
    : paramString;

  const msgBuf = new TextEncoder().encode(stringToHash);
  const hashBuf = await crypto.subtle.digest('MD5', msgBuf);
  const hashArray = Array.from(new Uint8Array(hashBuf));
  const computedSignature = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return computedSignature === params['signature'];
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // PayFast sends ITN as application/x-www-form-urlencoded
    const body = await req.text();
    const params: Record<string, string> = {};
    for (const [key, val] of new URLSearchParams(body)) {
      params[key] = val;
    }

    // Verify the payment source is PayFast
    const isValid = await verifySignature(params);
    if (!isValid) {
      console.error('[payfast-notify] Signature mismatch — possible spoofed request.');
      return new Response('Signature invalid', { status: 400 });
    }

    const paymentStatus = params['payment_status']; // 'COMPLETE' | 'CANCELLED' | 'FAILED'
    const merchantPaymentId = params['m_payment_id']; // This is our order_id
    const pfPaymentId = params['pf_payment_id'];
    const amountGross = params['amount_gross'];

    if (!merchantPaymentId) {
      return new Response('Missing m_payment_id', { status: 400 });
    }

    if (paymentStatus === 'COMPLETE') {
      const { error } = await supabase
        .from('orders')
        .update({
          payment_status: 'paid',
          payfast_payment_id: pfPaymentId,
          payfast_amount_gross: parseFloat(amountGross),
          order_status: 'pending', // Move from pending_payment → pending (visible to seller)
        })
        .eq('order_id', merchantPaymentId);

      if (error) {
        console.error('[payfast-notify] DB update error:', error.message);
        return new Response('DB error', { status: 500 });
      }

      console.log(`[payfast-notify] Payment COMPLETE for order ${merchantPaymentId}`);
    } else if (paymentStatus === 'CANCELLED' || paymentStatus === 'FAILED') {
      const { error } = await supabase
        .from('orders')
        .update({ payment_status: 'refunded', order_status: 'cancelled' })
        .eq('order_id', merchantPaymentId);

      if (error) {
        console.error('[payfast-notify] DB cancel error:', error.message);
        return new Response('DB error', { status: 500 });
      }

      console.log(`[payfast-notify] Payment ${paymentStatus} for order ${merchantPaymentId}`);
    }

    // PayFast requires HTTP 200 to acknowledge receipt
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[payfast-notify] Unhandled error:', err);
    return new Response('Internal server error', { status: 500 });
  }
});
