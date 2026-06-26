import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import { Navbar } from '../components/Navbar';
import {
  IconUser,
  IconShoppingCart,
  IconFlag,
  IconPhoto,
  IconCalendar,
  IconMapPin,
  IconAlertTriangle,
  IconX,
  IconStar,
} from '@tabler/icons-react';
import '../styles/cat.css';
import '../styles/ratings.css';

// PayFast merchant configuration (sandbox by default)
const PAYFAST_MERCHANT_ID = import.meta.env.VITE_PAYFAST_MERCHANT_ID || '';
const PAYFAST_MERCHANT_KEY = import.meta.env.VITE_PAYFAST_MERCHANT_KEY || '';
const PAYFAST_RETURN_URL = `${window.location.origin}/activity`;
const PAYFAST_CANCEL_URL = `${window.location.origin}/`;
// ITN (webhook) URL — must be the deployed Supabase Edge Function public URL
const PAYFAST_NOTIFY_URL = import.meta.env.VITE_PAYFAST_NOTIFY_URL || '';
const PAYFAST_USE_SANDBOX = import.meta.env.VITE_PAYFAST_SANDBOX !== 'false'; // true by default

export const Catalog = () => {
  const { user } = useAuth();

  // Products & Categories state
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Seller rating data: { [sellerId]: { avg_rating, total_reviews } }
  const [sellerRatings, setSellerRatings] = useState({});

  // Flag tracking: set of product_ids the current user has already flagged
  const [userFlags, setUserFlags] = useState(new Set());

  // Selected item modal states (Buy flow)
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [slots, setSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyAlert, setBuyAlert] = useState({ show: false, text: '', type: '' });
  const [isOrdering, setIsOrdering] = useState(false);

  // Report/Complaint modal states
  const [reportedProduct, setReportedProduct] = useState(null);
  const [complaintText, setComplaintText] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);

  // Toast State
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });

  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  // ── Helper: Send notification ─────────────────────────
  const sendNotification = async (payload) => {
    try {
      await supabase.functions.invoke('send-notification', { body: payload });
    } catch (err) {
      console.warn('[Catalog] Notification failed:', err);
    }
  };

  // Load Catalog Data
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: catData } = await supabase.from('categories').select('*');
      setCategories(catData || []);

      const { data: prodData, error } = await supabase
        .from('products')
        .select(`
          product_id, product_name, description, price, quantity, status, seller_id, category_id,
          students!products_seller_id_fkey ( first_name, last_name, card_verified, face_verified ),
          product_images ( storage_path, is_primary )
        `)
        .eq('status', 'available')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(prodData || []);

      // Load seller rating aggregates from the view
      const { data: ratingData } = await supabase
        .from('seller_ratings')
        .select('student_id, avg_rating, total_reviews');

      const ratingsMap = {};
      (ratingData || []).forEach((r) => {
        ratingsMap[r.student_id] = r;
      });
      setSellerRatings(ratingsMap);

      // Load which products the current user has already flagged
      if (user?.student_id) {
        const { data: flagData } = await supabase
          .from('listing_flags')
          .select('product_id')
          .eq('flagged_by', user.student_id);
        setUserFlags(new Set((flagData || []).map((f) => f.product_id)));
      }

    } catch (err) {
      console.error('Error loading catalog data:', err);
      showToast('Could not retrieve product list.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [user?.student_id]);

  const filteredProducts = products.filter(p => {
    const term = searchQuery.toLowerCase();
    const name = p.product_name.toLowerCase();
    const desc = (p.description || '').toLowerCase();
    return name.includes(term) || desc.includes(term);
  });

  // Buy Modal
  const handleOpenBuyModal = async (prod) => {
    setSelectedProduct(prod);
    setSelectedSlotId(null);
    setBuyAlert({ show: false, text: '', type: '' });
    setShowBuyModal(true);

    try {
      const { data: slotData, error } = await supabase
        .from('meetup_slots')
        .select('*')
        .eq('product_id', prod.product_id)
        .eq('is_booked', false);

      if (error) throw error;
      setSlots(slotData || []);
    } catch (err) {
      console.error(err);
      setBuyAlert({ show: true, text: 'Could not load meetup slots.', type: 'error' });
    }
  };

  const handleSelectSlot = (slotId) => {
    setSelectedSlotId(slotId);
    setBuyAlert({ show: false, text: '', type: '' });
  };

  // ── PayFast redirect purchase flow ───────────────────
  const initiatePayFastPayment = async (orderId, productName, amount) => {
    if (!PAYFAST_MERCHANT_ID || !PAYFAST_MERCHANT_KEY) {
      // PayFast not configured — fall back to cash-on-meetup
      showToast('PayFast not configured — order confirmed (cash on meetup).', 'success');
      setShowBuyModal(false);
      loadData();
      return;
    }

    const params = new URLSearchParams({
      merchant_id:  PAYFAST_MERCHANT_ID,
      merchant_key: PAYFAST_MERCHANT_KEY,
      return_url:   PAYFAST_RETURN_URL,
      cancel_url:   PAYFAST_CANCEL_URL,
      notify_url:   PAYFAST_NOTIFY_URL,
      m_payment_id: orderId, // used by the ITN webhook to identify the order
      amount:       parseFloat(amount).toFixed(2),
      item_name:    productName.slice(0, 100),
    });

    const payFastHost = PAYFAST_USE_SANDBOX
      ? 'https://sandbox.payfast.co.za/eng/process'
      : 'https://www.payfast.co.za/eng/process';

    setShowBuyModal(false);
    showToast('Redirecting to PayFast payment gateway…', 'info');

    // Give toast a moment to show before redirect
    setTimeout(() => {
      window.location.href = `${payFastHost}?${params.toString()}`;
    }, 800);
  };

  const confirmBuy = async () => {
    if (user && selectedProduct.seller_id === user.student_id) {
      setBuyAlert({ show: true, text: 'You cannot purchase your own listing.', type: 'error' });
      return;
    }
    if (!selectedSlotId) {
      setBuyAlert({ show: true, text: 'Please select a meetup time slot first.', type: 'error' });
      return;
    }
    if (selectedProduct.status === 'sold') {
      setBuyAlert({ show: true, text: 'Sorry, this item is no longer available.', type: 'error' });
      return;
    }

    setIsOrdering(true);
    setBuyAlert({ show: false, text: '', type: '' });

    try {
      const { data: freshProd } = await supabase
        .from('products')
        .select('status, seller_id')
        .eq('product_id', selectedProduct.product_id)
        .single();

      if (freshProd?.status === 'sold') {
        setBuyAlert({ show: true, text: 'Sorry, this item was just sold to someone else.', type: 'error' });
        setIsOrdering(false);
        return;
      }

      const { data: result, error: rpcError } = await supabase.rpc('place_order', {
        p_product_id: selectedProduct.product_id,
        p_buyer_id: user.student_id,
        p_slot_id: selectedSlotId,
      });

      if (rpcError) {
        setBuyAlert({ show: true, text: 'Checkout failed: ' + rpcError.message, type: 'error' });
        setIsOrdering(false);
        return;
      }

      if (!result?.success) {
        setBuyAlert({ show: true, text: result?.message || 'Could not place order.', type: 'error' });
        setIsOrdering(false);
        return;
      }

      const newOrderId = result.order_id;

      // Notify seller via email
      if (newOrderId) {
        sendNotification({ event: 'order_placed', orderId: newOrderId });
      }

      // Attempt PayFast payment (if configured), otherwise fall back to cash
      if (PAYFAST_MERCHANT_ID && PAYFAST_MERCHANT_KEY && newOrderId) {
        await initiatePayFastPayment(
          newOrderId,
          selectedProduct.product_name,
          selectedProduct.price
        );
      } else {
        showToast('Order confirmed! Meetup details booked successfully.', 'success');
        setShowBuyModal(false);
        loadData();
      }

    } catch (err) {
      console.error(err);
      setBuyAlert({ show: true, text: 'An error occurred placing the order.', type: 'error' });
    } finally {
      setIsOrdering(false);
    }
  };

  // ── Community Flag ────────────────────────────────────
  const handleFlagListing = async (prod) => {
    if (!user) { showToast('You must be logged in to flag a listing.', 'error'); return; }

    if (userFlags.has(prod.product_id)) {
      showToast('You have already flagged this listing.', 'error');
      return;
    }

    try {
      const { data: result, error } = await supabase.rpc('flag_listing', {
        p_product_id: prod.product_id,
        p_student_id: user.student_id,
      });

      if (error) throw error;

      if (result?.success) {
        setUserFlags((prev) => new Set([...prev, prod.product_id]));
        showToast(`Listing flagged (${result.flag_count} flag${result.flag_count !== 1 ? 's' : ''} total). Admin will review.`, 'success');
        // If the listing was auto-hidden (>=5 flags), remove from local list
        if (result.flag_count >= 5) {
          setProducts((prev) => prev.filter((p) => p.product_id !== prod.product_id));
        }
      } else {
        showToast(result?.message || 'Could not flag listing.', 'error');
      }
    } catch (err) {
      console.error('[Catalog] flag error:', err);
      showToast('Could not flag listing. Please try again.', 'error');
    }
  };

  // Report Modal (formal complaint to admin)
  const handleOpenReportModal = (prod) => {
    setReportedProduct(prod);
    setComplaintText('');
    setShowReportModal(true);
  };

  const submitComplaint = async () => {
    if (!complaintText.trim()) {
      showToast('Please describe the issue.', 'error');
      return;
    }

    try {
      const { data: complaint, error } = await supabase.from('complaints').insert({
        product_id: reportedProduct.product_id,
        complainant_id: user.student_id,
        reported_user_id: reportedProduct.seller_id,
        complaint_text: complaintText.trim(),
        complaint_status: 'pending',
      }).select('complaint_id').single();

      if (error) throw error;

      showToast('Report submitted. Admin will review this listing shortly.', 'success');
      setShowReportModal(false);

      if (complaint?.complaint_id) {
        sendNotification({ event: 'complaint_filed', complaintId: complaint.complaint_id });
      }
    } catch (err) {
      console.error(err);
      showToast('Could not submit complaint. Please try again.', 'error');
    }
  };

  // ── Star Rating Badge (on card) ───────────────────────
  const SellerRatingBadge = ({ sellerId }) => {
    const rating = sellerRatings[sellerId];
    if (!rating || rating.total_reviews === 0) return null;
    return (
      <span className="seller-rating-badge" title={`${rating.total_reviews} review${rating.total_reviews !== 1 ? 's' : ''}`}>
        <span className="star-icon">★</span>
        {rating.avg_rating}
        <span style={{ color: '#b45309', fontWeight: 400 }}>({rating.total_reviews})</span>
      </span>
    );
  };

  return (
    <div className="catalog-page-wrap">
      <Navbar />

      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`toast show ${toast.type}`}
          style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1050 }}
        >
          {toast.msg}
        </div>
      )}

      <div className="catalog-content">
        {/* Header row */}
        <div className="catalog-header">
          <div>
            <h1 className="catalog-title">All Listings</h1>
            <p className="catalog-subtitle">Browse active student listings on campus</p>
          </div>
          <div className="catalog-search-wrap">
            <input
              type="text"
              id="searchInput"
              className="catalog-search"
              placeholder="Search listings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="catalog-loading">
            <div className="loading-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-img" />
                  <div className="skeleton-body">
                    <div className="skeleton-line wide" />
                    <div className="skeleton-line narrow" />
                    <div className="skeleton-line medium" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="catalog-empty">
            <IconPhoto size={48} strokeWidth={1.5} color="var(--spotify-muted)" />
            <p>No listings found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((p) => {
              const primaryImg = p.product_images?.find(img => img.is_primary) || p.product_images?.[0];
              const sellerName = p.students
                ? `${p.students.first_name} ${p.students.last_name}`
                : 'Unknown';
              const isOwner = user && p.seller_id === user.student_id;
              const alreadyFlagged = userFlags.has(p.product_id);

              return (
                <div key={p.product_id} className="product-card">
                  {p.status === 'sold' && (
                    <div className="sold-out-overlay">SOLD OUT</div>
                  )}

                  {/* Image area */}
                  <div className="product-card-image-wrap">
                    {primaryImg ? (
                      <img src={primaryImg.storage_path} alt={p.product_name} />
                    ) : (
                      <div className="img-placeholder">
                        <IconPhoto size={32} strokeWidth={1.5} color="var(--spotify-muted)" />
                      </div>
                    )}
                    {/* Hover buy button — only for non-owners on available items */}
                    {p.status !== 'sold' && !isOwner && (
                      <button
                        className="product-play-btn"
                        title="Buy now"
                        aria-label={`Buy ${p.product_name}`}
                        onClick={(e) => { e.stopPropagation(); handleOpenBuyModal(p); }}
                      >
                        <IconShoppingCart size={20} strokeWidth={2} />
                      </button>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="product-card-body">
                    <div className="card-title-row">
                      <h2 className="product-title">{p.product_name}</h2>
                      <span className="product-price-badge">R{parseFloat(p.price).toFixed(2)}</span>
                    </div>

                    <p className="product-desc">
                      {p.description || 'No description provided.'}
                    </p>

                    <div className="product-seller-row">
                      <span className="seller-info">
                        <span className="seller-avatar-icon">
                          <IconUser size={12} strokeWidth={2} />
                        </span>
                        {sellerName}
                        {p.students?.card_verified && p.students?.face_verified && (
                          <span
                            title="Verified MUT student"
                            style={{ display: 'inline-flex', alignItems: 'center', marginLeft: 4, verticalAlign: 'middle' }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--spotify-green)" stroke="none">
                              <path d="M12 2L3 7v5c0 5.25 3.75 10.14 9 11.25C17.25 22.14 21 17.25 21 12V7L12 2z"/>
                              <polyline points="9 12 11 14 15 10" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        )}
                        <SellerRatingBadge sellerId={p.seller_id} />
                      </span>

                      {isOwner ? (
                        <span className="your-listing-badge">Your listing</span>
                      ) : p.status === 'sold' ? (
                        <span className="sold-badge">Sold out</span>
                      ) : (
                        <div className="card-actions">
                          <button
                            id={`buyBtn-${p.product_id}`}
                            className="btn-buy"
                            aria-label={`Buy ${p.product_name}`}
                            onClick={() => handleOpenBuyModal(p)}
                          >
                            Buy
                          </button>
                          {/* Flag as suspicious — distinct from formal complaint */}
                          <button
                            id={`flagBtn-${p.product_id}`}
                            className="btn-report"
                            title={alreadyFlagged ? 'Already flagged' : 'Flag as suspicious'}
                            aria-label={`Flag ${p.product_name}`}
                            onClick={() => alreadyFlagged ? null : handleFlagListing(p)}
                            style={alreadyFlagged ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                            disabled={alreadyFlagged}
                          >
                            <IconFlag size={14} strokeWidth={2} />
                          </button>
                          {/* Formal complaint to admin */}
                          <button
                            id={`reportBtn-${p.product_id}`}
                            className="btn-report"
                            title="Report to admin"
                            aria-label={`Report ${p.product_name}`}
                            onClick={() => handleOpenReportModal(p)}
                            style={{ marginLeft: 2 }}
                          >
                            <IconAlertTriangle size={14} strokeWidth={2} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BUY MODAL */}
      {showBuyModal && selectedProduct && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowBuyModal(false); }}
        >
          <div className="modal-panel modal-lg">
            <div className="modal-head">
              <h2 className="modal-heading">Buy Item</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowBuyModal(false)}
                aria-label="Close"
              >
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="modal-bod">
              {buyAlert.show && (
                <div className={`inline-alert ${buyAlert.type}`}>
                  <IconAlertTriangle size={16} strokeWidth={2} style={{ flexShrink: 0 }} />
                  {buyAlert.text}
                </div>
              )}

              <div className="modal-product-row">
                <div className="modal-img-col">
                  {selectedProduct.product_images?.find(i => i.is_primary)?.storage_path ? (
                    <img
                      src={selectedProduct.product_images.find(i => i.is_primary).storage_path}
                      alt={selectedProduct.product_name}
                      className="modal-product-img"
                    />
                  ) : (
                    <div className="modal-img-placeholder">
                      <IconPhoto size={36} strokeWidth={1.5} color="var(--spotify-muted)" />
                    </div>
                  )}
                </div>
                <div className="modal-info-col">
                  <h3 className="modal-product-name">{selectedProduct.product_name}</h3>
                  <p className="modal-product-price">R{parseFloat(selectedProduct.price).toFixed(2)}</p>
                  <span className="seller-chip">
                    <IconUser size={13} strokeWidth={2} />
                    Sold by {selectedProduct.students
                      ? `${selectedProduct.students.first_name} ${selectedProduct.students.last_name}`
                      : 'Unknown'}
                  </span>
                  {/* Seller rating in modal */}
                  {sellerRatings[selectedProduct.seller_id]?.total_reviews > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <SellerRatingBadge sellerId={selectedProduct.seller_id} />
                    </div>
                  )}
                  <p className="modal-product-desc">{selectedProduct.description}</p>
                </div>
              </div>

              <hr className="modal-divider" />

              <h3 className="modal-section-title">
                <IconCalendar size={16} strokeWidth={2} />
                Select a Meetup Slot
              </h3>
              <p className="modal-section-sub">
                All meetups are at pre-approved MUT campus safe zones.
                {PAYFAST_MERCHANT_ID ? ' Payment via PayFast.' : ' Pay cash on delivery.'}
              </p>

              {slots.length === 0 ? (
                <div className="slots-empty">
                  <IconAlertTriangle size={18} strokeWidth={1.5} />
                  No available meetup slots listed. Contact the seller directly.
                </div>
              ) : (
                <div className="slots-grid">
                  {slots.map((s) => (
                    <div
                      key={s.slot_id}
                      className={`slot-card${selectedSlotId === s.slot_id ? ' selected' : ''}`}
                      onClick={() => handleSelectSlot(s.slot_id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && handleSelectSlot(s.slot_id)}
                    >
                      <div className="slot-day">{s.day_of_week}</div>
                      <div className="slot-time">{s.slot_time.slice(0, 5)}</div>
                      <div className="slot-venue">
                        <IconMapPin size={11} strokeWidth={2} />
                        {s.venue}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedSlotId && selectedProduct && (() => {
                const slot = slots.find(s => s.slot_id === selectedSlotId);
                if (!slot) return null;
                return (
                  <div className="order-summary">
                    <p className="order-summary-title">Order Summary</p>
                    <div className="summary-row"><span>Item</span><strong>{selectedProduct.product_name}</strong></div>
                    <div className="summary-row"><span>Price</span><strong>R{parseFloat(selectedProduct.price).toFixed(2)}</strong></div>
                    <div className="summary-row"><span>Payment</span><strong>{PAYFAST_MERCHANT_ID ? 'PayFast (secure)' : 'Cash on meetup'}</strong></div>
                    <div className="summary-row"><span>Meetup Day</span><strong>{slot.day_of_week}</strong></div>
                    <div className="summary-row"><span>Time</span><strong>{slot.slot_time.slice(0, 5)}</strong></div>
                    <div className="summary-row"><span>Venue</span><strong>{slot.venue}</strong></div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-foot">
              <button
                id="confirmBuyBtn"
                className="btn btn-primary"
                disabled={!selectedSlotId || isOrdering}
                onClick={confirmBuy}
              >
                {isOrdering
                  ? 'Placing order...'
                  : PAYFAST_MERCHANT_ID
                    ? 'Proceed to Payment'
                    : 'Confirm Purchase'}
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setShowBuyModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT MODAL */}
      {showReportModal && reportedProduct && (
        <div
          className="modal-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReportModal(false); }}
        >
          <div className="modal-panel">
            <div className="modal-head">
              <h2 className="modal-heading">
                <IconFlag size={18} strokeWidth={2} style={{ marginRight: '8px', color: 'var(--spotify-error)' }} />
                Report Listing
              </h2>
              <button className="modal-close-btn" onClick={() => setShowReportModal(false)} aria-label="Close">
                <IconX size={20} strokeWidth={2} />
              </button>
            </div>
            <div className="modal-bod">
              <p className="report-context">
                Reporting: <strong>{reportedProduct.product_name}</strong>
              </p>
              <label className="form-label-ds" htmlFor="complaintTextarea">
                Describe the policy violation or issue
              </label>
              <textarea
                id="complaintTextarea"
                className="form-control"
                rows="4"
                placeholder="Describe the details..."
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
              />
            </div>
            <div className="modal-foot">
              <button id="submitReportBtn" className="btn btn-danger" onClick={submitComplaint}>
                Submit Report
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setShowReportModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
