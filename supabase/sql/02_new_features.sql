-- ============================================================
-- UniMarket v2 — Feature Migration 02: High-Impact New Features
-- Run this in the Supabase SQL Editor after 01_security_patches.sql
-- ============================================================

-- ── FEATURE 1: In-App Messaging ──────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  message_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID        NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  content      TEXT        NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Only order participants (buyer/seller) can read messages for their order
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.order_id = messages.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- Only order participants can insert
DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.order_id = messages.order_id
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- ── FEATURE 3: Seller Ratings & Buyer Reviews ────────────────
CREATE TABLE IF NOT EXISTS ratings (
  rating_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  reviewer_id      UUID        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  reviewed_user_id UUID        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  stars            SMALLINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  review_text      TEXT        CHECK (char_length(review_text) <= 500),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ratings_order_reviewer UNIQUE (order_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_reviewed_user ON ratings(reviewed_user_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Anyone can read ratings (public reputation scores)
DROP POLICY IF EXISTS "ratings_select" ON ratings;
CREATE POLICY "ratings_select" ON ratings
  FOR SELECT USING (true);

-- Only order participants can insert (and only for completed orders)
DROP POLICY IF EXISTS "ratings_insert" ON ratings;
CREATE POLICY "ratings_insert" ON ratings
  FOR INSERT WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.order_id = ratings.order_id
        AND o.order_status = 'completed'
        AND (o.buyer_id = auth.uid() OR o.seller_id = auth.uid())
    )
  );

-- ── FEATURE 4: Community Listing Flags ───────────────────────
CREATE TABLE IF NOT EXISTS listing_flags (
  flag_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  flagged_by  UUID        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_listing_flag_user UNIQUE (product_id, flagged_by)
);

CREATE INDEX IF NOT EXISTS idx_listing_flags_product ON listing_flags(product_id);

ALTER TABLE listing_flags ENABLE ROW LEVEL SECURITY;

-- Authenticated users can see flags on any product
DROP POLICY IF EXISTS "listing_flags_select" ON listing_flags;
CREATE POLICY "listing_flags_select" ON listing_flags
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Any student can flag a listing (once per product)
DROP POLICY IF EXISTS "listing_flags_insert" ON listing_flags;
CREATE POLICY "listing_flags_insert" ON listing_flags
  FOR INSERT WITH CHECK (flagged_by = auth.uid());

-- ── Auto-hide trigger: hide listing when flags >= 5 ──────────
CREATE OR REPLACE FUNCTION check_flag_threshold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_flag_count INTEGER;
  v_threshold  INTEGER := 5;
BEGIN
  SELECT COUNT(*) INTO v_flag_count
  FROM listing_flags
  WHERE product_id = NEW.product_id;

  IF v_flag_count >= v_threshold THEN
    UPDATE products
    SET is_hidden = true, status = 'hidden'
    WHERE product_id = NEW.product_id
      AND is_hidden = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_threshold ON listing_flags;
CREATE TRIGGER trg_flag_threshold
  AFTER INSERT ON listing_flags
  FOR EACH ROW EXECUTE FUNCTION check_flag_threshold();

-- ── RPC: flag_listing (callable from client with anon key) ──
DROP FUNCTION IF EXISTS flag_listing(UUID, UUID);
CREATE OR REPLACE FUNCTION flag_listing(p_product_id UUID, p_student_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_flag_count INTEGER;
BEGIN
  -- Prevent self-flagging own listing
  IF EXISTS (
    SELECT 1 FROM products
    WHERE product_id = p_product_id AND seller_id = p_student_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'You cannot flag your own listing.');
  END IF;

  -- Insert (unique constraint will raise on duplicate)
  BEGIN
    INSERT INTO listing_flags (product_id, flagged_by) VALUES (p_product_id, p_student_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'message', 'You have already flagged this listing.');
  END;

  -- Return current flag count
  SELECT COUNT(*) INTO v_flag_count FROM listing_flags WHERE product_id = p_product_id;

  RETURN json_build_object('success', true, 'flag_count', v_flag_count);
END;
$$;

-- ── FEATURE 5: Payment columns on orders ─────────────────────
-- Add payment_status column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (payment_status IN ('pending', 'paid', 'released', 'refunded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payfast_payment_id'
  ) THEN
    ALTER TABLE orders ADD COLUMN payfast_payment_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'payfast_amount_gross'
  ) THEN
    ALTER TABLE orders ADD COLUMN payfast_amount_gross NUMERIC(10,2);
  END IF;
END;
$$;

-- ── Updated place_order RPC (includes payment_status) ────────
-- Run AFTER the original place_order is already created.
-- This version adds payment_status to the order INSERT and returns order_id.
CREATE OR REPLACE FUNCTION place_order(
  p_product_id UUID,
  p_buyer_id   UUID,
  p_slot_id    BIGINT
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qty        INT;
  v_seller_id  UUID;
  v_status     TEXT;
  v_slot_booked BOOLEAN;
  v_order_id   UUID;
BEGIN
  -- Lock rows to prevent race conditions
  SELECT quantity, seller_id, status INTO v_qty, v_seller_id, v_status
  FROM products WHERE product_id = p_product_id FOR UPDATE;

  SELECT is_booked INTO v_slot_booked
  FROM meetup_slots WHERE slot_id = p_slot_id FOR UPDATE;

  -- Availability guards
  IF v_status = 'sold' OR v_qty <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Item is no longer available.');
  END IF;
  IF v_slot_booked THEN
    RETURN json_build_object('success', false, 'message', 'This meet-up slot has already been booked.');
  END IF;
  IF v_seller_id = p_buyer_id THEN
    RETURN json_build_object('success', false, 'message', 'Sellers cannot buy their own listings.');
  END IF;

  -- Book slot
  UPDATE meetup_slots SET is_booked = TRUE WHERE slot_id = p_slot_id;

  -- Decrement quantity and update status
  UPDATE products
  SET quantity = quantity - 1,
      status = CASE WHEN quantity - 1 <= 0 THEN 'sold' ELSE status END
  WHERE product_id = p_product_id;

  -- Create order with payment_status (defaults to 'pending')
  INSERT INTO orders (product_id, buyer_id, seller_id, slot_id, order_status, payment_status)
  VALUES (p_product_id, p_buyer_id, v_seller_id, p_slot_id, 'pending', 'pending')
  RETURNING order_id INTO v_order_id;

  RETURN json_build_object('success', true, 'order_id', v_order_id);
END;
$$;

-- ── Aggregate: seller average rating view ────────────────────
CREATE OR REPLACE VIEW seller_ratings AS
SELECT
  reviewed_user_id                          AS student_id,
  ROUND(AVG(stars)::NUMERIC, 1)             AS avg_rating,
  COUNT(*)                                  AS total_reviews
FROM ratings
GROUP BY reviewed_user_id;

-- Ensure the view is accessible via RLS context
GRANT SELECT ON seller_ratings TO anon, authenticated;

-- ── Flag count view (for admin + catalog) ────────────────────
CREATE OR REPLACE VIEW product_flag_counts AS
SELECT
  product_id,
  COUNT(*) AS flag_count
FROM listing_flags
GROUP BY product_id;

GRANT SELECT ON product_flag_counts TO anon, authenticated;
