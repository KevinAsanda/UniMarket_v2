/* ═══════════════════════════════════════════════════
   review.js  –  Listing Review
   Rule-based moderation engine — same UI feel as AI.
   No API key needed, works offline, instant results.
═══════════════════════════════════════════════════ */

'use strict';

let _productId = null;
let _product = null;
let _userId = null;

/* ── BOOT ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const session = await resolveSession();
  if (!session) return;
  _userId = session.userId;

  const params = new URLSearchParams(window.location.search);
  _productId = params.get('product_id');

  if (!_productId) {
    showError('No product ID found. Please go back and list your item again.');
    return;
  }

  await loadProduct();
});

/* ── LOAD PRODUCT ──────────────────────────────────── */
async function loadProduct() {
  const db = window.supabaseClient;
  setStatus('Loading your listing…');

  const { data, error } = await db
    .from('products')
    .select(`
      product_id, product_name, description, price, quantity, status,
      categories ( category_name ),
      students!products_seller_id_fkey ( student_id )
    `)
    .eq('product_id', _productId)
    .single();

  if (error || !data) {
    showError('Could not load your listing. Please try again.');
    return;
  }

  if (data.students?.student_id !== _userId) {
    showError('You are not authorised to review this listing.');
    return;
  }

  _product = {
    ...data,
    category_name: data.categories?.category_name || 'Unknown',
  };

  await runAIReview();
}

/* ═══════════════════════════════════════════════════
   RULE ENGINE  (replaces the Anthropic/Gemini call)
   Feels like AI — staged status messages + delay.
═══════════════════════════════════════════════════ */

/* ── Banned keyword lists ───────────────────────── */
const RULES = {

  // Hard reject — clear policy violation
  BANNED: [
    // Weapons
    'gun', 'guns', 'pistol', 'rifle', 'firearm', 'ammunition', 'ammo', 'bullet', 'bullets',
    'knife', 'knives', 'sword', 'blade', 'machete', 'taser', 'stun gun', 'explosive',
    'grenade', 'bomb', 'dynamite',
    // Drugs & substances
    'drug', 'drugs', 'weed', 'cannabis', 'cocaine', 'heroin', 'meth', 'methamphetamine',
    'ecstasy', 'mdma', 'lsd', 'pills', 'narcotics', 'dagga', 'tik', 'nyaope', 'whoonga',
    // Counterfeit & stolen
    'stolen', 'fake id', 'fake passport', 'counterfeit', 'replica watch', 'pirated',
    'cracked software', 'illegal',
    // Adult
    'porn', 'pornography', 'escort', 'prostitut', 'sex toy', 'adult content',
    // Other
    'malware', 'hack', 'phishing', 'ransomware',
  ],

  // Soft flag — needs a look
  SUSPICIOUS: [
    'iphone 16', 'iphone 15', 'macbook', 'rolex', 'gucci', 'louis vuitton',
    'prada', 'versace', 'jordans', 'yeezy', 'supreme', 'playstation 5', 'ps5',
    'xbox series', 'rtx 4090', 'nvidia', 'gpu', 'free money', 'make money',
    'investment', 'guaranteed', 'mlm', 'pyramid', 'get rich',
  ],

  // Price boundaries (ZAR)
  MIN_PRICE: 1,
  MAX_PRICE: 15000,

  // Description
  MIN_DESC_LENGTH: 10,

  // Name
  MIN_NAME_LENGTH: 3,
};

/* ── Main review function ─────────────────────────── */
async function runAIReview() {

  // Stage 1 — looks like it's connecting
  setStatus('Connecting to AI reviewer…');
  await delay(900);

  setStatus('Sending listing to AI reviewer…');
  await delay(700);

  setStatus('AI is analysing your listing…');
  await delay(1100);

  setStatus('Checking content policy…');
  await delay(600);

  setStatus('Applying review decision…');
  await delay(500);

  // Run the actual rules (instant)
  const result = evaluate(_product);

  await applyVerdict(result);
}

/* ── Rule evaluator ──────────────────────────────── */
function evaluate(p) {
  const name = (p.product_name || '').toLowerCase();
  const desc = (p.description || '').toLowerCase();
  const price = parseFloat(p.price) || 0;
  const combined = name + ' ' + desc;

  // ── 1. BANNED keyword check ──────────────────────
  const bannedHit = RULES.BANNED.find(kw => combined.includes(kw));
  if (bannedHit) {
    return {
      verdict: 'rejected',
      reason: `This listing contains a prohibited item or term ("${bannedHit}"). It violates UniMarket's content policy.`,
      notes: 'Listings must be for lawful physical goods only. Please review the marketplace guidelines before listing again.',
      safe_to_list: false,
    };
  }

  // ── 2. Price out of range ────────────────────────
  if (price < RULES.MIN_PRICE) {
    return {
      verdict: 'rejected',
      reason: 'The listed price is R0 or below. All items must have a valid price.',
      notes: 'Update your listing with a realistic price and resubmit.',
      safe_to_list: false,
    };
  }

  if (price > RULES.MAX_PRICE) {
    return {
      verdict: 'flagged',
      reason: `The price of R${price.toFixed(2)} is above the R15,000 campus marketplace limit and needs admin review.`,
      notes: 'If this is a genuine high-value item, an admin will review and approve your listing shortly.',
      safe_to_list: false,
    };
  }

  // ── 3. Name too short ────────────────────────────
  if (p.product_name.trim().length < RULES.MIN_NAME_LENGTH) {
    return {
      verdict: 'flagged',
      reason: 'Your item name is too short. Please provide a clear, descriptive name.',
      notes: 'A good name helps buyers find your item. Try something like "Calculus Textbook 3rd Ed." instead of just "Book".',
      safe_to_list: false,
    };
  }

  // ── 4. Description too short ─────────────────────
  if (p.description && p.description.trim().length > 0 &&
    p.description.trim().length < RULES.MIN_DESC_LENGTH) {
    return {
      verdict: 'flagged',
      reason: 'Your description is too brief. Buyers need more detail to trust your listing.',
      notes: 'Add at least a sentence describing the item condition, age, or any defects.',
      safe_to_list: false,
    };
  }

  // ── 5. SUSPICIOUS keyword — flag for admin ───────
  const suspiciousHit = RULES.SUSPICIOUS.find(kw => combined.includes(kw));
  if (suspiciousHit) {
    return {
      verdict: 'flagged',
      reason: `This listing contains a term ("${suspiciousHit}") commonly associated with high-value or counterfeit goods and has been flagged for admin review.`,
      notes: 'If your item is genuine, an admin will approve it shortly. No action needed from you.',
      safe_to_list: false,
    };
  }

  // ── 6. Quantity sanity ───────────────────────────
  const qty = parseInt(p.quantity) || 0;
  if (qty <= 0) {
    return {
      verdict: 'rejected',
      reason: 'Quantity must be at least 1. You cannot list an item with zero stock.',
      notes: 'Go back and update the quantity before resubmitting.',
      safe_to_list: false,
    };
  }

  // ── All checks passed ────────────────────────────
  return {
    verdict: 'approved',
    reason: 'This listing meets all UniMarket content and pricing guidelines.',
    notes: 'Your item is now live on the catalogue. Good luck with your sale! 🎉',
    safe_to_list: true,
  };
}

/* ── APPLY VERDICT ─────────────────────────────────── */
async function applyVerdict(result) {
  const db = window.supabaseClient;

  if (result.safe_to_list && result.verdict === 'approved') {
    await db
      .from('products')
      .update({ status: 'available', is_hidden: false })
      .eq('product_id', _productId);

    document.getElementById('stepReview').classList.remove('active');
    document.getElementById('stepReview').classList.add('done');
    document.getElementById('stepReview').querySelector('.step-circle').textContent = '✓';
    document.getElementById('lineApprove').classList.add('done');
    document.getElementById('stepApprove').classList.add('active');

  } else {
    await db
      .from('products')
      .update({
        status: result.verdict === 'rejected' ? 'suspended' : 'hidden',
        is_hidden: true,
      })
      .eq('product_id', _productId);
  }

  showStageResult(result);
}

/* ── SHOW RESULT ───────────────────────────────────── */
function showStageResult(result, aiUnavailable = false) {
  document.getElementById('stageReviewing').classList.remove('active');
  document.getElementById('stageResult').classList.add('active');

  const verdictConfig = {
    approved: { cls: 'approved', icon: '✅', title: 'Listing Approved!' },
    flagged: { cls: 'flagged', icon: '⚠️', title: 'Listing Needs Attention' },
    rejected: { cls: 'rejected', icon: '❌', title: 'Listing Rejected' },
  };
  const v = verdictConfig[result.verdict] || verdictConfig.flagged;

  document.getElementById('verdictBox').innerHTML = `
    <div class="verdict-box ${v.cls}">
      <div class="verdict-icon">${v.icon}</div>
      <div>
        <p class="verdict-title">${v.title}</p>
        <p class="verdict-body">${escHtml(result.reason)}</p>
      </div>
    </div>`;

  const notes = result.notes?.trim();
  document.getElementById('aiNotesBox').innerHTML = `
    <strong>💡 AI Reviewer Note</strong>
    ${escHtml(notes || 'No additional notes.')}`;

  document.getElementById('productPreview').innerHTML = `
    <div class="preview-row">
      <span>Item</span>
      <span>${escHtml(_product?.product_name || '—')}</span>
    </div>
    <div class="preview-row">
      <span>Category</span>
      <span>${escHtml(_product?.category_name || '—')}</span>
    </div>
    <div class="preview-row">
      <span>Price</span>
      <span>R${parseFloat(_product?.price || 0).toFixed(2)}</span>
    </div>
    <div class="preview-row">
      <span>Review</span>
      <span style="color:${result.verdict === 'approved' ? '#059669' :
      result.verdict === 'rejected' ? '#dc2626' : '#d97706'
    };font-weight:700;">
        ${result.verdict.toUpperCase()}
      </span>
    </div>`;

  let actions = '';

  if (result.verdict === 'approved') {
    actions = `
      <button class="btn-primary-uni" onclick="window.location.href='cat.html'">
        🛍️ View on Catalogue
      </button>
      <button class="btn-secondary-uni" onclick="window.location.href='activity.html'">
        📦 Go to My Activity
      </button>`;

  } else if (result.verdict === 'flagged') {
    actions = `
      <button class="btn-secondary-uni" onclick="window.location.href='activity.html'">
        📦 Go to My Activity
      </button>
      <button class="btn-danger-uni" onclick="deleteListing()">
        🗑️ Remove This Listing
      </button>`;

  } else {
    actions = `
      <button class="btn-secondary-uni" onclick="window.location.href='listing.html'">
        ✏️ List a Different Item
      </button>
      <button class="btn-danger-uni" onclick="deleteListing()">
        🗑️ Remove This Listing
      </button>`;
  }

  document.getElementById('resultActions').innerHTML = actions;
}

/* ── DELETE LISTING ────────────────────────────────── */
async function deleteListing() {
  if (!confirm('Are you sure you want to remove this listing?')) return;
  const db = window.supabaseClient;
  await db.from('products')
    .update({ is_hidden: true, status: 'hidden' })
    .eq('product_id', _productId);
  window.location.href = 'activity.html';
}

/* ── UTILS ─────────────────────────────────────────── */
function setStatus(msg) {
  const el = document.getElementById('aiStatusText');
  if (el) el.textContent = msg;
}

function showError(msg) {
  document.getElementById('stageReviewing').classList.remove('active');
  document.getElementById('stageResult').classList.add('active');
  document.getElementById('verdictBox').innerHTML = `
    <div class="verdict-box rejected">
      <div class="verdict-icon">⚠️</div>
      <div>
        <p class="verdict-title">Something went wrong</p>
        <p class="verdict-body">${escHtml(msg)}</p>
      </div>
    </div>`;
  document.getElementById('aiNotesBox').innerHTML = '';
  document.getElementById('productPreview').innerHTML = '';
  document.getElementById('resultActions').innerHTML =
    `<button class="btn-secondary-uni" onclick="window.location.href='listing.html'">← Back to Listing</button>`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}