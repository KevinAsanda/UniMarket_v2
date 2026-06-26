import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import '../styles/signup.css';

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

export const Signup = () => {
  const navigate = useNavigate();

  // Form state
  const [studentNo, setStudentNo]           = useState('');
  const [email, setEmail]                   = useState('');
  const [firstName, setFirstName]           = useState('');
  const [lastName, setLastName]             = useState('');
  const [faculty, setFaculty]               = useState('');
  const [qualification, setQualification]   = useState('');
  const [contact, setContact]               = useState('');
  const [password, setPassword]             = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [showPw, setShowPw]               = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [errors, setErrors]               = useState({});
  const [pwStrength, setPwStrength]       = useState(0);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [toast, setToast]                 = useState({ show: false, msg: '', type: 'info' });

  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3500);
  };

  // Password strength
  useEffect(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    setPwStrength(score);
  }, [password]);

  // Validation
  const validate = () => {
    const errs = {};
    if (!/^[0-9]{8}$/.test(studentNo.trim()))
      errs.studentNo = 'Student number must be exactly 8 digits';
    if (!email.trim().toLowerCase().endsWith('@live.mut.ac.za'))
      errs.email = 'Must be your MUT email ending in @live.mut.ac.za';
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim())  errs.lastName  = 'Last name is required';
    if (!faculty)          errs.faculty   = 'Please select a faculty';
    if (!qualification)    errs.qualification = 'Please select your qualification';
    if (!/^[0-9]{10}$/.test(contact.trim()))
      errs.contact = 'Must be a valid 10-digit number';
    if (password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    if (password !== confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit
  const submitRegistration = async () => {
    if (!validate()) { showToast('Please correct the errors on the form.', 'error'); return; }
    setIsSubmitting(true);

    try {
      // 1. Create Supabase Auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (authError) { showToast(authError.message, 'error'); setIsSubmitting(false); return; }

      const userId = authData.user?.id;
      if (!userId) { showToast('Registration failed — no user ID returned.', 'error'); setIsSubmitting(false); return; }

      // 2. Insert student profile — immediately active (MUT email is the gate)
      const { error: insertError } = await supabase.from('students').insert({
        student_id:      userId,
        student_number:  studentNo.trim(),
        first_name:      firstName.trim(),
        last_name:       lastName.trim(),
        email:           email.trim(),
        contact_number:  contact.trim(),
        qualification_id: parseInt(qualification, 10),
        account_status:  'active',
        email_verified:  false,
        face_verified:   false,
        card_verified:   false,
      });

      if (insertError) {
        // Student row insert failed — sign out the auth user so they're not
        // left with an orphaned account and can re-register cleanly.
        await supabase.auth.signOut();
        showToast(insertError.message, 'error');
        setIsSubmitting(false);
        return;
      }

      showToast('Account created! Please sign in.', 'success');
      setTimeout(() => navigate('/login'), 2200);
    } catch (err) {
      console.error(err);
      showToast('An unexpected error occurred.', 'error');
      setIsSubmitting(false);
    }
  };

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );

  return (
    <div className="page-wrap">
      {/* Toast */}
      {toast.show && (
        <div className={`toast show ${toast.type}`}
          style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1050 }}>
          {toast.msg}
        </div>
      )}

      {/* Logo */}
      <div className="logo" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <img src="/images/2.svg" alt="UniMarket Logo" style={{ height: '42px', width: 'auto' }} />
        <span className="logo-text">Uni<span>Market</span></span>
      </div>

      {/* Card */}
      <div className="card" style={{ width: '100%', maxWidth: '640px', padding: '36px' }}>
        <div className="card-header" style={{ marginBottom: '28px' }}>
          <h2 style={{ marginBottom: '8px' }}>Create your account</h2>
          <p className="subtitle">
            MUT students only · Use your <strong style={{ color: 'var(--spotify-green)' }}>@live.mut.ac.za</strong> institutional email
          </p>
        </div>

        <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

          {/* Student Number */}
          <div className="form-group">
            <label htmlFor="studentNo">Student Number</label>
            <input type="text" id="studentNo" placeholder="e.g. 21234567"
              value={studentNo} onChange={(e) => setStudentNo(e.target.value)} />
            {errors.studentNo && <span className="field-err" style={{ display: 'block' }}>{errors.studentNo}</span>}
          </div>

          {/* MUT Email */}
          <div className="form-group">
            <label htmlFor="email">MUT Email</label>
            <input type="email" id="email" placeholder="yourname@live.mut.ac.za"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            {errors.email && <span className="field-err" style={{ display: 'block' }}>{errors.email}</span>}
          </div>

          {/* First Name */}
          <div className="form-group">
            <label htmlFor="firstName">First Name</label>
            <input type="text" id="firstName" placeholder="First name"
              value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            {errors.firstName && <span className="field-err" style={{ display: 'block' }}>{errors.firstName}</span>}
          </div>

          {/* Last Name */}
          <div className="form-group">
            <label htmlFor="lastName">Last Name</label>
            <input type="text" id="lastName" placeholder="Last name"
              value={lastName} onChange={(e) => setLastName(e.target.value)} />
            {errors.lastName && <span className="field-err" style={{ display: 'block' }}>{errors.lastName}</span>}
          </div>

          {/* Faculty */}
          <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="faculty">Faculty</label>
            <div className="select-wrap">
              <select id="faculty" value={faculty}
                onChange={(e) => { setFaculty(e.target.value); setQualification(''); }}>
                <option value="">— Select your faculty —</option>
                <option value="1">Faculty of Applied and Health Sciences</option>
                <option value="2">Faculty of Engineering</option>
                <option value="3">Faculty of Management Sciences</option>
              </select>
            </div>
            {errors.faculty && <span className="field-err" style={{ display: 'block' }}>{errors.faculty}</span>}
          </div>

          {/* Qualification — toggled by qual-visible class */}
          <div
            className={`form-group full-width${faculty ? ' qual-visible' : ''}`}
            id="qualificationGroup"
            style={{ gridColumn: 'span 2' }}
          >
            <label htmlFor="qualification">Qualification</label>
            <div className="select-wrap">
              <select id="qualification" value={qualification}
                onChange={(e) => setQualification(e.target.value)}>
                <option value="">— Select your qualification —</option>
                {(QUALIFICATIONS[faculty] || []).map((q) => (
                  <option key={q.id} value={q.id}>{q.name}</option>
                ))}
              </select>
            </div>
            {errors.qualification && <span className="field-err" style={{ display: 'block' }}>{errors.qualification}</span>}
          </div>

          {/* Contact */}
          <div className="form-group">
            <label htmlFor="contact">Contact Number</label>
            <input type="tel" id="contact" placeholder="0812345678" maxLength="10"
              value={contact} onChange={(e) => setContact(e.target.value)} />
            {errors.contact && <span className="field-err" style={{ display: 'block' }}>{errors.contact}</span>}
          </div>

          {/* Spacer on small grid */}
          <div className="form-group" style={{ visibility: 'hidden' }} aria-hidden="true" />

          {/* Password */}
          <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="password">Password</label>
            <div className="pw-wrap">
              <input type={showPw ? 'text' : 'password'} id="password" placeholder="Create a password"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="eye-btn" onClick={() => setShowPw(!showPw)} aria-label="Toggle password visibility">
                <EyeIcon />
              </button>
            </div>
            <div className="pw-strength">
              <div className={`pw-bar ${pwStrength >= 1 ? 'strength-weak' : ''}`} />
              <div className={`pw-bar ${pwStrength >= 2 ? 'strength-fair' : ''}`} />
              <div className={`pw-bar ${pwStrength >= 3 ? 'strength-good' : ''}`} />
              <div className={`pw-bar ${pwStrength >= 4 ? 'strength-strong' : ''}`} />
            </div>
            {errors.password && <span className="field-err" style={{ display: 'block' }}>{errors.password}</span>}
          </div>

          {/* Confirm Password */}
          <div className="form-group full-width" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="confirmPw">Confirm Password</label>
            <div className="pw-wrap">
              <input type={showConfirmPw ? 'text' : 'password'} id="confirmPw" placeholder="Repeat password"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRegistration(); }} />
              <button type="button" className="eye-btn" onClick={() => setShowConfirmPw(!showConfirmPw)} aria-label="Toggle confirm password visibility">
                <EyeIcon />
              </button>
            </div>
            {errors.confirmPassword && <span className="field-err" style={{ display: 'block' }}>{errors.confirmPassword}</span>}
          </div>
        </div>

        {/* Submit */}
        <button
          type="button"
          className="btn-primary"
          id="btnCreateAccount"
          onClick={submitRegistration}
          disabled={isSubmitting}
          style={{ marginTop: '24px', width: '100%' }}
        >
          {isSubmitting ? 'Creating account…' : 'Create Account'}
        </button>

        <p className="login-link" style={{ marginTop: '20px', textAlign: 'center' }}>
          Already have an account? <Link to="/login">Log in here</Link>
        </p>
      </div>
    </div>
  );
};
