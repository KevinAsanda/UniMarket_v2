# Security and Architecture Analysis

This document provides a critical review of the UniMarket v2 architectural decisions, authentication mechanisms, and current security posture. Each vulnerability is documented with its location in the React codebase, the exploitation risk, and a concrete remediation path.

---

## 1. Critical Security Vulnerabilities

### Vulnerability A: Plain-Text Password Storage (Critical)

**Location**: `Signup.jsx` - the `students` table insert in the registration submission handler.

**Description**: During registration, `supabase.auth.signUp()` creates a properly hashed credential in Supabase Auth. However, the same raw password string is then inserted into the `students` table in a `password` column in plain text.

**Risk**: Anyone with read access to the PostgreSQL database - via the Supabase dashboard, a leaked anon key with weak RLS, or a SQL injection - can retrieve every student's password in cleartext. Because students commonly reuse passwords across services, this exposure extends well beyond the platform.

**Remediation**:
1. Remove the `password` column from the `students` table entirely.
2. Remove the `password` field from the insert in `Signup.jsx`.
3. All credential management is already handled securely by Supabase Auth (bcrypt-salted hashes). No application code needs to touch passwords after the `signUp()` call.

---

### Vulnerability B: Client-Side AI API Call (High)

**Location**: `Admin.jsx` - the `runAIReviewAll` function that sends requests to `https://api.anthropic.com/v1/messages`.

**Description**: The admin panel attempts to call the Anthropic Claude API directly from the browser.

**Three compounding problems**:

1. **API key exposure**: Any API key placed in client-side code or Vite environment variables prefixed with `VITE_` is readable by any user who opens DevTools. There is no safe way to hold a secret in a browser context.
2. **CORS block**: Anthropic does not permit cross-origin browser requests to their API. Every request returns a CORS error before it even reaches authentication.
3. **Result**: The current code passes no API key. Every scan silently fails and defaults to "AI review unavailable."

**Remediation**: Move the Claude call to a Supabase Edge Function:

```
supabase/functions/review-listing/index.ts
```

The Edge Function holds the `ANTHROPIC_API_KEY` as a Supabase secret, verifies that the requesting user is an admin, proxies the Claude request, and writes the result back to the database. The client only needs to call `supabase.functions.invoke('review-listing', { body: { productId } })`.

---

### Vulnerability C: Face ID Session Spoofing (High)

**Location**: `AuthContext.jsx` - the `resolveSession` function; `Login.jsx` - the Face ID completion handler.

**Description**: A successful Face ID match writes the authenticated student's UUID to `sessionStorage`:

```javascript
sessionStorage.setItem('um_student_id', studentId);
```

`resolveSession()` reads this value as a trusted session identifier. Because `sessionStorage` is writable by any JavaScript running in the same browser tab, a malicious user can open the console and type:

```javascript
sessionStorage.setItem('um_student_id', 'target-student-uuid-here');
```

On next page load, the application resolves the session under the targeted student's identity without any server-side verification.

**Remediation**: Face verification must be validated on the server, not the client.

1. Move the descriptor comparison to a Supabase Edge Function or RPC.
2. The function receives the live descriptor from the client, computes the Euclidean distance against the stored descriptor, and - if the match passes - returns a signed Supabase JWT for that student using the service-role key.
3. The client stores the JWT via `supabase.auth.setSession()` instead of a raw ID in `sessionStorage`.
4. All protected routes then rely solely on the verified Supabase session.

---

### Vulnerability D: Row-Level Security Gaps (Medium to High)

**Location**: `src/utils/supabaseClient.js` - the Supabase client is initialised with the public `anon` key.

**Description**: The application uses the anonymous Supabase key for all database reads and writes. If Row-Level Security (RLS) is not correctly configured on every table, any user who finds the anon key (readable from browser DevTools network traffic) can write direct API calls to read, modify, or delete arbitrary rows - including changing product prices, altering account statuses, or reading all student contact details.

**Remediation**:

Enable RLS on every table and define policies that enforce the principle of least privilege. Examples:

```sql
-- Students can only read and update their own profile
CREATE POLICY "Own profile access" ON students
  USING (auth.uid() = student_id);

-- Only the product seller can update their listing
CREATE POLICY "Seller listing update" ON products
  FOR UPDATE USING (auth.uid() = seller_id);

-- Any authenticated student can insert a complaint
CREATE POLICY "Authenticated complaint insert" ON complaints
  FOR INSERT WITH CHECK (auth.uid() = complainant_id);

-- Orders are readable only by the buyer or seller
CREATE POLICY "Order parties access" ON orders
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);
```

---

## 2. Architectural Design Notes

### Dual-Path Session Resolution

The `resolveSession()` function in `AuthContext.jsx` resolves authentication in priority order:

1. **Supabase session**: Checks `supabase.auth.getSession()` for a valid access token in the client cache.
2. **SessionStorage fallback**: If no Supabase session exists, reads `sessionStorage.getItem('um_student_id')` to support Face ID logins.

Both paths then call `fetchProfile()` to load the student record and verify account status. Suspended or banned accounts are signed out before any user state is set.

### Offline-First AI Simulation

The product review screen (`Review.jsx`) displays a staged, multi-step "AI scanning" interface with animated status transitions and simulated delays. The actual decision logic is a synchronous offline rules engine that checks listing text against `RULES.BANNED` and `RULES.SUSPICIOUS` keyword arrays.

This approach was a deliberate UX decision: it communicates platform safety to students without requiring a live API connection for every listing submission. The admin panel's Claude-powered review panel is intended to complement this with deeper analysis on flagged or escalated items.
