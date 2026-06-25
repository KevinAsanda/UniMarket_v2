/* ═══════════════════════════════════════════════════
   listing.js  –  UniMarket Sell an Item
   Fully connected to Supabase — no static data.
═══════════════════════════════════════════════════ */

'use strict';

/* ── STATE ───────────────────────────────────────── */
let _currentUserId = null;
let _slotCount     = 1;

/* ── INIT ────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // resolveSession() is from auth-session.js
  // It handles both password login and face login,
  // renders the name in #username, and redirects if not logged in.
  const session = await resolveSession();
  if (!session) return; // redirected to login
  _currentUserId = session.userId;

  // Set avatar initials in the dynamic navbar
  const initials = ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || '?';
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) avatarEl.textContent = initials;

  await loadCategories();
  renderSlots();
});

/* ── LOAD CATEGORIES FROM DB ─────────────────────── */
async function loadCategories() {
  const db = window.supabaseClient;
  if (!db) return;

  const { data, error } = await db
    .from('categories')
    .select('category_id, category_name')
    .order('category_name');

  if (error) { console.warn('Categories error:', error.message); return; }

  const select = document.getElementById('category');
  select.innerHTML = '<option value="">— Select a category —</option>';
  (data || []).forEach(c => {
    const opt       = document.createElement('option');
    opt.value       = c.category_id;
    opt.textContent = c.category_name;
    select.appendChild(opt);
  });
}

/* ══════════════════════════════════════════════════
   MEETUP SLOTS UI
══════════════════════════════════════════════════ */
const DAYS   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const VENUES = ['Bozzoli Hall','Seme Hall','Fountain','North Campus','Student Center'];

function renderSlots() {
  const container = document.getElementById('slotContainer');
  container.innerHTML = '';
  for (let i = 1; i <= _slotCount; i++) {
    container.innerHTML += `
      <div class="slot mb-3 p-3 border rounded" id="slot-${i}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong style="font-size:14px;">Slot ${i}</strong>
          ${i > 1 ? `<button type="button" class="btn btn-sm btn-outline-danger" onclick="removeSlot(${i})">Remove</button>` : ''}
        </div>
        <select class="form-select mb-2" id="slotDay-${i}">
          ${DAYS.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <input type="time" class="form-control mb-2" id="slotTime-${i}" required>
        <select class="form-select" id="slotVenue-${i}">
          ${VENUES.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>`;
  }
}

function addSlot() {
  if (_slotCount >= 3) { showToast('Maximum 3 slots allowed.', 'error'); return; }
  _slotCount++;
  renderSlots();
}

function removeSlot(i) {
  if (_slotCount <= 1) return;
  for (let j = i; j < _slotCount; j++) {
    document.getElementById(`slotDay-${j}`).value   = document.getElementById(`slotDay-${j+1}`).value;
    document.getElementById(`slotTime-${j}`).value  = document.getElementById(`slotTime-${j+1}`).value;
    document.getElementById(`slotVenue-${j}`).value = document.getElementById(`slotVenue-${j+1}`).value;
  }
  _slotCount--;
  renderSlots();
}

function collectSlots() {
  const slots = [];
  for (let i = 1; i <= _slotCount; i++) {
    const day   = document.getElementById(`slotDay-${i}`)?.value;
    const time  = document.getElementById(`slotTime-${i}`)?.value;
    const venue = document.getElementById(`slotVenue-${i}`)?.value;
    if (!time) { showToast(`Please set a time for Slot ${i}.`, 'error'); return null; }
    slots.push({ day_of_week: day, slot_time: time, venue });
  }
  const keys = slots.map(s => `${s.day_of_week}-${s.slot_time}-${s.venue}`);
  if (new Set(keys).size !== keys.length) {
    showToast('Two slots cannot have the same day, time, and venue.', 'error');
    return null;
  }
  return slots;
}

/* ══════════════════════════════════════════════════
   SUBMIT
══════════════════════════════════════════════════ */
async function submitItem() {
  if (!_currentUserId) {
    showToast('Session expired. Please log in again.', 'error');
    setTimeout(() => window.location.href = 'login.html', 1500);
    return;
  }

  const db = window.supabaseClient;
  if (!db) { showToast('Database unavailable.', 'error'); return; }

  const productName = document.getElementById('itemName').value.trim();
  const priceRaw    = document.getElementById('itemPrice').value.trim();
  const categoryId  = parseInt(document.getElementById('category').value, 10);
  const quantity    = parseInt(document.getElementById('quantity').value, 10) || 1;
  const description = document.getElementById('description').value.trim();
  const imageFile   = document.getElementById('image').files[0] || null;

  if (!productName)          { showToast('Please enter an item name.', 'error'); return; }
  const price = parseFloat(priceRaw);
  if (isNaN(price) || price <= 0) { showToast('Please enter a valid price greater than 0.', 'error'); return; }
  if (!categoryId)           { showToast('Please select a category.', 'error'); return; }

  const slots = collectSlots();
  if (!slots) return;

  const btn = document.getElementById('btnSubmit');
  btn.disabled    = true;
  btn.textContent = 'Listing…';

  try {
    // 1. Insert product
    const { data: product, error: prodError } = await db
      .from('products')
      .insert({
        seller_id:    _currentUserId,
        category_id:  categoryId,
        product_name: productName,
        description:  description || null,
        price,
        quantity,
        status:       'hidden',
        is_hidden:    true,
      })
      .select('product_id')
      .single();

    if (prodError) throw new Error('Could not create listing: ' + prodError.message);
    const productId = product.product_id;

    // 2. Upload image if provided
    if (imageFile) {
      const ext      = imageFile.name.split('.').pop();
      const filePath = `products/${productId}/primary.${ext}`;
      const { error: uploadError } = await db.storage
        .from('product-images')
        .upload(filePath, imageFile, { contentType: imageFile.type, upsert: true });

      if (uploadError) {
        // Non-fatal but log clearly so it's visible in DevTools
        console.error('[listing] Image upload failed:', uploadError.message, uploadError);
        showToast('Image upload failed: ' + uploadError.message, 'error');
      } else {
        // getPublicUrl never throws — publicUrl is always populated for public buckets
        const { data: urlData } = db.storage
          .from('product-images')
          .getPublicUrl(filePath);

        const publicUrl = urlData?.publicUrl;
        console.log('[listing] Image uploaded, public URL:', publicUrl);

        if (publicUrl) {
          const { error: imgInsertError } = await db.from('product_images').insert({
            product_id:    productId,
            storage_path:  publicUrl,
            is_primary:    true,
            display_order: 0,
          });
          if (imgInsertError) {
            console.error('[listing] product_images insert failed:', imgInsertError.message);
          }
        }
      }
    }

    // 3. Insert meetup slots
    const { error: slotError } = await db.from('meetup_slots').insert(
      slots.map(s => ({
        product_id:  productId,
        day_of_week: s.day_of_week,
        slot_time:   s.slot_time,
        venue:       s.venue,
        is_booked:   false,
      }))
    );
    if (slotError) console.warn('Slots insert error:', slotError.message);

    showToast('Item submitted for AI review…', 'success');
    setTimeout(() => window.location.href = 'review.html?product_id=' + productId, 1800);

  } catch (err) {
    console.error('Listing error:', err);
    showToast(err.message || 'An unexpected error occurred.', 'error');
    btn.disabled    = false;
    btn.textContent = 'List Item';
  }
}

/* ── UTILS ───────────────────────────────────────── */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) { alert(msg); return; }
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}