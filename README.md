# UniMarket v2

> A peer-to-peer campus marketplace for Mangosuthu University of Technology (MUT) students — built so students can buy and sell textbooks, electronics, and study materials directly on campus.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-BaaS-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=flat-square&logo=bootstrap&logoColor=white)

---

## What It Does

UniMarket is a closed, student-only marketplace. Before a student can log in or list anything, they must pass a three-step identity gate: OCR extraction of their physical student card, fuzzy-match verification of their details, and a live face comparison against their card photo. An admin then manually approves their account.

Once active, students can list items for sale with images and campus meetup slots, browse the full catalog, and complete purchases atomically — a PostgreSQL RPC function prevents double-bookings and race conditions at checkout.

---

## Features

| Module | Description |
| :--- | :--- |
| **Identity Gate Registration** | Tesseract.js OCR + face-api.js live face comparison + admin manual card approval |
| **Dual-Path Login** | Standard Supabase Auth password login or client-side Face ID biometric login |
| **Product Catalog** | Searchable grid of available listings with image, price, seller info, and buy flow |
| **Sell Flow** | Three-step listing form: basics, image upload, meetup slot scheduling |
| **Simulated AI Review** | Offline keyword engine auto-approves, flags, or rejects listings before they go live |
| **Admin Dashboard** | Student approval queue, manual listing moderation, AI-assisted content review, complaint resolution, and user management |
| **Atomic Checkout** | `place_order` Supabase RPC handles quantity decrement, slot booking, and order creation in a single transaction |

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | React 19 + Vite 8 |
| **Routing** | React Router DOM v7 |
| **Styling** | Vanilla CSS (Spotify-derived design system) + Bootstrap 5.3 |
| **Icons** | Tabler Icons (`@tabler/icons-react`) |
| **OCR** | Tesseract.js v7 (client-side) |
| **Face Detection** | `@vladmandic/face-api` |
| **Backend / BaaS** | Supabase (PostgreSQL, Auth, Storage, RPC) |

---

## Project Structure

```
UniMarket_v2/
├── public/
│   └── images/          # Static assets: logo (1.svg), campus photo (mut.jpg), face-api model weights
├── src/
│   ├── components/
│   │   ├── AuthContext.jsx      # Global auth state, session resolution, sign-out
│   │   ├── Navbar.jsx           # Fixed top nav with active state and mobile drawer
│   │   └── ProtectedRoute.jsx  # Route guard: redirects unauthenticated users to /login
│   ├── pages/
│   │   ├── Login.jsx      # Password + Face ID dual-path login
│   │   ├── Signup.jsx     # Three-step identity verification registration
│   │   ├── Catalog.jsx    # Main marketplace browsing grid
│   │   ├── Sell.jsx       # Multi-step listing creation form
│   │   ├── Activity.jsx   # Order history and seller listing management
│   │   ├── Review.jsx     # Post-listing AI policy scan result screen
│   │   └── Admin.jsx      # Admin moderation console
│   ├── styles/
│   │   ├── cat.css        # Catalog page grid, cards, modals
│   │   ├── login.css      # Login page glass-card and form styles
│   │   ├── signup.css     # Multi-step signup flow styles
│   │   ├── activity.css   # Order and listing management table styles
│   │   ├── admin.css      # Admin panel tab and table styles
│   │   ├── listing.css    # Sell page step-form styles
│   │   └── review.css     # AI review loader and verdict screen
│   ├── utils/
│   │   └── supabaseClient.js   # Supabase client initialisation
│   ├── App.jsx            # Router, route definitions, auth provider wrapper
│   ├── index.css          # Global design system tokens, Navbar, Bootstrap overrides
│   └── main.jsx           # React DOM entry point
├── docs/
│   ├── overview.md              # System overview and tech stack
│   ├── database-schema.md       # Table schemas, ERD, and RPC documentation
│   ├── user-flows.md            # Registration, login, listing, and purchase flows
│   ├── admin-system.md          # Admin dashboard moderation workflows
│   ├── security-and-architecture.md  # Security vulnerability analysis
│   └── improvements-roadmap.md  # Bug fixes and feature roadmap
├── vanilla-src/           # Archived v1 implementation (HTML/CSS/JS — do not modify)
├── package.json
└── vite.config.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with the schema described in [`docs/database-schema.md`](docs/database-schema.md)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/UniMarket_v2.git
cd UniMarket_v2
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
```

> These values are available in your Supabase project under **Settings > API**.

### 3. Run the development server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Build for production

```bash
npm run build
```

---

## Database Setup

Apply the schema from [`docs/database-schema.md`](docs/database-schema.md) to your Supabase project. Key steps:

1. Create all tables: `students`, `products`, `product_images`, `meetup_slots`, `orders`, `complaints`, `face_descriptors`, `categories`, `admins`.
2. Create the `place_order` RPC function (SQL provided in the schema doc).
3. Create two Supabase Storage buckets: `product-images` (public) and `student-cards` (restricted).
4. Configure Row-Level Security (RLS) policies — see [`docs/security-and-architecture.md`](docs/security-and-architecture.md) for guidance.

---

## Environment Notes

- **Face ID login** sets `sessionStorage('um_student_id')` as a client-side fallback session. See the security doc for known risks and the recommended server-side fix.
- **Admin AI review** calls the Anthropic Claude API. Currently this is a client-side call that will fail due to CORS. A Supabase Edge Function is the recommended path — see [`docs/improvements-roadmap.md`](docs/improvements-roadmap.md).
- The `vanilla-src/` directory contains the original v1 implementation and is kept for reference only.

---

## Documentation

| Document | Description |
| :--- | :--- |
| [System Overview](docs/overview.md) | Platform summary, features, and technology stack |
| [Database Schema](docs/database-schema.md) | Table definitions, ERD, and the `place_order` RPC |
| [User Flows](docs/user-flows.md) | Registration, authentication, listing, and purchase journeys |
| [Admin System](docs/admin-system.md) | Moderation queues and admin workflows |
| [Security Analysis](docs/security-and-architecture.md) | Known vulnerabilities and remediation guidance |
| [Improvements Roadmap](docs/improvements-roadmap.md) | Bug fixes, security patches, and planned features |

---

## Known Limitations

- Passwords are currently stored in plain text in the `students` table alongside the Supabase Auth entry. **Remove the `password` column before deploying to production.** Full details in the security doc.
- The Admin AI review panel requires a server-side proxy to function. The current client-side Claude API call is blocked by CORS.
- Face ID sessions are client-spoofable via `sessionStorage`. A server-signed token is needed for production hardening.

---

## License

This project is for academic and educational purposes.
