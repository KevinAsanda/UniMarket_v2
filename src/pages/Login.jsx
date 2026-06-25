import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import '../styles/login.css';

const MODELS_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
const FACE_THRESHOLD = 0.4; // Euclidean distance threshold (lower is stricter)

export const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();

  // Tab State: 'password' | 'face'
  const [activeTab, setActiveTab] = useState('password');
  
  // Credentials Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Student'); // 'Student' | 'Admin'
  const [rememberMe, setRememberMe] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr] = useState(false);

  // Lockout States
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);

  // Face Login Form State
  const [faceEmail, setFaceEmail] = useState('');
  const [faceEmailErr, setFaceEmailErr] = useState(false);
  const [isFaceStarting, setIsFaceStarting] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState({ type: 'normal', msg: 'Enter your email and click Start Face Login' });
  const [confidence, setConfidence] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [showModelsLoader, setShowModelsLoader] = useState(false);
  const [showSuccessFlash, setShowSuccessFlash] = useState(false);
  const [isFaceSigningIn, setIsFaceSigningIn] = useState(false);

  // Refs for webcam
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);
  const faceOvalRef = useRef(null);
  const camLabelRef = useRef(null);

  // Stored variables
  const [storedDescriptor, setStoredDescriptor] = useState(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Toast State
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });

  // Forgot Password Modal State
  const [showForgot, setShowForgot] = useState(false);
  const [fpEmail, setFpEmail] = useState('');
  const [fpStudentNo, setFpStudentNo] = useState('');

  // Show Toast helper
  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  // ── Password Strength / Lockout Setup ─────────────────
  useEffect(() => {
    // Restore lockout on mount
    const savedLock = localStorage.getItem('um_lockout_until');
    if (savedLock) {
      const remaining = Math.round((parseInt(savedLock, 10) - Date.now()) / 1000);
      if (remaining > 0) {
        setLockoutTime(remaining);
        const timer = setInterval(() => {
          setLockoutTime((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              localStorage.removeItem('um_lockout_until');
              localStorage.setItem('um_failed_attempts', '0');
              setAttempts(0);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        return () => clearInterval(timer);
      } else {
        localStorage.removeItem('um_lockout_until');
        localStorage.setItem('um_failed_attempts', '0');
      }
    }

    const savedAttempts = localStorage.getItem('um_failed_attempts');
    if (savedAttempts) {
      setAttempts(parseInt(savedAttempts, 10));
    }
  }, []);

  // Format lockout timer
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ── Tab Toggling ──────────────────────────────────────
  const switchTab = (tab) => {
    setActiveTab(tab);
    stopCamera();
  };

  // ── Password authentication ───────────────────────────
  const submitPassword = async () => {
    setEmailErr(!email);
    setPwErr(!password);
    if (!email || !password) return;

    if (lockoutTime > 0) {
      showToast('Account is currently locked. Please wait.', 'error');
      return;
    }

    const cleanEmail = email.trim();

    try {
      if (role === 'Admin') {
        // Query Admins Table
        const { data: adminRow, error: adminErr } = await supabase
          .from('admins')
          .select('*')
          .eq('email', cleanEmail)
          .single();

        if (adminErr || !adminRow || adminRow.password !== password) {
          handleFailedAttempt();
          showToast('Invalid admin credentials.', 'error');
          return;
        }

        // Setup Admin Session
        sessionStorage.setItem('um_role', 'admin');
        sessionStorage.setItem('um_admin_id', adminRow.admin_id);
        sessionStorage.setItem('um_admin_name', `${adminRow.first_name} ${adminRow.last_name}`);
        localStorage.setItem('um_failed_attempts', '0');
        setAttempts(0);

        showToast('Admin login successful! Redirecting...', 'success');
        setTimeout(() => navigate('/admin'), 1500);
      } else {
        // Student path: authenticate via Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password,
        });

        if (authError) {
          handleFailedAttempt();
          showToast(authError.message, 'error');
          return;
        }

        // Fetch Student Profile
        const { data: student, error: studentErr } = await supabase
          .from('students')
          .select('*')
          .eq('student_id', authData.user.id)
          .single();

        if (studentErr || !student) {
          handleFailedAttempt();
          showToast('Failed to load student profile.', 'error');
          return;
        }

        if (student.account_status === 'pending') {
          showToast('Your account is pending admin approval.', 'warning');
          await supabase.auth.signOut();
          return;
        }

        if (student.account_status === 'suspended' || student.account_status === 'banned') {
          showToast('Your account is suspended or banned. Access denied.', 'error');
          await supabase.auth.signOut();
          return;
        }

        // Success
        sessionStorage.setItem('um_role', 'student');
        localStorage.setItem('um_failed_attempts', '0');
        setAttempts(0);

        // Update context
        setUser(student);

        showToast(`Welcome back, ${student.first_name}!`, 'success');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      console.error(err);
      showToast('An unexpected error occurred.', 'error');
    }
  };

  const handleFailedAttempt = () => {
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    localStorage.setItem('um_failed_attempts', nextAttempts.toString());

    if (nextAttempts >= 5) {
      const until = Date.now() + 5 * 60 * 1000;
      localStorage.setItem('um_lockout_until', until.toString());
      setLockoutTime(300);
      const timer = setInterval(() => {
        setLockoutTime((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            localStorage.removeItem('um_lockout_until');
            localStorage.setItem('um_failed_attempts', '0');
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  // ── Face Authentication ───────────────────────────────
  const startFaceLogin = async () => {
    if (!faceEmail) {
      setFaceEmailErr(true);
      return;
    }
    setFaceEmailErr(false);
    setIsFaceStarting(true);
    setFaceVerified(false);
    setStoredDescriptor(null);
    setConfidence(0);

    setVerifyStatus({ type: 'checking', msg: 'Looking up your face profile…' });
    setShowCamera(true);

    try {
      // 1. Resolve student profile from email
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select('student_id, account_status, first_name')
        .eq('email', faceEmail.trim())
        .single();

      if (sErr || !student) {
        setVerifyStatus({ type: 'error', msg: 'No account found for this email' });
        setShowCamera(false);
        showToast('No account found for this email.', 'error');
        setIsFaceStarting(false);
        return;
      }

      if (student.account_status === 'pending') {
        setVerifyStatus({ type: 'error', msg: 'Account is pending admin approval' });
        setShowCamera(false);
        showToast('Your account is pending admin approval.', 'error');
        setIsFaceStarting(false);
        return;
      }

      if (student.account_status === 'suspended' || student.account_status === 'banned') {
        setVerifyStatus({ type: 'error', msg: 'Account suspended — contact admin' });
        setShowCamera(false);
        showToast('Your account has been suspended.', 'error');
        setIsFaceStarting(false);
        return;
      }

      // 2. Fetch descriptor
      const { data: faceRow, error: fErr } = await supabase
        .from('face_descriptors')
        .select('descriptor')
        .eq('student_id', student.student_id)
        .single();

      if (fErr || !faceRow || !faceRow.descriptor) {
        setVerifyStatus({ type: 'error', msg: 'No face profile found — use password login' });
        setShowCamera(false);
        showToast('No face profile on record. Please use password login.', 'error');
        setIsFaceStarting(false);
        return;
      }

      const descriptorArray = new Float32Array(faceRow.descriptor);
      setStoredDescriptor(descriptorArray);

      // 3. Load face-api models if needed
      setVerifyStatus({ type: 'checking', msg: 'Loading AI models…' });
      setShowModelsLoader(true);

      if (!modelsLoaded) {
        try {
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL),
          ]);
          setModelsLoaded(true);
        } catch (modelErr) {
          setShowModelsLoader(false);
          setVerifyStatus({ type: 'error', msg: 'Failed to load AI models' });
          setShowCamera(false);
          showToast('Could not load Face AI models.', 'error');
          setIsFaceStarting(false);
          return;
        }
      }
      setShowModelsLoader(false);

      // 4. Open webcam
      setVerifyStatus({ type: 'checking', msg: 'Opening camera…' });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await new Promise((resolve) => {
            videoRef.current.onloadedmetadata = resolve;
            setTimeout(resolve, 3000); // safety timeout
          });
          videoRef.current.play();
        }
      } catch (camErr) {
        setVerifyStatus({ type: 'error', msg: 'Camera access denied' });
        setShowCamera(false);
        showToast('Please allow camera access and try again.', 'error');
        setIsFaceStarting(false);
        return;
      }

      // 5. Start scanning loop
      setIsFaceStarting(false);
      setVerifyStatus({ type: 'checking', msg: 'Looking for your face…' });
      startDetectionLoop(descriptorArray);

    } catch (err) {
      console.error(err);
      setVerifyStatus({ type: 'error', msg: 'Something went wrong — please try again' });
      setShowCamera(false);
      setIsFaceStarting(false);
    }
  };

  const startDetectionLoop = (descriptorToMatch) => {
    stopDetectionLoop();
    let consecutive = 0;
    const NEEDED = 4;
    let detectRunning = false;

    detectIntervalRef.current = setInterval(async () => {
      if (detectRunning || !streamRef.current || !streamRef.current.active) return;
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      detectRunning = true;
      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) {
          if (faceOvalRef.current) faceOvalRef.current.classList.remove('detected');
          if (camLabelRef.current) camLabelRef.current.textContent = 'Position your face in the oval';
          consecutive = 0;
          setVerifyStatus({ type: 'checking', msg: 'No face detected — look directly at the camera' });
          setConfidence(0);
        } else {
          if (faceOvalRef.current) faceOvalRef.current.classList.add('detected');

          const dist = faceapi.euclideanDistance(detection.descriptor, descriptorToMatch);
          const computedConf = Math.max(0, Math.min(1, 1 - dist));
          setConfidence(computedConf);

          if (dist < FACE_THRESHOLD) {
            consecutive++;
            const pct = Math.round(computedConf * 100);
            setVerifyStatus({ type: 'checking', msg: `Verifying… ${consecutive}/${NEEDED} frames matched` });
            if (camLabelRef.current) camLabelRef.current.textContent = `Match ${pct}% — hold still…`;

            if (consecutive >= NEEDED) {
              stopDetectionLoop();
              setFaceVerified(true);
              setVerifyStatus({ type: 'success', msg: `Face matched — ${pct}% confidence` });
              if (camLabelRef.current) camLabelRef.current.textContent = `✓ Face matched (${pct}% confidence)`;
              setShowSuccessFlash(true);
              setTimeout(() => setShowSuccessFlash(false), 600);
              showToast('Face recognized! Click "Complete Face Login" to proceed.', 'success');
            }
          } else {
            consecutive = 0;
            const hint = computedConf > 0.35
              ? 'Almost — move a little closer or adjust lighting'
              : 'Face not matching — look straight at camera';
            setVerifyStatus({ type: 'checking', msg: hint });
            if (camLabelRef.current) camLabelRef.current.textContent = 'Adjust position…';
          }
        }
      } catch (err) {
        console.warn('Face detection loop exception:', err);
      } finally {
        detectRunning = false;
      }
    }, 500);
  };

  const stopDetectionLoop = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
  };

  const stopCamera = () => {
    stopDetectionLoop();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const submitFaceLogin = async () => {
    if (!faceVerified) return;
    setIsFaceSigningIn(true);

    try {
      const cleanEmail = faceEmail.trim();

      // Call the server-side face-login Edge Function to get a real Supabase session.
      // The server re-validates account status and creates the session using the service-role key.
      // This prevents client-side sessionStorage spoofing.
      const { data: fnData, error: fnError } = await supabase.functions.invoke('face-login', {
        body: { email: cleanEmail },
      });

      if (fnError || !fnData?.access_token) {
        const msg = fnData?.error || fnError?.message || 'Face login failed. Please use password login.';
        showToast(msg, 'error');
        setIsFaceSigningIn(false);
        return;
      }

      // Store the real Supabase session — no more sessionStorage spoofing
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: fnData.access_token,
        refresh_token: fnData.refresh_token,
      });

      if (sessionError) {
        showToast('Session creation failed. Please use password login.', 'error');
        setIsFaceSigningIn(false);
        return;
      }

      sessionStorage.setItem('um_role', 'student');
      stopCamera();

      showToast(`Welcome back, ${fnData.first_name}!`, 'success');
      setTimeout(() => navigate('/'), 1500);

    } catch (err) {
      console.error(err);
      showToast('Face sign in failed. Please try password login.', 'error');
      setIsFaceSigningIn(false);
    }
  };

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ── Forgot Password ───────────────────────────────────
  const submitForgot = async () => {
    if (!fpEmail) {
      showToast('Please enter your email address.', 'error');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(fpEmail.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) {
        showToast('Could not send reset email. Check the address and try again.', 'error');
        return;
      }

      showToast('Password reset link sent! Check your email inbox.', 'success');
      setShowForgot(false);
    } catch (err) {
      showToast('Password recovery failed.', 'error');
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

      <div className="card">
        <div className="card-header">
          <h2>Welcome back</h2>
          <p className="subtitle">Sign in to access the campus marketplace</p>
        </div>

        {/* Tab Row */}
        <div className="tab-row">
          <button 
            className={`tab ${activeTab === 'password' ? 'active' : ''}`} 
            onClick={() => switchTab('password')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Password
          </button>
          <button 
            className={`tab ${activeTab === 'face' ? 'active' : ''}`} 
            onClick={() => switchTab('face')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/><path d="M9 12.5s1 1.5 3 1.5 3-1.5 3-1.5"/><path d="M9 9h.01M15 9h.01"/></svg>
            Face ID
          </button>
        </div>

        {/* ── PANEL A: PASSWORD LOGIN ── */}
        {activeTab === 'password' && (
          <div className="login-panel active" id="panelPassword">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input 
                type="email" 
                id="email" 
                placeholder="your@email.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailErr && <span className="field-err" style={{ display: 'block' }}>Please enter a valid email</span>}
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password">Password</label>
                <a href="#" className="forgot-link" onClick={(e) => { e.preventDefault(); setShowForgot(true); }}>Forgot password?</a>
              </div>
              <div className="pw-wrap">
                <input 
                  type="password" 
                  id="password" 
                  placeholder="Enter your password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }}
                />
              </div>
              {pwErr && <span className="field-err" style={{ display: 'block' }}>Please enter your password</span>}
            </div>

            {/* Role selector */}
            <div className="role-row">
              <span className="role-label">Login as</span>
              <div className="role-pills">
                <button 
                  className={`role-pill ${role === 'Student' ? 'active' : ''}`} 
                  onClick={() => setRole('Student')}
                >
                  Student
                </button>
                <button 
                  className={`role-pill ${role === 'Admin' ? 'active' : ''}`} 
                  onClick={() => setRole('Admin')}
                >
                  Admin
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="remember-row">
              <input 
                type="checkbox" 
                id="rememberMe" 
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="custom-check"></span>
              <span>Remember me</span>
            </label>

            {/* Attempts bar */}
            {attempts > 0 && lockoutTime === 0 && (
              <div className="attempt-bar" style={{ display: 'flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{5 - attempts} attempts remaining before lock</span>
              </div>
            )}

            {/* Lockout bar */}
            {lockoutTime > 0 && (
              <div className="lockout-bar" style={{ display: 'flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Account locked. Try again in <strong>{formatTime(lockoutTime)}</strong></span>
              </div>
            )}

            <button 
              type="button" 
              className="btn-primary" 
              id="btnLogin" 
              onClick={submitPassword}
              disabled={lockoutTime > 0}
            >
              Sign In
            </button>
          </div>
        )}

        {/* ── PANEL B: FACE ID LOGIN ── */}
        {activeTab === 'face' && (
          <div className="login-panel active" id="panelFace">
            <div className="form-group">
              <label htmlFor="faceEmail">Your Email</label>
              <input 
                type="email" 
                id="faceEmail" 
                placeholder="your@email.com" 
                value={faceEmail}
                onChange={(e) => setFaceEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') startFaceLogin(); }}
                disabled={showCamera}
              />
              {faceEmailErr && <span className="field-err" style={{ display: 'block' }}>Please enter your email first</span>}
            </div>

            {!showCamera ? (
              <button 
                type="button" 
                className="btn-primary" 
                id="btnStartFace" 
                onClick={startFaceLogin} 
                style={{ marginBottom: '16px' }}
                disabled={isFaceStarting}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/></svg>
                &nbsp;{isFaceStarting ? 'Loading...' : 'Start Face Login'}
              </button>
            ) : (
              <button 
                type="button" 
                className="btn-outline" 
                onClick={stopCamera} 
                style={{ marginBottom: '16px', width: '100%' }}
              >
                Stop Camera
              </button>
            )}

            {/* Camera View */}
            <div className="camera-wrap" id="cameraWrap" style={{ display: showCamera ? 'block' : 'none' }}>
              <video ref={videoRef} id="videoFeed" autoplay playsInline muted style={{ transform: 'scaleX(-1)' }}></video>
              <div ref={faceOvalRef} className="face-oval" id="faceOval"></div>
              <div className="scan-line" id="scanLine"></div>
              <div ref={camLabelRef} className="camera-label" id="camLabel">Position your face in the oval</div>

              {showModelsLoader && (
                <div className="loader-overlay" id="modelLoader" style={{ display: 'flex' }}>
                  <div className="spinner"></div>
                  <p>Loading Face AI…</p>
                </div>
              )}

              {showSuccessFlash && (
                <div className="success-flash show" id="successFlash"></div>
              )}
            </div>

            {/* Status Strip */}
            <div className="verify-status" id="verifyStatus">
              <div className={`status-dot ${verifyStatus.type}`}></div>
              <span id="verifyMsg">{verifyStatus.msg}</span>
            </div>

            {/* Confidence Bar */}
            {showCamera && (
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

            <button 
              type="button" 
              className="btn-primary" 
              id="btnFaceLogin" 
              onClick={submitFaceLogin} 
              disabled={!faceVerified || isFaceSigningIn} 
              style={{ marginTop: '14px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              &nbsp;{isFaceSigningIn ? 'Logging in...' : 'Complete Face Login'}
            </button>
          </div>
        )}

        <p className="signup-link">
          Don't have an account? <Link to="/signup">Sign up here</Link>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="modal-backdrop" id="forgotModal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box">
            <button className="modal-close" onClick={() => setShowForgot(false)} aria-label="Close">✕</button>
            <h3>Reset Password</h3>
            <p>Enter your email address and we'll send you a secure password reset link.</p>
            <div className="form-group">
              <label htmlFor="fpEmail">Email</label>
              <input 
                type="email" 
                id="fpEmail" 
                placeholder="your@email.com" 
                value={fpEmail}
                onChange={(e) => setFpEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitForgot(); }}
              />
            </div>
            <button type="button" className="btn-primary" style={{ marginTop: '18px' }} onClick={submitForgot}>
              Send Reset Link
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
