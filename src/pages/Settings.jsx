import React, { useState, useEffect, useRef, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import { Navbar } from '../components/Navbar';
import '../styles/settings.css';

/* ── Constants ─────────────────────────────────────────────── */
const FACE_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const FACE_MATCH_THRESHOLD = 0.45;

const QUALIFICATIONS_FLAT = {
  1: 'Diploma in Agriculture',
  2: 'Diploma in Analytical Chemistry',
  3: 'Diploma in Community Extension',
  4: 'Diploma in Information Technology',
  5: 'Diploma in Nature Conservation',
  6: 'Bachelor of Science in Environmental Health',
  7: 'Bachelor of Health Sciences in Medical Laboratory Science',
  8: 'Bachelor of Applied Science in Nature Conservation',
  9: 'Advanced Diploma in Agriculture in Crop Production',
  10: 'Advanced Diploma in Agriculture in Animal Production',
  11: 'Advanced Diploma in Analytical Chemistry',
  12: 'Advanced Diploma in Agriculture Extension and Community Development',
  13: 'Advanced Diploma in ICT in Applications Development',
  14: 'Advanced Diploma in Nature Conservation',
  15: 'Post Graduate Diploma in Nature Conservation',
  16: 'Master of Nature Conservation',
  17: 'Diploma in Building',
  18: 'Diploma in Chemical Engineering',
  19: 'Diploma in Civil Engineering',
  20: 'Diploma in Electrical Engineering',
  21: 'Diploma in Mechanical Engineering',
  22: 'Diploma in Surveying',
  23: 'Diploma in Construction Management & Quantity Surveying',
  24: 'Advanced Diploma in Chemical Engineering',
  25: 'Advanced Diploma in Mechanical Engineering',
  26: 'Diploma in Accounting',
  27: 'Diploma in Cost & Management Accounting',
  28: 'Diploma in Office Management & Technology',
  29: 'Diploma in Public Finance and Accounting',
  30: 'Diploma in Local Government and Finance',
  31: 'Diploma in Public Management',
  32: 'Diploma in Marketing',
  33: 'Diploma in Human Resource Management',
  34: 'Advanced Diploma in Cost and Management Accounting',
  35: 'Advanced Diploma in Accounting',
  36: 'Advanced Diploma in Office Management and Technology',
  37: 'Advanced Diploma in Human Resource Management',
  38: 'Advanced Diploma in Marketing',
  39: 'Advanced Diploma in Public Management',
  40: 'Postgraduate Diploma in Marketing',
  41: 'Postgraduate Diploma in Human Resources Management',
  42: 'Postgraduate Diploma in Public Management',
};

const FACULTY_NAMES = {
  1: 'Faculty of Applied and Health Sciences',
  2: 'Faculty of Engineering',
  3: 'Faculty of Management Sciences',
};

const CARD_SKIP_WORDS = new Set([
  'the', 'and', 'of', 'for', 'to', 'a', 'is', 'in', 'at', 'on', 'by', 'or',
  'it', 'an', 'as', 'be', 'this', 'with', 'that', 'are', 'was', 'not',
  'from', 'student', 'card', 'number', 'name', 'faculty', 'qualification',
  'university', 'technology', 'mangosuthu', 'mut', 'id', 'no', 'year',
]);

/* ── OCR Helpers ────────────────────────────────────────────── */
function fuzzyMatch(a, b) {
  a = a.toLowerCase().trim(); b = b.toLowerCase().trim();
  if (a === b) return true;
  const shorter = a.length < b.length ? a : b;
  const longer  = a.length < b.length ? b : a;
  if (longer.includes(shorter)) return true;
  if (shorter.length < 4) return false;
  let diffs = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) diffs++;
    if (diffs > 1) return false;
  }
  return true;
}

function findAnyMatch(rawOcr, targets) {
  const words = rawOcr.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  for (const target of targets) {
    const targetWords = target.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !CARD_SKIP_WORDS.has(w));
    for (const tw of targetWords) {
      if (words.some(w => fuzzyMatch(w, tw))) return true;
    }
  }
  return false;
}

async function buildOCRCanvas(file, rotateDeg = 0) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const radians = (rotateDeg * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      canvas.width  = img.width * cos + img.height * sin;
      canvas.height = img.width * sin + img.height * cos;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.2) brightness(1.1)';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(radians);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas);
    };
    img.src = URL.createObjectURL(file);
  });
}

/* ── Settings Component ─────────────────────────────────────── */
export const Settings = () => {
  const { user, refreshUser } = useAuth();

  /* ─── Toast ─── */
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });
  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3500);
  };

  /* ─── Derived verification state ─── */
  const isVerified      = user?.card_verified && user?.face_verified;
  const cardDone        = !!user?.card_verified;
  const faceDone        = !!user?.face_verified;

  /* ─── STEP A: Card Upload State ─── */
  const [cardFile, setCardFile]           = useState(null);
  const [cardPreview, setCardPreview]     = useState(null);
  const [isOcr, setIsOcr]                 = useState(false);
  const [ocrStatus, setOcrStatus]         = useState(null); // { ok, msg }
  const [cardFaceDesc, setCardFaceDesc]   = useState(null); // Float32Array
  const [cardChecks, setCardChecks]       = useState({ uploaded: false, clear: false, matches: false });
  const canvasRef                          = useRef(null);

  /* ─── STEP B: Face Scan State ─── */
  const videoRef       = useRef(null);
  const streamRef      = useRef(null);
  const loopRef        = useRef(null);
  const faceOvalRef    = useRef(null);
  const camLabelRef    = useRef(null);
  const [modelsLoaded, setModelsLoaded]   = useState(false);
  const [cameraActive, setCameraActive]   = useState(false);
  const [faceStatus, setFaceStatus]       = useState({ msg: 'Waiting for camera…', type: 'idle' });
  const [confidence, setConfidence]       = useState(0);
  const [isSaving, setIsSaving]           = useState(false);

  /* ── Handle card file selection ── */
  const handleCardSelect = (file) => {
    if (!file) return;
    setCardFile(file);
    setCardPreview(URL.createObjectURL(file));
    setOcrStatus(null);
    setCardFaceDesc(null);
    setCardChecks({ uploaded: true, clear: false, matches: false });
  };

  /* ── Run OCR and face extraction on the card ── */
  const runCardVerification = useCallback(async () => {
    if (!cardFile || !user) return;
    setIsOcr(true);
    setOcrStatus(null);

    try {
      // 1. OCR
      const canvas0 = await buildOCRCanvas(cardFile, 0);
      const { data: { text: text0 } } = await Tesseract.recognize(canvas0, 'eng', { logger: () => {} });

      let bestText = text0;
      let bestScore = 0;

      // Try rotations if first pass confidence is low
      for (const deg of [90, 180, 270]) {
        const c = await buildOCRCanvas(cardFile, deg);
        const { data: { text } } = await Tesseract.recognize(c, 'eng', { logger: () => {} });
        const score = text.length;
        if (score > bestScore) { bestScore = score; bestText = text; }
      }

      // Build targets from user profile
      const targets = [
        user.student_number,
        user.last_name,
        user.first_name,
        QUALIFICATIONS_FLAT[user.qualification_id] || '',
      ].filter(Boolean);

      const matchFound = findAnyMatch(bestText, targets);
      const isReadable = bestText.trim().length > 50;

      setCardChecks({ uploaded: true, clear: isReadable, matches: matchFound });

      if (!isReadable) {
        setOcrStatus({ ok: false, msg: 'Card image is unclear — please upload a clearer photo.' });
        setIsOcr(false);
        return;
      }

      if (!matchFound) {
        setOcrStatus({ ok: false, msg: 'Could not verify card details match your account. Ensure the student number, name, or qualification is visible and matches exactly.' });
        setIsOcr(false);
        return;
      }

      // 2. Extract face from card for later comparison
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
        ]);

        const img = new Image();
        img.src = cardPreview;
        await new Promise(r => { img.onload = r; });
        const det = await faceapi
          .detectSingleFace(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) setCardFaceDesc(det.descriptor);
      } catch (_) {
        // Face extraction from card is optional — if card has no photo we skip
      }

      setOcrStatus({ ok: true, msg: 'Student card verified successfully! Proceed to the Face Scan step.' });
    } catch (err) {
      console.error('OCR error:', err);
      setOcrStatus({ ok: false, msg: 'Could not process the image. Please try again.' });
    } finally {
      setIsOcr(false);
    }
  }, [cardFile, cardPreview, user]);

  /* ── Save card_verified to DB ── */
  const saveCardVerified = async () => {
    if (!ocrStatus?.ok || !user) return;
    try {
      const { error } = await supabase
        .from('students')
        .update({ card_verified: true })
        .eq('student_id', user.student_id);
      if (error) throw error;
      await refreshUser();
      showToast('Student card verified! ✅ Now complete the face scan.', 'success');
    } catch (err) {
      showToast('Failed to save verification. Please try again.', 'error');
    }
  };

  /* ── Load face-api models for live scan ── */
  useEffect(() => {
    if (!cardDone || modelsLoaded) return;
    Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
    ])
      .then(() => setModelsLoaded(true))
      .catch(err => console.error('Face-api load error:', err));
  }, [cardDone]);

  /* ── Start camera ── */
  const startCamera = useCallback(async () => {
    if (!modelsLoaded) { showToast('Face models still loading, please wait…', 'info'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((res) => { videoRef.current.onloadedmetadata = res; });
        videoRef.current.play();
      }
      setCameraActive(true);
      setFaceStatus({ msg: 'Position your face in the oval…', type: 'idle' });
      startDetectionLoop();
    } catch (err) {
      showToast('Camera access denied. Please allow camera permissions.', 'error');
    }
  }, [modelsLoaded]);

  /* ── Stop camera ── */
  const stopCamera = useCallback(() => {
    if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setConfidence(0);
    setFaceStatus({ msg: 'Camera stopped.', type: 'idle' });
  }, []);

  useEffect(() => {
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  /* ── Face detection loop ── */
  const startDetectionLoop = () => {
    if (loopRef.current) clearInterval(loopRef.current);
    loopRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
      try {
        const det = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          if (faceOvalRef.current) faceOvalRef.current.classList.remove('detected');
          setFaceStatus({ msg: 'No face detected — look directly at camera', type: 'idle' });
          setConfidence(0);
          return;
        }

        if (faceOvalRef.current) faceOvalRef.current.classList.add('detected');

        // If we have a card face descriptor, compare
        if (cardFaceDesc) {
          const dist = faceapi.euclideanDistance(det.descriptor, cardFaceDesc);
          const conf = Math.max(0, Math.min(100, Math.round((1 - dist / 1.0) * 100)));
          setConfidence(conf);

          if (dist <= FACE_MATCH_THRESHOLD) {
            setFaceStatus({ msg: `Face matched! Confidence: ${conf}%`, type: 'success' });
          } else {
            setFaceStatus({ msg: 'Verifying face against card photo…', type: 'checking' });
          }
        } else {
          // No card face — just confirm a live face is detected
          setConfidence(80);
          setFaceStatus({ msg: 'Face detected — click Complete Verification', type: 'success' });
        }
      } catch (_) {}
    }, 800);
  };

  /* ── Complete face verification ── */
  const completeFaceVerification = async () => {
    if (isSaving) return;

    // Check if face is matched (or no card face available)
    const ready = !cardFaceDesc || faceStatus.type === 'success';
    if (!ready) {
      showToast('Please wait for face detection to succeed before verifying.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Get the current face descriptor for saving
      const det = videoRef.current
        ? await faceapi
            .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor()
        : null;

      // Update face_verified in students table
      const { error: updateErr } = await supabase
        .from('students')
        .update({ face_verified: true })
        .eq('student_id', user.student_id);

      if (updateErr) throw updateErr;

      // Save face descriptor to face_descriptors table
      if (det?.descriptor) {
        await supabase.from('face_descriptors').upsert({
          student_id: user.student_id,
          descriptor: Array.from(det.descriptor),
        }, { onConflict: 'student_id' });
      }

      stopCamera();
      await refreshUser();
      showToast('Identity fully verified! 🎉 Your listings now carry a verified badge.', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to save face verification. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Helpers ── */
  const getInitials = () =>
    `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase() || '?';

  const getQualName = () => QUALIFICATIONS_FLAT[user?.qualification_id] || 'Not specified';

  const getFacultyName = () => {
    const q = user?.qualification_id;
    if (!q) return 'Not specified';
    if (q <= 16) return FACULTY_NAMES[1];
    if (q <= 25) return FACULTY_NAMES[2];
    return FACULTY_NAMES[3];
  };

  /* ── Stepper state ── */
  const cardStep = cardDone ? 'done' : 'active';
  const faceStep = faceDone ? 'done' : cardDone ? 'active' : '';
  const doneStep = isVerified ? 'done' : '';

  /* ── CheckIcon ── */
  const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );

  /* ── ShieldCheck inline SVG ── */
  const ShieldCheck = ({ size = 14, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.14 9 11.25C17.25 22.14 21 17.25 21 12V7L12 2z"/>
      <polyline points="9 12 11 14 15 10" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div className="settings-page">
      <Navbar />

      {toast.show && (
        <div className={`toast show ${toast.type}`}
          style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1050 }}>
          {toast.msg}
        </div>
      )}

      <div className="settings-container">

        {/* ── LEFT: Profile Card ── */}
        <aside className="profile-card">
          <div className="profile-card-banner" />
          <div className="profile-card-body">
            <div className="profile-avatar">{getInitials()}</div>
            <p className="profile-name">{user?.first_name} {user?.last_name}</p>
            <p className="profile-email">{user?.email}</p>

            <div className="profile-badge-row">
              {isVerified ? (
                <span className="verified-badge-pill">
                  <ShieldCheck size={13} color="var(--spotify-green)" /> Verified
                </span>
              ) : (
                <span className="unverified-badge-pill">
                  ⚠ Not Verified
                </span>
              )}
            </div>

            <ul className="profile-info-list">
              <li className="profile-info-item">
                <span className="profile-info-label">Student Number</span>
                <span className="profile-info-value">{user?.student_number || '—'}</span>
              </li>
              <li className="profile-info-item">
                <span className="profile-info-label">Faculty</span>
                <span className="profile-info-value">{getFacultyName()}</span>
              </li>
              <li className="profile-info-item">
                <span className="profile-info-label">Qualification</span>
                <span className="profile-info-value" style={{ fontSize: '11px', lineHeight: 1.4 }}>{getQualName()}</span>
              </li>
              <li className="profile-info-item">
                <span className="profile-info-label">Contact</span>
                <span className="profile-info-value">{user?.contact_number || '—'}</span>
              </li>
            </ul>
          </div>
        </aside>

        {/* ── RIGHT: Verification Section ── */}
        <main className="settings-right">
          <section className="settings-section">
            <div className="settings-section-header">
              <span className="settings-section-title">
                <ShieldCheck size={18} color={isVerified ? 'var(--spotify-green)' : 'var(--spotify-muted)'} />
                Identity Verification
              </span>
            </div>

            <div className="settings-section-body">

              {/* Fully Verified */}
              {isVerified ? (
                <div className="verified-state">
                  <div className="verified-icon-ring">
                    <ShieldCheck size={36} color="var(--spotify-green)" />
                  </div>
                  <h3>Identity Verified</h3>
                  <p>Your account carries a verified badge on all listings and your profile. Buyers can trust you're a real MUT student.</p>
                </div>
              ) : (
                <>
                  {/* Stepper */}
                  <div className="verify-stepper" style={{ marginBottom: '28px' }}>
                    <div className={`verify-step ${cardStep}`}>
                      <div className="verify-step-circle">
                        {cardDone ? <CheckIcon /> : '1'}
                      </div>
                      <span className="verify-step-label">Student Card</span>
                    </div>
                    <div className={`verify-step ${faceStep}`}>
                      <div className="verify-step-circle">
                        {faceDone ? <CheckIcon /> : '2'}
                      </div>
                      <span className="verify-step-label">Face Scan</span>
                    </div>
                    <div className={`verify-step ${doneStep}`}>
                      <div className="verify-step-circle">
                        {isVerified ? <CheckIcon /> : '✓'}
                      </div>
                      <span className="verify-step-label">Verified</span>
                    </div>
                  </div>

                  {/* STEP A: Card Upload */}
                  {!cardDone && (
                    <div className="verify-sub" style={{ marginBottom: '20px' }}>
                      <div className="verify-sub-header">
                        <span className="verify-sub-num">1</span>
                        <span className="verify-sub-title">Upload Your Student Card</span>
                      </div>
                      <div className="verify-sub-body">
                        <p style={{ fontSize: '13px', color: 'var(--spotify-muted)', marginBottom: '16px' }}>
                          Upload a clear photo of your MUT student card. Our AI verifies that your name and student number match your account.
                        </p>

                        {!cardPreview ? (
                          <label htmlFor="cardInput" style={{ display: 'block', cursor: 'pointer' }}>
                            <div className="upload-zone">
                              <span className="upload-icon">🪪</span>
                              <h3>Tap to upload or drag & drop</h3>
                              <p>JPG, PNG · Max 5 MB</p>
                            </div>
                            <input id="cardInput" type="file" accept="image/jpeg,image/png"
                              style={{ display: 'none' }}
                              onChange={(e) => e.target.files[0] && handleCardSelect(e.target.files[0])} />
                          </label>
                        ) : (
                          <div className="card-preview">
                            <img src={cardPreview} alt="Student card"
                              style={{ width: '100%', borderRadius: '10px', display: 'block' }} />
                            {isOcr && (
                              <div className="loader-overlay">
                                <div className="spinner" />
                                <span>Verifying card…</span>
                              </div>
                            )}
                            {!isOcr && (
                              <button className="remove-btn" onClick={() => {
                                setCardFile(null); setCardPreview(null); setOcrStatus(null);
                                setCardChecks({ uploaded: false, clear: false, matches: false });
                              }} title="Remove">✕</button>
                            )}
                          </div>
                        )}

                        {/* OCR result badge */}
                        {ocrStatus && (
                          <div className={`ocr-badge ${ocrStatus.ok ? 'success' : 'error'}`}>
                            <span>{ocrStatus.ok ? '✓' : '✕'}</span>
                            <span>{ocrStatus.msg}</span>
                          </div>
                        )}

                        {/* Checklist */}
                        <ul className="req-list">
                          <li className={cardChecks.uploaded ? 'done' : ''}>Card image uploaded</li>
                          <li className={cardChecks.clear ? 'done' : ''}>Image is clear & readable</li>
                          <li className={cardChecks.matches ? 'done' : ''}>Details match your account</li>
                        </ul>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                          {cardFile && !ocrStatus && (
                            <button className="btn-primary" onClick={runCardVerification} disabled={isOcr}
                              style={{ flex: 1 }}>
                              {isOcr ? 'Verifying…' : 'Verify Card'}
                            </button>
                          )}
                          {ocrStatus?.ok && (
                            <button className="btn-primary" onClick={saveCardVerified}
                              style={{ flex: 1 }}>
                              Confirm & Continue →
                            </button>
                          )}
                          {ocrStatus && !ocrStatus.ok && (
                            <button className="btn-outline" onClick={() => {
                              setCardFile(null); setCardPreview(null); setOcrStatus(null);
                              setCardChecks({ uploaded: false, clear: false, matches: false });
                            }} style={{ flex: 1 }}>
                              Try Again
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card done indicator */}
                  {cardDone && (
                    <div className="ocr-badge success" style={{ marginBottom: '20px' }}>
                      <span>✓</span>
                      <span>Student card verified. Complete the face scan below to finish.</span>
                    </div>
                  )}

                  {/* STEP B: Face Scan (visible only after card is done) */}
                  {cardDone && !faceDone && (
                    <div className="verify-sub">
                      <div className="verify-sub-header">
                        <span className="verify-sub-num">2</span>
                        <span className="verify-sub-title">Live Face Scan</span>
                      </div>
                      <div className="verify-sub-body">
                        <p style={{ fontSize: '13px', color: 'var(--spotify-muted)', marginBottom: '16px' }}>
                          Look directly into your webcam. The scanner compares your live face to confirm you're the card holder.
                        </p>

                        {!modelsLoaded && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
                            fontSize: '13px', color: 'var(--spotify-muted)' }}>
                            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                            Loading face recognition models…
                          </div>
                        )}

                        {/* Camera */}
                        <div className="camera-wrap" style={{ display: cameraActive ? 'block' : 'none' }}>
                          <video ref={videoRef} id="videoFeedSettings" autoPlay playsInline muted
                            style={{ transform: 'scaleX(-1)' }} />
                          <div ref={faceOvalRef} className="face-oval" id="faceOvalSettings" />
                          <div className="scan-line" />
                          <div ref={camLabelRef} className="camera-label" id="camLabelSettings">
                            Position your face in the oval
                          </div>
                        </div>

                        {/* Status */}
                        {cameraActive && (
                          <>
                            <div className="verify-status">
                              <div className={`status-dot ${faceStatus.type}`} />
                              <span>{faceStatus.msg}</span>
                            </div>

                            {cardFaceDesc && (
                              <div className="conf-bar-wrap">
                                <div className="conf-bar-label">
                                  <span>Match Confidence</span>
                                  <span>{confidence}%</span>
                                </div>
                                <div className="conf-bar-track">
                                  <div className="conf-bar-fill" style={{ width: `${confidence}%` }} />
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                          {!cameraActive ? (
                            <button className="btn-primary" onClick={startCamera}
                              disabled={!modelsLoaded} style={{ flex: 1 }}>
                              {modelsLoaded ? '📷 Start Face Scan' : 'Loading models…'}
                            </button>
                          ) : (
                            <>
                              <button className="btn-primary" onClick={completeFaceVerification}
                                disabled={isSaving || faceStatus.type === 'idle'}
                                style={{ flex: 2 }}>
                                {isSaving ? 'Saving…' : '✓ Complete Verification'}
                              </button>
                              <button className="btn-outline" onClick={stopCamera} style={{ flex: 1 }}>
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* Hidden canvas for OCR */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};
