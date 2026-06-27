import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import { Navbar } from '../components/Navbar';
import { ChatPanel } from '../components/ChatPanel';
import { RatingModal } from '../components/RatingModal';
import '../styles/activity.css';

export const Activity = () => {
  const { user } = useAuth();

  // Active Tab state: 'products' | 'orders'
  const [activeTab, setActiveTab] = useState('products');

  // Filter Product Status: 'all' | 'available' | 'sold'
  const [filterStatus, setFilterStatus] = useState('all');

  // Data lists
  const [products, setProducts] = useState([]);
  const [buying, setBuying] = useState([]);
  const [selling, setSelling] = useState([]);
  const [loading, setLoading] = useState(true);

  // Edit Modal States
  const [editProduct, setEditProduct] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Complaint Modal States
  const [reportOrderId, setReportOrderId] = useState(null);
  const [reportProdName, setReportProdName] = useState('');
  const [complaintText, setComplaintText] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  // Feature: Chat Panel state
  const [chatOrderId, setChatOrderId] = useState(null);
  const [chatOrderLabel, setChatOrderLabel] = useState('');
  const [showChat, setShowChat] = useState(false);

  // Feature: Rating Modal state
  const [ratingOrder, setRatingOrder] = useState(null); // { orderId, reviewedUserId, reviewedName }
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [submittedRatings, setSubmittedRatings] = useState(new Set()); // Set of order_ids already rated

  // Toast notifications
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });

  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  // ── Helper: Send notification via Edge Function ───────────
  const sendNotification = async (payload) => {
    try {
      await supabase.functions.invoke('send-notification', { body: payload });
    } catch (err) {
      // Notifications are best-effort — don't block the user flow
      console.warn('[Activity] Notification send failed:', err);
    }
  };

  // ── Load Activity Data ────────────────────────────────
  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Load seller's own listings
      const { data: prodData } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.student_id)
        .order('created_at', { ascending: false });
      setProducts(prodData || []);

      // 2. Load buying orders (include payment_status if column exists)
      const { data: buyData } = await supabase
        .from('orders')
        .select(`
          order_id, order_status, payment_status, created_at,
          seller_id,
          products ( product_name, price ),
          students!orders_seller_id_fkey ( first_name, last_name ),
          meetup_slots ( day_of_week, slot_time, venue )
        `)
        .eq('buyer_id', user.student_id)
        .order('created_at', { ascending: false });
      setBuying(buyData || []);

      // 3. Load selling orders
      const { data: sellData } = await supabase
        .from('orders')
        .select(`
          order_id, order_status, payment_status, created_at,
          buyer_id,
          products ( product_name, price ),
          students!orders_buyer_id_fkey ( first_name, last_name, contact_number ),
          meetup_slots ( day_of_week, slot_time, venue )
        `)
        .eq('seller_id', user.student_id)
        .order('created_at', { ascending: false });
      setSelling(sellData || []);

      // 4. Fetch which completed orders the user has already rated
      if (user.student_id) {
        const { data: ratingData } = await supabase
          .from('ratings')
          .select('order_id')
          .eq('reviewer_id', user.student_id);
        setSubmittedRatings(new Set((ratingData || []).map((r) => r.order_id)));
      }

    } catch (err) {
      console.error(err);
      showToast('Could not load activity history.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  // ── Seller action utilities ───────────────────────────
  const handleHideProduct = async (productId) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_hidden: true, status: 'hidden' })
        .eq('product_id', productId);
      if (error) throw error;
      showToast('Listing hidden successfully.', 'success');
      loadData();
    } catch (err) {
      showToast('Could not hide listing.', 'error');
    }
  };

  const handleRelistProduct = async (productId) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_hidden: false, status: 'available' })
        .eq('product_id', productId);
      if (error) throw error;
      showToast('Listing pushed live!', 'success');
      loadData();
    } catch (err) {
      showToast('Could not relist product.', 'error');
    }
  };

  const handleMarkSold = async (productId) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'sold' })
        .eq('product_id', productId);
      if (error) throw error;
      showToast('Product marked as sold.', 'success');
      loadData();
    } catch (err) {
      showToast('Could not update status.', 'error');
    }
  };

  // ── Edit product basics ────────────────────────────────
  const handleOpenEdit = (prod) => {
    setEditProduct(prod);
    setEditName(prod.product_name);
    setEditPrice(prod.price.toString());
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!editName.trim()) { showToast('Item name is required.', 'error'); return; }
    if (isNaN(parseFloat(editPrice)) || parseFloat(editPrice) < 0) {
      showToast('Enter a valid price.', 'error');
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({
          product_name: editName.trim(),
          price: parseFloat(editPrice)
        })
        .eq('product_id', editProduct.product_id);

      if (error) throw error;
      showToast('Changes saved successfully!', 'success');
      setShowEditModal(false);
      loadData();
    } catch (err) {
      showToast('Could not save modifications.', 'error');
    }
  };

  // ── Complete order ────────────────────────────────────
  const completeOrder = async (orderId) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ order_status: 'completed' })
        .eq('order_id', orderId);
      if (error) throw error;
      showToast('Transaction marked as completed! ✅', 'success');
      // Notify buyer via email
      sendNotification({ event: 'order_completed', orderId });
      loadData();
    } catch (err) {
      showToast('Failed to complete transaction.', 'error');
    }
  };

  // ── Complaint files ───────────────────────────────────
  const handleOpenReport = (orderId, prodName) => {
    setReportOrderId(orderId);
    setReportProdName(prodName);
    setComplaintText('');
    setShowReportModal(true);
  };

  const submitComplaint = async () => {
    if (!complaintText.trim()) {
      showToast('Please describe the issue.', 'error');
      return;
    }

    try {
      // Fetch details from order first
      const { data: orderDetails, error: orderErr } = await supabase
        .from('orders')
        .select('product_id, seller_id')
        .eq('order_id', reportOrderId)
        .single();

      if (orderErr || !orderDetails) {
        showToast('Error looking up order details.', 'error');
        return;
      }

      const { data: complaint, error } = await supabase.from('complaints').insert({
        order_id: reportOrderId,
        product_id: orderDetails.product_id,
        complainant_id: user.student_id,
        reported_user_id: orderDetails.seller_id,
        complaint_text: complaintText.trim(),
        complaint_status: 'pending'
      }).select('complaint_id').single();

      if (error) throw error;

      showToast('Dispute complaint submitted 🚩', 'success');
      setShowReportModal(false);

      // Notify admin via email
      if (complaint?.complaint_id) {
        sendNotification({ event: 'complaint_filed', complaintId: complaint.complaint_id });
      }
    } catch (err) {
      console.error(err);
      showToast('Could not file complaint.', 'error');
    }
  };

  // ── Chat ─────────────────────────────────────────────
  const handleOpenChat = (orderId, productName, counterpartName) => {
    setChatOrderId(orderId);
    setChatOrderLabel(`${productName} · ${counterpartName}`);
    setShowChat(true);
  };

  // ── Rating ────────────────────────────────────────────
  const handleOpenRating = (order, isBuyerRating) => {
    // isBuyerRating true = buyer rates seller; false = seller rates buyer
    const reviewedUserId = isBuyerRating ? order.seller_id : order.buyer_id;
    const reviewedName = isBuyerRating
      ? (order.students ? `${order.students.first_name} ${order.students.last_name}` : 'Seller')
      : (order.students ? `${order.students.first_name} ${order.students.last_name}` : 'Buyer');

    setRatingOrder({ orderId: order.order_id, reviewedUserId, reviewedName });
    setShowRatingModal(true);
  };

  // ── Filtering owned listings ─────────────────────────
  const filteredOwnedProducts = products.filter(p => {
    if (filterStatus === 'all') return true;
    return p.status === filterStatus;
  });

  // ── Payment status badge ──────────────────────────────
  const PaymentBadge = ({ status }) => {
    if (!status || status === 'pending') return null;
    const map = {
      paid:     { label: 'Paid',     color: '#1DB954', bg: 'rgba(29,185,84,0.12)'   },
      released: { label: 'Released', color: '#60A5FA', bg: 'rgba(96,165,250,0.12)'  },
      refunded: { label: 'Refunded', color: '#F15E6C', bg: 'rgba(241,94,108,0.12)'  },
    };
    const cfg = map[status];
    if (!cfg) return null;
    return (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
        background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`,
        marginLeft: 6,
      }}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div style={{ background: '#121212', minHeight: '100vh', paddingBottom: '60px', paddingTop: '110px', overflow: 'visible' }}>
      <Navbar />

      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast show ${toast.type}`} style={{ position: 'fixed', top: '80px', right: '20px', zIndex: 1050 }}>
          {toast.msg}
        </div>
      )}

      {/* Hero Stats */}
      <section className="page-hero" style={{ overflow: 'visible' }}>
        <div className="container">
          <div className="hero-inner">
            <div>
              <h4 style={{ fontWeight: 700, margin: 0 }}>📦 My Activity</h4>
              <p style={{ margin: 0, marginTop: '4px', opacity: 0.8 }}>Track your purchases and manage your listings</p>
            </div>
            <div className="hero-stats" id="heroStats">
              <div className="stat-pill" id="hStatListings">
                <span className="stat-num">{products.length}</span>
                <span className="stat-lbl">Listings</span>
              </div>
              <div className="stat-pill" id="hStatOrders">
                <span className="stat-num">{buying.length + selling.length}</span>
                <span className="stat-lbl">Orders</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tab Row */}
      <div className="container tab-row mt-4">
        <button
          className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          🗂 My Products <span className="badge-count" id="productCount">{products.length}</span>
        </button>
        <button
          className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          🛒 Orders <span className="badge-count" id="orderCount">{buying.length + selling.length}</span>
        </button>
      </div>

      {/* Verification Prompt Banner — shown only to unverified users */}
      {!(user?.card_verified && user?.face_verified) && (
        <div className="container" style={{ marginTop: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 20px',
            borderRadius: '12px',
            background: 'rgba(29, 185, 84, 0.1)',
            border: '1px solid rgba(29, 185, 84, 0.3)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#1DB954" stroke="none" style={{ flexShrink: 0 }}>
              <path d="M12 2L3 7v5c0 5.25 3.75 10.14 9 11.25C17.25 22.14 21 17.25 21 12V7L12 2z"/>
              <polyline points="9 12 11 14 15 10" stroke="#000" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 600, fontSize: '13px', color: '#FFFFFF' }}>Get a verified badge on your listings</span>
              <span style={{ fontSize: '12px', color: '#B3B3B3', marginLeft: '6px' }}>
                — Verify your student identity in Settings to build buyer trust.
              </span>
            </div>
            <a href="/settings"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 16px',
                borderRadius: '9999px',
                background: '#1DB954',
                color: '#000000',
                fontWeight: 700,
                fontSize: '12px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'background 150ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#1ED760'}
              onMouseLeave={e => e.currentTarget.style.background = '#1DB954'}
            >
              Verify Now →
            </a>
          </div>
        </div>
      )}

      {/* Main Content Containers */}
      <div className="container pb-5">
        {loading ? (
          <div className="d-flex justify-content-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading data...</span>
            </div>
          </div>
        ) : activeTab === 'products' ? (
          // 🗂 My Products Panel
          <div id="panelProducts" className="panel active">
            <div className="card-box">
              <div className="card-header-bar d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <div className="card-icon teal">🗂</div>
                  <h6>My Listings</h6>
                </div>
                <div>
                  <select
                    id="filterStatus"
                    className="filter-select"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">All</option>
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                  </select>
                </div>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                {filteredOwnedProducts.length === 0 ? (
                  <div className="text-center py-5 text-muted">No listings found.</div>
                ) : (
                  <table className="data-table" style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px' }}>Item</th>
                        <th style={{ padding: '12px 16px' }}>Price</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px' }}>Qty</th>
                        <th style={{ padding: '12px 16px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOwnedProducts.map((p) => (
                        <tr key={p.product_id}>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.product_name}</td>
                          <td style={{ padding: '12px 16px' }}>R{parseFloat(p.price).toFixed(2)}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className={`badge-status ${p.status}`}>
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>{p.quantity}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <div className="d-flex gap-1 flex-wrap">
                              <button className="btn btn-sm btn-outline-light" onClick={() => handleOpenEdit(p)}>✏️ Edit</button>
                              {p.status === 'available' && !p.is_hidden && (
                                <>
                                  <button className="btn btn-sm btn-outline-warning" onClick={() => handleHideProduct(p.product_id)}>Hide</button>
                                  <button className="btn btn-sm btn-outline-success" onClick={() => handleMarkSold(p.product_id)}>Mark Sold</button>
                                </>
                              )}
                              {p.status === 'hidden' && p.is_hidden && (
                                <button className="btn btn-sm btn-outline-success" onClick={() => handleRelistProduct(p.product_id)}>Relist</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        ) : (
          // 🛒 Orders Panel
          <div id="panelOrders" className="panel active">

            {/* Buying orders */}
            <div className="card-box mb-4">
              <div className="card-header-bar d-flex align-items-center gap-2">
                <div className="card-icon gold">🛒</div>
                <h6>Buying Orders</h6>
                <span className="header-sub">({buying.length})</span>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                {buying.length === 0 ? (
                  <div className="text-center py-4 text-muted">No buying transactions found.</div>
                ) : (
                  <table className="data-table" style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px' }}>Product</th>
                        <th style={{ padding: '12px 16px' }}>Price</th>
                        <th style={{ padding: '12px 16px' }}>Day</th>
                        <th style={{ padding: '12px 16px' }}>Time</th>
                        <th style={{ padding: '12px 16px' }}>Venue</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buying.map((o) => {
                        const sellerName = o.students
                          ? `${o.students.first_name} ${o.students.last_name}`
                          : 'Seller';
                        const alreadyRated = submittedRatings.has(o.order_id);
                        return (
                          <tr key={o.order_id}>
                            <td style={{ fontWeight: 600 }}>{o.products?.product_name || '—'}</td>
                            <td>R{parseFloat(o.products?.price || 0).toFixed(2)}</td>
                            <td>{o.meetup_slots?.day_of_week || '—'}</td>
                            <td>{o.meetup_slots?.slot_time ? o.meetup_slots.slot_time.slice(0, 5) : '—'}</td>
                            <td>{o.meetup_slots?.venue || '—'}</td>
                            <td>
                              <span className={`badge-status ${o.order_status}`}>
                                {o.order_status.toUpperCase()}
                              </span>
                              <PaymentBadge status={o.payment_status} />
                            </td>
                            <td>
                              <div className="d-flex gap-1 flex-wrap">
                                {/* Chat button — always available */}
                                <button
                                  id={`chatBuyBtn-${o.order_id}`}
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => handleOpenChat(o.order_id, o.products?.product_name, sellerName)}
                                  title="Chat with seller"
                                >
                                  💬 Chat
                                </button>

                                {/* Rate seller — only after completion and not yet rated */}
                                {o.order_status === 'completed' && !alreadyRated && o.seller_id && (
                                  <button
                                    id={`rateSellerBtn-${o.order_id}`}
                                    className="btn btn-sm btn-warning"
                                    onClick={() => handleOpenRating(o, true)}
                                    title="Rate the seller"
                                  >
                                    ⭐ Rate
                                  </button>
                                )}

                                {o.order_status === 'completed' && alreadyRated && (
                                  <span style={{ fontSize: 12, color: '#1DB954', fontWeight: 600, alignSelf: 'center' }}>✓ Rated</span>
                                )}

                                {/* Report button — for active non-completed orders */}
                                {o.order_status !== 'completed' && (
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleOpenReport(o.order_id, o.products?.product_name)}
                                  >
                                    Report
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Selling orders */}
            <div className="card-box">
              <div className="card-header-bar d-flex align-items-center gap-2">
                <div className="card-icon green">📦</div>
                <h6>Selling Sales</h6>
                <span className="header-sub">({selling.length})</span>
              </div>
              <div className="table-wrap" style={{ overflowX: 'auto' }}>
                {selling.length === 0 ? (
                  <div className="text-center py-4 text-muted">No sales transactions found.</div>
                ) : (
                  <table className="data-table" style={{ width: '100%', minWidth: '750px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '12px 16px' }}>Product</th>
                        <th style={{ padding: '12px 16px' }}>Buyer</th>
                        <th style={{ padding: '12px 16px' }}>Contact</th>
                        <th style={{ padding: '12px 16px' }}>Day</th>
                        <th style={{ padding: '12px 16px' }}>Time</th>
                        <th style={{ padding: '12px 16px' }}>Venue</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selling.map((o) => {
                        const buyerName = o.students
                          ? `${o.students.first_name} ${o.students.last_name}`
                          : 'Buyer';
                        const alreadyRated = submittedRatings.has(o.order_id);
                        return (
                          <tr key={o.order_id}>
                            <td style={{ fontWeight: 600 }}>{o.products?.product_name || '—'}</td>
                            <td>{buyerName}</td>
                            <td>{o.students?.contact_number || '—'}</td>
                            <td>{o.meetup_slots?.day_of_week || '—'}</td>
                            <td>{o.meetup_slots?.slot_time ? o.meetup_slots.slot_time.slice(0, 5) : '—'}</td>
                            <td>{o.meetup_slots?.venue || '—'}</td>
                            <td>
                              <span className={`badge-status ${o.order_status}`}>
                                {o.order_status.toUpperCase()}
                              </span>
                              <PaymentBadge status={o.payment_status} />
                            </td>
                            <td>
                              <div className="d-flex gap-1 flex-wrap">
                                {/* Chat with buyer */}
                                <button
                                  id={`chatSellBtn-${o.order_id}`}
                                  className="btn btn-sm btn-outline-primary"
                                  onClick={() => handleOpenChat(o.order_id, o.products?.product_name, buyerName)}
                                  title="Chat with buyer"
                                >
                                  💬 Chat
                                </button>

                                {/* Mark complete */}
                                {o.order_status === 'pending' && (
                                  <button
                                    id={`completeBtn-${o.order_id}`}
                                    className="btn btn-sm btn-success"
                                    onClick={() => completeOrder(o.order_id)}
                                  >
                                    ✅ Complete
                                  </button>
                                )}

                                {/* Rate buyer after completion */}
                                {o.order_status === 'completed' && !alreadyRated && o.buyer_id && (
                                  <button
                                    id={`rateBuyerBtn-${o.order_id}`}
                                    className="btn btn-sm btn-warning"
                                    onClick={() => handleOpenRating(o, false)}
                                    title="Rate the buyer"
                                  >
                                    ⭐ Rate
                                  </button>
                                )}

                                {o.order_status === 'completed' && alreadyRated && (
                                  <span style={{ fontSize: 12, color: '#1DB954', fontWeight: 600, alignSelf: 'center' }}>✓ Rated</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── EDIT MODAL ── */}
      {showEditModal && editProduct && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">✏️ Edit Item</h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Item Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="mb-2">
                  <label className="form-label">Price (R)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {showReportModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content" style={{ borderRadius: '14px' }}>
              <div className="modal-header">
                <h5 className="modal-title">⚠️ Report Item</h5>
                <button type="button" className="btn-close" onClick={() => setShowReportModal(false)}></button>
              </div>
              <div className="modal-body">
                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '14px' }}>
                  Reporting: <strong>{reportProdName}</strong>
                </p>
                <label className="form-label">Describe the transaction issue (scam, fake bills, absent counterpart)</label>
                <textarea
                  className="form-control"
                  rows="4"
                  placeholder="Enter complaint here…"
                  value={complaintText}
                  onChange={(e) => setComplaintText(e.target.value)}
                ></textarea>
              </div>
              <div className="modal-footer">
                <button className="btn btn-danger" onClick={submitComplaint}>Submit Complaint</button>
                <button type="button" className="btn btn-outline-secondary" onClick={() => setShowReportModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CHAT PANEL ── */}
      {showChat && chatOrderId && (
        <ChatPanel
          orderId={chatOrderId}
          orderLabel={chatOrderLabel}
          onClose={() => { setShowChat(false); setChatOrderId(null); }}
        />
      )}

      {/* ── RATING MODAL ── */}
      {showRatingModal && ratingOrder && (
        <RatingModal
          orderId={ratingOrder.orderId}
          reviewedUserId={ratingOrder.reviewedUserId}
          reviewedName={ratingOrder.reviewedName}
          onClose={() => { setShowRatingModal(false); setRatingOrder(null); }}
          onSuccess={() => {
            setSubmittedRatings((prev) => new Set([...prev, ratingOrder.orderId]));
            showToast('Review submitted successfully! ⭐', 'success');
          }}
        />
      )}
    </div>
  );
};
