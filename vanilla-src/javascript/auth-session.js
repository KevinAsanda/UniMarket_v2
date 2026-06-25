/* ═══════════════════════════════════════════════════
   auth-session.js  –  UniMarket session helper
   Supports two login paths:
     1. Password login  → Supabase Auth session
     2. Face ID login   → sessionStorage um_student_id

   Usage: call resolveSession() on any protected page.
   It returns { userId, firstName } or redirects to login.
═══════════════════════════════════════════════════ */

async function resolveSession() {
  const db = window.supabaseClient;
  if (!db) { window.location.href = 'login.html'; return null; }

  let userId = null;

  // 1. Try Supabase Auth (password login)
  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    userId = session.user.id;
  }

  // 2. Fallback: face login stores student_id in sessionStorage
  if (!userId) {
    userId = sessionStorage.getItem('um_student_id') || null;
  }

  // 3. Not logged in at all — redirect
  if (!userId) {
    window.location.href = 'login.html';
    return null;
  }

  // 4. Fetch student name for the navbar
  const { data: student, error } = await db
    .from('students')
    .select('first_name, last_name, account_status')
    .eq('student_id', userId)
    .single();

  if (error || !student) {
    window.location.href = 'login.html';
    return null;
  }

  // Block suspended / banned accounts
  if (student.account_status === 'suspended' || student.account_status === 'banned') {
    await db.auth.signOut();
    sessionStorage.clear();
    window.location.href = 'login.html';
    return null;
  }

  // 5. Render name in navbar — looks for id="username"
  const el = document.getElementById('username');
  if (el) el.textContent = `${student.first_name} ${student.last_name}`;

  return { userId, firstName: student.first_name, lastName: student.last_name };
}

/* Sign out — clears both auth session and sessionStorage */
async function signOut() {
  const db = window.supabaseClient;
  if (db) await db.auth.signOut();
  sessionStorage.clear();
  window.location.href = 'login.html';
}