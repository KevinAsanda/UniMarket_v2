// supabase/functions/send-notification/index.ts
// Triggered by client after key order events. Sends emails via Resend API.
// Events: 'order_placed' | 'order_completed' | 'complaint_filed'

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationPayload {
  event: 'order_placed' | 'order_completed' | 'complaint_filed';
  orderId?: string;
  complaintId?: string;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.warn('[send-notification] RESEND_API_KEY not set — skipping email.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'UniMarket <notifications@unimarket.app>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[send-notification] Resend error:', err);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: NotificationPayload = await req.json();
    const { event, orderId, complaintId } = body;

    if (event === 'order_placed' && orderId) {
      // Notify the seller that their item has been purchased
      const { data: order } = await supabase
        .from('orders')
        .select(`
          order_id, created_at,
          products ( product_name, price ),
          meetup_slots ( day_of_week, slot_time, venue ),
          seller:students!orders_seller_id_fkey ( first_name, last_name, email ),
          buyer:students!orders_buyer_id_fkey ( first_name, last_name, contact_number )
        `)
        .eq('order_id', orderId)
        .single();

      if (order?.seller?.email) {
        const sellerName = `${order.seller.first_name} ${order.seller.last_name}`;
        const buyerName = `${order.buyer.first_name} ${order.buyer.last_name}`;
        const productName = order.products.product_name;
        const price = parseFloat(order.products.price).toFixed(2);
        const day = order.meetup_slots?.day_of_week ?? 'TBD';
        const time = order.meetup_slots?.slot_time?.slice(0, 5) ?? 'TBD';
        const venue = order.meetup_slots?.venue ?? 'TBD';

        await sendEmail(
          order.seller.email,
          `🛒 New Order for "${productName}" — UniMarket`,
          `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="color:#1a1a2e">You have a new order! 🎉</h2>
            <p>Hi <strong>${sellerName}</strong>,</p>
            <p><strong>${buyerName}</strong> has purchased your listing <strong>"${productName}"</strong> for <strong>R${price}</strong>.</p>
            <h3 style="color:#374151">Meetup Details</h3>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6"><strong>Day</strong></td><td style="padding:8px;border-bottom:1px solid #f3f4f6">${day}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #f3f4f6"><strong>Time</strong></td><td style="padding:8px;border-bottom:1px solid #f3f4f6">${time}</td></tr>
              <tr><td style="padding:8px"><strong>Venue</strong></td><td style="padding:8px">${venue}</td></tr>
            </table>
            <p style="margin-top:16px">Buyer contact: <strong>${order.buyer.contact_number ?? 'not provided'}</strong></p>
            <p style="color:#6b7280;font-size:13px;margin-top:24px">Log in to UniMarket to view the order and chat with the buyer.</p>
          </div>
          `
        );
      }
    }

    if (event === 'order_completed' && orderId) {
      // Notify the buyer the order has been marked complete
      const { data: order } = await supabase
        .from('orders')
        .select(`
          order_id,
          products ( product_name, price ),
          buyer:students!orders_buyer_id_fkey ( first_name, last_name, email ),
          seller:students!orders_seller_id_fkey ( first_name, last_name )
        `)
        .eq('order_id', orderId)
        .single();

      if (order?.buyer?.email) {
        const buyerName = `${order.buyer.first_name} ${order.buyer.last_name}`;
        const sellerName = `${order.seller.first_name} ${order.seller.last_name}`;
        const productName = order.products.product_name;

        await sendEmail(
          order.buyer.email,
          `✅ Your order for "${productName}" is complete — UniMarket`,
          `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
            <h2 style="color:#1a1a2e">Transaction Complete! ✅</h2>
            <p>Hi <strong>${buyerName}</strong>,</p>
            <p>Your order for <strong>"${productName}"</strong> from <strong>${sellerName}</strong> has been marked as completed.</p>
            <p>Log in to UniMarket to leave a rating and review for the seller!</p>
            <p style="color:#6b7280;font-size:13px;margin-top:24px">If you did not complete this meetup, please file a complaint from the Activity page.</p>
          </div>
          `
        );
      }
    }

    if (event === 'complaint_filed' && complaintId) {
      // Notify admin (via a known admin email from env) about a new complaint
      const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? '';
      if (!ADMIN_EMAIL) {
        console.warn('[send-notification] ADMIN_EMAIL not set — skipping complaint notification.');
      } else {
        const { data: complaint } = await supabase
          .from('complaints')
          .select(`
            complaint_id, complaint_text,
            products ( product_name ),
            complainant:students!complaints_complainant_id_fkey ( first_name, last_name ),
            reported:students!complaints_reported_user_id_fkey ( first_name, last_name )
          `)
          .eq('complaint_id', complaintId)
          .single();

        if (complaint) {
          const complainantName = `${complaint.complainant.first_name} ${complaint.complainant.last_name}`;
          const reportedName = `${complaint.reported.first_name} ${complaint.reported.last_name}`;
          const productName = complaint.products?.product_name ?? 'Unknown';

          await sendEmail(
            ADMIN_EMAIL,
            `🚩 New Complaint Filed — UniMarket Admin`,
            `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
              <h2 style="color:#dc2626">New Complaint Filed 🚩</h2>
              <p><strong>Complainant:</strong> ${complainantName}</p>
              <p><strong>Reported User:</strong> ${reportedName}</p>
              <p><strong>Product:</strong> ${productName}</p>
              <p><strong>Complaint:</strong></p>
              <blockquote style="border-left:4px solid #ef4444;padding:12px;margin:0;background:#fff5f5;border-radius:4px">
                ${complaint.complaint_text}
              </blockquote>
              <p style="color:#6b7280;font-size:13px;margin-top:24px">Log in to UniMarket Admin to review and take action.</p>
            </div>
            `
          );
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('[send-notification] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
