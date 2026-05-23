<div align="center">

# mise

### Real-Time Restaurant & Kitchen Management System

[![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![WebSockets](https://img.shields.io/badge/WebSockets-ws-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://github.com/websockets/ws)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vitest](https://img.shields.io/badge/Tested_with-Vitest-6e9f18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-f97316?style=for-the-badge)](./LICENSE)

**mise** eliminates order handover delays and kitchen miscommunication by keeping every station — front-of-house, kitchen, and cashier — in real-time sync via WebSockets.

[Features](#features) · [Quick Start](#quick-start) · [Architecture](#architecture) · [API Reference](#api-reference) · [Deployment](#deployment) · [Roadmap](#roadmap)

</div>

---

## Features

| Module | Highlights |
|--------|-----------|
| 🛒 **POS** | Dine-in / takeaway / delivery orders · Item modifiers & notes · Quantity editing · Discount, tax, service charge · Split & merge tickets · Blocked items shown as disabled |
| 👨‍🍳 **Kitchen Display (KDS)** | Live order tickets per station (grill / fry / bar / cold / pastry) · Status pipeline: New → Accepted → In Progress → Ready → Served · Elapsed-time display with priority alerts |
| ⚡ **Real-Time Engine** | WebSocket events for every state change · Snapshot resync on reconnect · Live menu block propagation · Offline-safe draft order queue |
| 📦 **Inventory** | Ingredient-level stock tracking · Auto-deduction on order completion · Low-stock alerts via WebSocket push |
| 📊 **Analytics** | Real-time sales totals · Item & category performance · Hourly trend chart · Staff throughput · End-of-day CSV export |
| 🔒 **Roles & Permissions** | Admin · Manager · Cashier · Kitchen — route and action guards enforced per role |
| 🗃️ **Audit Log** | Full order event timeline (who changed what and when) |
| 🪑 **Table Management** | Occupancy view · Status transitions · Active order badge per table · Real-time clear on void/serve |
| 🍽️ **Menu Management** | Add / edit / delete items (admin & manager) · Block / unblock items live (kitchen) · Changes propagate to POS instantly via WebSocket |
| 🖨️ **Extras** | Printer-ready kitchen ticket view · Sound + visual alert on new KDS order · Table floor plans |

---

## Architecture

```
mise/
├── packages/
│   ├── shared/          # Shared TypeScript types & contracts
│   ├── backend/         # Node.js + Express + PostgreSQL + WebSocket API
│   └── frontend/        # React + Vite + Tailwind SPA
├── docs/
│   ├── ARCHITECTURE.md
│   └── INTERVIEW_PREP.md
├── docker-compose.yml
└── README.md
```

### Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| API | Express 4 + TypeScript | Battle-tested, simple, optimal for this scale |
| Database | PostgreSQL 16 | ACID transactions, native JSON, excellent indexes |
| Real-time | `ws` (native WebSocket) | Zero abstraction overhead vs. Socket.IO |
| Auth | JWT (Bearer tokens) | Stateless, works across tabs / devices / hardware |
| Validation | Zod | Runtime + compile-time type safety on every API boundary |
| Frontend state | Zustand + React Query | Minimal boilerplate, excellent devex |
| Styling | Tailwind CSS | Rapid mobile-first UI, consistent design tokens |

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ (or Docker)

### 1. Clone & Install

```bash
git clone https://github.com/Nishan-noob/mise.git
cd mise
npm install
```

### 2. Configure Environment

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit DATABASE_URL, JWT_SECRET as needed
```

### 3. Start PostgreSQL & Migrate

**With Docker (recommended):**
```bash
docker compose up postgres -d
npm run db:migrate
npm run db:seed
```

**Without Docker:**
```bash
createdb mise_db
npm run db:migrate
npm run db:seed
```

### 4. Run in Dev Mode

```bash
npm run dev
# Backend → http://localhost:4000
# Frontend → http://localhost:5173
```

### 5. Login

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@mise.local | password |
| Manager | manager@mise.local | password |
| Cashier | cashier@mise.local | password |
| Kitchen | kitchen@mise.local | password |

---

## Docker (Full Stack)

```bash
docker compose up --build
# App → http://localhost:5173
# API → http://localhost:4000
```

---

## Build Commands

```bash
npm run build           # Build all packages
npm run test            # Run tests
npm run typecheck       # TypeScript check all packages
npm run lint            # ESLint all packages
npm run db:migrate      # Apply DB migrations
npm run db:seed         # Load demo data
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `JWT_SECRET` | **(required)** | JWT signing secret — use a long random string in production |
| `JWT_EXPIRES_IN` | `24h` | Token expiry |
| `PORT` | `4000` | Backend HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `BCRYPT_ROUNDS` | `10` | bcrypt cost factor |

---

## Project Structure

```
packages/
├── shared/
│   └── src/index.ts             # All shared TypeScript types + WS event contracts
│
├── backend/
│   └── src/
│       ├── app.ts               # Express app factory
│       ├── index.ts             # Server entrypoint
│       ├── config/
│       │   └── database.ts      # pg Pool, withTransaction helper
│       ├── db/
│       │   ├── migrate.ts       # Migration runner
│       │   ├── seed.ts          # Seed runner
│       │   └── migrations/
│       │       ├── 001_initial.sql   # Full schema
│       │       └── 002_seed.sql     # Demo data
│       ├── middleware/
│       │   ├── auth.ts          # JWT authentication + role guards
│       │   ├── validate.ts      # Zod request validator
│       │   └── errorHandler.ts  # Global error handler
│       ├── routes/
│       │   ├── auth.ts          # POST /login, GET /me
│       │   ├── menu.ts          # Menu categories + items + modifiers
│       │   ├── orders.ts        # Full order CRUD + split/merge
│       │   ├── tables.ts        # Table management
│       │   ├── inventory.ts     # Inventory + restock
│       │   ├── analytics.ts     # Sales summary + CSV export
│       │   ├── users.ts         # User management
│       │   ├── shifts.ts        # Shift tracking
│       │   └── payments.ts      # Payment processing
│       ├── services/
│       │   └── orderService.ts  # All order business logic + transactions
│       ├── websocket/
│       │   └── server.ts        # WS server + broadcast + snapshot
│       └── tests/
│           ├── unit.test.ts     # Pricing, status transitions, inventory
│           └── api.test.ts      # API contract tests
│
└── frontend/
    └── src/
        ├── App.tsx              # Router + auth guard
        ├── main.tsx             # React root
        ├── services/api.ts      # Axios client + interceptors
        ├── store/
        │   ├── authStore.ts     # Persisted auth state (Zustand)
        │   └── realtimeStore.ts # WS-driven live state
        ├── hooks/
        │   └── useWebSocket.ts  # WS hook with exponential-backoff reconnect
        ├── components/
        │   └── Layout.tsx       # Sidebar nav + WS connection indicator
        └── pages/
            ├── LoginPage.tsx
            ├── POSPage.tsx
            ├── KDSPage.tsx            ├── MenuPage.tsx            ├── TablesPage.tsx
            ├── InventoryPage.tsx
            ├── AnalyticsPage.tsx
            ├── OrderHistoryPage.tsx
            └── UsersPage.tsx
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `DB connection refused` | PostgreSQL not running | Run `docker compose up postgres -d` |
| `JWT_SECRET not configured` | Missing env var | Copy `.env.example` to `.env` and set `JWT_SECRET` |
| WS shows "Reconnecting..." | Backend not running | Start backend with `npm run dev -w packages/backend` |
| Build fails with `rootDir` error | Shared package not built | Run `npm run build -w packages/shared` first |
| Migration fails on re-run | `ON CONFLICT` handled | Migrations are idempotent — safe to re-run |
| Low stock alert not showing | No WebSocket event | Check backend logs; trigger by restocking below threshold |

---

## Roadmap

### v0.2
- [ ] Floor plan drag-and-drop table editor
- [ ] Multi-printer support (ESC/POS)
- [ ] Customer-facing order status QR display

### v0.3
- [ ] Reservation system with time slots
- [ ] Online ordering integration (webhook receiver)
- [ ] Loyalty points engine

### v1.0
- [ ] Multi-branch / multi-tenant support
- [ ] Mobile app (React Native)
- [ ] Advanced forecasting analytics

---

<div align="center">

Made with obsessive attention to detail by **Nishan P** © 2026

</div>
