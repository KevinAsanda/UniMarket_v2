/* ═══════════════════════════════════════════════════
   activity.js  –  UniMarket Activity Page
   Requires: supabase.js, auth-session.js (loaded before)
═══════════════════════════════════════════════════ */

/* ── STATE ─────────────────────────────────────── */
let _userId      = null;
let _products    = [];
let _buying      = [];
let _selling     = [];
let _reportOrderId = null;
let _filterStatus  = 'all';

/* ── BOOT ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {

  // 1. Resolve session (redirects to login if unauthenticated)
  const session = await resolveSession();
  if (!session) return;

  _userId = session.userId;

  // 2. Set avatar initials from resolved name
  const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || '?';
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = initials;

  // 3. Load data
  showSkeletons();
  await Promise.all([loadProducts(), loadOrders()]);
  updateHeroStats();
});

/* ── MOBILE MENU ───────────────────────────────── */
function toggleMobileMenu() {
  document.getElementById('mobileDrawer').classList.toggle('open');
  document.getElementById('drawerOverlay').classList.toggle('open');
}

function closeMobileMenu() {
  document.getElementById('mobileDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
}

/* ── TAB SWITCHING ─────────────────────────────── */
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.panel').forEach(p =>
    p.classList.toggle('active', p.id === 'panel' + cap(tab))
  );

  if (tab === 'orders') {
    renderBuying();
    renderSelling();
  }
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ── FILTER ────────────────────────────────────── */
function filterProducts() {
  _filterStatus = document.getElementById('filterStatus').value;
  renderProducts();
}

/* ── HERO STATS ────────────────────────────────── */
function updateHeroStats() {
  const listingsEl = document.querySelector('#hStatListings .stat-num');
  const ordersEl   = document.querySelector('#hStatOrders .stat-num');
  if (listingsEl) listingsEl.textContent = _products.filter(p => !p.is_hidden).length;
  if (ordersEl)   ordersEl.textContent   = _buying.length + _selling.length;
}

/* ── SKELETON LOADERS ──────────────────────────── */
function showSkeletons() {
  const skRow = (cols) => `<tr class="skeleton-row">${
    Array.from({length: cols}, () =>
      `<td><div class="skeleton-cell" style="width:${60+Math.random()*30}%"></div></td>`
    ).join('')
  }</tr>`;

  const pb = document.getElementById('productsBody');
  if (pb) pb.innerHTML = skRow(5).repeat(3);
}

/* ══════════════════════════════════════════════════
   PRODUCTS
════════════════════════════════════════════════════ */
async function loadProducts() {
  const db = window.supabaseClient;
  const { data, error } = await db
    .from('products')
    .select('product_id, product_name, price, quantity, status, is_hidden, views')
    .eq('seller_id', _userId)
    .order('created_at', { ascending: false });

  if (error) { console.error('Products load error', error); }
  _products = data || [];

  document.getElementById('productCount').textContent =
    _products.filter(p => !p.is_hidden).length;

  renderProducts();
}

function renderProducts() {
  const tbody = document.getElementById('productsBody');
  const visible = _products.filter(p => {
    if (p.is_hidden) return false;
    if (_filterStatus === 'all') return true;
    if (_filterStatus === 'available') return p.status === 'available';
    if (_filterStatus === 'sold')      return p.status === 'sold';
    return true;
  });

  if (!visible.length) {
    const msg = _filterStatus !== 'all'
      ? `No ${_filterStatus} listings`
      : 'You have no active listings';
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="empty-state"><div class="icon">📭</div><p>${msg}</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = visible.map(p => {
    const statusClass = p.status === 'sold' ? 'badge-sold' : 'badge-available';
    const statusLabel = p.status === 'sold' ? 'Sold' : 'Available';
    return `
      <tr>
        <td><span class="prod-name" title="${esc(p.product_name)}">${esc(p.product_name)}</span></td>
        <td>R${parseFloat(p.price).toFixed(2)}</td>
        <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
        <td><span style="color:var(--muted);font-size:13px">👁 ${p.views}</span></td>
        <td>
          <div class="action-wrap">
            <button class="icon-btn del"    title="Remove listing" onclick="hideProd('${p.product_id}')">🗑</button>
            <button class="icon-btn edit"   title="Edit item"      onclick="openEdit('${p.product_id}')">✏️</button>
            ${p.status !== 'sold'
              ? `<button class="icon-btn sold"   title="Mark as sold"   onclick="markSold('${p.product_id}')">✔</button>`
              : `<button class="icon-btn relist" title="Re-list item"   onclick="relistProd('${p.product_id}')">↻</button>`
            }
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

/* ── Product actions ─── */
async function hideProd(id) {
  const db = window.supabaseClient;
  const { error } = await db
    .from('products')
    .update({ is_hidden: true })
    .eq('product_id', id)
    .eq('seller_id', _userId);

  if (error) { toast('❌ Could not remove listing'); return; }

  _products = _products.map(p =>
    p.product_id === id ? { ...p, is_hidden: true } : p
  );
  renderProducts();
  updateHeroStats();
  toast('Listing removed');
}

async function markSold(id) {
  const db = window.supabaseClient;
  const { error } = await db
    .from('products')
    .update({ status: 'sold' })
    .eq('product_id', id)
    .eq('seller_id', _userId);

  if (error) { toast('❌ Could not update status'); return; }

  _products = _products.map(p =>
    p.product_id === id ? { ...p, status: 'sold' } : p
  );
  renderProducts();
  toast('Marked as sold ✔');
}

async function relistProd(id) {
  const db = window.supabaseClient;
  const { error } = await db
    .from('products')
    .update({ status: 'available', is_hidden: false })
    .eq('product_id', id)
    .eq('seller_id', _userId);

  if (error) { toast('❌ Could not re-list item'); return; }

  _products = _products.map(p =>
    p.product_id === id ? { ...p, status: 'available', is_hidden: false } : p
  );
  renderProducts();
  toast('Item re-listed ↻');
}

/* ── EDIT MODAL ──── */
function openEdit(id) {
  const p = _products.find(x => x.product_id === id);
  if (!p) return;
  document.getElementById('hfEditID').value    = id;
  document.getElementById('txtEditName').value  = p.product_name;
  document.getElementById('txtEditPrice').value = p.price;
  new bootstrap.Modal(document.getElementById('editModal')).show();
}

async function saveEdit() {
  const id    = document.getElementById('hfEditID').value;
  const name  = document.getElementById('txtEditName').value.trim();
  const price = parseFloat(document.getElementById('txtEditPrice').value);

  if (!name || isNaN(price) || price <= 0) {
    alert('Please enter a valid name and price.'); return;
  }

  const db = window.supabaseClient;
  const { error } = await db
    .from('products')
    .update({ product_name: name, price })
    .eq('product_id', id)
    .eq('seller_id', _userId);

  if (error) { toast('❌ Could not save changes'); return; }

  _products = _products.map(p =>
    p.product_id === id ? { ...p, product_name: name, price } : p
  );

  bootstrap.Modal.getInstance(document.getElementById('editModal'))?.hide();
  renderProducts();
  toast('Item updated ✅');
}

/* ══════════════════════════════════════════════════
   ORDERS
════════════════════════════════════════════════════ */
async function loadOrders() {
  const db = window.supabaseClient;

  // Buying orders (I am the buyer)
  const { data: bData, error: bErr } = await db
    .from('orders')
    .select(`
      order_id, order_status, amount_paid, created_at,
      products ( product_name, price ),
      meetup_slots ( day_of_week, slot_time, venue )
    `)
    .eq('buyer_id', _userId)
    .order('created_at', { ascending: false });

  if (bErr) console.error('Buying orders error', bErr);
  _buying = bData || [];

  // Selling orders (I am the seller)
  const { data: sData, error: sErr } = await db
    .from('orders')
    .select(`
      order_id, order_status, created_at,
      products ( product_name ),
      students!orders_buyer_id_fkey ( first_name, last_name, contact_number ),
      meetup_slots ( day_of_week, slot_time, venue )
    `)
    .eq('seller_id', _userId)
    .order('created_at', { ascending: false });

  if (sErr) console.error('Selling orders error', sErr);
  _selling = sData || [];

  const total = _buying.length + _selling.length;
  document.getElementById('orderCount').textContent = total;

  const bc = document.getElementById('buyingCount');
  const sc = document.getElementById('sellingCount');
  if (bc) bc.textContent = `${_buying.length} order${_buying.length !== 1 ? 's' : ''}`;
  if (sc) sc.textContent = `${_selling.length} order${_selling.length !== 1 ? 's' : ''}`;
}

function renderBuying() {
  const tbody = document.getElementById('buyingBody');

  if (!_buying.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state"><div class="icon">🛍️</div><p>No buying orders yet</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = _buying.map(o => {
    const prod    = o.products || {};
    const slot    = o.meetup_slots || {};
    const price   = o.amount_paid ?? prod.price ?? '—';
    const priceStr = typeof price === 'number' ? `R${parseFloat(price).toFixed(2)}` : price;
    const status  = o.order_status || 'pending';
    const badgeClass = badgeForStatus(status);

    return `
      <tr>
        <td><span class="prod-name" title="${esc(prod.product_name)}">${esc(prod.product_name || '—')}</span></td>
        <td>${priceStr}</td>
        <td>${esc(slot.day_of_week || '—')}</td>
        <td>${slot.slot_time ? slot.slot_time.slice(0,5) : '—'}</td>
        <td>${esc(slot.venue || '—')}</td>
        <td><span class="badge-status ${badgeClass}">${cap(status)}</span></td>
        <td>
          ${status === 'completed'
            ? `<button class="btn-report" onclick="openReport('${o.order_id}','${esc(prod.product_name)}')">Report</button>`
            : '<span style="color:#9ca3af;font-size:12px">—</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderSelling() {
  const tbody = document.getElementById('sellingBody');

  if (!_selling.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state"><div class="icon">📦</div><p>No selling orders yet</p></div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = _selling.map(o => {
    const prod   = o.products || {};
    const buyer  = o.students  || {};
    const slot   = o.meetup_slots || {};
    const status = o.order_status || 'pending';
    const badgeClass = badgeForStatus(status);
    const buyerName = [buyer.first_name, buyer.last_name].filter(Boolean).join(' ') || '—';

    return `
      <tr>
        <td><span class="prod-name" title="${esc(prod.product_name)}">${esc(prod.product_name || '—')}</span></td>
        <td>${esc(buyerName)}</td>
        <td>${esc(buyer.contact_number || '—')}</td>
        <td>${esc(slot.day_of_week || '—')}</td>
        <td>${slot.slot_time ? slot.slot_time.slice(0,5) : '—'}</td>
        <td>${esc(slot.venue || '—')}</td>
        <td><span class="badge-status ${badgeClass}">${cap(status)}</span></td>
        <td>
          ${status === 'confirmed' || status === 'pending'
            ? `<button class="btn-complete" onclick="completeOrder('${o.order_id}')">Complete</button>`
            : `<span class="badge-status badge-completed" style="font-size:11px">Done</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

function badgeForStatus(s) {
  const map = {
    pending:   'badge-pending',
    confirmed: 'badge-confirmed',
    completed: 'badge-completed',
    cancelled: 'badge-cancelled',
  };
  return map[s] || 'badge-pending';
}

/* ── Complete order ── */
async function completeOrder(id) {
  const db = window.supabaseClient;
  const { error } = await db
    .from('orders')
    .update({ order_status: 'completed' })
    .eq('order_id', id)
    .eq('seller_id', _userId);

  if (error) { toast('❌ Could not complete order'); return; }

  _selling = _selling.map(o =>
    o.order_id === id ? { ...o, order_status: 'completed' } : o
  );
  renderSelling();
  updateHeroStats();
  toast('Order marked as completed ✅');
}

/* ══════════════════════════════════════════════════
   REPORT MODAL
════════════════════════════════════════════════════ */
function openReport(orderId, prodName) {
  _reportOrderId = orderId;
  document.getElementById('reportProductName').textContent = prodName || '—';
  document.getElementById('txtComplaint').value = '';
  new bootstrap.Modal(document.getElementById('reportModal')).show();
}

async function submitComplaint() {
  const text = document.getElementById('txtComplaint').value.trim();
  if (!text) { alert('Please describe the issue.'); return; }

  // Find the order to get product_id and reported_user (seller_id)
  const db  = window.supabaseClient;
  const ord = _buying.find(o => o.order_id === _reportOrderId);

  if (!ord) {
    toast('❌ Order not found'); return;
  }

  // We need product_id and the seller; fetch seller from order
  const { data: fullOrder, error: oErr } = await db
    .from('orders')
    .select('product_id, seller_id')
    .eq('order_id', _reportOrderId)
    .single();

  if (oErr || !fullOrder) {
    toast('❌ Could not load order details'); return;
  }

  const { error } = await db
    .from('complaints')
    .insert({
      order_id:         _reportOrderId,
      product_id:       fullOrder.product_id,
      complainant_id:   _userId,
      reported_user_id: fullOrder.seller_id,
      complaint_text:   text,
    });

  if (error) {
    console.error('Complaint error', error);
    toast('❌ Could not submit complaint');
    return;
  }

  bootstrap.Modal.getInstance(document.getElementById('reportModal'))?.hide();
  toast('Complaint submitted 🚩');
}

/* ══════════════════════════════════════════════════
   UTILS
════════════════════════════════════════════════════ */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg) {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className   = 'toast-msg';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}