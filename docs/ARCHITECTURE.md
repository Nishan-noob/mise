# Mise — System Architecture

## Module Responsibilities

### `@mise/shared`
Single source of truth for all TypeScript types shared between backend and frontend. Includes:
- Entity types: `User`, `Order`, `OrderItem`, `MenuItem`, `InventoryItem`, etc.
- WebSocket event payload contracts (`WsEvent<T>` with typed payloads per event type)
- API response wrappers (`ApiResponse<T>`, `ApiError`)

Compiled to CommonJS for consumption by both Node.js backend and Vite frontend.

---

### `@mise/backend`
Express 4 REST API + WebSocket server.

| Layer | Responsibility |
|-------|---------------|
| `src/app.ts` | Mounts middleware (helmet, cors, json) and registers route prefixes |
| `src/index.ts` | Creates HTTP server, attaches WS server, verifies DB, starts listening |
| `src/config/database.ts` | Singleton `pg.Pool` + `withTransaction()` helper |
| `src/db/` | SQL migrations + seed data + migration runner |
| `src/middleware/auth.ts` | JWT verification, `requireRole()` factory |
| `src/middleware/validate.ts` | Zod schema validation middleware |
| `src/routes/` | Thin route handlers — parse, validate, delegate to services, broadcast WS events |
| `src/services/orderService.ts` | All order business logic inside transactions |
| `src/websocket/server.ts` | WS server with heartbeat, auth handshake, snapshot-on-connect, typed broadcast |

---

### `@mise/frontend`
Vite + React 18 SPA.

| Layer | Responsibility |
|-------|---------------|
| `store/authStore.ts` | Persisted JWT + user via Zustand + `persist` middleware |
| `store/realtimeStore.ts` | All live state (orders, tables, low-stock) driven by WS events |
| `hooks/useWebSocket.ts` | Connects to WS with auth token, reconnects with exponential backoff, delivers snapshot on connect |
| `services/api.ts` | Axios instance with JWT interceptor and 401 → logout |
| `components/Layout.tsx` | Sidebar nav, WS status indicator, global notification sound |
| `pages/` | Role-gated views; each page is independently data-fetching via React Query |

---

## Data Flow

### Order Creation (POS → Kitchen)

```
Cashier                    Backend                         Kitchen Staff
  │                           │                                   │
  │  POST /api/orders         │                                   │
  │─────────────────────────► │                                   │
  │                           │  withTransaction():               │
  │                           │   INSERT orders                   │
  │                           │   INSERT order_items              │
  │                           │   INSERT order_item_modifiers     │
  │                           │   calc totals, UPDATE orders      │
  │                           │   UPDATE restaurant_tables        │
  │                           │   INSERT order_events (audit)     │
  │                           │                                   │
  │  201 { order }            │                                   │
  │◄─────────────────────────  │                                   │
  │                           │                                   │
  │                           │  broadcast('order:created', ...) │
  │                           │──────────────────────────────────►│
  │                           │                                   │
  │  [WS] order:created       │                                   │
  │◄─────────────────────────  │   KDS ticket appears instantly   │
```

### Item Status Pipeline (KDS → FOH)

```
Kitchen Staff              Backend                          FOH / Cashier
     │                        │                                   │
     │ PATCH /orders/:id/     │                                   │
     │   items/:itemId/status │                                   │
     │───────────────────────►│                                   │
     │                        │  withTransaction():               │
     │                        │   UPDATE order_items status       │
     │                        │   autoAdvanceOrderStatus()        │
     │                        │   INSERT order_events (audit)     │
     │                        │                                   │
     │ 200 { item }           │                                   │
     │◄───────────────────────│                                   │
     │                        │                                   │
     │                        │  broadcast('order_item:          │
     │                        │    status_changed', ...)          │
     │                        │──────────────────────────────────►│
     │                        │                                   │
     │                        │  broadcast('order:updated', ...) │
     │                        │──────────────────────────────────►│
```

### WebSocket Reconnect & Snapshot Resync

```
Client (reconnecting)           Server
       │                           │
       │  new WebSocket(url)       │
       │──────────────────────────►│
       │                           │
       │  [verifies JWT]           │
       │                           │
       │◄──────────────────────────│  snapshot event:
       │                           │  { open_orders: [...],
       │  stores full state        │    tables: [...] }
       │  replaces stale data      │
```

---

## Database Schema Overview

```
users ──────────────────────────────────────────────────────────────────
  id, name, email, password_hash, role (enum), active, timestamps

restaurant_tables ──────────────────────────────────────────────────────
  id, name, capacity, floor, status (enum), active

menu_categories ────────────────────────────────────────────────────────
  id, name, station (enum: grill/fry/bar/cold/pastry/expo), sort_order

menu_items ─────────────────────────────────────────────────────────────
  id, category_id → menu_categories, name, price, description, active

modifier_groups ────────────────────────────────────────────────────────
  id, menu_item_id → menu_items, name, required, min/max_select

modifiers ──────────────────────────────────────────────────────────────
  id, modifier_group_id → modifier_groups, name, price_delta

inventory_items ────────────────────────────────────────────────────────
  id, name, unit, quantity, low_stock_threshold

recipe_ingredients ─────────────────────────────────────────────────────
  id, menu_item_id, inventory_item_id, quantity_per_unit
  UNIQUE(menu_item_id, inventory_item_id)

inventory_transactions ─────────────────────────────────────────────────
  id, inventory_item_id, type (restock/deduction/adjustment/waste),
  quantity, reason, order_id, created_by

orders ─────────────────────────────────────────────────────────────────
  id, table_id → restaurant_tables, customer_name,
  type (dine_in/takeaway/delivery),
  status (draft/open/in_progress/ready/served/paid/voided/merged),
  subtotal, discount_pct, discount_amount,
  service_charge_pct, service_charge_amount,
  tax_pct, tax_amount, total,
  notes, created_by, merged_into, timestamps

order_items ────────────────────────────────────────────────────────────
  id, order_id → orders, menu_item_id → menu_items,
  quantity, unit_price, notes,
  status (pending/accepted/in_progress/ready/served/voided)

order_item_modifiers ───────────────────────────────────────────────────
  id, order_item_id, modifier_id, modifier_name, price_delta

payments ───────────────────────────────────────────────────────────────
  id, order_id, amount, method (cash/card/mobile/complimentary),
  reference, created_by

shifts ─────────────────────────────────────────────────────────────────
  id, user_id, start_time, end_time, notes

order_events ───────────────────────────────────────────────────────────
  id, order_id, event_type, payload (JSONB), user_id, created_at
```

### Key Relationships

- `orders.table_id` → `restaurant_tables.id` (nullable for takeaway/delivery)
- `orders.created_by` → `users.id`
- `order_items.order_id` → `orders.id` (CASCADE DELETE)
- `order_item_modifiers.order_item_id` → `order_items.id` (CASCADE DELETE)
- `recipe_ingredients` bridges `menu_items` ↔ `inventory_items`

### Performance Indexes

All foreign keys are indexed. Hot read paths specifically indexed:
- `orders(status)` — KDS queries filter by status constantly
- `orders(created_at DESC)` — analytics range queries
- `order_items(status)` — KDS item status filter
- `inventory_transactions(created_at DESC)` — audit queries
- `payments(created_at DESC)` — analytics

---

## WebSocket Event Contract

All events share this envelope:

```typescript
interface WsEvent<T> {
  type: WsEventType;
  payload: T;
  timestamp: string; // ISO 8601
}
```

| Event | Payload | Trigger |
|-------|---------|---------|
| `snapshot` | `{ open_orders: Order[], tables: RestaurantTable[] }` | On WS connection |
| `order:created` | `{ order: Order }` | POST /api/orders |
| `order:updated` | `{ order: Order }` | Item status change, add items |
| `order:status_changed` | `{ order_id, old_status, new_status, updated_by }` | PATCH /orders/:id/status |
| `order_item:status_changed` | `{ order_id, item_id, old_status, new_status, updated_by }` | PATCH /orders/:id/items/:id/status |
| `table:status_changed` | `{ table_id, old_status, new_status }` | PATCH /tables/:id/status |
| `inventory:low_stock` | `{ item: InventoryItem }` | Inventory drops below threshold |
| `ping` / `pong` | `{}` | Heartbeat |

---

## Pricing Formula

```
subtotal          = sum(item.unit_price * item.quantity)
discount_amount   = subtotal * (discount_pct / 100)
after_discount    = subtotal - discount_amount
service_charge    = after_discount * (service_charge_pct / 100)
taxable           = after_discount + service_charge
tax_amount        = taxable * (tax_pct / 100)
total             = taxable + tax_amount
```

All amounts are rounded to 2 decimal places using `Math.round(x * 100) / 100`.

---

## Authentication Strategy

**JWT (Bearer tokens)** stored in `localStorage` via Zustand persist.

**Choice rationale:**
- Restaurant hardware runs multiple tabs (POS, KDS, cashier) — JWT works across tabs without shared session store
- Stateless — backend can be horizontally scaled without sticky sessions
- WebSocket auth: token passed as `?token=<jwt>` query param on connection

**Security hardening:**
- `helmet` sets all standard security headers
- `cors` restricts to known origin
- bcrypt cost factor configurable (default 10)
- Zod validation on all write paths prevents injection
- PostgreSQL parameterized queries throughout — no string concatenation

---

## Known Limitations & v2 Roadmap

### Current Limitations
- JWT tokens are not revocable before expiry (no blacklist)
- No rate limiting on auth endpoints
- WebSocket auth token in URL is visible in server logs (mitigated by HTTPS in production)
- Single PostgreSQL node — no read replica or failover
- Inventory deduction is at order payment, not order start (simple but less precise)

### v2 Roadmap
- Redis for pub/sub (multi-instance WebSocket broadcasting)
- Rate limiting (express-rate-limit)
- Refresh tokens + token rotation
- Read replica with pgBouncer connection pooling
- Mobile app (React Native, shared types)
- Multi-tenant / multi-branch support
- Full end-to-end Playwright test suite
- Prometheus + Grafana metrics
