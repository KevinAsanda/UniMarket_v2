# Graph Report - .  (2026-06-26)

## Corpus Check
- 96 files · ~57,083 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 388 nodes · 652 edges · 46 communities (25 shown, 21 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 56 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Auth and Chat Components (React)|Auth and Chat Components (React)]]
- [[_COMMUNITY_User Signup OCR and Face API|User Signup OCR and Face API]]
- [[_COMMUNITY_Admin Operations and Banning|Admin Operations and Banning]]
- [[_COMMUNITY_Activity Page and Orders|Activity Page and Orders]]
- [[_COMMUNITY_Package Dependencies Configuration|Package Dependencies Configuration]]
- [[_COMMUNITY_Login Page Face API|Login Page Face API]]
- [[_COMMUNITY_Product Catalog and Buying|Product Catalog and Buying]]
- [[_COMMUNITY_Listing and Session Management|Listing and Session Management]]
- [[_COMMUNITY_AI-Assisted Moderation Review|AI-Assisted Moderation Review]]
- [[_COMMUNITY_Postgres Performance Best Practices|Postgres Performance Best Practices]]
- [[_COMMUNITY_App Architecture and Configurations|App Architecture and Configurations]]
- [[_COMMUNITY_Sprite Icons and Brand Integrations|Sprite Icons and Brand Integrations]]
- [[_COMMUNITY_Supabase RLS and Security|Supabase RLS and Security]]
- [[_COMMUNITY_Hero Isometric Design System|Hero Isometric Design System]]
- [[_COMMUNITY_SQL Monitoring and Indexing|SQL Monitoring and Indexing]]
- [[_COMMUNITY_Email Notifications Functions|Email Notifications Functions]]
- [[_COMMUNITY_SQL Indexing and Pagination|SQL Indexing and Pagination]]
- [[_COMMUNITY_Product Listing Flagging Rules|Product Listing Flagging Rules]]
- [[_COMMUNITY_Vite Logo and Brand Assets|Vite Logo and Brand Assets]]
- [[_COMMUNITY_MUT Campus Entrance gate|MUT Campus Entrance gate]]
- [[_COMMUNITY_PayFast Webhook Signature Validation|PayFast Webhook Signature Validation]]
- [[_COMMUNITY_Database Deadlocks and Queues|Database Deadlocks and Queues]]
- [[_COMMUNITY_Supabase Skills Feedback Template|Supabase Skills Feedback Template]]
- [[_COMMUNITY_Review Listing Function|Review Listing Function]]
- [[_COMMUNITY_Login HTML Interface|Login HTML Interface]]
- [[_COMMUNITY_Signup HTML Interface|Signup HTML Interface]]
- [[_COMMUNITY_Index Types and Partitioning|Index Types and Partitioning]]
- [[_COMMUNITY_SQL Schemas and Keys|SQL Schemas and Keys]]
- [[_COMMUNITY_SQL Privileges and Security|SQL Privileges and Security]]
- [[_COMMUNITY_Face Login Function|Face Login Function]]
- [[_COMMUNITY_SQL Listing Reviews Policies|SQL Listing Reviews Policies]]
- [[_COMMUNITY_SQL Ratings and Seller Views|SQL Ratings and Seller Views]]
- [[_COMMUNITY_React Brand Asset Logo|React Brand Asset Logo]]
- [[_COMMUNITY_Resolve Session Helper logic|Resolve Session Helper logic]]
- [[_COMMUNITY_Supabase JS Client Init|Supabase JS Client Init]]
- [[_COMMUNITY_SQL UPSERT Performance Best-practice|SQL UPSERT Performance Best-practice]]
- [[_COMMUNITY_Advisory Locks SQL concurrency|Advisory Locks SQL concurrency]]
- [[_COMMUNITY_SQL Database Schema Constraints|SQL Database Schema Constraints]]
- [[_COMMUNITY_SQL Database Lowercase Identifiers|SQL Database Lowercase Identifiers]]
- [[_COMMUNITY_SQL Definer Security check|SQL Definer Security check]]
- [[_COMMUNITY_Chat Messages Table SQL|Chat Messages Table SQL]]
- [[_COMMUNITY_Linked Supabase Project Settings|Linked Supabase Project Settings]]

## God Nodes (most connected - your core abstractions)
1. `supabase` - 23 edges
2. `useAuth()` - 21 edges
3. `db()` - 17 edges
4. `Activity()` - 12 edges
5. `loadStats()` - 11 edges
6. `loadPendingApprovals()` - 10 edges
7. `loadManualReview()` - 10 edges
8. `verifyCardWithOCR()` - 10 edges
9. `Catalog()` - 9 edges
10. `Login()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Index Columns in RLS Policies` --conceptually_related_to--> `students table`  [INFERRED]
  .agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md → src/utils/supabaseClient.js
- `Index Columns in RLS Policies` --conceptually_related_to--> `products table`  [INFERRED]
  .agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md → src/utils/supabaseClient.js
- `evaluate()` --semantically_similar_to--> `serve handler`  [INFERRED] [semantically similar]
  vanilla-src/javascript/review.js → supabase/functions/review-listing/index.ts
- `UniMarket v2 Overview` --conceptually_related_to--> `package.json Config`  [INFERRED]
  README.md → package.json
- `Wrap auth.uid() in SELECT` --conceptually_related_to--> `fetchProfile Helper`  [INFERRED]
  .agents/skills/supabase-postgres-best-practices/references/security-rls-performance.md → src/components/AuthContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Postgres Connection Management Patterns** — references_conn_idle_timeout_idle, references_conn_limits_limits, references_conn_pooling_pooling, references_conn_prepared_statements_prepared [INFERRED 0.85]
- **Supabase Security Checklist Guidelines** — supabase_skill_rls, supabase_skill_jwt_metadata, supabase_skill_security_definer, supabase_skill_auth_role, supabase_skill_bola, supabase_skill_update_policies [EXTRACTED 1.00]
- **Postgres Indexing Optimization Strategies** — references_query_composite_indexes_composite_indexes, references_query_covering_indexes_covering_indexes, references_query_index_types_index_types, references_query_missing_indexes_missing_indexes, references_query_partial_indexes_partial_indexes, references_schema_foreign_key_indexes_foreign_key_indexes [INFERRED 0.85]
- **Concurrency Control and Locking Best Practices** — references_lock_advisory_advisory_locks, references_lock_deadlock_prevention_deadlock_prevention, references_lock_short_transactions_short_transactions, references_lock_skip_locked_skip_locked [INFERRED 0.85]
- **Database Performance Monitoring and Maintenance** — references_monitor_explain_analyze_explain_analyze, references_monitor_pg_stat_statements_pg_stat_statements, references_monitor_vacuum_analyze_vacuum_analyze [INFERRED 0.85]
- **Face Verification and Login Flow** — pages_login_login, pages_settings_settings, face_login_index_serve, database_face_descriptors [INFERRED 0.95]
- **Marketplace Order Transaction Lifecycle** — pages_catalog_catalog, pages_activity_activity, components_chatpanel_chatpanel, components_ratingmodal_ratingmodal [INFERRED 0.85]
- **User Identity and Auth Session Context** — components_authcontext_authprovider, components_protectedroute_protectedroute, components_navbar_navbar [INFERRED 0.95]
- **Authentication and Session Management Flow** — javascript_auth_session_resolvesession, javascript_login_submitpassword, javascript_login_submitfacelogin, javascript_signup_initfaceverification [INFERRED 0.85]
- **Listing Moderation Flow** — review_listing_index_serve, javascript_review_runaireview, javascript_review_evaluate, sql_01_security_patches_listing_reviews [INFERRED 0.85]
- **Social Media Branding Icons** — public_icons_bluesky_icon, public_icons_discord_icon, public_icons_github_icon, public_icons_x_icon, public_icons_social_icon [INFERRED 0.85]
- **UniMarket Brand Assets** — images_1_logo, images_2_logo, public_favicon_logo [INFERRED 0.85]
- **Isometric Layered Projection System** — assets_hero_layered_stack, assets_hero_top_layer, assets_hero_bottom_layer [INFERRED 0.85]

## Communities (46 total, 21 thin omitted)

### Community 0 - "Auth and Chat Components (React)"
Cohesion: 0.09
Nodes (43): AuthContext, AuthProvider(), fetchProfile Helper, useAuth(), ChatPanel(), CAMPUS_HUBS, MeetupHubPicker(), Navbar() (+35 more)

### Community 1 - "User Signup OCR and Face API"
Cohesion: 0.08
Nodes (35): buildMatchTargets(), buildOCRCanvas(), CARD_SKIP_WORDS, clearErrors(), findAnyMatch(), friendlyAuthError(), friendlyInsertError(), fuzzyMatch() (+27 more)

### Community 2 - "Admin Operations and Banning"
Cohesion: 0.15
Nodes (33): approveManualListing(), approveStudent(), confirmManualReject(), confirmReject(), db(), disableFromDetail(), errRow(), esc() (+25 more)

### Community 3 - "Activity Page and Orders"
Cohesion: 0.12
Nodes (19): _buying, completeOrder(), filterProducts(), hideProd(), loadOrders(), loadProducts(), markSold(), DOMContentLoaded handler (+11 more)

### Community 4 - "Package Dependencies Configuration"
Cohesion: 0.07
Nodes (28): dependencies, bootstrap, react, react-dom, react-router-dom, @supabase/supabase-js, @tabler/icons-react, tesseract.js (+20 more)

### Community 5 - "Login Page Face API"
Cohesion: 0.15
Nodes (21): clearFieldErrors(), closeForgot(), handleFailedAttempt(), hideAttemptBars(), onFaceMatchSuccess(), restoreLockout(), setVerifyStatus(), showCameraWrap() (+13 more)

### Community 6 - "Product Catalog and Buying"
Cohesion: 0.13
Nodes (17): _allProducts, confirmBuy(), _currentSlots, filterProducts(), loadProducts(), DOMContentLoaded handler, openBuyModal(), populateBuyProduct() (+9 more)

### Community 7 - "Listing and Session Management"
Cohesion: 0.18
Nodes (13): resolveSession(), signOut(), addSlot(), collectSlots(), DAYS, loadCategories(), DOMContentLoaded handler, removeSlot() (+5 more)

### Community 8 - "AI-Assisted Moderation Review"
Cohesion: 0.28
Nodes (11): applyVerdict(), delay(), escHtml(), evaluate(), loadProduct(), RULES, runAIReview(), setStatus() (+3 more)

### Community 9 - "Postgres Performance Best Practices"
Cohesion: 0.24
Nodes (10): Use tsvector for Full-Text Search, Index JSONB Columns for Efficient Querying, Configure Idle Connection Timeouts, Set Appropriate Connection Limits, Use Connection Pooling for All Applications, Use Prepared Statements Correctly with Pooling, Batch INSERT Statements for Bulk Data, Eliminate N+1 Queries with Batch Loading (+2 more)

### Community 10 - "App Architecture and Configurations"
Cohesion: 0.25
Nodes (8): ESLint Setup Configuration, package.json Config, Atomic Checkout via place_order RPC, Identity Gate Verification Flow, UniMarket v2 Security and Architecture Limitations, UniMarket v2 Overview, Render Deployment Blueprint, Vite Setup Configuration

### Community 11 - "Sprite Icons and Brand Integrations"
Cohesion: 0.29
Nodes (7): SVG Icons Sprite Sheet, Bluesky Icon, Discord Icon, Documentation Icon, GitHub Icon, Social Connection Icon, X Icon

### Community 12 - "Supabase RLS and Security"
Cohesion: 0.33
Nodes (7): Supabase Agent Skill Guidelines, Deprecated auth.role() in Policies, BOLA/IDOR Prevention with TO authenticated, Avoid user_metadata in JWT Authorization, Enable RLS on Exposed Schemas, SECURITY DEFINER Functions Security Checklist, UPDATE Policy Requirements (USING and WITH CHECK)

### Community 13 - "Hero Isometric Design System"
Cohesion: 0.50
Nodes (5): Bottom Layer (Concrete / Platform / Data), Hero Illustration, Layered Isometric Stack Concept, UniMarket Purple Color Palette, Top Layer (Abstract / UI / View)

### Community 14 - "SQL Monitoring and Indexing"
Cohesion: 0.40
Nodes (5): EXPLAIN ANALYZE, pg_stat_statements Extension, VACUUM and ANALYZE, Indexes on WHERE and JOIN Columns, Index Foreign Key Columns

### Community 15 - "Email Notifications Functions"
Cohesion: 0.40
Nodes (4): corsHeaders, NotificationPayload, sendEmail(), serve handler

### Community 16 - "SQL Indexing and Pagination"
Cohesion: 0.50
Nodes (4): Cursor-Based Pagination, Composite Indexes, Covering Indexes, Partial Indexes

### Community 17 - "Product Listing Flagging Rules"
Cohesion: 0.50
Nodes (4): check_flag_threshold Function, flag_listing Function, listing_flags Table, product_flag_counts View

### Community 18 - "Vite Logo and Brand Assets"
Cohesion: 0.67
Nodes (3): Vite Lightning Bolt, Vite Logo, Parenthesis Styling

### Community 19 - "MUT Campus Entrance gate"
Cohesion: 0.67
Nodes (3): MUT Main Entrance Gate, Mangosuthu University of Technology (MUT), Mangosuthu University of Technology Campus Photo

### Community 21 - "Database Deadlocks and Queues"
Cohesion: 0.67
Nodes (3): Deadlock Prevention, Short Transactions, SKIP LOCKED Queue Processing

## Knowledge Gaps
- **87 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+82 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `resolveSession()` connect `Listing and Session Management` to `Activity Page and Orders`, `Product Catalog and Buying`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `DOMContentLoaded handler` connect `Activity Page and Orders` to `Listing and Session Management`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `resolveCurrentUser()` connect `Product Catalog and Buying` to `Listing and Session Management`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `Activity()` (e.g. with `complaints table` and `meetup_slots table`) actually correct?**
  _`Activity()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _119 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth and Chat Components (React)` be split into smaller, more focused modules?**
  _Cohesion score 0.08581349206349206 - nodes in this community are weakly interconnected._
- **Should `User Signup OCR and Face API` be split into smaller, more focused modules?**
  _Cohesion score 0.08383838383838384 - nodes in this community are weakly interconnected._