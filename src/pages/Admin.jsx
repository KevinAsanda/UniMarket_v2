import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import '../styles/admin.css';

export const Admin = () => {
  const navigate = useNavigate();

  // Active Tab state: 'listings' | 'users' | 'approvals' | 'complaints' | 'aireview' | 'manualreview'
  const [activeTab, setActiveTab] = useState('listings');

  // Stats State
  const [stats, setStats] = useState({ users: 0, listings: 0, unavailable: 0, complaints: 0 });
  const [topSellers, setTopSellers] = useState([]);

  // Data lists
  const [listings, setListings] = useState([]);
  const [users, setUsers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [manualReview, setManualReview] = useState([]);
  const [flaggedListings, setFlaggedListings] = useState([]);

  // Loading indicator
  const [loading, setLoading] = useState(true);

  // Student Card Preview Modal States
  const [previewCardUrl, setPreviewCardUrl] = useState('');
  const [previewCardName, setPreviewCardName] = useState('');
  const [showCardModal, setShowCardModal] = useState(false);

  // Reject Account Modal States
  const [rejectStudentId, setRejectStudentId] = useState(null);
  const [rejectStudentName, setRejectStudentName] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Reject Listing Modal States
  const [rejectProductId, setRejectProductId] = useState(null);
  const [rejectProductName, setRejectProductName] = useState('');
  const [rejectListingReason, setRejectListingReason] = useState('');
  const [showRejectListingModal, setShowRejectListingModal] = useState(false);

  // AI Moderation States
  const [aiReviewList, setAiReviewList] = useState([]);
  const [aiStatusMsg, setAiStatusMsg] = useState('');
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [selectedAiDetail, setSelectedAiDetail] = useState(null);
  const [showAiDetailModal, setShowAiDetailModal] = useState(false);

  // Toast State
  const [toast, setToast] = useState({ show: false, msg: '' });

  const showToast = (msg) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3000);
  };

  // ── Load Stats and Top Sellers ──────────────────────────
  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch counts
      const { count: userCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('account_status', 'active');

      const { count: activeCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'available')
        .eq('is_hidden', false);

      const { count: unavailCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .in('status', ['sold', 'hidden', 'suspended']);

      const { count: complaintCount } = await supabase
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('complaint_status', 'pending');

      setStats({
        users: userCount || 0,
        listings: activeCount || 0,
        unavailable: unavailCount || 0,
        complaints: complaintCount || 0,
      });

      // 2. Fetch Top Sellers
      const { data: allProds } = await supabase
        .from('products')
        .select('seller_id, students ( first_name, last_name )');

      // Group and count
      const sellerCounts = {};
      (allProds || []).forEach(p => {
        if (!p.seller_id) return;
        const name = p.students ? `${p.students.first_name} ${p.students.last_name}` : 'Unknown';
        if (!sellerCounts[p.seller_id]) {
          sellerCounts[p.seller_id] = { name, count: 0 };
        }
        sellerCounts[p.seller_id].count++;
      });

      const sortedSellers = Object.values(sellerCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setTopSellers(sortedSellers);

    } catch (err) {
      console.error(err);
      showToast('Error retrieving analytics.');
    } finally {
      setLoading(false);
    }
  };

  // ── Tab Loading Switch ────────────────────────────────
  const loadTabContent = async (tab) => {
    try {
      if (tab === 'listings') {
        const { data } = await supabase
          .from('products')
          .select('product_id, product_name, price, status, is_hidden, students(first_name, last_name)')
          .order('created_at', { ascending: false });
        setListings(data || []);
      }
      else if (tab === 'users') {
        const { data } = await supabase
          .from('students')
          .select('student_id, first_name, last_name, email, student_number, account_status, qualification_id')
          .order('first_name', { ascending: true });
        setUsers(data || []);
      }
      else if (tab === 'approvals') {
        const { data } = await supabase
          .from('students')
          .select('student_id, first_name, last_name, student_number, qualification_id, card_image_url, created_at')
          .eq('account_status', 'pending')
          .order('created_at', { ascending: true });
        setApprovals(data || []);
      }
      else if (tab === 'complaints') {
        const { data } = await supabase
          .from('complaints')
          .select(`
            complaint_id, complaint_text, complaint_status, created_at,
            products ( product_name ),
            students!complaints_reported_user_id_fkey ( first_name, last_name, contact_number )
          `)
          .eq('complaint_status', 'pending')
          .order('created_at', { ascending: false });
        setComplaints(data || []);
      }
      else if (tab === 'manualreview') {
        const { data } = await supabase
          .from('products')
          .select(`
            product_id, product_name, description, price, created_at,
            students!products_seller_id_fkey ( first_name, last_name, student_number ),
            product_images ( storage_path, is_primary )
          `)
          .eq('status', 'hidden')
          .eq('is_hidden', true)
          .order('created_at', { ascending: true });
        setManualReview(data || []);
      }
      else if (tab === 'flagged') {
        // Join products with flag counts from the view
        const { data } = await supabase
          .from('product_flag_counts')
          .select(`
            product_id,
            flag_count,
            products (
              product_id, product_name, price, status, is_hidden,
              students!products_seller_id_fkey ( first_name, last_name )
            )
          `)
          .order('flag_count', { ascending: false });
        setFlaggedListings(data || []);
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading tab records.');
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    loadTabContent(activeTab);
  }, [activeTab]);

  // ── Platform toggle actions ───────────────────────────
  const handleToggleListing = async (productId, currentlyDisabled) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          status: currentlyDisabled ? 'available' : 'suspended',
          is_hidden: !currentlyDisabled
        })
        .eq('product_id', productId);

      if (error) throw error;
      showToast('Listing visibility toggled.');
      loadTabContent('listings');
      loadDashboardData();
    } catch (err) {
      showToast('Failed to modify listing state.');
    }
  };

  const handleToggleBan = async (studentId, currentStatus) => {
    const nextStatus = currentStatus === 'banned' ? 'active' : 'banned';
    try {
      const { error } = await supabase
        .from('students')
        .update({ account_status: nextStatus })
        .eq('student_id', studentId);

      if (error) throw error;
      showToast(nextStatus === 'banned' ? 'User blocked.' : 'User restored.');
      loadTabContent('users');
      loadDashboardData();
    } catch (err) {
      showToast('Failed to update user block state.');
    }
  };

  // ── Approvals controls ────────────────────────────────
  const openCardPreview = (url, name) => {
    setPreviewCardUrl(url);
    setPreviewCardName(name);
    setShowCardModal(true);
  };

  const approveStudent = async (studentId) => {
    try {
      const { error } = await supabase
        .from('students')
        .update({ account_status: 'active' })
        .eq('student_id', studentId);

      if (error) throw error;
      showToast('Student account approved!');
      loadTabContent('approvals');
      loadDashboardData();
    } catch (err) {
      showToast('Failed to approve profile.');
    }
  };

  const openRejectModal = (studentId, name) => {
    setRejectStudentId(studentId);
    setRejectStudentName(name);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    try {
      // Rejects delete the pending student record
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('student_id', rejectStudentId);

      if (error) throw error;
      showToast('Registration rejected and deleted.');
      setShowRejectModal(false);
      loadTabContent('approvals');
      loadDashboardData();
    } catch (err) {
      showToast('Rejection update failed.');
    }
  };

  // ── Complaints Resolution ──────────────────────────────
  const resolveComplaint = async (complaintId) => {
    try {
      const { error } = await supabase
        .from('complaints')
        .update({ complaint_status: 'resolved' })
        .eq('complaint_id', complaintId);

      if (error) throw error;
      showToast('Complaint resolved.');
      loadTabContent('complaints');
      loadDashboardData();
    } catch (err) {
      showToast('Failed to resolve complaint.');
    }
  };

  // ── Manual Reviews controls ───────────────────────────
  const approveManualListing = async (productId) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'available', is_hidden: false })
        .eq('product_id', productId);

      if (error) throw error;
      showToast('Listing pushed live on catalogue!');
      loadTabContent('manualreview');
      loadDashboardData();
    } catch (err) {
      showToast('Approval update failed.');
    }
  };

  const openManualRejectModal = (productId, name) => {
    setRejectProductId(productId);
    setReportProdName(name);
    setRejectListingReason('');
    setShowRejectListingModal(true);
  };

  const confirmManualReject = async () => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'suspended', is_hidden: true })
        .eq('product_id', rejectProductId);

      if (error) throw error;
      showToast('Listing rejected and hidden.');
      setShowRejectListingModal(false);
      loadTabContent('manualreview');
      loadDashboardData();
    } catch (err) {
      showToast('Rejection action failed.');
    }
  };

  // ── Claude AI Auditing via Supabase Edge Function ──────
  const runAIReviewAll = async () => {
    setIsAiScanning(true);
    setAiStatusMsg('Fetching available listings…');
    setAiReviewList([]);

    try {
      // Fetch current available listings
      const { data: listingsData } = await supabase
        .from('products')
        .select(`
          product_id, product_name, description, price, status,
          students ( first_name, last_name ),
          product_images ( storage_path, is_primary )
        `)
        .eq('status', 'available')
        .eq('is_hidden', false);

      if (!listingsData || listingsData.length === 0) {
        setAiStatusMsg('No active listings found to audit.');
        setIsAiScanning(false);
        return;
      }

      setAiStatusMsg(`Auditing 0 of ${listingsData.length}…`);
      const results = [];

      for (let i = 0; i < listingsData.length; i++) {
        const item = listingsData[i];
        setAiStatusMsg(`Auditing ${i + 1} of ${listingsData.length}…`);

        // Call the server-side Edge Function — API key is stored as a Supabase secret
        const { data: reviewData, error: reviewError } = await supabase.functions.invoke('review-listing', {
          body: { productId: item.product_id },
        });

        let risk, summary, issues, recommendation;

        if (reviewError || !reviewData) {
          // Edge function not yet deployed or errored — use offline fallback
          const isSus = item.product_name.toLowerCase().includes('rolex') ||
                        item.product_name.toLowerCase().includes('iphone 16') ||
                        parseFloat(item.price) > 10000;
          risk = isSus ? 'high' : 'low';
          summary = isSus
            ? 'Suspicious listing name or extreme price detected. (Offline rules engine — deploy Edge Function for full AI review.)'
            : 'Low risk content. (Offline rules engine — deploy Edge Function for full AI review.)';
          issues = isSus ? ['High-value luxury keyword matching', 'ZAR price threshold flag'] : ['No issues detected'];
          recommendation = isSus ? 'review' : 'approve';
        } else {
          risk = reviewData.risk || 'low';
          summary = reviewData.summary || 'No summary returned.';
          issues = reviewData.issues || [];
          recommendation = reviewData.recommendation || 'approve';
        }

        results.push({
          product_id: item.product_id,
          product_name: item.product_name,
          price: item.price,
          seller: item.students ? `${item.students.first_name} ${item.students.last_name}` : 'Unknown',
          imageUrl: item.product_images?.find(img => img.is_primary)?.storage_path || null,
          risk,
          summary,
          fullText: { risk, summary, issues, recommendation }
        });
        setAiReviewList([...results]);
      }

      setAiStatusMsg(`✅ Checked ${listingsData.length} listings.`);
    } catch (err) {
      console.error(err);
      setAiStatusMsg('AI Auditing failed. Check browser console for details.');
    } finally {
      setIsAiScanning(false);
    }
  };


  const handleOpenAiDetail = (item) => {
    setSelectedAiDetail(item);
    setShowAiDetailModal(true);
  };

  const disableFromDetail = async () => {
    if (!selectedAiDetail) return;
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'suspended', is_hidden: true })
        .eq('product_id', selectedAiDetail.product_id);

      if (error) throw error;
      showToast('Listing disabled.');
      setShowAiDetailModal(false);
      runAIReviewAll();
      loadDashboardData();
    } catch (err) {
      showToast('Failed to disable listing.');
    }
  };

  return (
    <div className="admin-page-wrap pb-5">
      {/* Topbar */}
      <div className="topbar d-flex justify-content-between align-items-center">
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src="/images/1.svg" alt="UniMarket Logo" style={{ height: '32px', width: 'auto' }} />
          <span>UniMarket Admin</span>
        </div>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate('/login'); }}>
          Sign Out
        </button>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className="toast show">
          {toast.msg}
        </div>
      )}

      <div className="container mt-4">
        <h3>Admin Dashboard</h3>

        {/* STAT CARDS */}
        <div className="row g-3 mb-4">
          <div className="col-md-3">
            <div className="card stat-card text-center p-3">
              <div style={{ fontSize: '14px' }} className="text-muted">Total Users</div>
              <h3 className="mt-2">{stats.users}</h3>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card stat-card text-center p-3">
              <div style={{ fontSize: '14px' }} className="text-muted">Active Listings</div>
              <h3 className="mt-2">{stats.listings}</h3>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card stat-card text-center p-3">
              <div style={{ fontSize: '14px' }} className="text-muted">Unavailable</div>
              <h3 className="mt-2">{stats.unavailable}</h3>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card stat-card text-center p-3">
              <div style={{ fontSize: '14px' }} className="text-muted">Complaints</div>
              <h3 className="mt-2">{stats.complaints}</h3>
            </div>
          </div>
        </div>

        {/* Top Sellers panel */}
        <div className="card section-card mb-4">
          <div className="card-body">
            <h5 style={{ fontWeight: 600 }}>Top Sellers</h5>
            <table className="table table-striped table-hover mb-0 mt-3" style={{ fontSize: '14px' }}>
              <thead>
                <tr>
                  <th>Seller Display Name</th>
                  <th>Total Created Listings</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((s, i) => (
                  <tr key={i}>
                    <td>{s.name}</td>
                    <td><strong>{s.count} items</strong></td>
                  </tr>
                ))}
                {topSellers.length === 0 && (
                  <tr>
                    <td colSpan="2" className="text-center text-muted">No listing history loaded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* NAV TABS */}
        <div className="mb-4 d-flex flex-wrap gap-2">
          <button className={`btn tab-btn ${activeTab === 'listings' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('listings')}>Listings</button>
          <button className={`btn tab-btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('users')}>Users</button>
          <button className={`btn tab-btn ${activeTab === 'approvals' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('approvals')}>Approvals</button>
          <button className={`btn tab-btn ${activeTab === 'complaints' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('complaints')}>Complaints</button>
          <button className={`btn tab-btn ${activeTab === 'flagged' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('flagged')}>🚩 Flagged</button>
          <button className={`btn tab-btn ${activeTab === 'manualreview' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('manualreview')}>Manual Review</button>
          <button className={`btn tab-btn ${activeTab === 'aireview' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('aireview')}>🤖 AI Review</button>
        </div>

        {/* ── LISTINGS PANEL ── */}
        {activeTab === 'listings' && (
          <div className="card section-card">
            <div className="card-body">
              <h5 style={{ fontWeight: 600 }}>All Listings</h5>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Item</th><th>Seller</th><th>Price</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {listings.map((l) => (
                      <tr key={l.product_id}>
                        <td><strong>{l.product_name}</strong></td>
                        <td>{l.students ? `${l.students.first_name} ${l.students.last_name}` : '—'}</td>
                        <td>R{parseFloat(l.price).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${l.status === 'available' ? 'bg-success' : 'bg-danger'}`}>
                            {l.status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <button 
                            className={`btn btn-sm ${l.is_hidden ? 'btn-success' : 'btn-outline-danger'}`}
                            onClick={() => handleToggleListing(l.product_id, l.is_hidden)}
                          >
                            {l.is_hidden ? 'Restore' : 'Disable'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── FLAGGED LISTINGS PANEL ── */}
        {activeTab === 'flagged' && (
          <div className="card section-card">
            <div className="card-body">
              <h5 style={{ fontWeight: 700, color: '#E22134' }}>🚩 Community-Flagged Listings</h5>
              <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
                Listings flagged by students as suspicious. Auto-hidden when ≥5 flags are reached. Review and take action below.
              </p>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Seller</th>
                      <th>Price</th>
                      <th>Flags</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedListings.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center text-muted py-4">No flagged listings found.</td>
                      </tr>
                    ) : (
                      flaggedListings.map((row) => {
                        const prod = row.products;
                        if (!prod) return null;
                        const flagCount = row.flag_count;
                        const isAutoHidden = prod.is_hidden && flagCount >= 5;
                        return (
                          <tr key={row.product_id}>
                            <td><strong>{prod.product_name}</strong></td>
                            <td>{prod.students ? `${prod.students.first_name} ${prod.students.last_name}` : '—'}</td>
                            <td>R{parseFloat(prod.price).toFixed(2)}</td>
                            <td>
                              <span style={{
                                fontWeight: 700,
                                color: flagCount >= 5 ? '#E22134' : flagCount >= 3 ? '#FFA500' : '#B3B3B3',
                                background: flagCount >= 5 ? 'rgba(226,33,52,0.12)' : flagCount >= 3 ? 'rgba(255,165,0,0.12)' : 'rgba(255,255,255,0.08)',
                                padding: '2px 10px',
                                borderRadius: 9999,
                                fontSize: 12
                              }}>
                                🚩 {flagCount}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${prod.is_hidden ? 'bg-danger' : 'bg-success'}`}>
                                {prod.is_hidden ? 'HIDDEN' : prod.status?.toUpperCase()}
                              </span>
                              {isAutoHidden && (
                                <span className="badge bg-warning text-dark ms-1">Auto-hidden</span>
                              )}
                            </td>
                            <td>
                              <div className="d-flex gap-1">
                                {prod.is_hidden ? (
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={async () => {
                                      await supabase
                                        .from('products')
                                        .update({ status: 'available', is_hidden: false })
                                        .eq('product_id', prod.product_id);
                                      showToast('Listing restored after review.');
                                      loadTabContent('flagged');
                                    }}
                                  >
                                    ✅ Restore
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={async () => {
                                      await supabase
                                        .from('products')
                                        .update({ status: 'suspended', is_hidden: true })
                                        .eq('product_id', prod.product_id);
                                      showToast('Listing suspended.');
                                      loadTabContent('flagged');
                                    }}
                                  >
                                    🚫 Suspend
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS PANEL ── */}
        {activeTab === 'users' && (
          <div className="card section-card">
            <div className="card-body">
              <h5 style={{ fontWeight: 600 }}>Active Users</h5>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Name</th><th>Email</th><th>Student #</th><th>Status</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.student_id}>
                        <td>{`${u.first_name} ${u.last_name}`}</td>
                        <td>{u.email}</td>
                        <td>{u.student_number}</td>
                        <td>
                          <span className={`badge ${u.account_status === 'active' ? 'bg-success' : 'bg-danger'}`}>
                            {u.account_status.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <button 
                            className={`btn btn-sm ${u.account_status === 'banned' ? 'btn-success' : 'btn-danger'}`}
                            onClick={() => handleToggleBan(u.student_id, u.account_status)}
                          >
                            {u.account_status === 'banned' ? 'Unban' : 'Ban'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── APPROVALS PANEL ── */}
        {activeTab === 'approvals' && (
          <div className="card section-card" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
            <div className="card-body">
              <h5 style={{ fontWeight: 600, color: '#d97706' }}>⏳ Pending Account Approvals</h5>
              <p className="text-muted mb-3" style={{ fontSize: '13px' }}>Compare the student card image against the submitted details before approving.</p>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Student</th><th>Student #</th><th>Registered</th><th>Student Card</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {approvals.map((a) => (
                      <tr key={a.student_id}>
                        <td>{`${a.first_name} ${a.last_name}`}</td>
                        <td>{a.student_number}</td>
                        <td>{new Date(a.created_at).toLocaleDateString()}</td>
                        <td>
                          {a.card_image_url ? (
                            <button className="btn btn-sm btn-outline-primary" onClick={() => openCardPreview(a.card_image_url, `${a.first_name} ${a.last_name}`)}>
                              🔍 View Card
                            </button>
                          ) : (
                            <span className="text-muted">No photo</span>
                          )}
                        </td>
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-success" onClick={() => approveStudent(a.student_id)}>Approve</button>
                            <button className="btn btn-sm btn-danger" onClick={() => openRejectModal(a.student_id, `${a.first_name} ${a.last_name}`)}>Reject</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {approvals.length === 0 && (
                      <tr><td colSpan="5" className="text-center py-4 text-muted">No student accounts awaiting approvals.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── COMPLAINTS PANEL ── */}
        {activeTab === 'complaints' && (
          <div className="card section-card" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
            <div className="card-body">
              <h5 style={{ fontWeight: 600, color: '#dc2626' }}>Complaints Resolution</h5>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Product</th><th>Reported User</th><th>Contact</th><th>Complaint Details</th><th>Date</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {complaints.map((c) => (
                      <tr key={c.complaint_id}>
                        <td><strong>{c.products?.product_name || '—'}</strong></td>
                        <td>{c.students ? `${c.students.first_name} ${c.students.last_name}` : '—'}</td>
                        <td>{c.students?.contact_number || '—'}</td>
                        <td>{c.complaint_text}</td>
                        <td>{new Date(c.created_at).toLocaleDateString()}</td>
                        <td>
                          <button className="btn btn-sm btn-outline-success" onClick={() => resolveComplaint(c.complaint_id)}>
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                    {complaints.length === 0 && (
                      <tr><td colSpan="6" className="text-center py-4 text-muted">No pending complaints.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── MANUAL REVIEW PANEL ── */}
        {activeTab === 'manualreview' && (
          <div className="card section-card" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
            <div className="card-body">
              <h5 style={{ fontWeight: 600 }}>📋 Manual Listing Review</h5>
              <p className="text-muted mb-3" style={{ fontSize: '13px' }}>These listings were submitted while the AI review scanner was unavailable. Review and action.</p>
              <div className="table-responsive">
                <table className="table table-striped align-middle mt-3 mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Image</th><th>Item</th><th>Seller</th><th>Price</th><th>Description</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {manualReview.map((m) => {
                      const img = m.product_images?.find(i => i.is_primary)?.storage_path || m.product_images?.[0]?.storage_path;
                      return (
                        <tr key={m.product_id}>
                          <td>
                            {img ? (
                              <img src={img} alt="Product" style={{ width: '70px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} />
                            ) : (
                              <span className="text-muted">No Image</span>
                            )}
                          </td>
                          <td><strong>{m.product_name}</strong></td>
                          <td>{m.students ? `${m.students.first_name} ${m.students.last_name}` : '—'}</td>
                          <td>R{parseFloat(m.price).toFixed(2)}</td>
                          <td>{m.description}</td>
                          <td>
                            <div className="d-flex gap-1">
                              <button className="btn btn-sm btn-success" onClick={() => approveManualListing(m.product_id)}>Approve</button>
                              <button className="btn btn-sm btn-danger" onClick={() => openManualRejectModal(m.product_id, m.product_name)}>Reject</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {manualReview.length === 0 && (
                      <tr><td colSpan="6" className="text-center py-4 text-muted">No listings pending manual review.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── AI REVIEW PANEL ── */}
        {activeTab === 'aireview' && (
          <div className="card section-card" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
            <div className="card-body">
              <h5 style={{ fontWeight: 600 }}>🤖 AI Content Audit Console</h5>
              <p className="text-muted mb-3" style={{ fontSize: '13px' }}>Scans active catalog listings for compliance. Suspicious listings will trigger risk flags.</p>
              <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
                <button className="btn btn-dark" onClick={runAIReviewAll} disabled={isAiScanning}>
                  {isAiScanning ? '⏳ Auditing listings…' : '▶ Run Audit Scan'}
                </button>
                <span className="text-muted" style={{ fontSize: '13px' }}>{aiStatusMsg}</span>
              </div>
              <div className="table-responsive">
                <table className="table table-striped align-middle mb-0" style={{ fontSize: '14px' }}>
                  <thead>
                    <tr><th>Image</th><th>Item</th><th>Seller</th><th>Price</th><th>AI Verdict</th><th>Risk</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {aiReviewList.map((item) => (
                      <tr key={item.product_id}>
                        <td>
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="Product" style={{ width: '70px', height: '50px', objectFit: 'cover', borderRadius: '6px' }} />
                          ) : (
                            <span className="text-muted">No Image</span>
                          )}
                        </td>
                        <td><strong>{item.product_name}</strong></td>
                        <td>{item.seller}</td>
                        <td>R{parseFloat(item.price).toFixed(2)}</td>
                        <td style={{ fontSize: '12px', maxWidth: '240px' }}>{item.summary}</td>
                        <td>
                          <span className={`badge ${item.risk === 'high' ? 'bg-danger' : 'bg-success'}`}>
                            {item.risk.toUpperCase()}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-outline-dark" onClick={() => handleOpenAiDetail(item)}>
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {aiReviewList.length === 0 && !isAiScanning && (
                      <tr><td colSpan="7" className="text-center py-4 text-muted">Click "Run Audit Scan" to evaluate active listings.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── CARD IMAGE PREVIEW MODAL ── */}
      {showCardModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">🪪 Student Card — {previewCardName}</h5>
                <button type="button" className="btn-close" onClick={() => setShowCardModal(false)}></button>
              </div>
              <div className="modal-body text-center p-3">
                <img src={previewCardUrl} alt="Student Card" style={{ maxWidth: '100%', borderRadius: '10px', border: '1px solid #E5E7EB' }} />
                <p className="text-muted mt-2" style={{ fontSize: '12px' }}>Verify matching information carefully before giving platform access.</p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCardModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECT ACCOUNT REASON MODAL ── */}
      {showRejectModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">Reject Account</h5>
                <button type="button" className="btn-close" onClick={() => setShowRejectModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  Rejecting: <strong>{rejectStudentName}</strong>
                </p>
                <label className="form-label fw-semibold" style={{ fontSize: '13px' }}>Reason (optional)</label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  placeholder="e.g. Student card details do not match signup details..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                ></textarea>
              </div>
              <div className="modal-footer">
                <button className="btn btn-danger" onClick={confirmReject}>Confirm Rejection</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECT LISTING REASON MODAL ── */}
      {showRejectListingModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">❌ Reject Listing</h5>
                <button type="button" className="btn-close" onClick={() => setShowRejectListingModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  Rejecting: <strong>{reportProdName}</strong>
                </p>
                <label className="form-label fw-semibold" style={{ fontSize: '13px' }}>Reason for rejection</label>
                <textarea 
                  className="form-control" 
                  rows="3" 
                  placeholder="e.g. Price is too high / contains prohibited keywords..."
                  value={rejectListingReason}
                  onChange={(e) => setRejectListingReason(e.target.value)}
                ></textarea>
              </div>
              <div className="modal-footer">
                <button className="btn btn-danger" onClick={confirmManualReject}>Confirm Rejection</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowRejectListingModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── AI REVIEW DETAIL MODAL ── */}
      {showAiDetailModal && selectedAiDetail && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">🤖 AI Compliance Analysis</h5>
                <button type="button" className="btn-close" onClick={() => setShowAiDetailModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-4 text-center">
                    {selectedAiDetail.imageUrl ? (
                      <img src={selectedAiDetail.imageUrl} alt="Product" style={{ width: '100%', borderRadius: '10px', border: '1px solid #E5E7EB' }} />
                    ) : (
                      <p className="text-muted mt-2">No image uploaded</p>
                    )}
                  </div>
                  <div className="col-md-8">
                    <p className="fw-semibold mb-1">Item Title: {selectedAiDetail.product_name}</p>
                    <p className="text-muted">Price: R{parseFloat(selectedAiDetail.price).toFixed(2)} | Seller: {selectedAiDetail.seller}</p>
                    <hr />
                    <p className="fw-semibold mb-1">Audit Findings:</p>
                    <div style={{ fontSize: '13px', lineHeight: '1.7', background: '#282828', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,255,255,0.08)', color: '#FFFFFF' }}>
                      <p><strong>Verdict:</strong> {selectedAiDetail.fullText?.recommendation.toUpperCase()}</p>
                      <p><strong>Description Risk:</strong> {selectedAiDetail.fullText?.risk.toUpperCase()}</p>
                      <p><strong>Identified Flags:</strong></p>
                      <ul>
                        {selectedAiDetail.fullText?.issues?.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                {selectedAiDetail.risk === 'high' && (
                  <button className="btn btn-warning" onClick={disableFromDetail}>Disable Listing</button>
                )}
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowAiDetailModal(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
