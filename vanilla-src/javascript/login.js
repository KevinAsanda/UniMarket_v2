/* ================================================================
   UNIMARKET – LOGIN
   - Password login via Supabase Auth
   - Face ID login: loads descriptor from face_descriptors table,
     matches against live webcam feed using face-api.js
   ================================================================ */

'use strict';

/* ── CONSTANTS ─────────────────────────────────────────── */
const MAX_ATTEMPTS    = 3;
const LOCKOUT_SECONDS = 5 * 60;
const FACE_THRESHOLD  = 0.45;   // euclidean distance; lower = stricter
const MODELS_URL      = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

/* ── STATE ─────────────────────────────────────────────── */
let selectedRole      = 'Student';
let loginAttempts     = 0;
let lockoutTimer      = null;
let lockoutRemaining  = 0;
let stream            = null;
let faceDetectionLoop = null;
let modelsLoaded      = false;
let faceVerified      = false;
let storedDescriptor  = null;   // Float32Array loaded from Supabase
let currentTab        = 'password';
let detectRunning     = false;  // prevent overlapping detection calls

/* ── DOM READY ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  restoreLockout();
  document.getElementById('email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('password').focus();
  });
  document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPassword();
  });

  const remembered = localStorage.getItem('um_remember');
  if (remembered) {
    document.getElementById('email').value        = remembered;
    document.getElementById('rememberMe').checked = true;
  }
});

/* ================================================================
   TAB SWITCHING
   ================================================================ */
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabPassword').classList.toggle('active', tab === 'password');
  document.getElementById('tabFace').classList.toggle('active',    tab === 'face');
  document.getElementById('panelPassword').classList.toggle('active', tab === 'password');
  document.getElementById('panelFace').classList.toggle('active',    tab === 'face');

  if (tab !== 'face') {
    stopCamera();
  }
  // Face camera only starts once the user has typed their email and clicked Start
}

/* ================================================================
   ROLE TOGGLE
   ================================================================ */
function setRole(role) {
  selectedRole = role;
  document.getElementById('roleStudent').classList.toggle('active', role === 'Student');
  document.getElementById('roleAdmin').classList.toggle('active',   role === 'Admin');
}

/* ================================================================
   PASSWORD LOGIN  (Supabase Auth)
   ================================================================ */
function togglePw() {
  const input = document.getElementById('password');
  const icon  = document.getElementById('eyeIcon');
  const show  = input.type === 'password';
  input.type  = show ? 'text' : 'password';
  icon.innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

async function submitPassword() {
  if (lockoutTimer) return;
  clearFieldErrors();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email) {
    showFieldErr('errEmail');
    document.getElementById('email').classList.add('error');
    return;
  }
  if (!password) {
    showFieldErr('errPw');
    document.getElementById('password').classList.add('error');
    return;
  }

  const btn = document.getElementById('btnLogin');
  btn.classList.add('loading');
  btn.textContent = 'Signing in…';

  const db = window.supabaseClient;
  if (!db) {
    showToast('Database connection unavailable.', 'error');
    btn.classList.remove('loading');
    btn.textContent = 'Sign In';
    return;
  }

  try {
    if (selectedRole === 'Admin') {
      const { data: adminRow, error: adminErr } = await db
        .from('admins')
        .select('admin_id, full_name, email, password, is_active')
        .eq('email', email)
        .single();

      if (adminErr || !adminRow) {
        btn.classList.remove('loading'); btn.textContent = 'Sign In';
        handleFailedAttempt(); return;
      }
      if (!adminRow.is_active) {
        showToast('This admin account is inactive.', 'error');
        btn.classList.remove('loading'); btn.textContent = 'Sign In';
        return;
      }
      if (adminRow.password !== password) {
        btn.classList.remove('loading'); btn.textContent = 'Sign In';
        handleFailedAttempt(); return;
      }

      sessionStorage.setItem('um_role',       'admin');
      sessionStorage.setItem('um_admin_id',   adminRow.admin_id);
      sessionStorage.setItem('um_admin_name', adminRow.full_name);
      if (document.getElementById('rememberMe').checked) {
        localStorage.setItem('um_remember', email);
      }
      showToast('Welcome back, ' + adminRow.full_name + '!', 'success');
      btn.classList.remove('loading'); btn.textContent = 'Sign In';
      setTimeout(() => window.location.href = 'admin.html', 1500);

    } else {
      const { data, error } = await db.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        btn.classList.remove('loading'); btn.textContent = 'Sign In';
        handleFailedAttempt(); return;
      }

      const { data: student, error: studentErr } = await db
        .from('students')
        .select('account_status, first_name')
        .eq('student_id', data.user.id)
        .single();

      btn.classList.remove('loading'); btn.textContent = 'Sign In';

      if (studentErr || !student) {
        showToast('Account not found. Contact support.', 'error'); return;
      }
      if (student.account_status === 'pending') {
        showToast('Your account is pending admin approval.', 'error'); return;
      }
      if (student.account_status === 'suspended' || student.account_status === 'banned') {
        showToast('Your account has been suspended. Contact admin.', 'error'); return;
      }

      loginAttempts = 0;
      hideAttemptBars();
      sessionStorage.setItem('um_role', 'student');
      if (document.getElementById('rememberMe').checked) {
        localStorage.setItem('um_remember', email);
      }
      showToast('Welcome back, ' + student.first_name + '!', 'success');
      setTimeout(() => window.location.href = 'cat.html', 1500);
    }

  } catch (err) {
    console.error('Login error:', err);
    btn.classList.remove('loading'); btn.textContent = 'Sign In';
    showToast('An unexpected error occurred. Please try again.', 'error');
  }
}

function handleFailedAttempt() {
  loginAttempts++;
  const remaining = MAX_ATTEMPTS - loginAttempts;
  if (loginAttempts >= MAX_ATTEMPTS) {
    startLockout();
  } else {
    showToast(`Incorrect credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, 'error');
    const bar = document.getElementById('attemptBar');
    const msg = document.getElementById('attemptMsg');
    bar.style.display = 'flex';
    msg.textContent   = `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining`;
  }
  document.getElementById('email').classList.add('error');
  document.getElementById('password').classList.add('error');
}

function startLockout() {
  lockoutRemaining = LOCKOUT_SECONDS;
  document.getElementById('attemptBar').style.display  = 'none';
  document.getElementById('lockoutBar').style.display  = 'flex';
  document.getElementById('btnLogin').disabled = true;
  updateLockTimer();
  lockoutTimer = setInterval(() => {
    lockoutRemaining--;
    updateLockTimer();
    if (lockoutRemaining <= 0) clearLockout();
  }, 1000);
  localStorage.setItem('um_lockout_until', Date.now() + LOCKOUT_SECONDS * 1000);
}

function updateLockTimer() {
  const m = Math.floor(lockoutRemaining / 60).toString().padStart(2, '0');
  const s = (lockoutRemaining % 60).toString().padStart(2, '0');
  document.getElementById('lockTimer').textContent = `${m}:${s}`;
}

function clearLockout() {
  clearInterval(lockoutTimer);
  lockoutTimer = null; lockoutRemaining = 0; loginAttempts = 0;
  document.getElementById('lockoutBar').style.display = 'none';
  document.getElementById('btnLogin').disabled = false;
  localStorage.removeItem('um_lockout_until');
}

function restoreLockout() {
  const until = parseInt(localStorage.getItem('um_lockout_until') || '0', 10);
  if (!until) return;
  const remaining = Math.ceil((until - Date.now()) / 1000);
  if (remaining > 0) {
    lockoutRemaining = remaining;
    document.getElementById('lockoutBar').style.display = 'flex';
    document.getElementById('btnLogin').disabled = true;
    updateLockTimer();
    lockoutTimer = setInterval(() => {
      lockoutRemaining--;
      updateLockTimer();
      if (lockoutRemaining <= 0) clearLockout();
    }, 1000);
  } else {
    localStorage.removeItem('um_lockout_until');
  }
}

function hideAttemptBars() {
  document.getElementById('attemptBar').style.display = 'none';
  document.getElementById('lockoutBar').style.display = 'none';
}

/* ================================================================
   FACE ID LOGIN
   ================================================================

   Flow:
     1. User types their email and clicks "Start Face Login"
     2. We look up their stored descriptor from face_descriptors
     3. Load face-api models (cached after first load)
     4. Open the camera
     5. Poll for face every 500ms using setInterval (NOT rAF with
        async — that causes overlapping calls and race conditions)
     6. When FACE_THRESHOLD is beaten for NEEDED consecutive frames,
        mark verified and enable the submit button
     7. submitFaceLogin() stores um_student_id in sessionStorage
        which auth-session.js already handles as a valid session

   ================================================================ */

async function startFaceLogin() {
  const email = document.getElementById('faceEmail').value.trim();

  if (!email) {
    document.getElementById('errFaceEmail').style.display = 'block';
    document.getElementById('faceEmail').focus();
    return;
  }
  document.getElementById('errFaceEmail').style.display = 'none';

  const btn = document.getElementById('btnStartFace');
  if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }

  faceVerified     = false;
  storedDescriptor = null;
  document.getElementById('btnFaceLogin').disabled = true;

  setVerifyStatus('checking', 'Looking up your face profile…');
  showCameraWrap(true);

  const db = window.supabaseClient;
  if (!db) {
    setVerifyStatus('error', 'Database unavailable');
    showCameraWrap(false);
    if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
    return;
  }

  try {
    // Step 1: resolve student_id from email
    const { data: student, error: sErr } = await db
      .from('students')
      .select('student_id, account_status, first_name')
      .eq('email', email)
      .single();

    if (sErr || !student) {
      setVerifyStatus('error', 'No account found for this email');
      showCameraWrap(false);
      showToast('No account found for this email.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
      return;
    }

    if (student.account_status === 'pending') {
      setVerifyStatus('error', 'Account is pending admin approval');
      showCameraWrap(false);
      showToast('Your account is pending admin approval.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
      return;
    }

    if (student.account_status === 'suspended' || student.account_status === 'banned') {
      setVerifyStatus('error', 'Account suspended — contact admin');
      showCameraWrap(false);
      showToast('Your account has been suspended.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
      return;
    }

    // Step 2: load stored face descriptor
    const { data: faceRow, error: fErr } = await db
      .from('face_descriptors')
      .select('descriptor')
      .eq('student_id', student.student_id)
      .single();

    if (fErr || !faceRow || !faceRow.descriptor) {
      setVerifyStatus('error', 'No face profile found — use password login');
      showCameraWrap(false);
      showToast('No face profile on record. Please use password login.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
      return;
    }

    storedDescriptor = new Float32Array(faceRow.descriptor);
    console.log('[FaceID] Descriptor loaded, length:', storedDescriptor.length);

    // Step 3: load models if not already cached
    setVerifyStatus('checking', 'Loading AI models…');
    showLoaderOverlay(true);

    if (!modelsLoaded) {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
        ]);
        modelsLoaded = true;
        console.log('[FaceID] Models loaded');
      } catch (modelErr) {
        showLoaderOverlay(false);
        setVerifyStatus('error', 'Failed to load AI models — check your connection');
        showCameraWrap(false);
        showToast('Could not load Face AI models.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
        return;
      }
    }
    showLoaderOverlay(false);

    // Step 4: open camera
    setVerifyStatus('checking', 'Opening camera…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = document.getElementById('videoFeed');
      video.srcObject = stream;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(resolve, 3000); // fallback in case onloadedmetadata doesn't fire
      });
      video.play();
    } catch (camErr) {
      console.error('[FaceID] Camera error:', camErr);
      setVerifyStatus('error', 'Camera access denied — please allow camera permissions');
      showCameraWrap(false);
      showToast('Please allow camera access and try again.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
      return;
    }

    // Step 5: activate UI and start detection
    document.getElementById('cameraWrap').classList.add('active');
    document.getElementById('scanLine').classList.add('active');
    document.getElementById('camLabel').textContent = 'Position your face in the oval';
    setVerifyStatus('checking', 'Looking for your face…');

    if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }

    startDetectionLoop();

  } catch (err) {
    console.error('[FaceID] Unexpected error:', err);
    setVerifyStatus('error', 'Something went wrong — please try again');
    showCameraWrap(false);
    if (btn) { btn.disabled = false; btn.textContent = 'Start Face Login'; }
  }
}

/* ── Detection loop ────────────────────────────────────── */
function startDetectionLoop() {
  stopDetectionLoop(); // clear any previous loop

  const video  = document.getElementById('videoFeed');
  let consecutive = 0;
  const NEEDED    = 4; // consecutive frames below threshold to confirm

  faceDetectionLoop = setInterval(async () => {
    // Guard: skip if already processing or stream gone
    if (detectRunning || !stream || !stream.active) return;
    if (!video || video.paused || video.ended || video.readyState < 2) return;
    if (!storedDescriptor) return;

    detectRunning = true;
    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        document.getElementById('faceOval').classList.remove('detected');
        document.getElementById('camLabel').textContent = 'Position your face in the oval';
        consecutive = 0;
        setVerifyStatus('checking', 'No face detected — look directly at the camera');
        updateConfBar(0);
      } else {
        document.getElementById('faceOval').classList.add('detected');

        const dist       = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
        const confidence = Math.max(0, Math.min(1, 1 - dist));
        updateConfBar(confidence);

        console.log(`[FaceID] dist=${dist.toFixed(3)} consecutive=${consecutive}`);

        if (dist < FACE_THRESHOLD) {
          consecutive++;
          const pct = Math.round(confidence * 100);
          setVerifyStatus('checking', `Verifying… ${consecutive}/${NEEDED} frames matched`);
          document.getElementById('camLabel').textContent = `Match ${pct}% — hold still…`;

          if (consecutive >= NEEDED && !faceVerified) {
            faceVerified = true;
            stopDetectionLoop();
            onFaceMatchSuccess(Math.round(confidence * 100));
          }
        } else {
          consecutive = 0;
          const hint = confidence > 0.35
            ? 'Almost — move a little closer or adjust lighting'
            : 'Face not matching — ensure good lighting and look straight ahead';
          setVerifyStatus('checking', hint);
          document.getElementById('camLabel').textContent = 'Adjust position…';
        }
      }
    } catch (err) {
      console.error('[FaceID] Detection error:', err);
    } finally {
      detectRunning = false;
    }
  }, 500);
}

function stopDetectionLoop() {
  if (faceDetectionLoop) {
    clearInterval(faceDetectionLoop);
    faceDetectionLoop = null;
  }
  detectRunning = false;
}

function onFaceMatchSuccess(pct) {
  document.getElementById('scanLine').classList.remove('active');
  document.getElementById('cameraWrap').classList.add('matched');
  document.getElementById('faceOval').classList.add('detected');
  document.getElementById('camLabel').textContent = `✓ Face matched (${pct}% confidence)`;

  const flash = document.getElementById('successFlash');
  if (flash) { flash.classList.add('show'); setTimeout(() => flash.classList.remove('show'), 600); }

  setVerifyStatus('success', `Face matched — ${pct}% confidence`);
  document.getElementById('btnFaceLogin').disabled = false;
  showToast('Face recognised! Click "Complete Face Login" to proceed.', 'success');
}

async function submitFaceLogin() {
  if (!faceVerified) { showToast('Face verification not complete.', 'error'); return; }

  const email = document.getElementById('faceEmail').value.trim();
  if (!email) {
    document.getElementById('errFaceEmail').style.display = 'block';
    return;
  }

  const btn = document.getElementById('btnFaceLogin');
  btn.disabled    = true;
  btn.textContent = 'Signing in…';

  const db = window.supabaseClient;
  if (!db) { showToast('Database unavailable.', 'error'); btn.disabled = false; return; }

  const { data: student } = await db
    .from('students')
    .select('student_id, first_name, account_status')
    .eq('email', email)
    .single();

  if (!student) {
    showToast('Account not found.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Complete Face Login';
    return;
  }

  if (student.account_status === 'pending') {
    showToast('Your account is pending admin approval.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Complete Face Login';
    return;
  }
  if (student.account_status === 'suspended' || student.account_status === 'banned') {
    showToast('Your account has been suspended.', 'error');
    btn.disabled    = false;
    btn.textContent = 'Complete Face Login';
    return;
  }

  stopCamera();
  sessionStorage.setItem('um_role',       'student');
  sessionStorage.setItem('um_student_id', student.student_id);
  showToast('Welcome back, ' + student.first_name + '!', 'success');
  setTimeout(() => window.location.href = 'cat.html', 1500);
}

function stopCamera() {
  stopDetectionLoop();
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  const video = document.getElementById('videoFeed');
  if (video) video.srcObject = null;

  const cw = document.getElementById('cameraWrap');
  const sl = document.getElementById('scanLine');
  const fo = document.getElementById('faceOval');
  if (cw) cw.classList.remove('active', 'matched');
  if (sl) sl.classList.remove('active');
  if (fo) fo.classList.remove('detected');

  faceVerified     = false;
  storedDescriptor = null;
}

/* ── UI helpers ────────────────────────────────────────── */
function showCameraWrap(visible) {
  const cw = document.getElementById('cameraWrap');
  if (cw) cw.style.display = visible ? 'block' : 'none';
}

function showLoaderOverlay(visible) {
  // Make cameraWrap visible first so the spinner is actually shown
  showCameraWrap(true);
  const ml = document.getElementById('modelLoader');
  if (ml) ml.classList.toggle('show', visible);
}

function updateConfBar(confidence) {
  const wrap = document.getElementById('confBarWrap');
  const fill = document.getElementById('confFill');
  const pct  = document.getElementById('confPct');
  if (!wrap) return;
  wrap.style.display = confidence > 0 ? 'block' : 'none';
  const p = Math.round(confidence * 100);
  if (fill) fill.style.width   = p + '%';
  if (pct)  pct.textContent    = p + '%';
}

/* ================================================================
   FORGOT PASSWORD
   ================================================================ */
function showForgot(e) {
  e && e.preventDefault();
  document.getElementById('forgotModal').classList.add('open');
}

function closeForgot() {
  document.getElementById('forgotModal').classList.remove('open');
}

async function submitForgot() {
  const email     = document.getElementById('fpEmail').value.trim();
  const studentNo = document.getElementById('fpStudentNo').value.trim();

  if (!email || !studentNo) { showToast('Please fill in all fields', 'error'); return; }

  const db = window.supabaseClient;
  if (db) {
    const { data } = await db
      .from('students')
      .select('student_id')
      .eq('email', email)
      .eq('student_number', studentNo)
      .single();

    if (!data) {
      showToast('No account found matching those details.', 'error');
      return;
    }
    await db.auth.resetPasswordForEmail(email);
  }

  showToast('If this account exists, a reset link has been sent.', 'info');
  closeForgot();
}

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('forgotModal');
  if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeForgot(); });
});

/* ================================================================
   HELPERS
   ================================================================ */
function setVerifyStatus(type, msg) {
  const strip = document.getElementById('verifyStatus');
  if (!strip) return;
  strip.className = 'verify-status';
  if (type !== 'default') strip.classList.add(type);
  document.getElementById('verifyMsg').textContent = msg;
}

function showFieldErr(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function clearFieldErrors() {
  document.querySelectorAll('.field-err').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.form-group input').forEach(el => el.classList.remove('error'));
}

let toastTimeout = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 3800);
}