import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { IconX } from '@tabler/icons-react';
import '../styles/ratings.css';

const STAR_LABELS = {
  1: 'Poor — Very unsatisfied',
  2: 'Fair — Below expectations',
  3: 'Okay — Met expectations',
  4: 'Good — Above expectations',
  5: 'Excellent — Outstanding!',
};

/**
 * RatingModal — Star-rating + written review form.
 *
 * Props:
 *   orderId        {string}   — The completed order being rated
 *   reviewedUserId {string}   — student_id of the person being rated
 *   reviewedName   {string}   — Display name of the person being rated
 *   onClose        {function} — Dismiss the modal
 *   onSuccess      {function} — Called after a successful rating submission
 */
export const RatingModal = ({ orderId, reviewedUserId, reviewedName, onClose, onSuccess }) => {
  const { user } = useAuth();
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const activeStars = hovered || stars;

  const handleSubmit = async () => {
    if (stars === 0) {
      setError('Please select a star rating before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { error: dbError } = await supabase.from('ratings').insert({
        order_id: orderId,
        reviewer_id: user.student_id,
        reviewed_user_id: reviewedUserId,
        stars,
        review_text: reviewText.trim() || null,
      });

      if (dbError) {
        if (dbError.code === '23505') {
          // Unique constraint — already rated
          setError('You have already submitted a rating for this order.');
        } else {
          setError('Could not submit rating: ' + dbError.message);
        }
        return;
      }

      setSubmitted(true);
      onSuccess?.();
    } catch (err) {
      setError('An unexpected error occurred.');
      console.error('[RatingModal]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="rating-modal-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rating-modal-panel" role="dialog" aria-label="Leave a review">
        {/* Header */}
        <div className="rating-modal-head">
          <h2 className="rating-modal-title">⭐ Leave a Review</h2>
          <button className="rating-modal-close" onClick={onClose} aria-label="Close">
            <IconX size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        {submitted ? (
          <div className="rating-success-msg">
            <span className="success-icon">🎉</span>
            <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Review Submitted!</h3>
            <p>Your rating for <strong>{reviewedName}</strong> has been saved.</p>
            <button className="btn btn-primary mt-3" onClick={onClose} style={{ minWidth: 120 }}>
              Done
            </button>
          </div>
        ) : (
          <div className="rating-modal-body">
            <p className="rating-context">
              Rate your experience with <strong>{reviewedName}</strong>
            </p>

            {/* Star Widget */}
            <div className="star-row" id="starRatingRow">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  id={`star-${n}`}
                  className={`star-btn${activeStars >= n ? ' filled' : ''}`}
                  onClick={() => setStars(n)}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                  {activeStars >= n ? '★' : '☆'}
                </button>
              ))}
            </div>

            <div className="star-label">
              {activeStars > 0 ? STAR_LABELS[activeStars] : 'Hover or tap to rate'}
            </div>

            {/* Review Text */}
            <textarea
              id="reviewTextarea"
              className="rating-textarea"
              rows={4}
              placeholder="Share your experience (optional)…"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value.slice(0, 500))}
            />
            <div className="rating-char-count">{reviewText.length}/500</div>

            {/* Error */}
            {error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 8,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#dc2626',
                  marginTop: 12,
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!submitted && (
          <div className="rating-modal-foot">
            <button
              id="submitRatingBtn"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || stars === 0}
            >
              {submitting ? 'Submitting…' : 'Submit Review'}
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
