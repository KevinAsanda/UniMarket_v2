'use strict';

/* ═══════════════════════════════════════════════════
   admin.js  –  UniMarket Admin Dashboard
   Fixed to match Supabase schema exactly.
═══════════════════════════════════════════════════ */

/* ── STATE ───────────────────────────────────────── */
let _pendingStudents   = [];
let _rejectStudentId   = null;
let _rejectStudentName = '';

/* ── INIT ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadStats(),
    loadTopSellers(),
    loadListings(),
    loadUsers(),
    loadComplaints(),
    loadPendingApprovals(),
    loadManualReviewCount(),
  ]);
});

/* ── TAB SWITCHING ───────────────────────────────── */
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.panel').forEach(p =>
    p.classList.toggle('active',
      p.id === 'panel' + tab.charAt(0).toUpperCase() + tab.slice(1))
  );
  if (tab === 'approvals') loadPendingApprovals();
}

/* ── DB HELPER ───────────────────────────────────── */
const db = () => window.supabaseClient || null;

/* ═══════════════════════════════════════════════════
   STATS
   FIX: products use `status` column, not `is_sold`/`is_hidden`.
        complaints use `complaint_status`, not `status`.
═══════════════════════════════════════════════════ */
async function loadStats() {
  const client = db();
  if (!client) { renderStatsFallback(); return; }
  try {
    const [
      { count: totalUsers },
      { count: activeListings },
      { count: unavailable },
      { count: complaints },
    ] = await Promise.all([
      client.from('students').select('*', { count:'exact', head:true }).eq('account_status','active'),
      client.from('products').select('*', { count:'exact', head:true }).eq('status','available').eq('is_hidden',false),
      client.from('products').select('*', { count:'exact', head:true }).in('status',['sold','hidden','suspended']),
      client.from('complaints').select('*', { count:'exact', head:true }).eq('complaint_status','pending'),
    ]);
    setEl('lblTotalUsers',     totalUsers     ?? '—');
    setEl('lblActiveListings', activeListings ?? '—');
    setEl('lblUnavailable',    unavailable    ?? '—');
    setEl('lblComplaints',     complaints     ?? '—');
  } catch (e) {
    console.warn('Stats error:', e.message);
    renderStatsFallback();
  }
}
function renderStatsFallback() {
  ['lblTotalUsers','lblActiveListings','lblUnavailable','lblComplaints'].forEach(id => setEl(id,'—'));
}

/* ═══════════════════════════════════════════════════
   TOP SELLERS
═══════════════════════════════════════════════════ */
async function loadTopSellers() {
  const tbody  = document.getElementById('topSellersBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(2); return; }
  try {
    const { data, error } = await client
      .from('products')
      .select('seller_id, students(first_name, last_name)')
      .eq('is_hidden', false);
    if (error) throw error;
    const tally = {};
    (data || []).forEach(p => {
      const name = p.students ? `${p.students.first_name} ${p.students.last_name}` : p.seller_id;
      tally[name] = (tally[name] || 0) + 1;
    });
    const sorted = Object.entries(tally).sort((a,b) => b[1]-a[1]).slice(0,5);
    tbody.innerHTML = sorted.length
      ? sorted.map(([name,count]) =>
          `<tr><td>${esc(name)}</td><td><span class="badge bg-primary">${count}</span></td></tr>`
        ).join('')
      : `<tr><td colspan="2" class="text-center text-muted py-3">No listings yet</td></tr>`;
  } catch (e) {
    tbody.innerHTML = errRow(2, e.message);
  }
}

/* ═══════════════════════════════════════════════════
   LISTINGS
   FIX: column is `product_name` (not `name`).
        status is text enum: 'available'|'sold'|'hidden'|'suspended'.
        toggleListing updates `status`, not `is_hidden`.
═══════════════════════════════════════════════════ */
async function loadListings() {
  const tbody  = document.getElementById('listingsBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(5); return; }
  tbody.innerHTML = loadingRow(5);
  try {
    const { data, error } = await client
      .from('products')
      .select('product_id, product_name, price, status, is_hidden, students(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No listings found</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(l => {
      const seller     = l.students ? `${l.students.first_name} ${l.students.last_name}` : '—';
      const statusText = l.status === 'sold' ? 'Sold' : (l.is_hidden || l.status === 'hidden' || l.status === 'suspended') ? 'Disabled' : 'Active';
      const canToggle  = l.status !== 'sold';
      const isDisabled = l.is_hidden || l.status === 'hidden' || l.status === 'suspended';
      return `
        <tr>
          <td>${esc(l.product_name)}</td>
          <td>${esc(seller)}</td>
          <td>R${parseFloat(l.price).toFixed(2)}</td>
          <td><span class="badge ${statusBadge(statusText)}">${statusText}</span></td>
          <td>${canToggle
            ? `<button class="btn btn-sm ${isDisabled ? 'btn-success' : 'btn-warning'}"
                onclick="toggleListing('${l.product_id}',${isDisabled})">
                ${isDisabled ? 'Enable' : 'Disable'}</button>`
            : '—'}</td>
        </tr>`;
    }).join('');
  } catch (e) { tbody.innerHTML = errRow(5, e.message); }
}

async function toggleListing(productId, currentlyDisabled) {
  const client = db(); if (!client) return;
  // FIX: update both `status` and `is_hidden` consistently
  const newStatus  = currentlyDisabled ? 'available' : 'hidden';
  const newHidden  = !currentlyDisabled;
  const { error } = await client.from('products')
    .update({ status: newStatus, is_hidden: newHidden }).eq('product_id', productId);
  if (error) { toast('Error: ' + error.message); return; }
  toast(currentlyDisabled ? 'Listing enabled ✔' : 'Listing disabled');
  loadListings(); loadStats();
}

function statusBadge(s) {
  if (s === 'Active')   return 'bg-success';
  if (s === 'Disabled') return 'bg-warning text-dark';
  if (s === 'Sold')     return 'bg-secondary';
  return 'bg-light text-dark';
}

/* ═══════════════════════════════════════════════════
   USERS
   FIX: `qualification` column does not exist on students.
        Must join qualifications table via qualification_id.
        contact_number is the correct column (not phone_number).
═══════════════════════════════════════════════════ */
async function loadUsers() {
  const tbody  = document.getElementById('usersBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(6); return; }
  tbody.innerHTML = loadingRow(6);
  try {
    const { data, error } = await client
      .from('students')
      .select('student_id, first_name, last_name, email, student_number, account_status, qualifications(qualification_name)')
      .in('account_status', ['active','suspended','banned'])
      .order('first_name');
    if (error) throw error;
    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">No users found</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(u => {
      const name           = `${esc(u.first_name)} ${esc(u.last_name)}`;
      const qualName       = u.qualifications?.qualification_name || '—';
      const isBanned       = u.account_status === 'banned' || u.account_status === 'suspended';
      return `
        <tr>
          <td>${name}</td>
          <td>${esc(u.email)}</td>
          <td>${esc(qualName)}</td>
          <td>${esc(u.student_number)}</td>
          <td><span class="badge ${isBanned ? 'bg-danger' : 'bg-success'}">${esc(u.account_status)}</span></td>
          <td>
            <button class="btn btn-sm ${isBanned ? 'btn-success' : 'btn-danger'}"
              onclick="toggleBan('${u.student_id}','${esc(u.account_status)}','${name}')">
              ${isBanned ? 'Unban' : 'Ban'}
            </button>
          </td>
        </tr>`;
    }).join('');
  } catch (e) { tbody.innerHTML = errRow(6, e.message); }
}

async function toggleBan(studentId, currentStatus, name) {
  const client = db(); if (!client) return;
  const banning   = currentStatus === 'active';
  const newStatus = banning ? 'banned' : 'active';
  const { error } = await client.from('students')
    .update({ account_status: newStatus }).eq('student_id', studentId);
  if (error) { toast('Error: ' + error.message); return; }
  // FIX: hide/show their products via status field
  await client.from('products')
    .update({ status: banning ? 'suspended' : 'available', is_hidden: banning })
    .eq('seller_id', studentId);
  toast(banning ? `${name} banned 🚫` : `${name} unbanned ✔`);
  loadUsers(); loadListings(); loadStats();
}

/* ═══════════════════════════════════════════════════
   PENDING APPROVALS
   FIX: `qualification` does not exist — join qualifications table.
═══════════════════════════════════════════════════ */
async function loadPendingApprovals() {
  const tbody  = document.getElementById('approvalsBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(7); return; }
  tbody.innerHTML = loadingRow(7);

  try {
    const { data, error } = await client
      .from('students')
      .select(`
        student_id,
        first_name,
        last_name,
        email,
        student_number,
        contact_number,
        created_at,
        qualifications(qualification_name)
      `)
      .eq('account_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) throw error;

    _pendingStudents = data || [];
    updatePendingBadge(_pendingStudents.length);

    if (!_pendingStudents.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted">
        ✅ No pending approvals — all caught up!</td></tr>`;
      return;
    }

    tbody.innerHTML = _pendingStudents.map(s => {
      const name    = `${esc(s.first_name)} ${esc(s.last_name)}`;
      const date    = s.created_at ? new Date(s.created_at).toLocaleDateString('en-ZA') : '—';
      const qualName = s.qualifications?.qualification_name || '—';

      const cardHtml = s.card_image_url
        ? `<img
            src="${esc(s.card_image_url)}"
            alt="Student card"
            style="width:120px;height:75px;object-fit:cover;border-radius:6px;
                   border:1px solid #E5E7EB;cursor:pointer;"
            onclick="openCardPreview('${esc(s.card_image_url)}','${name}')"
            title="Click to enlarge"/>`
        : `<span class="text-muted" style="font-size:12px;">No image</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight:600;">${name}</div>
            <div style="font-size:12px;color:#6b7280;">${esc(s.email)}</div>
            <div style="font-size:12px;color:#6b7280;">${esc(s.contact_number || '')}</div>
          </td>
          <td>${esc(s.student_number)}</td>
          <td>${esc(qualName)}</td>
          <td>${date}</td>
          <td>${cardHtml}</td>
          <td>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-success btn-sm fw-semibold"
                onclick="approveStudent('${s.student_id}','${name}')">✔ Approve</button>
              <button class="btn btn-danger btn-sm"
                onclick="openRejectModal('${s.student_id}','${name}')">✕ Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');

  } catch (e) {
    console.error('Pending approvals error:', e);
    tbody.innerHTML = errRow(7, e.message);
  }
}

/* ── APPROVE ─────────────────────────────────────── */
async function approveStudent(studentId, name) {
  const client = db(); if (!client) return;
  const { error } = await client.from('students')
    .update({ account_status: 'active' }).eq('student_id', studentId);
  if (error) { toast('Error: ' + error.message); return; }
  _pendingStudents = _pendingStudents.filter(s => s.student_id !== studentId);
  updatePendingBadge(_pendingStudents.length);
  toast(`✅ ${name} approved — they can now log in`);
  loadPendingApprovals(); loadStats();
}

/* ── REJECT MODAL ────────────────────────────────── */
function openRejectModal(studentId, name) {
  _rejectStudentId   = studentId;
  _rejectStudentName = name;
  document.getElementById('rejectStudentName').textContent = name;
  document.getElementById('rejectReason').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('rejectModal')).show();
}

async function confirmReject() {
  const client = db();
  bootstrap.Modal.getInstance(document.getElementById('rejectModal'))?.hide();
  if (!client) return;
  // FIX: 'rejected' is not a valid account_status value in the DB.
  //      Use 'banned' (which is valid) to deny access to rejected applicants.
  const { error } = await client.from('students')
    .update({ account_status: 'banned' }).eq('student_id', _rejectStudentId);
  if (error) { toast('Error: ' + error.message); return; }
  _pendingStudents = _pendingStudents.filter(s => s.student_id !== _rejectStudentId);
  updatePendingBadge(_pendingStudents.length);
  toast(`🚫 ${_rejectStudentName} rejected`);
  loadPendingApprovals();
}

/* ── CARD IMAGE PREVIEW MODAL ────────────────────── */
function openCardPreview(url, name) {
  document.getElementById('previewCardImg').src          = url;
  document.getElementById('previewCardName').textContent = name;
  bootstrap.Modal.getOrCreateInstance(document.getElementById('cardPreviewModal')).show();
}

/* ── PENDING BADGE ───────────────────────────────── */
function updatePendingBadge(count) {
  const badge  = document.getElementById('pendingBadge');
  const banner = document.getElementById('pendingBanner');
  if (badge) badge.textContent = count;
  if (banner) {
    const el = document.getElementById('pendingBannerCount');
    if (el) el.textContent = count;
    banner.style.display = count > 0 ? 'flex' : 'none';
  }
}

/* ═══════════════════════════════════════════════════
   COMPLAINTS
   FIX: column is `complaint_text` (not `description`).
        column is `complaint_status` (not `status`).
        students column is `contact_number` (not `phone_number`).
        products column is `product_name` (not `name`).
        resolveComplaint must update `complaint_status`.
═══════════════════════════════════════════════════ */
async function loadComplaints() {
  const tbody  = document.getElementById('complaintsBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(7); return; }
  tbody.innerHTML = loadingRow(7);
  try {
    const { data, error } = await client
      .from('complaints')
      .select('complaint_id, complaint_text, complaint_status, date_submitted, products(product_name), students!complaints_complainant_id_fkey(first_name, last_name, contact_number)')
      .order('date_submitted', { ascending: false });
    if (error) throw error;
    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No complaints</td></tr>`;
      return;
    }
    tbody.innerHTML = data.map(c => {
      const seller   = c.students ? `${c.students.first_name} ${c.students.last_name}` : '—';
      const phone    = c.students?.contact_number || '—';
      const product  = c.products?.product_name   || '—';
      const date     = new Date(c.date_submitted).toLocaleDateString('en-ZA');
      const resolved = c.complaint_status === 'resolved';
      return `
        <tr>
          <td>${esc(product)}</td>
          <td>${esc(seller)}</td>
          <td>${esc(phone)}</td>
          <td>${esc(c.complaint_text)}</td>
          <td>${date}</td>
          <td><span class="badge ${resolved ? 'bg-success' : 'bg-danger'}">${esc(c.complaint_status)}</span></td>
          <td>${!resolved
            ? `<button class="btn btn-success btn-sm" onclick="resolveComplaint('${c.complaint_id}')">Resolve</button>`
            : '—'}</td>
        </tr>`;
    }).join('');
  } catch (e) { tbody.innerHTML = errRow(7, e.message); }
}

async function resolveComplaint(complaintId) {
  const client = db(); if (!client) return;
  // FIX: update `complaint_status`, not `status`
  const { error } = await client.from('complaints')
    .update({ complaint_status: 'resolved' }).eq('complaint_id', complaintId);
  if (error) { toast('Error: ' + error.message); return; }
  toast('Complaint resolved ✅');
  loadComplaints(); loadStats();
}

/* ── UTILS ───────────────────────────────────────── */
function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function loadingRow(cols) {
  return `<tr><td colspan="${cols}" class="text-center py-4 text-muted">
    <div class="spinner-border spinner-border-sm me-2"></div>Loading…</td></tr>`;
}
function noDbRow(cols) {
  return `<tr><td colspan="${cols}" class="text-center text-danger py-4">⚠️ Database not connected.</td></tr>`;
}
function errRow(cols, msg) {
  return `<tr><td colspan="${cols}" class="text-center text-danger py-4">Error: ${esc(msg)}</td></tr>`;
}
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = 'toast-msg'; el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

/* ═══════════════════════════════════════════════════
   AI LISTING REVIEW
   Uses Anthropic API (claude-sonnet-4-20250514) to
   review each available listing's image + description
   for policy violations, prohibited items, or
   misleading content.
═══════════════════════════════════════════════════ */

let _aiReviewProductId = null; // product open in detail modal

/* ── RUN REVIEW ON ALL AVAILABLE LISTINGS ─────── */
async function runAIReviewAll() {
  const client = db();
  if (!client) { toast('Database unavailable.'); return; }

  const btn    = document.getElementById('btnAIReviewAll');
  const status = document.getElementById('aiReviewStatus');
  const tbody  = document.getElementById('aiReviewBody');

  btn.disabled    = true;
  btn.textContent = '⏳ Reviewing…';
  tbody.innerHTML = loadingRow(7);

  // Fetch all available listings with their primary image
  const { data: listings, error } = await client
    .from('products')
    .select(`
      product_id,
      product_name,
      description,
      price,
      status,
      students(first_name, last_name),
      product_images(storage_path, is_primary)
    `)
    .eq('status', 'available')
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = errRow(7, error.message);
    btn.disabled = false; btn.textContent = '▶ Review All Pending Listings';
    return;
  }

  if (!listings?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No available listings to review.</td></tr>`;
    btn.disabled = false; btn.textContent = '▶ Review All Pending Listings';
    return;
  }

  tbody.innerHTML = '';
  let done = 0;

  for (const listing of listings) {
    status.textContent = `Reviewing ${++done} of ${listings.length}…`;

    const primaryImg = (listing.product_images || []).find(i => i.is_primary) ||
                       (listing.product_images || [])[0] || null;
    const imageUrl   = primaryImg?.storage_path || null;
    const seller     = listing.students
      ? `${listing.students.first_name} ${listing.students.last_name}` : '—';

    // Show a "reviewing" placeholder row immediately
    const rowId = `aiRow-${listing.product_id}`;
    tbody.innerHTML += `
      <tr id="${rowId}">
        <td>${imageUrl
          ? `<img src="${esc(imageUrl)}" style="width:70px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #E5E7EB;"/>`
          : `<span class="text-muted" style="font-size:12px;">No image</span>`}
        </td>
        <td>${esc(listing.product_name)}</td>
        <td>${esc(seller)}</td>
        <td>R${parseFloat(listing.price).toFixed(2)}</td>
        <td><span class="text-muted" style="font-size:12px;">⏳ Analysing…</span></td>
        <td>—</td>
        <td>—</td>
      </tr>`;

    // Call AI
    const result = await reviewListingWithAI(listing, imageUrl);

    // Update the row with results
    const row = document.getElementById(rowId);
    if (row) {
      const riskBadge = riskLabel(result.risk);
      row.innerHTML = `
        <td>${imageUrl
          ? `<img src="${esc(imageUrl)}" style="width:70px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #E5E7EB;cursor:pointer;"
               onclick="openAIDetail('${esc(listing.product_id)}','${esc(listing.product_name)}','${esc(imageUrl)}',${JSON.stringify(result.full).replace(/'/g,"&#39;")})" />`
          : `<span class="text-muted" style="font-size:12px;">No image</span>`}
        </td>
        <td><strong>${esc(listing.product_name)}</strong></td>
        <td>${esc(seller)}</td>
        <td>R${parseFloat(listing.price).toFixed(2)}</td>
        <td style="font-size:12px;color:#374151;">${esc(result.summary)}</td>
        <td>${riskBadge}</td>
        <td>
          <div class="d-flex flex-column gap-1">
            <button class="btn btn-sm btn-outline-dark"
              onclick="openAIDetail('${esc(listing.product_id)}','${esc(listing.product_name)}','${esc(imageUrl || '')}',${JSON.stringify(result.full).replace(/'/g,'&#39;')})">
              Details
            </button>
            ${result.risk !== 'low'
              ? `<button class="btn btn-sm btn-warning"
                   onclick="toggleListing('${esc(listing.product_id)}', false)">
                   Disable
                 </button>`
              : ''}
          </div>
        </td>`;
    }
  }

  status.textContent = `✅ ${listings.length} listing${listings.length !== 1 ? 's' : ''} reviewed.`;
  btn.disabled    = false;
  btn.textContent = '▶ Review All Pending Listings';
}

/* ── CALL ANTHROPIC API FOR ONE LISTING ───────── */
async function reviewListingWithAI(listing, imageUrl) {
  const systemPrompt = `You are a marketplace content moderator for UniMarket, a student marketplace at Mangosuthu University of Technology. 
Review product listings for policy violations.

Flag listings that contain:
- Prohibited items (weapons, drugs, alcohol, counterfeit goods, adult content)
- Misleading or fraudulent descriptions
- Pricing that seems suspicious (e.g. extremely underpriced electronics)
- Stolen goods indicators
- Academic dishonesty materials (essays for sale, exam papers, etc.)

Respond in this exact JSON format (no markdown, no backticks):
{
  "risk": "low" | "medium" | "high",
  "summary": "One sentence verdict under 20 words",
  "issues": ["issue 1", "issue 2"],
  "recommendation": "approve" | "review" | "disable"
}`;

  // Build message content — include image if available
  const userContent = [];

  if (imageUrl) {
    userContent.push({
      type: 'image',
      source: { type: 'url', url: imageUrl }
    });
  }

  userContent.push({
    type: 'text',
    text: `Product Name: ${listing.product_name}
Price: R${listing.price}
Description: ${listing.description || '(no description provided)'}

Review this listing and respond with JSON only.`
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
    });

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      risk:    parsed.risk        || 'low',
      summary: parsed.summary     || 'No issues detected.',
      full:    parsed,
    };
  } catch (err) {
    console.warn('AI review failed for', listing.product_name, err.message);
    return {
      risk:    'low',
      summary: 'AI review unavailable.',
      full:    { risk: 'low', summary: 'AI review unavailable.', issues: [], recommendation: 'approve' },
    };
  }
}

/* ── OPEN DETAIL MODAL ────────────────────────── */
function openAIDetail(productId, name, imageUrl, resultJson) {
  _aiReviewProductId = productId;

  document.getElementById('aiDetailTitle').textContent = name;

  const img   = document.getElementById('aiDetailImg');
  const noImg = document.getElementById('aiDetailNoImg');
  if (imageUrl) {
    img.src = imageUrl; img.style.display = 'block'; noImg.style.display = 'none';
  } else {
    img.style.display = 'none'; noImg.style.display = 'block';
  }

  let result = resultJson;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { result = { summary: result }; }
  }

  const lines = [
    `Risk Level:      ${(result.risk || '—').toUpperCase()}`,
    `Recommendation:  ${result.recommendation || '—'}`,
    ``,
    `Summary:`,
    result.summary || '—',
    ``,
    `Issues Found:`,
    ...(result.issues?.length ? result.issues.map(i => `  • ${i}`) : ['  None detected.']),
  ];
  document.getElementById('aiDetailText').textContent = lines.join('\n');

  // Show/hide disable button based on risk
  document.getElementById('aiDetailDisable').style.display =
    result.risk === 'low' ? 'none' : 'inline-block';

  bootstrap.Modal.getOrCreateInstance(document.getElementById('aiDetailModal')).show();
}

async function disableFromDetail() {
  if (!_aiReviewProductId) return;
  bootstrap.Modal.getInstance(document.getElementById('aiDetailModal'))?.hide();
  await toggleListing(_aiReviewProductId, false);
}

/* ── RISK BADGE HELPER ────────────────────────── */
function riskLabel(risk) {
  if (risk === 'high')   return '<span class="badge bg-danger">High</span>';
  if (risk === 'medium') return '<span class="badge bg-warning text-dark">Medium</span>';
  return '<span class="badge bg-success">Low</span>';
}
/* ═══════════════════════════════════════════════════
   MANUAL LISTING REVIEW
   Loads all products with status = 'hidden' that were
   submitted by sellers but the AI was unavailable.
   Admins can approve (make available) or reject (suspend).
═══════════════════════════════════════════════════ */

let _manualRejectProductId   = null;
let _manualRejectProductName = '';

/* ── Load on tab switch ──────────────────────────── */
const _origSwitchTab = switchTab;
// Override switchTab to also load manual reviews when that tab is opened
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.panel').forEach(p =>
    p.classList.toggle('active',
      p.id === 'panel' + tab.charAt(0).toUpperCase() + tab.slice(1))
  );
  if (tab === 'approvals')    loadPendingApprovals();
  if (tab === 'manualreview') loadManualReview();
}

/* ── Load pending manual reviews ─────────────────── */
async function loadManualReview() {
  const tbody  = document.getElementById('manualReviewBody');
  const client = db();
  if (!client) { tbody.innerHTML = noDbRow(8); return; }

  tbody.innerHTML = loadingRow(8);

  try {
    // Hidden listings submitted by sellers = awaiting review
    // We distinguish "awaiting manual review" from admin-hidden by
    // checking is_hidden=true AND status='hidden' (set by listing.js on submit)
    const { data, error } = await client
      .from('products')
      .select(`
        product_id, product_name, description, price, created_at,
        categories ( category_name ),
        students!products_seller_id_fkey ( first_name, last_name, student_number ),
        product_images ( storage_path, is_primary )
      `)
      .eq('status', 'hidden')
      .eq('is_hidden', true)
      .order('created_at', { ascending: true }); // oldest first

    if (error) throw error;

    // Also fetch images separately for reliability
    const productIds = (data || []).map(p => p.product_id);
    let imageMap = {};
    if (productIds.length) {
      const { data: imgData } = await client
        .from('product_images')
        .select('product_id, storage_path, is_primary')
        .in('product_id', productIds);
      (imgData || []).forEach(img => {
        if (!imageMap[img.product_id]) imageMap[img.product_id] = img.storage_path;
        if (img.is_primary) imageMap[img.product_id] = img.storage_path;
      });
    }

    updateManualReviewBadge(data?.length || 0);

    if (!data?.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5 text-muted">
        ✅ No listings waiting for manual review.</td></tr>`;
      return;
    }

    tbody.innerHTML = data.map(p => {
      const seller   = p.students
        ? `${esc(p.students.first_name)} ${esc(p.students.last_name)}`
        : '—';
      const imgUrl   = imageMap[p.product_id] || null;
      const category = p.categories?.category_name || '—';
      const date     = new Date(p.created_at).toLocaleDateString('en-ZA');
      const desc     = p.description
        ? (p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description)
        : '<span class="text-muted fst-italic">No description</span>';

      return `
        <tr id="manualRow-${p.product_id}">
          <td>
            ${imgUrl
              ? `<img src="${esc(imgUrl)}"
                      style="width:70px;height:52px;object-fit:cover;border-radius:8px;
                             border:1px solid #E5E7EB;cursor:pointer;"
                      onclick="openCardPreview('${esc(imgUrl)}','${esc(p.product_name)}')"
                      title="Click to enlarge"/>`
              : `<div style="width:70px;height:52px;border-radius:8px;background:#f3f4f6;
                            display:flex;align-items:center;justify-content:center;
                            font-size:20px;border:1px solid #E5E7EB;">📦</div>`}
          </td>
          <td><strong>${esc(p.product_name)}</strong></td>
          <td>${seller}</td>
          <td>R${parseFloat(p.price).toFixed(2)}</td>
          <td><span class="badge bg-secondary">${esc(category)}</span></td>
          <td style="font-size:12px;color:#374151;max-width:220px;">${desc}</td>
          <td style="white-space:nowrap;">${date}</td>
          <td>
            <div class="d-flex flex-column gap-1">
              <button class="btn btn-success btn-sm fw-semibold"
                onclick="approveManualListing('${p.product_id}','${esc(p.product_name)}')">
                ✔ Approve
              </button>
              <button class="btn btn-danger btn-sm"
                onclick="openManualRejectModal('${p.product_id}','${esc(p.product_name)}')">
                ✕ Reject
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');

  } catch (e) {
    console.error('Manual review error:', e);
    tbody.innerHTML = errRow(8, e.message);
  }
}

/* ── Approve ─────────────────────────────────────── */
async function approveManualListing(productId, productName) {
  const client = db(); if (!client) return;

  const { error } = await client
    .from('products')
    .update({ status: 'available', is_hidden: false })
    .eq('product_id', productId);

  if (error) { toast('Error: ' + error.message); return; }

  // Remove row from table
  document.getElementById(`manualRow-${productId}`)?.remove();

  // Update badge
  const badge = document.getElementById('pendingReviewBadge');
  if (badge) badge.textContent = Math.max(0, parseInt(badge.textContent || '0') - 1);

  updateManualReviewBannerCount(-1);
  toast(`✅ "${productName}" approved and is now live`);
  loadStats();
}

/* ── Reject modal ────────────────────────────────── */
function openManualRejectModal(productId, productName) {
  _manualRejectProductId   = productId;
  _manualRejectProductName = productName;
  document.getElementById('manualRejectProductName').textContent = productName;
  document.getElementById('manualRejectReason').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('manualRejectModal')).show();
}

async function confirmManualReject() {
  const client = db();
  bootstrap.Modal.getInstance(document.getElementById('manualRejectModal'))?.hide();
  if (!client || !_manualRejectProductId) return;

  const { error } = await client
    .from('products')
    .update({ status: 'suspended', is_hidden: true })
    .eq('product_id', _manualRejectProductId);

  if (error) { toast('Error: ' + error.message); return; }

  document.getElementById(`manualRow-${_manualRejectProductId}`)?.remove();
  updateManualReviewBannerCount(-1);
  toast(`❌ "${_manualRejectProductName}" rejected and suspended`);
  loadStats();

  _manualRejectProductId   = null;
  _manualRejectProductName = '';
}

/* ── Badge + banner helpers ──────────────────────── */
function updateManualReviewBadge(count) {
  const badge  = document.getElementById('pendingReviewBadge');
  const banner = document.getElementById('manualReviewBanner');
  const bannerCount = document.getElementById('manualReviewBannerCount');
  if (badge)       badge.textContent       = count;
  if (bannerCount) bannerCount.textContent = count;
  if (banner)      banner.style.display    = count > 0 ? 'flex' : 'none';
}

function updateManualReviewBannerCount(delta) {
  const badge  = document.getElementById('pendingReviewBadge');
  const bannerCount = document.getElementById('manualReviewBannerCount');
  const banner = document.getElementById('manualReviewBanner');
  const current = parseInt(badge?.textContent || '0') + delta;
  const newCount = Math.max(0, current);
  if (badge)       badge.textContent       = newCount;
  if (bannerCount) bannerCount.textContent = newCount;
  if (banner)      banner.style.display    = newCount > 0 ? 'flex' : 'none';
}

/* ── Load manual review count on page init ───────── */
async function loadManualReviewCount() {
  const client = db(); if (!client) return;
  const { count } = await client
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'hidden')
    .eq('is_hidden', true);
  updateManualReviewBadge(count || 0);
}