import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../components/AuthContext';
import { Navbar } from '../components/Navbar';
import { MeetupHubPicker } from '../components/MeetupHubPicker';
import '../styles/listing.css';

export const Sell = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Categories Dropdown State
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Form Fields State
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);

  // Meetup slots State
  const [slots, setSlots] = useState([
    { id: 1, day: 'Monday', time: '12:00', venue: 'Library Reception' }
  ]);
  const [nextSlotId, setNextSlotId] = useState(2);

  // Submitting States
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Toast State
  const [toast, setToast] = useState({ show: false, msg: '', type: 'info' });

  const showToast = (msg, type = 'info') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'info' }), 3000);
  };

  // Load Categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('category_id, category_name')
          .order('category_name', { ascending: true });

        if (error) throw error;
        setCategories(data || []);
      } catch (err) {
        console.error('Error loading categories:', err);
        showToast('Could not load categories dropdown.', 'error');
      } finally {
        setLoadingCategories(false);
      }
    };
    loadCategories();
  }, []);

  // ── Meetup slots handlers ─────────────────────────────
  const addSlot = () => {
    setSlots([
      ...slots,
      { id: nextSlotId, day: 'Monday', time: '12:00', venue: 'Library Reception' }
    ]);
    setNextSlotId(nextSlotId + 1);
  };

  const removeSlot = (id) => {
    setSlots(slots.filter(s => s.id !== id));
  };

  const updateSlotField = (id, field, value) => {
    setSlots(slots.map(s => {
      if (s.id === id) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  // ── Form Submission ──────────────────────────────────
  const submitItem = async () => {
    // 1. Validation
    if (!name.trim()) { showToast('Item name is required.', 'error'); return; }
    if (!price.trim() || isNaN(parseFloat(price)) || parseFloat(price) <= 0) { 
      showToast('Please enter a valid price.', 'error'); return; 
    }
    if (!category) { showToast('Please select a category.', 'error'); return; }
    if (quantity < 1) { showToast('Quantity must be at least 1.', 'error'); return; }
    if (!description.trim()) { showToast('Description is required.', 'error'); return; }
    if (slots.length === 0) { showToast('Please add at least one meetup slot.', 'error'); return; }

    setIsSubmitting(true);

    try {
      // 1. Insert product record with 'hidden' status initially
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .insert({
          product_name: name.trim(),
          price: parseFloat(price),
          category_id: parseInt(category, 10),
          quantity: parseInt(quantity, 10),
          description: description.trim(),
          seller_id: user.student_id,
          status: 'hidden', // initially hidden until AI approved
          is_hidden: true,
        })
        .select('product_id')
        .single();

      if (prodErr || !prodData) {
        throw new Error(prodErr?.message || 'Failed to create product listing.');
      }

      const productId = prodData.product_id;

      // 2. Upload file to Supabase Storage if attached
      let uploadedImageUrl = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const rand = Math.random().toString(36).substring(2, 8);
        const storagePath = `product-images/${productId}-${rand}.${fileExt}`;

        const { error: uploadErr } = await supabase.storage
          .from('product-images')
          .upload(storagePath, imageFile, { contentType: imageFile.type, upsert: true });

        if (uploadErr) {
          console.warn('[listing] Image upload failed:', uploadErr.message);
        } else {
          const { data: urlData } = supabase.storage
            .from('product-images')
            .getPublicUrl(storagePath);
          uploadedImageUrl = urlData?.publicUrl || null;
        }
      }

      // 3. Link image URL to database if uploaded
      if (uploadedImageUrl) {
        const { error: imgLinkErr } = await supabase
          .from('product_images')
          .insert({
            product_id: productId,
            storage_path: uploadedImageUrl,
            is_primary: true,
          });
        if (imgLinkErr) {
          console.warn('[listing] Image linking failed:', imgLinkErr.message);
        }
      }

      // 4. Create meetup slots
      const slotsPayload = slots.map(s => ({
        product_id: productId,
        day_of_week: s.day,
        slot_time: `${s.time}:00`, // format as TIME
        venue: s.venue.trim(),
        is_booked: false,
      }));

      const { error: slotsErr } = await supabase
        .from('meetup_slots')
        .insert(slotsPayload);

      if (slotsErr) {
        console.warn('[listing] Meetup slots insertions failed:', slotsErr.message);
      }

      showToast('Item listed! Redirecting to review scanner...', 'success');
      
      // Redirect to simulated AI moderation review
      setTimeout(() => navigate(`/review?product_id=${productId}`), 1800);

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to submit listing.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="catalog-page-wrap pb-5">
      <Navbar />

      {/* Toast Notification */}
      {toast.show && (
        <div className={`toast show ${toast.type}`} style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 1050 }}>
          {toast.msg}
        </div>
      )}

      <div className="main-card">
        <h4 className="mb-4">Sell an Item</h4>

        {/* STEP 1 */}
        <div className="step-card">
          <div className="section-title">Step 1: Item Basics</div>
          <input 
            type="text"
            className="form-control mb-2" 
            placeholder="Item Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input 
            type="text"
            className="form-control mb-2" 
            placeholder="Price (R)"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <select 
            className="form-select mb-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loadingCategories}
          >
            <option value="">— Select Category —</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>{c.category_name}</option>
            ))}
          </select>
          <input 
            className="form-control" 
            type="number" 
            min="1" 
            placeholder="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          />
        </div>

        {/* STEP 2 */}
        <div className="step-card">
          <div className="section-title">Step 2: Description &amp; Media</div>
          <textarea 
            rows="4" 
            className="form-control mb-3"
            placeholder="Describe your item condition, defects, or age…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
          <input 
            type="file" 
            className="form-control" 
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
        </div>

        {/* STEP 3 */}
        <div className="step-card">
          <div className="section-title">Step 3: Meet-up Availability</div>
          <div id="slotContainer">
            {slots.map((s, idx) => (
              <div
                key={s.id}
                className="slot-row-item mb-4"
                style={{ borderBottom: idx < slots.length - 1 ? '1px solid #f3f4f6' : 'none', paddingBottom: idx < slots.length - 1 ? '20px' : 0 }}
              >
                {/* Slot header */}
                <div className="d-flex align-items-center justify-content-between mb-3">
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Slot #{idx + 1}</span>
                  {slots.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => removeSlot(s.id)}
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>

                {/* Day + Time row */}
                <div className="d-flex gap-2 mb-3 flex-wrap">
                  <select
                    id={`slot-day-${s.id}`}
                    className="form-select"
                    style={{ width: '140px' }}
                    value={s.day}
                    onChange={(e) => updateSlotField(s.id, 'day', e.target.value)}
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                  <input
                    id={`slot-time-${s.id}`}
                    type="time"
                    className="form-control"
                    style={{ width: '130px' }}
                    value={s.time}
                    onChange={(e) => updateSlotField(s.id, 'time', e.target.value)}
                  />
                </div>

                {/* Hub Picker */}
                <MeetupHubPicker
                  value={s.venue}
                  onChange={(hubName) => updateSlotField(s.id, 'venue', hubName)}
                />
              </div>
            ))}
          </div>
          <button className="btn btn-dark btn-sm mt-3" onClick={addSlot} type="button">+ Add Another Slot</button>
        </div>

        {/* SUBMIT */}
        <div className="text-end">
          <button 
            className="btn btn-success mt-3" 
            onClick={submitItem}
            disabled={isSubmitting}
            style={{ padding: '10px 24px', fontWeight: 600 }}
          >
            {isSubmitting ? 'Listing item...' : 'List Item'}
          </button>
        </div>
      </div>
    </div>
  );
};
