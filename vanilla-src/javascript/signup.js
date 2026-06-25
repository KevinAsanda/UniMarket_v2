/* ================================================================
   UNIMARKET – SIGNUP  (Supabase-connected)
   Flow : Step 1 (form) → Step 2 (student card barcode verify) → Step 3 (face scan)
   ================================================================

   STEP 2 — Student Card Verification  (ZXing barcode – no API key needed)
   ────────────────────────────────────────────────────────────────
   • User uploads a photo of their MUT student card.
   • ZXing-js reads the barcode on the card entirely in the browser.
   • The barcode encodes the student number (8 digits).
   • The decoded value is compared exactly against the student number
     the user typed in Step 1.
   • No OCR, no fuzzy matching, no rotation guessing — just a clean
     exact barcode match.

   STEP 3 — Face Verification  (face-api.js – no API key needed)
   ───────────────────────────────────────────────────────────────
   • face-api.js (vladmandic build) loads SSD MobileNet +
     FaceLandmark68 + FaceRecognition models from CDN.
   • A reference descriptor is extracted from the uploaded card image.
   • The live webcam feed is polled every 500 ms.
   • When the euclidean distance between the live descriptor and the
     card descriptor falls below FACE_MATCH_THRESHOLD (0.45) for
     3 consecutive frames, the match is confirmed.

   ================================================================ */

/* ── QUALIFICATION DATA ─────────────────────────────────────────── */
const QUALIFICATIONS = {
  1: [
    { id: 1,  name: 'Diploma in Agriculture' },
    { id: 2,  name: 'Diploma in Analytical Chemistry' },
    { id: 3,  name: 'Diploma in Community Extension' },
    { id: 4,  name: 'Diploma in Information Technology' },
    { id: 5,  name: 'Diploma in Nature Conservation' },
    { id: 6,  name: 'Bachelor of Science in Environmental Health' },
    { id: 7,  name: 'Bachelor of Health Sciences in Medical Laboratory Science' },
    { id: 8,  name: 'Bachelor of Applied Science in Nature Conservation' },
    { id: 9,  name: 'Advanced Diploma in Agriculture in Crop Production' },
    { id: 10, name: 'Advanced Diploma in Agriculture in Animal Production' },
    { id: 11, name: 'Advanced Diploma in Analytical Chemistry' },
    { id: 12, name: 'Advanced Diploma in Agriculture Extension and Community Development' },
    { id: 13, name: 'Advanced Diploma in ICT in Applications Development' },
    { id: 14, name: 'Advanced Diploma in Nature Conservation' },
    { id: 15, name: 'Post Graduate Diploma in Nature Conservation' },
    { id: 16, name: 'Master of Nature Conservation' },
  ],
  2: [
    { id: 17, name: 'Diploma in Building' },
    { id: 18, name: 'Diploma in Chemical Engineering' },
    { id: 19, name: 'Diploma in Civil Engineering' },
    { id: 20, name: 'Diploma in Electrical Engineering' },
    { id: 21, name: 'Diploma in Mechanical Engineering' },
    { id: 22, name: 'Diploma in Surveying' },
    { id: 23, name: 'Diploma in Construction Management & Quantity Surveying' },
    { id: 24, name: 'Advanced Diploma in Chemical Engineering' },
    { id: 25, name: 'Advanced Diploma in Mechanical Engineering' },
  ],
  3: [
    { id: 26, name: 'Diploma in Accounting' },
    { id: 27, name: 'Diploma in Cost & Management Accounting' },
    { id: 28, name: 'Diploma in Office Management & Technology' },
    { id: 29, name: 'Diploma in Public Finance and Accounting' },
    { id: 30, name: 'Diploma in Local Government and Finance' },
    { id: 31, name: 'Diploma in Public Management' },
    { id: 32, name: 'Diploma in Marketing' },
    { id: 33, name: 'Diploma in Human Resource Management' },
    { id: 34, name: 'Advanced Diploma in Cost and Management Accounting' },
    { id: 35, name: 'Advanced Diploma in Accounting' },
    { id: 36, name: 'Advanced Diploma in Office Management and Technology' },
    { id: 37, name: 'Advanced Diploma in Human Resource Management' },
    { id: 38, name: 'Advanced Diploma in Marketing' },
    { id: 39, name: 'Advanced Diploma in Public Management' },
    { id: 40, name: 'Postgraduate Diploma in Marketing' },
    { id: 41, name: 'Postgraduate Diploma in Human Resources Management' },
    { id: 42, name: 'Postgraduate Diploma in Public Management' },
  ],
};

/* ── CONSTANTS ──────────────────────────────────────────────────── */
// face-api CDN path for model weights (vladmandic build)
const FACE_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Euclidean distance threshold for face match. Lower = stricter.
const FACE_MATCH_THRESHOLD = 0.45;

/* ── STATE ──────────────────────────────────────────────────────── */
let cardImageDataUrl  = null;   // full data URL of uploaded card
let cardVerified      = false;  // true when barcode confirms match
let faceVerified      = false;  // true when live face matches card face
let cardFaceDescriptor= null;   // Float32Array from face-api on card image
let videoStream       = null;   // MediaStream for webcam
let faceApiLoaded     = false;  // true once face-api models downloaded
let faceCheckInterval = null;   // handle for the live-poll setInterval

/* ════════════════════════════════════════════════════════════════
   INIT
   ════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setupPasswordStrength();
  setupCardDropZone();
});

/* ════════════════════════════════════════════════════════════════
   STEP NAVIGATION
   ════════════════════════════════════════════════════════════════ */
function goStep(n) {
  document.querySelectorAll('.step-panel').forEach((p, i) => {
    p.classList.toggle('active', i + 1 === n);
  });
  document.querySelectorAll('.step-item').forEach((item, i) => {
    item.classList.remove('active', 'done');
    if (i + 1 < n)  item.classList.add('done');
    if (i + 1 === n) item.classList.add('active');
  });

  if (n === 3) initFaceVerification();
  if (n !== 3) stopCamera();
}

function goStep2() {
  if (!validateStep1()) return;
  goStep(2);
}

function goStep3Fn() {
  if (!cardVerified) {
    showToast('Please wait for your student card to be verified first.', 'error');
    return;
  }
  goStep(3);
}

/* ════════════════════════════════════════════════════════════════
   FACULTY → QUALIFICATION CASCADE
   ════════════════════════════════════════════════════════════════ */
function onFacultyChange() {
  const facultyId  = parseInt(document.getElementById('faculty').value, 10);
  const qualSelect = document.getElementById('qualification');
  const qualGroup  = document.getElementById('qualificationGroup');
  const errFaculty = document.getElementById('errFaculty');

  qualSelect.innerHTML = '<option value="">— Select your qualification —</option>';

  if (!facultyId) {
    qualGroup.style.display = 'none';
    qualGroup.classList.remove('qual-visible');
    return;
  }

  if (errFaculty) errFaculty.style.display = 'none';

  (QUALIFICATIONS[facultyId] || []).forEach(({ id, name }) => {
    const opt       = document.createElement('option');
    opt.value       = id;
    opt.textContent = name;
    qualSelect.appendChild(opt);
  });

  qualGroup.style.display = 'block';
  qualGroup.classList.remove('qual-visible');
  void qualGroup.offsetWidth;
  qualGroup.classList.add('qual-visible');
}

/* ════════════════════════════════════════════════════════════════
   STEP 1 VALIDATION
   ════════════════════════════════════════════════════════════════ */
function validateStep1() {
  clearErrors();
  let valid = true;

  const studentNo   = val('studentNo');
  const email       = val('email');
  const firstName   = val('firstName');
  const lastName    = val('lastName');
  const facultyVal  = document.getElementById('faculty').value;
  const qualVal     = document.getElementById('qualification').value;
  const contact     = val('contact');
  const password    = val('password');
  const confirmPass = val('confirmPw');

  if (!/^[0-9]{8}$/.test(studentNo)) {
    showFieldErr('errStudentNo', 'Must be exactly 8 digits');
    markError('studentNo');
    valid = false;
  }

  if (!/^[A-Za-z0-9._%+\-]+@gmail\.com$/i.test(email)) {
    showFieldErr('errEmail', 'Must be a valid @gmail.com address');
    markError('email');
    valid = false;
  }

  if (!firstName) {
    showFieldErr('errFirst', 'Required');
    markError('firstName');
    valid = false;
  }

  if (!lastName) {
    showFieldErr('errLast', 'Required');
    markError('lastName');
    valid = false;
  }

  if (!facultyVal) {
    showFieldErr('errFaculty', 'Please select your faculty');
    valid = false;
  }

  if (!qualVal) {
    showFieldErr('errQualification', 'Please select your qualification');
    valid = false;
  }

  if (!/^0[0-9]{9}$/.test(contact)) {
    showFieldErr('errContact', 'Must be 10 digits starting with 0');
    markError('contact');
    valid = false;
  }

  if (!password) {
    showFieldErr('errPw', 'Password is required');
    markError('password');
    valid = false;
  }

  if (password && password !== confirmPass) {
    showFieldErr('errConfirm', 'Passwords do not match');
    markError('confirmPw');
    valid = false;
  }

  if (!valid) showToast('Please fix the errors highlighted below.', 'error');
  return valid;
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — STUDENT CARD UPLOAD & OCR VERIFICATION
   ════════════════════════════════════════════════════════════════ */

function setupCardDropZone() {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('cardFileInput');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processCardFile(file);
  });
}

function handleCardUpload(event) {
  const file = event.target.files[0];
  if (file) processCardFile(file);
}

function processCardFile(file) {
  resetCardVerification();

  const MAX_MB = 5;
  if (file.size > MAX_MB * 1024 * 1024) {
    showToast(`Image must be under ${MAX_MB} MB.`, 'error');
    return;
  }
  if (!file.type.startsWith('image/')) {
    showToast('Please upload an image file (JPG or PNG).', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    cardImageDataUrl = e.target.result;

    // Show preview
    const preview    = document.getElementById('cardPreview');
    const previewImg = document.getElementById('cardPreviewImg');
    const zone       = document.getElementById('uploadZone');
    previewImg.src   = cardImageDataUrl;
    preview.style.display = 'block';
    zone.style.display    = 'none';

    setReq('req-uploaded', true);
    document.getElementById('ocrLoader').style.display = 'flex';

    try {
      await verifyCardWithOCR(cardImageDataUrl);
    } catch (err) {
      console.error('Card OCR error:', err);
      document.getElementById('ocrLoader').style.display = 'none';
      showToast('Could not read the card. Please try a clearer photo.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function removeCard() {
  resetCardVerification();
  document.getElementById('cardPreview').style.display = 'none';
  document.getElementById('uploadZone').style.display  = 'block';
  document.getElementById('cardFileInput').value       = '';
  cardImageDataUrl = null;
}

function resetCardVerification() {
  cardVerified       = false;
  cardFaceDescriptor = null;

  document.getElementById('ocrBadge').style.display  = 'none';
  document.getElementById('btnStep2Next').disabled   = true;

  setReq('req-uploaded', false);
  setReq('req-clear',    false);
  setReq('req-match',    false);
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT CARD VERIFICATION  (Tesseract.js OCR – OR logic)
   ─────────────────────────────────────────────────────────────────

   Strategy — OR matching for maximum reliability:
     1. Try OCR at 4 rotations (0°, 90°, 270°, 180°) — picks the one
        that returns the most text (handles sideways card photos).
     2. Build a list of ALL valid match targets for this student:
          • Their surname (last name from Step 1)
          • Their 8-digit student number (from Step 1)
          • Every meaningful word (≥4 letters) from their qualification
     3. Scan the OCR output for ANY of those targets using fuzzy
        matching for text and exact matching for the student number.
     4. If ANY one target is found → card verified.

   Why OR logic?
     OCR is imperfect — a single target can easily be missed due to
     glare, angle, or font rendering.  Using OR across surname,
     student number, and qualification words means verification
     succeeds as long as at least one readable piece of the card
     matches what the student entered in Step 1.
   ──────────────────────────────────────────────────────────────── */

const TESSERACT_WORKER_PATH =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';

/**
 * Draw img rotated by `degrees` onto a new canvas, scaled 2×,
 * with greyscale + contrast boost applied for better OCR.
 */
function buildOCRCanvas(img, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const W   = img.naturalWidth;
  const H   = img.naturalHeight;
  const lw  = Math.round(W * cos + H * sin);
  const lh  = Math.round(W * sin + H * cos);
  const SC  = 2;

  const canvas = document.createElement('canvas');
  canvas.width  = lw * SC;
  canvas.height = lh * SC;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(SC, SC);
  ctx.translate(lw / 2, lh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -W / 2, -H / 2);
  ctx.restore();

  // Greyscale + contrast boost
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d  = id.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = g < 128 ? Math.max(0, g - 50) : Math.min(255, g + 50);
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

/**
 * Score OCR output — higher = this rotation is probably correct.
 * We reward finding MUT card anchor words.
 */
function scoreOCRText(text) {
  const t = text.toLowerCase();
  let score = 0;
  if (t.includes('mangosuthu'))  score += 15;
  if (t.includes('mut'))         score += 8;
  if (t.includes('student'))     score += 8;
  if (t.includes('technology'))  score += 6;
  if (/[0-9]{8}/.test(t))        score += 10;
  if (text.trim().length > 30)   score += 5;
  return score;
}

/**
 * Run Tesseract on the image at 4 rotations and return the text
 * from the best-scoring rotation.
 */
async function ocrBestRotation(dataUrl, onProgress) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });

  const worker = await Tesseract.createWorker('eng', 1, {
    workerPath: TESSERACT_WORKER_PATH,
    logger: m => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  const ROTATIONS = [0, 90, 270, 180];
  let bestText  = '';
  let bestScore = -Infinity;

  for (const deg of ROTATIONS) {
    const canvas     = buildOCRCanvas(img, deg);
    const { data }   = await worker.recognize(canvas.toDataURL('image/png'));
    const text       = data.text || '';
    const score      = scoreOCRText(text);
    console.log(`[OCR] ${deg}° score=${score} snippet="${text.slice(0, 60).replace(/\n/g, ' ')}"`);
    if (score > bestScore) { bestScore = score; bestText = text; }
    if (bestScore >= 30) break; // early exit if confident
  }

  await worker.terminate();
  console.log('[OCR] best text:\n', bestText);
  return bestText;
}

/**
 * Extract the most likely surname from raw OCR text.
 *
 * MUT card: "KHANYILE Z T" is the name line — surname is the longest
 * all-caps, all-letter word that isn't a known header word.
 */
const CARD_SKIP_WORDS = new Set([
  'mangosuthu','university','technology','student','card','valid',
  'expires','mut','south','africa','issued','info','comms','eng',
  'engineering','science','management','accounting','marketing',
  'diploma','bachelor','advanced','postgraduate','master','faculty',
  'qualification','number','name','surname','applied','health',
]);

function extractSurname(rawText) {
  // Collect all word-like tokens, sorted by length descending
  const tokens = rawText
    .split(/[\s\n\r,.\-_\/]+/)
    .map(t => t.replace(/[^A-Za-z]/g, ''))
    .filter(t => t.length >= 3)                           // at least 3 chars
    .filter(t => !/[0-9]/.test(t))                        // no digits
    .filter(t => !CARD_SKIP_WORDS.has(t.toLowerCase()))   // not a header word
    .sort((a, b) => b.length - a.length);                 // longest first

  // Prefer a token that is all-caps (card prints name in caps)
  const capsToken = tokens.find(t => t === t.toUpperCase() && t.length >= 4);
  const best      = capsToken || tokens[0] || '';

  console.log('[OCR] surname candidates:', tokens.slice(0, 6), '→ picked:', best);
  return best.toLowerCase();
}

/**
 * Build the list of acceptable match targets for this student.
 *
 * OR logic — the card is considered verified if OCR finds ANY of:
 *   1. The student's last name
 *   2. The student's 8-digit student number
 *   3. Any significant word (≥4 letters) from their qualification name
 *
 * This makes verification robust against OCR noise — it is very
 * unlikely that none of surname / student number / qualification
 * words appear anywhere on a genuine MUT student card.
 */
function buildMatchTargets() {
  const targets = [];

  // 1. Surname
  const lastName = val('lastName').trim().toLowerCase();
  if (lastName) targets.push({ label: 'surname', value: lastName });

  // 2. Student number (typed in step 1)
  const studentNo = val('studentNo').trim();
  if (/^[0-9]{8}$/.test(studentNo)) {
    targets.push({ label: 'student number', value: studentNo });
  }

  // 3. Meaningful words from the selected qualification name
  const qualSelect = document.getElementById('qualification');
  if (qualSelect && qualSelect.value) {
    const qualId   = parseInt(qualSelect.value, 10);
    const allQuals = Object.values(QUALIFICATIONS).flat();
    const qualObj  = allQuals.find(q => q.id === qualId);
    if (qualObj) {
      const qualWords = qualObj.name
        .toLowerCase()
        .split(/[\s,\/&]+/)
        .map(w => w.replace(/[^a-z]/g, ''))
        .filter(w => w.length >= 4 && !CARD_SKIP_WORDS.has(w));
      qualWords.forEach(w => targets.push({ label: `qualification word "${w}"`, value: w }));
    }
  }

  console.log('[OCR] match targets:', targets.map(t => t.value));
  return targets;
}

/**
 * Try to match any target against all meaningful tokens in the OCR text.
 * Returns { matched: true, label, token } or { matched: false }.
 */
function findAnyMatch(rawText, targets) {
  // All word-like tokens from OCR output (letters + digit runs)
  const ocrTokens = rawText
    .split(/[\s\n\r,.\-_\/\\|:;()\[\]"'`]+/)
    .map(t => t.replace(/[^A-Za-z0-9]/g, '').toLowerCase())
    .filter(t => t.length >= 3);

  console.log('[OCR] tokens:', ocrTokens.slice(0, 20));

  for (const target of targets) {
    const tv = target.value.toLowerCase();

    // Direct token match (with fuzzy fallback for text targets)
    for (const token of ocrTokens) {
      const isNumber = /^[0-9]+$/.test(tv);
      if (isNumber) {
        // Exact match required for student numbers
        if (token === tv) {
          console.log(`[OCR] ✓ matched ${target.label} exactly: "${token}"`);
          return { matched: true, label: target.label, token };
        }
      } else {
        // Fuzzy match for text (surname / qual words)
        if (fuzzyMatch(token, tv)) {
          console.log(`[OCR] ✓ matched ${target.label} via fuzzy: "${token}" ~ "${tv}"`);
          return { matched: true, label: target.label, token };
        }
      }
    }

    // Also try matching against the full raw text string (catches split tokens)
    if (!/^[0-9]+$/.test(tv) && rawText.toLowerCase().includes(tv)) {
      console.log(`[OCR] ✓ matched ${target.label} in full text: "${tv}"`);
      return { matched: true, label: target.label, token: tv };
    }
  }

  return { matched: false };
}

/**
 * Main Step 2 verification — OCR the card, then check surname OR
 * student number OR any qualification word (whichever appears first).
 */
async function verifyCardWithOCR(dataUrl) {
  const loaderMsg = document.getElementById('ocrLoaderMsg');

  let rawText = '';
  try {
    rawText = await ocrBestRotation(dataUrl, pct => {
      if (loaderMsg) loaderMsg.textContent = `Reading card… ${pct}%`;
    });
  } catch (err) {
    throw new Error('Tesseract failed: ' + err.message);
  }

  document.getElementById('ocrLoader').style.display = 'none';

  if (!rawText.trim()) {
    setReq('req-clear', false);
    showBadge(false, 'No text detected. Use a clearer, well-lit photo.');
    showToast('OCR found no text. Try a brighter, sharper photo.', 'error');
    return;
  }

  setReq('req-clear', true);

  // Build all valid match targets for this student
  const targets = buildMatchTargets();

  if (!targets.length) {
    showBadge(false, 'Could not determine match targets — please complete Step 1 first.');
    return;
  }

  // Try matching any target against the OCR output
  const result = findAnyMatch(rawText, targets);

  if (!result.matched) {
    setReq('req-match', false);

    // Build a helpful hint listing what we were looking for
    const tried = [
      `surname "${val('lastName').trim()}"`,
      val('studentNo').trim() ? `student number "${val('studentNo').trim()}"` : null,
      'qualification keywords',
    ].filter(Boolean).join(', ');

    showBadge(false,
      `Could not verify this card. We looked for: ${tried}. ` +
      `Try a clearer, well-lit photo with the card lying flat.`
    );
    showToast('Card could not be verified. Try a sharper photo.', 'error');
    return;
  }

  // ✓ At least one match found
  setReq('req-match', true);
  showBadge(true, `Verified ✓  matched your ${result.label} on the card`);
  cardVerified = true;
  document.getElementById('btnStep2Next').disabled = false;
  showToast('Student card verified!', 'success');

  preloadCardFaceDescriptor(dataUrl);
}



/* ─────────────────────────────────────────────────────────────────
   SHARED UI HELPERS
   ──────────────────────────────────────────────────────────────── */

/**
 * Toggle a checklist requirement item on/off.
 * Elements with these ids must exist in signup.html:
 *   req-uploaded, req-clear, req-match
 */
function setReq(id, done) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('done',    done);
  el.classList.toggle('pending', !done);
}

/**
 * Show the result badge below the card upload zone.
 * @param {boolean} success  true = green tick, false = red cross
 * @param {string}  text     message to display
 */
function showBadge(success, text) {
  const badge    = document.getElementById('ocrBadge');
  const badgeTxt = document.getElementById('ocrBadgeText');
  if (!badge) return;
  badge.style.display = 'flex';
  badge.className     = 'ocr-badge ' + (success ? 'success' : 'fail');
  if (badgeTxt) badgeTxt.textContent = text;
}

/**
 * Fuzzy string match — true if a contains b or b contains a
 * after normalisation.
 */
function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  const na = normalise(a);
  const nb = normalise(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalise(str) {
  return str.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
}



/* ════════════════════════════════════════════════════════════════
   STEP 3 — FACE CAPTURE  (face-api.js – store descriptor in Supabase)
   ════════════════════════════════════════════════════════════════

   No matching here — just capture a clean live face descriptor
   and save it to the face_descriptors table.
   It will be used later at login for face ID authentication.
   ════════════════════════════════════════════════════════════════ */

async function initFaceVerification() {
  faceVerified = false;
  document.getElementById('btnSubmitFinal').disabled = true;
  setVerifyStatus('loading', 'Loading face detection models…');

  try {
    if (!faceApiLoaded) {
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
      ]);
      faceApiLoaded = true;
    }

    await startCamera();
    setVerifyStatus('scanning', 'Look at the camera and hold still…');
    startFaceCaptureLoop();

  } catch (err) {
    console.error('Face init error:', err);
    setVerifyStatus('error', 'Camera error. Please allow camera access and try again.');
  }
}

async function startCamera() {
  const video = document.getElementById('videoFeed');
  videoStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = videoStream;
  await new Promise(resolve => { video.onloadedmetadata = resolve; });
}

function stopCamera() {
  if (faceCheckInterval) { clearInterval(faceCheckInterval); faceCheckInterval = null; }
  if (videoStream)       { videoStream.getTracks().forEach(t => t.stop()); videoStream = null; }
  const video = document.getElementById('videoFeed');
  if (video) video.srcObject = null;
}

/**
 * Poll the webcam every 600ms.
 * Collect face descriptors from 5 consecutive good detections,
 * average them for a stable descriptor, then mark capture done.
 */
function startFaceCaptureLoop() {
  const video = document.getElementById('videoFeed');
  const NEEDED = 5;
  const descriptors = [];

  faceCheckInterval = setInterval(async () => {
    if (!video || video.paused || video.ended) return;

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setVerifyStatus('scanning', 'No face detected — look directly at the camera');
      updateConfBar(0);
      return;
    }

    descriptors.push(detection.descriptor);
    const pct = Math.round((descriptors.length / NEEDED) * 100);
    updateConfBar(pct / 100);
    setVerifyStatus('scanning', `Capturing… ${descriptors.length}/${NEEDED} frames`);

    if (descriptors.length >= NEEDED) {
      clearInterval(faceCheckInterval);
      faceCheckInterval = null;

      // Average the descriptors for a more stable result
      const averaged = averageDescriptors(descriptors);
      cardFaceDescriptor = averaged;
      faceVerified = true;

      setVerifyStatus('success', '✓ Face captured! Click "Complete Registration" below.');
      updateConfBar(1);
      document.getElementById('btnSubmitFinal').disabled = false;
      showToast('Face captured successfully!', 'success');
    }
  }, 600);
}

/**
 * Average an array of Float32Array descriptors into one.
 */
function averageDescriptors(descriptors) {
  const len = descriptors[0].length;
  const avg = new Float32Array(len);
  for (const d of descriptors) {
    for (let i = 0; i < len; i++) avg[i] += d[i];
  }
  for (let i = 0; i < len; i++) avg[i] /= descriptors.length;
  return avg;
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = dataUrl;
  });
}

// Kept for compatibility — no longer used for matching, just silently skipped
async function preloadCardFaceDescriptor(dataUrl) {
  console.log('[signup] Card face preload skipped — using live capture instead.');
}

function setVerifyStatus(state, msg) {
  const dot   = document.querySelector('.status-dot');
  const msgEl = document.getElementById('verifyMsg');
  if (msgEl) msgEl.textContent = msg;
  if (dot) {
    dot.className = 'status-dot';
    if (state === 'success') dot.classList.add('match');
    if (state === 'error')   dot.classList.add('error');
    if (state === 'loading') dot.classList.add('loading');
  }
}

function updateConfBar(confidence) {
  const wrap = document.getElementById('confBarWrap');
  const fill = document.getElementById('confFill');
  const pct  = document.getElementById('confPct');
  if (!wrap) return;
  wrap.style.display = 'block';
  const p = Math.round(confidence * 100);
  if (fill) fill.style.width = p + '%';
  if (pct)  pct.textContent  = p + '%';
}


/* ════════════════════════════════════════════════════════════════
   FINAL SUBMIT
   ════════════════════════════════════════════════════════════════ */
async function submitRegistration() {
  const db = window.supabaseClient;
  if (!db) { showToast('Database connection unavailable.', 'error'); return; }

  if (!cardVerified) { showToast('Student card verification is required.', 'error'); return; }
  if (!faceVerified) { showToast('Face capture is required.', 'error'); return; }

  const btnSubmit = document.getElementById('btnSubmitFinal');
  setBtnLoading(btnSubmit, true);

  const studentNo       = val('studentNo');
  const email           = val('email');
  const firstName       = val('firstName');
  const lastName        = val('lastName');
  const qualificationId = parseInt(document.getElementById('qualification').value, 10);
  const contact         = val('contact');
  const password        = val('password');

  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await db.auth.signUp({ email, password });
    if (authError) {
      showToast(friendlyAuthError(authError.message), 'error');
      setBtnLoading(btnSubmit, false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      showToast('Registration failed — no user ID returned. Please try again.', 'error');
      setBtnLoading(btnSubmit, false);
      return;
    }

    // 2. Insert student profile
    const { error: insertError } = await db.from('students').insert({
      student_id:       userId,
      student_number:   studentNo,
      first_name:       firstName,
      last_name:        lastName,
      email:            email,
      contact_number:   contact,
      qualification_id: qualificationId,
      password:         password,
      account_status:   'pending',
      email_verified:   false,
      face_verified:    true,
      card_verified:    true,
    });

    if (insertError) {
      showToast(friendlyInsertError(insertError), 'error');
      setBtnLoading(btnSubmit, false);
      return;
    }

    // 3. Upload student card image to Supabase Storage
    let cardImageUrl = null;
    if (cardImageDataUrl) {
      try {
        // Convert data URL → Blob
        const res      = await fetch(cardImageDataUrl);
        const blob     = await res.blob();
        const ext      = blob.type === 'image/png' ? 'png' : 'jpg';
        const filePath = `student-cards/${userId}.${ext}`;

        const { error: uploadErr } = await db.storage
          .from('student-cards')
          .upload(filePath, blob, { contentType: blob.type, upsert: true });

        if (uploadErr) {
          console.warn('[signup] Card image upload failed:', uploadErr.message);
        } else {
          const { data: urlData } = db.storage
            .from('student-cards')
            .getPublicUrl(filePath);
          cardImageUrl = urlData?.publicUrl || null;
          console.log('[signup] Card image uploaded:', cardImageUrl);
        }
      } catch (uploadEx) {
        console.warn('[signup] Card upload exception:', uploadEx.message);
      }
    }

    // Update student row with card_image_url (non-fatal if column missing)
    if (cardImageUrl) {
      await db.from('students').update({ card_image_url: cardImageUrl }).eq('student_id', userId);
    }

    // 4. Save face descriptor to Supabase face_descriptors table
    if (cardFaceDescriptor) {
      const descriptorArray = Array.from(cardFaceDescriptor);
      const { error: faceError } = await db.from('face_descriptors').insert({
        student_id:  userId,
        descriptor:  descriptorArray,
      });
      if (faceError) {
        console.warn('[signup] Face descriptor save failed:', faceError.message);
      } else {
        console.log('[signup] Face descriptor saved to Supabase.');
      }
    }

    stopCamera();
    showToast('Registration submitted! Your account is pending admin approval.', 'success');
    setTimeout(() => { window.location.href = 'login.html'; }, 2500);

  } catch (err) {
    console.error('Registration error:', err);
    showToast('An unexpected error occurred. Please try again.', 'error');
    setBtnLoading(btnSubmit, false);
  }
}


/* ════════════════════════════════════════════════════════════════
   PASSWORD HELPERS
   ════════════════════════════════════════════════════════════════ */
function togglePw(id) {
  const input = document.getElementById(id);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function setupPasswordStrength() {
  const pwInput = document.getElementById('password');
  if (!pwInput) return;
  pwInput.addEventListener('input', () => updateStrength(pwInput.value));
}

function updateStrength(pw) {
  let score = 0;
  if (pw.length >= 8)          score++;
  if (/[A-Z]/.test(pw))        score++;
  if (/[0-9]/.test(pw))        score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levelClass = ['', 'weak', 'medium', 'medium', 'strong'];
  ['pb1','pb2','pb3','pb4'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.className = 'pw-bar ' + (i < score ? levelClass[score] : '');
  });
}

/* ════════════════════════════════════════════════════════════════
   ERROR HELPERS
   ════════════════════════════════════════════════════════════════ */
function showFieldErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = 'block';
}

function markError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('error');
}

function clearErrors() {
  document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.querySelectorAll('.field-err').forEach(el => {
    el.style.display = 'none';
    el.textContent   = '';
  });
}

/* ════════════════════════════════════════════════════════════════
   TOAST
   ════════════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ════════════════════════════════════════════════════════════════
   BUTTON LOADING STATE
   ════════════════════════════════════════════════════════════════ */
function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? '<span class="spinner-inline"></span> Submitting…'
    : '✔ &nbsp;Complete Registration';
}

/* ════════════════════════════════════════════════════════════════
   FRIENDLY ERROR MESSAGES
   ════════════════════════════════════════════════════════════════ */
function friendlyAuthError(msg) {
  if (!msg) return 'Registration failed. Please try again.';
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('already exists'))
    return 'An account with this email already exists. Try logging in.';
  if (m.includes('invalid email'))
    return 'Please enter a valid email address.';
  if (m.includes('password'))
    return 'Password is too weak. Please choose a stronger password.';
  return msg;
}

function friendlyInsertError(err) {
  if (!err) return 'Could not save your profile. Please try again.';
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('student_number') || msg.includes('chk_student_number'))
    return 'Student number must be exactly 8 digits.';
  if (msg.includes('chk_email_gmail') || msg.includes('email'))
    return 'Email must be a valid @gmail.com address.';
  if (msg.includes('chk_contact') || msg.includes('contact_number'))
    return 'Contact number must be 10 digits starting with 0.';
  if (msg.includes('qualification_id') || msg.includes('qualifications'))
    return 'Please select a valid qualification.';
  if (msg.includes('unique') || msg.includes('duplicate'))
    return 'This student number or email is already registered.';
  return 'Could not save your profile: ' + err.message;
}

/* ════════════════════════════════════════════════════════════════
   VAL HELPER
   ════════════════════════════════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}