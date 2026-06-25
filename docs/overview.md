# System Overview

UniMarket v2 is a React-based, peer-to-peer campus marketplace designed for student-to-student transactions at Mangosuthu University of Technology (MUT). Students can buy and sell textbooks, electronics, and study materials locally on campus.

To maintain a secure, closed-campus environment, the platform enforces a strict identity validation workflow during sign-up. Every account is reviewed and manually activated by an administrator before the student can trade.

---

## Core Modules and Features

### 1. Verification-Gate Registration

The sign-up page (`Signup.jsx`) uses a three-step pipeline to confirm that a user is an enrolled MUT student:

- **OCR Reading**: Tesseract.js performs client-side optical character recognition on the uploaded student card image to extract the student number, name, and surname.
- **Fuzzy Matching**: The extracted text is compared against the details the student typed into the form, with a tolerance for minor OCR misreads.
- **Face Comparison**: The webcam streams live video. `face-api.js` models compute a descriptor vector from the live face and compare it against a descriptor extracted from the card photo. If the match confidence reaches 60%, the check passes.
- **Admin Approval**: After submission, the account is set to `pending`. An administrator must manually review the card photo and approve the account before the student can log in.

### 2. Dual-Path Authentication

`AuthContext.jsx` handles session resolution across two authentication paths:

- **Password Login**: Standard email and password authentication via Supabase Auth. Admin logins query the `admins` table separately.
- **Face ID Login**: The student's live face descriptor is compared against the stored descriptor in the `face_descriptors` table. On a successful match, the student ID is written to `sessionStorage('um_student_id')` as a local session fallback. See the [security analysis](security-and-architecture.md) for the known risk this introduces.

Both paths converge in `resolveSession()`, which checks the Supabase session first and falls back to the `sessionStorage` value. If neither is present, the user is redirected to `/login`.

### 3. Student Catalog and Transactions

Students can browse all available listings, search by keyword, and purchase items:

- **Search**: Client-side filter in `Catalog.jsx` matches against product name and description.
- **Meetup Scheduling**: When creating a listing, sellers define campus meetup slots (day, time, venue). Buyers select one of these slots at checkout.
- **Atomic Checkout**: The `place_order` Supabase RPC function executes the purchase as a single PostgreSQL transaction, locking rows to prevent double-bookings or simultaneous buys of the same single-stock item.

### 4. Listing Creation and AI Policy Scan

The sell flow in `Sell.jsx` runs as a three-step form:

1. **Basics**: Item name, price (ZAR), category, quantity, description.
2. **Image Upload**: Image is uploaded to the `product-images` Supabase Storage bucket. A record is inserted into `product_images`.
3. **Meetup Slots**: Seller defines one or more pickup availability windows.

After submission, the listing is saved with `status: 'hidden'` and `is_hidden: true`. The student is redirected to `Review.jsx`, which simulates an AI content scan:

- An offline rules engine parses the listing against a list of banned terms (weapons, drugs, counterfeit goods) and suspicious pricing thresholds.
- **Approved**: Status updated to `available`, `is_hidden` set to `false`. The listing goes live immediately.
- **Flagged**: Status remains `hidden`. Pushed into the admin's manual review queue.
- **Rejected**: Status updated to `suspended`. The listing stays invisible and cannot be resubmitted.

---

## Technology Stack

| Layer | Library or Service | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 + Vite 8 | Component-based UI, hot-module replacement |
| **Routing** | React Router DOM v7 | Client-side routing and protected route guards |
| **Styling** | Vanilla CSS + Bootstrap 5.3 | Spotify-derived design system tokens; Bootstrap for grid and modal utilities |
| **Icons** | `@tabler/icons-react` | Consistent professional icon set across all UI components |
| **Fonts** | Circular, Helvetica Neue (system fallback) | Brand typeface stack per design system spec |
| **Client-Side OCR** | Tesseract.js v7 | Student card optical character recognition |
| **Face Detection** | `@vladmandic/face-api` | Face landmark detection, descriptor extraction, and Euclidean distance comparison |
| **Backend as a Service** | Supabase | PostgreSQL database, Auth, Storage buckets, and RPC transactions |
| **AI Content Review** | Anthropic Claude (planned server-side) | Listing content analysis in admin panel — currently requires a server-side proxy to work |

---

## Repository Structure

```
src/
├── components/
│   ├── AuthContext.jsx       # Global auth state, session resolution, sign-out handler
│   ├── Navbar.jsx            # Fixed 64px nav, active state indicator, mobile drawer
│   └── ProtectedRoute.jsx   # Redirects unauthenticated users to /login
├── pages/
│   ├── Login.jsx             # Dual-path login: password and Face ID
│   ├── Signup.jsx            # Three-step identity verification registration
│   ├── Catalog.jsx           # Marketplace browsing grid with buy and report modals
│   ├── Sell.jsx              # Multi-step listing creation form
│   ├── Activity.jsx          # Buyer order history and seller listing management
│   ├── Review.jsx            # Post-listing AI policy scan result screen
│   └── Admin.jsx             # Admin moderation console (five tabbed panels)
├── styles/                  # Per-page CSS modules
├── utils/
│   └── supabaseClient.js    # Initialises the Supabase JS client from env variables
├── App.jsx                  # Route definitions and AuthProvider wrapper
├── index.css                # Global CSS design tokens, navbar, Bootstrap overrides
└── main.jsx                 # React DOM entry point
```

> The `vanilla-src/` directory at the project root contains the original v1 plain HTML/CSS/JavaScript implementation. It is kept for reference and historical context. Do not modify it.
