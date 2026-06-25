-- ============================================================
-- UniMarket v2 - Security Patches SQL
-- Run these statements IN ORDER in the Supabase SQL Editor.
-- Dashboard: https://supabase.com/dashboard/project/<your-project>/sql
-- ============================================================

-- -- PATCH A: Remove plain-text password column --------------
-- CRITICAL: Drop the password column from the students table.
-- Supabase Auth already stores credentials securely via bcrypt.
-- Back up your data first if you need to migrate any test accounts.

ALTER TABLE students DROP COLUMN IF EXISTS password;

-- -- PATCH B: Create listing_reviews table -------------------
-- Required by the review-listing Edge Function to store Claude AI results.

CREATE TABLE IF NOT EXISTS listing_reviews (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id      UUID        NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
  risk            TEXT        NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  summary         TEXT        NOT NULL,
  issues          TEXT[]      DEFAULT '{}',
  recommendation  TEXT        NOT NULL CHECK (recommendation IN ('approve', 'review', 'reject')),
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_listing_reviews_product UNIQUE (product_id)
);

-- -- PATCH C: Enable Row-Level Security on all tables --------
-- Without RLS, any user with the anon key can read/write any row.

ALTER TABLE students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_descriptors ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_reviews  ENABLE ROW LEVEL SECURITY;

-- -- PATCH D: RLS Policies -----------------------------------

-- Students: can read and update ONLY their own profile
DROP POLICY IF EXISTS "students_own_read"   ON students;
DROP POLICY IF EXISTS "students_own_update" ON students;

CREATE POLICY "students_own_read" ON students
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "students_own_update" ON students
  FOR UPDATE USING (auth.uid() = student_id);

-- Products: any authenticated user can read available listings
DROP POLICY IF EXISTS "products_public_read"   ON products;
DROP POLICY IF EXISTS "products_seller_insert" ON products;
DROP POLICY IF EXISTS "products_seller_update" ON products;
DROP POLICY IF EXISTS "products_seller_delete" ON products;

CREATE POLICY "products_public_read" ON products
  FOR SELECT USING (is_hidden = false AND status = 'available');

CREATE POLICY "products_seller_insert" ON products
  FOR INSERT WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "products_seller_update" ON products
  FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "products_seller_delete" ON products
  FOR DELETE USING (auth.uid() = seller_id);

-- Orders: readable only by buyer or seller
DROP POLICY IF EXISTS "orders_parties_read"   ON orders;
DROP POLICY IF EXISTS "orders_buyer_insert"   ON orders;
DROP POLICY IF EXISTS "orders_parties_update" ON orders;

CREATE POLICY "orders_parties_read" ON orders
  FOR SELECT USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "orders_buyer_insert" ON orders
  FOR INSERT WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "orders_parties_update" ON orders
  FOR UPDATE USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Complaints: authenticated students can insert; can read their own
DROP POLICY IF EXISTS "complaints_insert" ON complaints;
DROP POLICY IF EXISTS "complaints_read"   ON complaints;

CREATE POLICY "complaints_insert" ON complaints
  FOR INSERT WITH CHECK (auth.uid() = complainant_id);

CREATE POLICY "complaints_read" ON complaints
  FOR SELECT USING (auth.uid() = complainant_id);

-- Face descriptors: students can only read/write their own
DROP POLICY IF EXISTS "face_own_read"   ON face_descriptors;
DROP POLICY IF EXISTS "face_own_insert" ON face_descriptors;

CREATE POLICY "face_own_read" ON face_descriptors
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "face_own_insert" ON face_descriptors
  FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Listing reviews: only readable; written by service-role (edge function)
DROP POLICY IF EXISTS "listing_reviews_read" ON listing_reviews;

CREATE POLICY "listing_reviews_read" ON listing_reviews
  FOR SELECT USING (true);

-- -- PATCH E: Admin bypass using service-role -----------------
-- The admin panel uses the anon key + RLS. For admin operations
-- (approving students, hiding listings) to work, the admin must
-- use the Supabase service-role key OR a dedicated admin session.
-- The current admin login stores admin_id in sessionStorage — see
-- manual task in the security guide for hardening admin auth.

-- ============================================================
-- END OF PATCH FILE
-- ============================================================
