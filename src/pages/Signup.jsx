import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Tesseract from 'tesseract.js';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../utils/supabaseClient';
import '../styles/signup.css';

const FACE_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const FACE_MATCH_THRESHOLD = 0.45; // Euclidean distance threshold. Lower is stricter.

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

const CARD_SKIP_WORDS = new Set([
  'mangosuthu','university','technology','student','card','valid',
  'expires','mut','south','africa','issued','info','comms','eng',
  'engineering','science','management','accounting','marketing',
  'diploma','bachelor','advanced','postgraduate','master','faculty',
  'qualification','number','name','surname','applied','health',
]);

export const Signup = () => {
  const navigate = useNavigate();

  // Navigation Steps: 1 | 2 | 3
  const [step, setStep] = useState(1);

  // Step 1: Form Fields
  const [studentNo, setStudentNo] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [faculty, setFaculty] = useState('');
  const [qualification, setQualification] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password Visibility Toggle
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Validation Error states
  const [errors, setErrors] = useState({});

  // Password strength score (0-4)
  const [pwStrength, setPwStrength] = useState(0);

  // Step 2: Student Card Upload / OCR
  const [cardPreviewUrl, setCardPreviewUrl] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [cardVerified, setCardVerified] = useState(false);
  const [requirements, setRequirements] = useState({ uploaded: false, clear: false, match: false });
  const [ocrBadge, setOcrBadge] = useState({ show: false, success: false, text: '' });

  // Step 3: Webcam & Face Recognition
  const [cameraActive, setCameraActive] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState({ type: 'normal', msg: 'Camera starting…' });
  const [confidence, setConfidence] = useState(0);
  const [faceVerified, setFaceVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // References for camera
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const camLabelRef = useRef(null);

  // Face-api cached values
  const [cardFaceDescriptor, setCardFaceDescriptor] = useState(null);
  const [faceApiLoaded, setFaceApiLoaded] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });

  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  // ── Step Navigation ───────────────────────────────────
  const goStep = (n) => {
    setStep(n);
    if (n === 3) {
      initFaceVerification();
    } else {
      stopCamera();
    }
  };

  // Validate fields in Step 1
  const goStep2 = () => {
    if (!validateStep1()) {
      showToast('Please correct errors on the form.', 'error');
      return;
    }
    goStep(2);
  };

  const goStep3 = () => {
    if (!cardVerified) {
      showToast('Student card verification is required.', 'error');
      return;
    }
    goStep(3);
  };

  // ── Password strength evaluation ──────────────────────
  const evaluatePasswordStrength = (val) => {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    setPwStrength(score);
  };

  useEffect(() => {
    evaluatePasswordStrength(password);
  }, [password]);

  // Validate step 1 fields
  const validateStep1 = () => {
    const errs = {};
    if (!/^[0-9]{8}$/.test(studentNo.trim())) {
      errs.studentNo = 'Student number must be exactly 8 digits';
    }
    if (!email.trim() || !email.trim().toLowerCase().endsWith('@gmail.com')) {
      errs.email = 'Must be a valid @gmail.com address';
    }
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (!faculty) errs.faculty = 'Please select a faculty';
    if (!qualification) errs.qualification = 'Please select your qualification';
    if (!/^[0-9]{10}$/.test(contact.trim())) {
      errs.contact = 'Must be a valid 10-digit number';
    }
    if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Step 2: OCR OCR Rotation & Scoring ─────────────────
  const buildOCRCanvas = (img, degrees) => {
    const rad = (degrees * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const lw = Math.round(W * cos + H * sin);
    const lh = Math.round(W * sin + H * cos);
    const SC = 2; // scale factor to improve readability

    const canvas = document.createElement('canvas');
    canvas.width = lw * SC;
    canvas.height = lh * SC;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(SC, SC);
    ctx.translate(lw / 2, lh / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -W / 2, -H / 2);
    ctx.restore();

    // Convert to greyscale + contrast boost
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      g = g < 128 ? Math.max(0, g - 50) : Math.min(255, g + 50);
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(id, 0, 0);
    return canvas;
  };

  const scoreOCRText = (text) => {
    const t = text.toLowerCase();
    let score = 0;
    if (t.includes('mangosuthu')) score += 15;
    if (t.includes('mut')) score += 8;
    if (t.includes('student')) score += 8;
    if (t.includes('technology')) score += 6;
    if (/[0-9]{8}/.test(t)) score += 10;
    if (text.trim().length > 30) score += 5;
    return score;
  };

  const ocrBestRotation = async (dataUrl, onProgress) => {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });

    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress || 0) * 100));
        }
      }
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6' });

    const ROTATIONS = [0, 90, 270, 180];
    let bestText = '';
    let bestScore = -Infinity;

    for (const deg of ROTATIONS) {
      const canvas = buildOCRCanvas(img, deg);
      const { data } = await worker.recognize(canvas.toDataURL('image/png'));
      const text = data.text || '';
      const score = scoreOCRText(text);
      console.log(`[OCR] Rotation ${deg}°: score=${score}`);
      if (score > bestScore) {
        bestScore = score;
        bestText = text;
      }
      if (bestScore >= 30) break; // early exit if confident
    }

    await worker.terminate();
    return bestText;
  };

  const buildMatchTargets = () => {
    const targets = [];
    // 1. Surname
    if (lastName.trim()) {
      targets.push({ label: 'surname', value: lastName.trim().toLowerCase() });
    }
    // 2. Student Number
    if (/^[0-9]{8}$/.test(studentNo.trim())) {
      targets.push({ label: 'student number', value: studentNo.trim() });
    }
    // 3. Qualification terms
    const qualId = parseInt(qualification, 10);
    const allQuals = Object.values(QUALIFICATIONS).flat();
    const qualObj = allQuals.find(q => q.id === qualId);
    if (qualObj) {
      const qualWords = qualObj.name
        .toLowerCase()
        .split(/[\s,\/&]+/)
        .map(w => w.replace(/[^a-z]/g, ''))
        .filter(w => w.length >= 4 && !CARD_SKIP_WORDS.has(w));
      qualWords.forEach(w => targets.push({ label: `qualification word "${w}"`, value: w }));
    }
    return targets;
  };

  const fuzzyMatch = (a, b) => {
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    // Simple edit distance boundary for short words
    return false;
  };

  const findAnyMatch = (rawText, targets) => {
    const ocrTokens = rawText
      .split(/[\s\n\r,.\-_\/\\|:;()\[\]"'`]+/)
      .map(t => t.replace(/[^A-Za-z0-9]/g, '').toLowerCase())
      .filter(t => t.length >= 3);

    for (const target of targets) {
      const tv = target.value.toLowerCase();
      for (const token of ocrTokens) {
        const isNumber = /^[0-9]+$/.test(tv);
        if (isNumber) {
          if (token === tv) return { matched: true, label: target.label };
        } else {
          if (fuzzyMatch(token, tv)) return { matched: true, label: target.label };
        }
      }
      if (!/^[0-9]+$/.test(tv) && rawText.toLowerCase().includes(tv)) {
        return { matched: true, label: target.label };
      }
    }
    return { matched: false };
  };

  const handleCardUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Maximum file size is 5MB.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setCardPreviewUrl(dataUrl);
      setOcrProcessing(true);
      setRequirements({ uploaded: true, clear: false, match: false });
      setOcrBadge({ show: false, success: false, text: '' });
      setCardVerified(false);

      try {
        const rawText = await ocrBestRotation(dataUrl, (progress) => {
          setOcrProgress(progress);
        });

        setOcrProcessing(false);

        if (!rawText.trim()) {
          setRequirements(prev => ({ ...prev, clear: false }));
          setOcrBadge({ show: true, success: false, text: 'No text detected. Use a clearer, well-lit photo.' });
          showToast('OCR found no text. Try a sharper image.', 'error');
          return;
        }

        setRequirements(prev => ({ ...prev, clear: true }));
        const targets = buildMatchTargets();
        const result = findAnyMatch(rawText, targets);

        if (!result.matched) {
          setRequirements(prev => ({ ...prev, match: false }));
          setOcrBadge({ show: true, success: false, text: 'Could not match card details. Make sure student number/name match.' });
          showToast('Card matching failed.', 'error');
          return;
        }

        setRequirements(prev => ({ ...prev, match: true }));
        setOcrBadge({ show: true, success: true, text: `Verified ✓ matched your ${result.label} on the card` });
        setCardVerified(true);
        showToast('Student card verified!', 'success');

        // Preload Face Descriptor
        preloadCardFaceDescriptor(dataUrl);

      } catch (err) {
        console.error(err);
        setOcrProcessing(false);
        showToast('OCR processing failed. Try again.', 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  const removeCard = () => {
    setCardPreviewUrl(null);
    setCardVerified(false);
    setRequirements({ uploaded: false, clear: false, match: false });
    setOcrBadge({ show: false, success: false, text: '' });
    setCardFaceDescriptor(null);
  };

  // ── Step 3: Webcam Face Landmarks ─────────────────────
  const preloadCardFaceDescriptor = async (cardDataUrl) => {
    try {
      if (!faceApiLoaded) {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
        ]);
        setFaceApiLoaded(true);
      }

      const img = await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.src = cardDataUrl;
      });

      const detection = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        setCardFaceDescriptor(detection.descriptor);
        console.log('[FaceID] Card face descriptor cached.');
      } else {
        console.warn('[FaceID] No face detected on the student card image.');
      }
    } catch (err) {
      console.warn('[FaceID] Preloading descriptor error:', err);
    }
  };

  const initFaceVerification = async () => {
    setCameraActive(true);
    setLoadingModels(true);
    setVerifyStatus({ type: 'normal', msg: 'Loading AI models…' });
    setConfidence(0);

    try {
      if (!faceApiLoaded) {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL),
        ]);
        setFaceApiLoaded(true);
      }

      setLoadingModels(false);
      setVerifyStatus({ type: 'normal', msg: 'Opening camera…' });

      // Start webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = resolve;
          setTimeout(resolve, 3000);
        });
        videoRef.current.play();
      }

      setVerifyStatus({ type: 'normal', msg: 'Position your face in the oval' });
      startFaceCaptureLoop();

    } catch (err) {
      setLoadingModels(false);
      setVerifyStatus({ type: 'error', msg: 'Failed to initialize face scanning' });
      showToast('Camera opening failed. Check webcam permissions.', 'error');
    }
  };

  const startFaceCaptureLoop = () => {
    stopFaceCaptureLoop();
    let consecutive = 0;
    const NEEDED = 3;
    let detectRunning = false;

    faceIntervalRef.current = setInterval(async () => {
      if (detectRunning || !streamRef.current || !streamRef.current.active) return;
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      detectRunning = true;
      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          setConfidence(0);
          setVerifyStatus({ type: 'checking', msg: 'Position your face in the oval' });
          if (camLabelRef.current) camLabelRef.current.textContent = 'Position your face in the oval';
          consecutive = 0;
        } else {
          // If we failed to get a reference descriptor from the card, load it now from preview url
          let refDescriptor = cardFaceDescriptor;
          if (!refDescriptor && cardPreviewUrl) {
            const img = await new Promise((resolve) => {
              const i = new Image();
              i.onload = () => resolve(i);
              i.src = cardPreviewUrl;
            });
            const cardDetect = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
            if (cardDetect) {
              refDescriptor = cardDetect.descriptor;
              setCardFaceDescriptor(refDescriptor);
            }
          }

          if (!refDescriptor) {
            setVerifyStatus({ type: 'error', msg: 'Failed to extract face from card image — go back' });
            consecutive = 0;
            detectRunning = false;
            return;
          }

          const dist = faceapi.euclideanDistance(detection.descriptor, refDescriptor);
          const computedConf = Math.max(0, Math.min(1, 1 - dist));
          setConfidence(computedConf);

          if (dist < FACE_MATCH_THRESHOLD) {
            consecutive++;
            const pct = Math.round(computedConf * 100);
            setVerifyStatus({ type: 'checking', msg: `Matching… ${consecutive}/${NEEDED} frames matched` });
            if (camLabelRef.current) camLabelRef.current.textContent = `Match ${pct}% — hold still…`;

            if (consecutive >= NEEDED) {
              stopFaceCaptureLoop();
              setFaceVerified(true);
              setVerifyStatus({ type: 'success', msg: `Identity matched with ${pct}% confidence!` });
              if (camLabelRef.current) camLabelRef.current.textContent = `✓ Face matched (${pct}% confidence)`;
              showToast('Face identity matched!', 'success');
            }
          } else {
            consecutive = 0;
            setVerifyStatus({ type: 'checking', msg: 'Face not matching card — verify card image clarity' });
            if (camLabelRef.current) camLabelRef.current.textContent = 'Face not matching card';
          }
        }
      } catch (err) {
        console.warn('Face capture loop exception:', err);
      } finally {
        detectRunning = false;
      }
    }, 500);
  };

  const stopFaceCaptureLoop = () => {
    if (faceIntervalRef.current) {
      clearInterval(faceIntervalRef.current);
      faceIntervalRef.current = null;
    }
  };

  const stopCamera = () => {
    stopFaceCaptureLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ── Final Registration Submission ────────────────────
  const submitRegistration = async () => {
    if (!cardVerified) {
      showToast('Student card verification is required.', 'error');
      return;
    }
    if (!faceVerified) {
      showToast('Live face comparison is required.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create Supabase Auth SignUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
      });

      if (authError) {
        showToast(authError.message, 'error');
        setIsSubmitting(false);
        return;
      }

      const userId = authData.user?.id;
      if (!userId) {
        showToast('Registration failed — no user ID returned.', 'error');
        setIsSubmitting(false);
        return;
      }

      // 2. Insert Student Row (no password stored — Supabase Auth handles credentials securely)
      const { error: insertError } = await supabase.from('students').insert({
        student_id: userId,
        student_number: studentNo.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        contact_number: contact.trim(),
        qualification_id: parseInt(qualification, 10),
        account_status: 'pending',
        email_verified: false,
        face_verified: true,
        card_verified: true,
      });

      if (insertError) {
        showToast(insertError.message, 'error');
        setIsSubmitting(false);
        return;
      }

      // 3. Upload student card file
      let cardImageUrl = null;
      if (cardPreviewUrl) {
        try {
          const res = await fetch(cardPreviewUrl);
          const blob = await res.blob();
          const ext = blob.type === 'image/png' ? 'png' : 'jpg';
          const filePath = `student-cards/${userId}.${ext}`;

          const { error: uploadErr } = await supabase.storage
            .from('student-cards')
            .upload(filePath, blob, { contentType: blob.type, upsert: true });

          if (uploadErr) {
            console.warn('[signup] Card image upload failed:', uploadErr.message);
          } else {
            const { data: urlData } = supabase.storage
              .from('student-cards')
              .getPublicUrl(filePath);
            cardImageUrl = urlData?.publicUrl || null;
          }
        } catch (uploadEx) {
          console.warn('[signup] Card upload exception:', uploadEx.message);
        }
      }

      if (cardImageUrl) {
        await supabase
          .from('students')
          .update({ card_image_url: cardImageUrl })
          .eq('student_id', userId);
      }

      // 4. Save face descriptor
      if (cardFaceDescriptor) {
        const descriptorArray = Array.from(cardFaceDescriptor);
        const { error: faceError } = await supabase.from('face_descriptors').insert({
          student_id: userId,
          descriptor: descriptorArray,
        });
        if (faceError) {
          console.warn('[signup] Face descriptor save failed:', faceError.message);
        }
      }

      stopCamera();
      showToast('Registration submitted! Verification pending admin approval.', 'success');
      setTimeout(() => navigate('/login'), 2500);

    } catch (err) {
      console.error(err);
      showToast('An unexpected error occurred.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-wrap">
      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast show ${toast.type}`} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1050 }}>
          {toast.msg}
        </div>
      )}

      <div className="logo" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img src="/images/2.svg" alt="UniMarket Logo" style={{ height: '42px', width: 'auto' }} />
        <span className="logo-text">Uni<span>Market</span></span>
      </div>

      {/* Progress Stepper */}
      <div className="stepper">
        <div className={`step-item ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`} id="si1">
          <div className="step-circle" id="sc1">1</div>
          <span className="step-label">Your Info</span>
        </div>
        <div className={`step-item ${step === 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`} id="si2">
          <div className="step-circle" id="sc2">2</div>
          <span className="step-label">Student Card</span>
        </div>
        <div className={`step-item ${step === 3 ? 'active' : ''}`} id="si3">
          <div className="step-circle" id="sc3">3</div>
          <span className="step-label">Face Verify</span>
        </div>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: '640px', padding: '30px' }}>
        {/* ====================================================
             STEP 1: PERSONAL INFORMATION
             ==================================================== */}
        {step === 1 && (
          <div className="step-panel active" id="step1">
            <h2>Create your account</h2>
            <p className="subtitle">MUT students only · Use your personal @gmail.com address</p>

            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="studentNo">Student Number</label>
                <input 
                  type="text" 
                  id="studentNo" 
                  placeholder="e.g. 21234567" 
                  value={studentNo}
                  onChange={(e) => setStudentNo(e.target.value)}
                />
                {errors.studentNo && <span className="field-err" style={{ display: 'block' }}>{errors.studentNo}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  placeholder="yourname@gmail.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {errors.email && <span className="field-err" style={{ display: 'block' }}>{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input 
                  type="text" 
                  id="firstName" 
                  placeholder="First name" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                {errors.firstName && <span className="field-err" style={{ display: 'block' }}>{errors.firstName}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input 
                  type="text" 
                  id="lastName" 
                  placeholder="Last name" 
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
                {errors.lastName && <span className="field-err" style={{ display: 'block' }}>{errors.lastName}</span>}
              </div>

              <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="faculty">Faculty</label>
                <div className="select-wrap">
                  <select 
                    id="faculty" 
                    value={faculty}
                    onChange={(e) => { setFaculty(e.target.value); setQualification(''); }}
                  >
                    <option value="">— Select your faculty —</option>
                    <option value="1">Faculty of Applied and Health Sciences</option>
                    <option value="2">Faculty of Engineering</option>
                    <option value="3">Faculty of Management Sciences</option>
                  </select>
                </div>
                {errors.faculty && <span className="field-err" style={{ display: 'block' }}>{errors.faculty}</span>}
              </div>

              {faculty && (
                <div className="form-group full-width" id="qualificationGroup" style={{ gridColumn: 'span 2' }}>
                  <label htmlFor="qualification">Qualification</label>
                  <div className="select-wrap">
                    <select 
                      id="qualification"
                      value={qualification}
                      onChange={(e) => setQualification(e.target.value)}
                    >
                      <option value="">— Select your qualification —</option>
                      {(QUALIFICATIONS[faculty] || []).map((q) => (
                        <option key={q.id} value={q.id}>{q.name}</option>
                      ))}
                    </select>
                  </div>
                  {errors.qualification && <span className="field-err" style={{ display: 'block' }}>{errors.qualification}</span>}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="contact">Contact Number</label>
                <input 
                  type="tel" 
                  id="contact" 
                  placeholder="0812345678" 
                  maxLength="10"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
                {errors.contact && <span className="field-err" style={{ display: 'block' }}>{errors.contact}</span>}
              </div>

              <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="password">Password</label>
                <div className="pw-wrap">
                  <input 
                    type={showPw ? 'text' : 'password'} 
                    id="password" 
                    placeholder="Create a password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    className="eye-btn" 
                    onClick={() => setShowPw(!showPw)}
                    aria-label="Toggle password"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
                <div className="pw-strength">
                  <div className={`pw-bar ${pwStrength >= 1 ? 'strength-weak' : ''}`}></div>
                  <div className={`pw-bar ${pwStrength >= 2 ? 'strength-fair' : ''}`}></div>
                  <div className={`pw-bar ${pwStrength >= 3 ? 'strength-good' : ''}`}></div>
                  <div className={`pw-bar ${pwStrength >= 4 ? 'strength-strong' : ''}`}></div>
                </div>
                {errors.password && <span className="field-err" style={{ display: 'block' }}>{errors.password}</span>}
              </div>

              <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
                <label htmlFor="confirmPw">Confirm Password</label>
                <div className="pw-wrap">
                  <input 
                    type={showConfirmPw ? 'text' : 'password'} 
                    id="confirmPw" 
                    placeholder="Repeat password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    className="eye-btn" 
                    onClick={() => setShowConfirmPw(!showConfirmPw)} 
                    aria-label="Toggle password"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
                {errors.confirmPassword && <span className="field-err" style={{ display: 'block' }}>{errors.confirmPassword}</span>}
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-primary" onClick={goStep2}>
                Continue &nbsp;→
              </button>
            </div>
          </div>
        )}

        {/* ====================================================
             STEP 2: STUDENT CARD UPLOAD
             ==================================================== */}
        {step === 2 && (
          <div className="step-panel active" id="step2">
            <h2>Upload Student Card</h2>
            <p className="subtitle">Upload a clear photo of your MUT student card. Tesseract AI verifies that details match your registration info.</p>

            {!cardPreviewUrl ? (
              <div 
                className="upload-zone" 
                id="uploadZone"
                onClick={() => document.getElementById('cardFileInput').click()}
                style={{ cursor: 'pointer' }}
              >
                <span className="upload-icon">🪪</span>
                <h3>Tap to upload or drag &amp; drop</h3>
                <p>JPG, PNG · Max 5 MB</p>
                <input 
                  type="file" 
                  id="cardFileInput" 
                  accept="image/*" 
                  style={{ display: 'none' }}
                  onChange={handleCardUpload}
                />
              </div>
            ) : (
              <div className="card-preview" id="cardPreview" style={{ display: 'block', position: 'relative' }}>
                <img id="cardPreviewImg" src={cardPreviewUrl} alt="Student Card Preview" style={{ width: '100%', borderRadius: '8px' }} />
                {!ocrProcessing && (
                  <button type="button" className="remove-btn" onClick={removeCard} aria-label="Remove card">✕</button>
                )}
                
                {ocrProcessing && (
                  <div className="loader-overlay" id="ocrLoader" style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="spinner"></div>
                    <p id="ocrLoaderMsg">Reading card… {ocrProgress}%</p>
                  </div>
                )}
              </div>
            )}

            {ocrBadge.show && (
              <div className={`ocr-badge ${ocrBadge.success ? 'success' : 'error'}`} id="ocrBadge" style={{ display: 'flex' }}>
                <span className="ocr-icon">{ocrBadge.success ? '✓' : '⚠️'}</span>
                <span id="ocrBadgeText">{ocrBadge.text}</span>
              </div>
            )}

            <ul className="req-list">
              <li className={requirements.uploaded ? 'done' : ''} id="req-uploaded">Card image uploaded</li>
              <li className={requirements.clear ? 'done' : ''} id="req-clear">Image is clear &amp; readable</li>
              <li className={requirements.match ? 'done' : ''} id="req-match">Details match your signup info</li>
            </ul>

            <div className="btn-row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button type="button" className="btn-outline" onClick={() => goStep(1)}>← Back</button>
              <button 
                type="button" 
                className="btn-primary" 
                id="btnStep2Next" 
                onClick={goStep3} 
                disabled={!cardVerified}
              >
                Continue &nbsp;→
              </button>
            </div>
          </div>
        )}

        {/* ====================================================
             STEP 3: AI FACE VERIFICATION
             ==================================================== */}
        {step === 3 && (
          <div className="step-panel active" id="step3">
            <h2>Face Verification</h2>
            <p className="subtitle">Look directly into your webcam. The scanner compares your live face against your card photo to verify your identity.</p>

            <div className="camera-wrap" id="cameraWrap" style={{ display: 'block' }}>
              <video ref={videoRef} id="videoFeed" autoPlay playsInline muted style={{ transform: 'scaleX(-1)' }}></video>
              <div className="face-oval" id="faceOval"></div>
              <div className="camera-label" id="camLabel">Position your face in the oval</div>
              
              {loadingModels && (
                <div className="loader-overlay" id="modelLoader" style={{ display: 'flex' }}>
                  <div className="spinner"></div>
                  <p>Loading AI models…</p>
                </div>
              )}
            </div>

            <div className="verify-status" id="verifyStatus">
              <div className={`status-dot ${verifyStatus.type}`}></div>
              <span id="verifyMsg">{verifyStatus.msg}</span>
            </div>

            {cameraActive && (
              <div className="conf-bar-wrap" id="confBarWrap" style={{ display: 'block' }}>
                <div className="conf-bar-label">
                  <span>Match confidence</span>
                  <span id="confPct">{Math.round(confidence * 100)}%</span>
                </div>
                <div className="conf-bar-track">
                  <div className="conf-bar-fill" id="confFill" style={{ width: `${confidence * 100}%` }}></div>
                </div>
              </div>
            )}

            <div className="btn-row" style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button 
                type="button" 
                className="btn-outline" 
                onClick={() => { stopCamera(); goStep(2); }}
              >
                ← Back
              </button>
              <button 
                type="button" 
                className="btn-primary" 
                id="btnSubmitFinal" 
                onClick={submitRegistration}
                disabled={!faceVerified || isSubmitting}
              >
                {isSubmitting ? 'Registering...' : '✔ Complete Registration'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="login-link">Already have an account? <Link to="/login">Log in here</Link></p>
    </div>
  );
};
