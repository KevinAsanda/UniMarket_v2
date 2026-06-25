/* ═══════════════════════════════════════════════════
   cat.js  –  UniMarket Catalogue
   Fully connected to Supabase — no static data.
═══════════════════════════════════════════════════ */

'use strict';

/* ── STATE ───────────────────────────────────────── */
let _allProducts    = [];
let _currentProd    = null;
let _currentSlots   = [];
let _selectedSlot   = null;
let _reportProdId   = null;
let _reportSellerId = null;
let _currentUserId  = null;

/* ── INIT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await resolveCurrentUser();
  await loadProducts();
});

/* ── RESOLVE LOGGED-IN USER ──────────────────────── */
async function resolveCurrentUser() {
  const session = await resolveSession();
  if (!session) return;

  _currentUserId = session.userId;

  const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || '?';
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = initials;
}



/* ══════════════════════════════════════════════════
   PRODUCTS  — from v_catalogue view
   Includes sold items so they show "Sold Out" for
   up to 2 days before pg_cron hides them.
══════════════════════════════════════════════════ */
async function loadProducts() {
  const db = window.supabaseClient;
  if (!db) { renderProducts([]); return; }

  showGridLoading(true);

  // Fetch available + recently sold (within 2 days) from the products table
  // directly so we can include sold items for the grace period.
  // v_catalogue only shows available — use products table with a wider filter.
  const { data, error } = await db
    .from('products')
    .select(`
      product_id, product_name, description, price, quantity,
      status, views, created_at, updated_at, seller_id, is_hidden,
      categories ( category_name ),
      students!products_seller_id_fkey ( first_name, last_name, contact_number ),
      product_images ( storage_path, is_primary )
    `)
    .eq('is_hidden', false)
    .in('status', ['available', 'sold'])
    .order('created_at', { ascending: false });

  showGridLoading(false);

  if (error) {
    console.error('Products error:', error.message);
    renderProducts([]);
    return;
  }

  // For sold items: only show within 2-day grace window
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const filtered = (data || []).filter(p => {
    if (p.status === 'available') return true;
    if (p.status === 'sold') {
      const soldAt = new Date(p.updated_at).getTime();
      return (now - soldAt) <= TWO_DAYS_MS;
    }
    return false;
  });

  // Fetch all images for these products in one query (bypasses nested RLS issues)
  const productIds = filtered.map(p => p.product_id);
  let imageMap = {};
  if (productIds.length) {
    const { data: imgData } = await db
      .from('product_images')
      .select('product_id, storage_path, is_primary')
      .in('product_id', productIds);

    (imgData || []).forEach(img => {
      if (!imageMap[img.product_id]) {
        imageMap[img.product_id] = img.storage_path; // first image = default
      }
      if (img.is_primary) {
        imageMap[img.product_id] = img.storage_path; // override if primary
      }
    });
  }

  _allProducts = filtered.map(p => ({
    ...p,
    category_name:   p.categories?.category_name || '—',
    seller_name:     [p.students?.first_name, p.students?.last_name].filter(Boolean).join(' ') || '—',
    seller_contact:  p.students?.contact_number || '',
    primary_image:   imageMap[p.product_id] || null,
  }));

  renderProducts(_allProducts);
}

/* ── FILTER ──────────────────────────────────────── */
function filterProducts() {
  const search = document
    .getElementById('searchInput')
    .value
    .toLowerCase()
    .trim();

  const result = _allProducts.filter(p =>
    !search ||
    p.product_name.toLowerCase().includes(search) ||
    (p.description || '').toLowerCase().includes(search) ||
    (p.category_name || '').toLowerCase().includes(search) ||
    (p.seller_name || '').toLowerCase().includes(search)
  );

  renderProducts(result);
}

/* ══════════════════════════════════════════════════
   RENDER GRID
   Validations applied here:
   1. Own listing  → "Your Listing" label, no Buy/WhatsApp/Report
   2. Sold product → "Sold Out" overlay + disabled Buy btn
══════════════════════════════════════════════════ */
function renderProducts(products) {
  const grid = document.getElementById('productGrid');

  if (!products.length) {
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#9ca3af;width:100%;">
        <div style="font-size:48px;margin-bottom:12px;">🔍</div>
        <p>No products found.</p>
      </div>`;
    return;
  }

  grid.innerHTML = products.map(p => {
    const isSold    = p.status === 'sold';
    const isOwn     = _currentUserId && p.seller_id === _currentUserId;

    // Sold: show how much time is left in the 2-day window
    const soldTimeLeft = isSold ? getSoldTimeLeft(p.updated_at) : '';

    const imageHtml = p.primary_image
      ? `<img src="${escAttr(p.primary_image)}" alt="${escAttr(p.product_name)}"/>`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;
                     justify-content:center;font-size:48px;color:#d1d5db;background:#f9fafb;">📦</div>`;

    // ── Action buttons depend on ownership & sold state ──────────────
    let actionButtons = '';

    if (isOwn) {
      // Owner sees a neutral "Your Listing" badge — no buy/report
      actionButtons = `
        <span class="own-listing-badge">✏️ Your Listing</span>`;
    } else if (isSold) {
      // Sold: buy is disabled; report still allowed; whatsapp still allowed
      actionButtons = `
  <button class="btn btn-secondary btn-sm" disabled>
    Sold Out
  </button>`;
    } else {
      // Normal available product
     actionButtons = `
  <button class="btn btn-primary btn-sm"
    onclick="openBuyModal('${escAttr(p.product_id)}')">
    Buy
  </button>

  <button class="btn btn-outline-danger btn-sm"
    onclick="openReport('${escAttr(p.product_id)}', '${escAttr(p.seller_id)}')">
    Report
  </button>`;
    }

    return `
      <div class="product-item ${isSold ? 'is-sold' : ''} ${isOwn ? 'is-own' : ''}">
        <div class="product-card">

          <div class="product-image">
            ${imageHtml}
            ${isSold  ? `<div class="sold-overlay">Sold Out</div>` : ''}
            ${isOwn   ? `<div class="own-overlay">Your Listing</div>` : ''}
          </div>

          <div class="product-body">
            <div class="product-header">
              <span class="product-name-text">${escHtml(p.product_name)}</span>
              <span class="price">R${parseFloat(p.price).toFixed(2)}</span>
            </div>
            <p class="product-desc">${escHtml(p.description || '')}</p>

            ${isSold && soldTimeLeft ? `
              <div class="sold-countdown">🕐 Listing removed ${soldTimeLeft}</div>
            ` : ''}

            <div class="product-seller">
              <div class="seller-avatar">${escHtml((p.seller_name || '?').charAt(0))}</div>
              <span class="seller-name-text">${escHtml(p.seller_name || '—')}</span>
            </div>
          </div>

          <div class="product-actions">
            ${actionButtons}
          </div>

        </div>
      </div>`;
  }).join('');
}

/* ── Sold countdown helper ───────────────────────── */
function getSoldTimeLeft(updatedAt) {
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const elapsed     = Date.now() - new Date(updatedAt).getTime();
  const remaining   = TWO_DAYS_MS - elapsed;
  if (remaining <= 0) return '';

  const hoursLeft = Math.ceil(remaining / (1000 * 60 * 60));
  if (hoursLeft >= 24) {
    const daysLeft = Math.ceil(hoursLeft / 24);
    return `in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  }
  return `in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
}

/* ══════════════════════════════════════════════════
   BUY MODAL
══════════════════════════════════════════════════ */
async function openBuyModal(productId) {
  const db = window.supabaseClient;
  if (!db) return;

  // Reset
  _selectedSlot = null;
  _currentProd  = null;
  _currentSlots = [];
  setBuyAlert('', '');
  document.getElementById('buyOrderSummary').classList.remove('visible');
  document.getElementById('buySoldBanner').style.display = 'none';
  document.getElementById('buyConfirmBtn').disabled      = false;
  document.getElementById('buyConfirmBtn').textContent   = 'Confirm Purchase';
  document.getElementById('buySlotsGrid').innerHTML      =
    `<p style="font-size:14px;color:#6b7280;grid-column:1/-1;">Loading slots…</p>`;

  bootstrap.Modal.getOrCreateInstance(document.getElementById('buyModal')).show();

  const [prodRes, slotsRes, imgRes] = await Promise.all([
    db.from('products')
      .select(`
        product_id, product_name, description, price, quantity,
        status, seller_id, updated_at,
        categories ( category_name ),
        students!products_seller_id_fkey ( first_name, last_name )
      `)
      .eq('product_id', productId)
      .single(),
    db.from('meetup_slots')
      .select('*')
      .eq('product_id', productId)
      .order('day_of_week')
      .order('slot_time'),
    // Fetch images separately — avoids nested RLS issues
    db.from('product_images')
      .select('storage_path, is_primary')
      .eq('product_id', productId),
  ]);

  if (prodRes.error || !prodRes.data) {
    setBuyAlert('Could not load product details.', 'error'); return;
  }

  // Resolve primary image from the separate fetch
  const imgs     = imgRes.data || [];
  const primary  = imgs.find(i => i.is_primary === true);
  const fallback = imgs[0];
  const resolvedImage = (primary || fallback)?.storage_path || null;

  const raw = prodRes.data;
  _currentProd = {
    ...raw,
    category_name: raw.categories?.category_name || '—',
    seller_name:   [raw.students?.first_name, raw.students?.last_name].filter(Boolean).join(' ') || '—',
    primary_image: resolvedImage,
  };
  _currentSlots = slotsRes.data || [];

  populateBuyProduct();
  populateBuySlots();
}

function populateBuyProduct() {
  const p = _currentProd;

  const img = document.getElementById('buyImgProduct');
  const ph  = document.getElementById('buyImgPlaceholder');
  if (p.primary_image) {
    img.src = p.primary_image; img.style.display = 'block'; ph.style.display = 'none';
  } else {
    img.style.display = 'none'; ph.style.display = 'flex';
  }

  document.getElementById('buyLblName').textContent        = p.product_name;
  document.getElementById('buyLblPrice').textContent       = `R${parseFloat(p.price).toFixed(2)}`;
  document.getElementById('buyLblCategory').textContent    = p.category_name;
  document.getElementById('buyLblDescription').textContent = p.description || '';
  document.getElementById('buyLblSeller').textContent      = `Sold by ${p.seller_name}`;

  const btn = document.getElementById('buyConfirmBtn');

  // VALIDATION 1: Product already sold
  if (p.status === 'sold') {
    document.getElementById('buySoldBanner').style.display = 'block';
    btn.disabled    = true;
    btn.textContent = 'Sold Out';
    return;
  }

  // VALIDATION 2: Seller cannot buy own product
  if (_currentUserId && p.seller_id === _currentUserId) {
    btn.disabled    = true;
    btn.textContent = 'This is your listing';
    setBuyAlert('You cannot purchase your own listing.', 'error');
    return;
  }
}

function populateBuySlots() {
  const grid = document.getElementById('buySlotsGrid');

  if (!_currentSlots.length) {
    grid.innerHTML = `<p style="font-size:14px;color:#6b7280;grid-column:1/-1;">
                        No time slots available for this item.</p>`;
    return;
  }

  grid.innerHTML = _currentSlots.map(s => `
    <div class="slot-card ${s.is_booked ? 'booked' : ''}"
         id="buySlot-${s.slot_id}"
         onclick="${s.is_booked ? '' : `selectSlot('${s.slot_id}')`}">
      <div class="slot-day">${escHtml(s.day_of_week)}</div>
      <div class="slot-time">⏰ ${escHtml(s.slot_time.slice(0,5))}</div>
      <div class="slot-venue">📍 ${escHtml(s.venue)}</div>
      ${s.is_booked ? `<div class="slot-booked-tag">Already booked</div>` : ''}
    </div>
  `).join('');
}

function selectSlot(slotId) {
  _selectedSlot = slotId;

  document.querySelectorAll('#buySlotsGrid .slot-card')
    .forEach(c => c.classList.remove('selected'));
  document.getElementById(`buySlot-${slotId}`)?.classList.add('selected');

  const slot = _currentSlots.find(s => s.slot_id === slotId);
  if (slot && _currentProd) {
    document.getElementById('buyOrderSummary').classList.add('visible');
    document.getElementById('buySubProduct').textContent = _currentProd.product_name;
    document.getElementById('buySubPrice').textContent   = `R${parseFloat(_currentProd.price).toFixed(2)}`;
    document.getElementById('buySubDay').textContent     = slot.day_of_week;
    document.getElementById('buySubTime').textContent    = slot.slot_time.slice(0, 5);
    document.getElementById('buySubVenue').textContent   = slot.venue;
  }

  setBuyAlert('', '');
}

async function confirmBuy() {
  // VALIDATION 2 (server-side guard): can't buy own product
  if (_currentUserId && _currentProd?.seller_id === _currentUserId) {
    setBuyAlert('You cannot purchase your own listing.', 'error'); return;
  }

  if (!_selectedSlot) {
    setBuyAlert('Please select a meet-up time slot first.', 'error'); return;
  }

  // VALIDATION 1 (server-side guard): re-check status before insert
  if (!_currentProd || _currentProd.status === 'sold') {
    setBuyAlert('Sorry, this item is no longer available.', 'error'); return;
  }

  const db = window.supabaseClient;
  if (!db)              { setBuyAlert('Database unavailable.', 'error'); return; }
  if (!_currentUserId)  { setBuyAlert('You must be logged in to purchase.', 'error'); return; }

  // Re-fetch latest status to guard against race conditions
  const { data: freshProd } = await db
    .from('products')
    .select('status, seller_id')
    .eq('product_id', _currentProd.product_id)
    .single();

  if (freshProd?.status === 'sold') {
    setBuyAlert('Sorry, this item was just sold to someone else.', 'error');
    document.getElementById('buySoldBanner').style.display = 'block';
    document.getElementById('buyConfirmBtn').disabled = true;
    document.getElementById('buyConfirmBtn').textContent = 'Sold Out';
    return;
  }

  if (freshProd?.seller_id === _currentUserId) {
    setBuyAlert('You cannot purchase your own listing.', 'error'); return;
  }

  const btn = document.getElementById('buyConfirmBtn');
  btn.disabled    = true;
  btn.textContent = 'Placing order…';

  // Single atomic DB call — checks availability, decrements
  // quantity, marks sold if qty=0, books slot, inserts order.
  // Uses FOR UPDATE lock so two simultaneous buyers can't
  // both pass the availability check.
  const { data: result, error: rpcError } = await db.rpc('place_order', {
    p_product_id: _currentProd.product_id,
    p_buyer_id:   _currentUserId,
    p_slot_id:    _selectedSlot,
  });

  if (rpcError) {
    btn.disabled    = false;
    btn.textContent = 'Confirm Purchase';
    setBuyAlert('Could not place order: ' + rpcError.message, 'error');
    return;
  }

  if (!result?.success) {
    btn.disabled    = false;
    btn.textContent = 'Confirm Purchase';
    setBuyAlert(result?.message || 'Could not place order.', 'error');
    if (result?.message?.toLowerCase().includes('no longer available') ||
        result?.message?.toLowerCase().includes('out of stock')) {
      document.getElementById('buySoldBanner').style.display = 'block';
      btn.disabled    = true;
      btn.textContent = 'Sold Out';
    }
    return;
  }

  setBuyAlert('🎉 Purchase confirmed! The seller will meet you at the selected time. Check your Activity page.', 'success');

  setTimeout(async () => {
    bootstrap.Modal.getInstance(document.getElementById('buyModal'))?.hide();
    await loadProducts();
  }, 2800);
}


/* ══════════════════════════════════════════════════
   REPORT MODAL
══════════════════════════════════════════════════ */
function openReport(productId, sellerId) {
  _reportProdId   = productId;
  _reportSellerId = sellerId;
  document.getElementById('complaintText').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('reportModal')).show();
}

async function submitComplaint() {
  const text = document.getElementById('complaintText').value.trim();
  if (!text) { alert('Please describe the issue.'); return; }

  const db = window.supabaseClient;
  if (!db || !_currentUserId) {
    alert('You must be logged in to submit a complaint.');
    return;
  }

  const { error } = await db.from('complaints').insert({
    product_id:       _reportProdId,
    complainant_id:   _currentUserId,
    reported_user_id: _reportSellerId,
    complaint_text:   text,
    complaint_status: 'pending',
  });

  bootstrap.Modal.getInstance(document.getElementById('reportModal'))?.hide();

  if (error) {
    alert('Could not submit complaint: ' + error.message);
  } else {
    showToast('Complaint submitted successfully.', 'success');
  }
}

/* ══════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════ */
function showGridLoading(show) {
  const grid = document.getElementById('productGrid');
  if (show) {
    grid.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#9ca3af;width:100%;">
        <div class="spinner-border text-primary mb-3"></div>
        <p>Loading products…</p>
      </div>`;
  }
}

function setBuyAlert(msg, type) {
  const el = document.getElementById('buyAlertMsg');
  if (!el) return;
  el.textContent = msg;
  el.className   = msg ? `alert-msg ${type}` : 'alert-msg';
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}