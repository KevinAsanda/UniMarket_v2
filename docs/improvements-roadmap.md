# Improvements Analysis and Product Roadmap

This document covers immediate bugs and security fixes that should be addressed before any production deployment, followed by a phased feature roadmap for growing the platform.

---

## 1. Immediate Fixes and Security Patches

These items represent known defects or security vulnerabilities in the current v2 codebase. Address them before deploying to any live environment.

### A. Remove Plain-Text Password Storage (Critical)

**Problem**: `Signup.jsx` inserts the user's raw password string into the `students` table as a `password` column alongside the Supabase Auth registration. This is a critical security violation.

**Fix**:
1. Remove the `password` field from the `students` table insert in `Signup.jsx`.
2. Drop the `password` column from the `students` table schema entirely.
3. Supabase Auth already handles credentials securely via bcrypt. No application code should touch passwords after `supabase.auth.signUp()`.

---

### B. Move Claude API Call to a Supabase Edge Function (High)

**Problem**: `Admin.jsx` calls the Anthropic Claude API directly from the browser. This fails on every request because Anthropic blocks cross-origin browser requests (CORS), and there is no safe way to store an API key in client-side code.

**Fix**: Create a Supabase Edge Function at `supabase/functions/review-listing/index.ts`. The function should:
1. Verify that the caller is an authenticated admin.
2. Accept a `product_id` in the request body.
3. Read the listing details from the database using the service-role key.
4. Call the Anthropic API using `ANTHROPIC_API_KEY` stored as a Supabase secret.
5. Write the Claude response (risk level, reasoning) back to a `listing_reviews` table and return the result to the client.

On the client, replace the direct `fetch` call with `supabase.functions.invoke('review-listing', { body: { productId } })`.

---

### C. Harden Face ID Sessions (High)

**Problem**: A successful Face ID login writes the student's UUID to `sessionStorage`. Because `sessionStorage` is writable in the browser console, any user can impersonate any other student without going through face verification.

**Fix**:
1. Move the face descriptor comparison to a Supabase Edge Function or database RPC.
2. The server validates the descriptor match and - if successful - uses the Supabase service-role key to generate and return a signed session token for that student (`supabase.auth.admin.createSession()`).
3. The client stores this token via `supabase.auth.setSession()`.
4. Remove the `sessionStorage.setItem('um_student_id', ...)` pattern from `Login.jsx` and the `sessionStorage` fallback from `AuthContext.jsx` entirely.

---

### D. Configure Row-Level Security (High)

**Problem**: All Supabase queries use the public anon key. Without strict RLS policies, the database is accessible to any client who intercepts the key from browser network traffic.

**Fix**: Enable RLS on every table and apply least-privilege policies. See [`security-and-architecture.md`](security-and-architecture.md) for concrete SQL examples.

---

## 2. High-Impact New Features

A phased roadmap for elevating UniMarket from a functional prototype to a production-grade campus marketplace.

### Phase 1: Communication and Engagement

**1. In-App Messaging**

Students currently negotiate meetup details outside the platform (phone, WhatsApp). A real-time chat thread per order - built on Supabase Realtime - would keep all transaction communication inside the app and provide an audit trail for dispute resolution.

**2. Automated Transaction Notifications**

Trigger email or SMS notifications at key events: slot booked, order status changed, complaint resolved. Supabase Database Webhooks can call a notification Edge Function that integrates with Resend (email) or Twilio (SMS/WhatsApp). Both have generous free tiers.

---

### Phase 2: Trust and Community Moderation

**3. Seller Ratings and Buyer Reviews**

After an order is marked `completed`, both parties should be able to rate each other (1-5 stars) and leave a short written review. A `ratings` table linked to `orders` would power a seller reputation score displayed on listing cards.

**4. Community Listing Flags**

Allow any student to flag a listing as suspicious. If a listing accumulates more than a configurable threshold of flags (e.g., 5), automatically set `is_hidden = true` and push it into the admin's manual review queue. This distributes moderation effort across the student body without exposing admin tools.

---

### Phase 3: Financial and Logistics

**5. Digital Payment Escrow (PayFast or Yoco)**

The current cash-on-meetup model has no fraud protection for either party. Integrating PayFast or Yoco with an escrow pattern - where the buyer's payment is held until both parties confirm the meetup completed - would significantly reduce scam risk. Funds release to the seller only when `order_status` is updated to `completed` by the buyer.

**6. Approved Campus Meetup Hubs**

Replace the free-text venue field with a curated list of pre-approved safe zones on the MUT campus (Library reception, Admin foyer, Student Centre). Display these in a visual map picker during slot creation. This standardises meetup locations and reduces the risk of students being directed to unsafe off-campus locations.
