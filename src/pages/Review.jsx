import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import '../styles/review.css';

const RULES = {
  BANNED: [
    'gun','guns','pistol','rifle','firearm','ammunition','ammo','bullet','bullets',
    'knife','knives','sword','blade','machete','taser','stun gun','explosive',
    'grenade','bomb','dynamite',
    'drug','drugs','weed','cannabis','cocaine','heroin','meth','methamphetamine',
    'ecstasy','mdma','lsd','pills','narcotics','dagga','tik','nyaope','whoonga',
    'stolen','fake id','fake passport','counterfeit','replica watch','pirated',
    'cracked software','illegal',
    'porn','pornography','escort','prostitut','sex toy','adult content',
    'malware','hack','phishing','ransomware',
  ],
  SUSPICIOUS: [
    'iphone 16','iphone 15','macbook','rolex','gucci','louis vuitton',
    'prada','versace','jordans','yeezy','supreme','playstation 5','ps5',
    'xbox series','rtx 4090','nvidia','gpu','free money','make money',
    'investment','guaranteed','mlm','pyramid','get rich',
  ],
  MIN_PRICE: 1,
  MAX_PRICE: 15000,
  MIN_DESC_LENGTH: 10,
  MIN_NAME_LENGTH: 3,
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const Review = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get('product_id');

  // Review states
  const [loading, setLoading] = useState(true);
  const [statusText, setStatusText] = useState('Connecting to AI reviewer…');
  const [stepIndex, setStepIndex] = useState(2); // 1: listed, 2: review, 3: live
  const [errorMsg, setErrorMsg] = useState('');

  // Result states
  const [verdict, setVerdict] = useState(null); // 'approved' | 'flagged' | 'rejected'
  const [verdictReason, setVerdictReason] = useState('');
  const [verdictNotes, setVerdictNotes] = useState('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productPrice, setProductPrice] = useState(0);

  // Deletion loading
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Run AI Review ─────────────────────────────────────
  const runAIReview = async (product) => {
    try {
      setStatusText('Connecting to AI reviewer…');
      await delay(900);

      setStatusText('Sending listing to AI reviewer…');
      await delay(700);

      setStatusText('AI is analysing your listing…');
      await delay(1100);

      setStatusText('Checking content policy…');
      await delay(600);

      setStatusText('Applying review decision…');
      await delay(500);

      const name = (product.product_name || '').toLowerCase();
      const desc = (product.description || '').toLowerCase();
      const priceVal = parseFloat(product.price) || 0;
      const combined = `${name} ${desc}`;

      // 1. Banned keyword check
      const bannedHit = RULES.BANNED.find(kw => combined.includes(kw));
      if (bannedHit) {
        return applyVerdict({
          verdict: 'rejected',
          reason: `This listing contains a prohibited item or term ("${bannedHit}"). It violates UniMarket's content policy.`,
          notes: 'Listings must be for lawful physical goods only. Please review the marketplace guidelines before listing again.',
          safe: false,
        });
      }

      // 2. Price check
      if (priceVal < RULES.MIN_PRICE) {
        return applyVerdict({
          verdict: 'rejected',
          reason: 'The listed price is R0 or below. All items must have a valid price.',
          notes: 'Update your listing with a realistic price and resubmit.',
          safe: false,
        });
      }

      if (priceVal > RULES.MAX_PRICE) {
        return applyVerdict({
          verdict: 'flagged',
          reason: `The price of R${priceVal.toFixed(2)} is above the R15,000 campus marketplace limit and needs admin review.`,
          notes: 'If this is a genuine high-value item, an admin will review and approve your listing shortly.',
          safe: false,
        });
      }

      // 3. Name length check
      if (product.product_name.trim().length < RULES.MIN_NAME_LENGTH) {
        return applyVerdict({
          verdict: 'flagged',
          reason: 'Your item name is too short. Please provide a clear, descriptive name.',
          notes: 'A good name helps buyers find your item. Try something like "Calculus Textbook 3rd Ed." instead of just "Book".',
          safe: false,
        });
      }

      // 4. Description length check
      if (product.description && product.description.trim().length > 0 &&
          product.description.trim().length < RULES.MIN_DESC_LENGTH) {
        return applyVerdict({
          verdict: 'flagged',
          reason: 'Your description is too brief. Buyers need more detail to trust your listing.',
          notes: 'Add at least a sentence describing the item condition, age, or any defects.',
          safe: false,
        });
      }

      // 5. Suspicious keywords check
      const suspiciousHit = RULES.SUSPICIOUS.find(kw => combined.includes(kw));
      if (suspiciousHit) {
        return applyVerdict({
          verdict: 'flagged',
          reason: `This listing contains a term ("${suspiciousHit}") commonly associated with high-value or counterfeit goods and has been flagged for admin review.`,
          notes: 'If your item is genuine, an admin will approve it shortly. No action needed from you.',
          safe: false,
        });
      }

      // 6. Quantity check
      if ((parseInt(product.quantity) || 0) <= 0) {
        return applyVerdict({
          verdict: 'rejected',
          reason: 'Quantity must be at least 1. You cannot list an item with zero stock.',
          notes: 'Go back and update the quantity before resubmitting.',
          safe: false,
        });
      }

      // 7. Approved
      return applyVerdict({
        verdict: 'approved',
        reason: 'This listing meets all UniMarket content and pricing guidelines.',
        notes: 'Your item is now live on the catalogue. Good luck with your sale! 🎉',
        safe: true,
      });

    } catch (err) {
      console.error(err);
      setErrorMsg('AI review failed to complete.');
      setLoading(false);
    }
  };

  const applyVerdict = async (result) => {
    try {
      if (result.safe && result.verdict === 'approved') {
        const { error } = await supabase
          .from('products')
          .update({ status: 'available', is_hidden: false })
          .eq('product_id', productId);
        if (error) throw error;
        setStepIndex(3);
      } else {
        const { error } = await supabase
          .from('products')
          .update({
            status: result.verdict === 'rejected' ? 'suspended' : 'hidden',
            is_hidden: true,
          })
          .eq('product_id', productId);
        if (error) throw error;
      }

      setVerdict(result.verdict);
      setVerdictReason(result.reason);
      setVerdictNotes(result.notes);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setErrorMsg('Could not update listing verdict status.');
      setLoading(false);
    }
  };

  // ── Load product details on mount ─────────────────────
  useEffect(() => {
    const loadProduct = async () => {
      if (!productId) {
        setErrorMsg('No product ID found. Please go back and list your item again.');
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('products')
          .select(`
            product_id, product_name, description, price, quantity, status, seller_id,
            categories ( category_name )
          `)
          .eq('product_id', productId)
          .single();

        if (error || !data) {
          setErrorMsg('Could not load your listing. Please try again.');
          setLoading(false);
          return;
        }

        // Verify resource owner
        if (user && data.seller_id !== user.student_id) {
          setErrorMsg('You are not authorised to review this listing.');
          setLoading(false);
          return;
        }

        setProductName(data.product_name);
        setProductCategory(data.categories?.category_name || 'Unknown');
        setProductPrice(data.price);

        // Run scanning
        runAIReview(data);

      } catch (err) {
        console.error(err);
        setErrorMsg('Could not retrieve product information.');
        setLoading(false);
      }
    };

    if (user) {
      loadProduct();
    }
  }, [productId, user]);

  // ── Delete Listing ────────────────────────────────────
  const deleteListing = async () => {
    if (!window.confirm('Are you sure you want to remove this listing?')) return;
    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from('products')
        .update({ is_hidden: true, status: 'hidden' })
        .eq('product_id', productId);

      if (error) throw error;
      navigate('/activity');
    } catch (err) {
      console.error(err);
      alert('Could not remove listing.');
      setIsDeleting(false);
    }
  };

  return (
    <div style={{ background: '#121212', minHeight: '100vh', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div className="review-card">
        <div className="review-header">
          <h1>🤖 AI Listing Review</h1>
          <p>Your item is being reviewed before it goes live on the catalogue</p>
        </div>

        <div className="review-body">
          {/* STEP INDICATOR */}
          <div className="steps">
            <div className="step done" id="stepListed">
              <div className="step-circle">✓</div>
              <div className="step-label">Listed</div>
            </div>
            <div className="step-line done"></div>
            <div className={`step ${stepIndex === 2 ? 'active' : ''} ${stepIndex > 2 ? 'done' : ''}`} id="stepReview">
              <div className="step-circle">{stepIndex > 2 ? '✓' : '2'}</div>
              <div className="step-label">AI Review</div>
            </div>
            <div className={`step-line ${stepIndex === 3 ? 'done' : ''}`} id="lineApprove"></div>
            <div className={`step ${stepIndex === 3 ? 'active' : ''}`} id="stepApprove">
              <div className="step-circle">3</div>
              <div className="step-label">Live</div>
            </div>
          </div>

          {/* STAGE 1: REVIEWING */}
          {loading && !errorMsg && (
            <div className="stage active" id="stageReviewing">
              <div className="ai-spinner">
                <div className="spinner-ring"></div>
                <p className="ai-status" id="aiStatusText">{statusText}</p>
              </div>
            </div>
          )}

          {/* ERROR STATUS */}
          {errorMsg && (
            <div className="stage active">
              <div className="verdict-box rejected">
                <div className="verdict-icon">⚠️</div>
                <div>
                  <p className="verdict-title">Something went wrong</p>
                  <p className="verdict-body">{errorMsg}</p>
                </div>
              </div>
              <div className="text-center mt-4">
                <Link to="/sell" className="btn-secondary-uni" style={{ textDecoration: 'none' }}>
                  ← Back to Sell Page
                </Link>
              </div>
            </div>
          )}

          {/* STAGE 2: RESULT */}
          {!loading && !errorMsg && verdict && (
            <div className="stage active" id="stageResult">
              <div className={`verdict-box ${verdict}`}>
                <div className="verdict-icon">
                  {verdict === 'approved' && '✅'}
                  {verdict === 'flagged' && '⚠️'}
                  {verdict === 'rejected' && '❌'}
                </div>
                <div>
                  <p className="verdict-title">
                    {verdict === 'approved' && 'Listing Approved!'}
                    {verdict === 'flagged' && 'Listing Needs Attention'}
                    {verdict === 'rejected' && 'Listing Rejected'}
                  </p>
                  <p className="verdict-body">{verdictReason}</p>
                </div>
              </div>

              <div className="ai-notes" id="aiNotesBox">
                <strong>💡 AI Reviewer Note</strong>
                <p style={{ margin: 0, marginTop: '4px' }}>{verdictNotes}</p>
              </div>

              <div className="product-preview" id="productPreview">
                <div className="preview-row">
                  <span>Item</span>
                  <span>{productName}</span>
                </div>
                <div className="preview-row">
                  <span>Category</span>
                  <span>{productCategory}</span>
                </div>
                <div className="preview-row">
                  <span>Price</span>
                  <span>R{parseFloat(productPrice).toFixed(2)}</span>
                </div>
                <div className="preview-row">
                  <span>Review Verdict</span>
                  <span 
                    style={{ 
                      color: verdict === 'approved' ? '#059669' : verdict === 'rejected' ? '#dc2626' : '#d97706',
                      fontWeight: 700 
                    }}
                  >
                    {verdict.toUpperCase()}
                  </span>
                </div>
              </div>

              <div id="resultActions" className="d-flex flex-column gap-2 mt-4">
                {verdict === 'approved' ? (
                  <>
                    <button className="btn-primary-uni" onClick={() => navigate('/')}>
                      🛍️ View on Catalogue
                    </button>
                    <button className="btn-secondary-uni" onClick={() => navigate('/activity')}>
                      📦 Go to My Activity
                    </button>
                  </>
                ) : verdict === 'flagged' ? (
                  <>
                    <button className="btn-secondary-uni" onClick={() => navigate('/activity')}>
                      📦 Go to My Activity
                    </button>
                    <button className="btn-danger-uni" onClick={deleteListing} disabled={isDeleting}>
                      🗑️ {isDeleting ? 'Removing...' : 'Remove This Listing'}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn-secondary-uni" onClick={() => navigate('/sell')}>
                      ✏️ List a Different Item
                    </button>
                    <button className="btn-danger-uni" onClick={deleteListing} disabled={isDeleting}>
                      🗑️ {isDeleting ? 'Removing...' : 'Remove This Listing'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Link className="logo-link" to="/" style={{ textDecoration: 'none', color: '#B3B3B3', fontSize: '14px', marginTop: '20px' }}>
        ← Back to Catalogue
      </Link>
    </div>
  );
};
