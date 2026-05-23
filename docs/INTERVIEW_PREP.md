# Mise — Interview Prep Guide

## Elevator Pitch

> "Mise is a full-stack real-time restaurant POS and Kitchen Display System. Orders placed at the front of house instantly appear on KDS screens in the kitchen — no re-keying, no relay race. The system handles the full lifecycle: seat a table, build an order with modifiers, split/merge tickets, track inventory depletion, and close out with role-based permissions. I built it end-to-end in TypeScript across a monorepo with a React SPA, a Node/Express API, PostgreSQL, and raw WebSockets."

---

## Tech Choice Justifications

### Why PostgreSQL over MongoDB?

Restaurant operations are inherently relational. An order has items, each item has modifiers, each payment links to an order, each event links to a user. With MongoDB you'd be managing references manually and losing atomicity on cross-collection writes. PostgreSQL gives ACID transactions, FK constraints that prevent orphan records, and native JSONB for the audit log payload — best of both worlds.

### Why raw `ws` over Socket.IO?

Socket.IO adds ~80kB of abstraction that provides rooms, namespaces, and fallback transport. For this system:
- **Rooms** aren't needed — all events go to all authenticated users (KDS filters client-side)
- **Fallback** to polling is a regression — the whole point is real-time
- **Binary savings** — `ws` broadcast is a single `for...of` over the client set, zero overhead

The tradeoff: we implement our own reconnect (exponential backoff) and heartbeat (30s ping/pong). That's ~60 lines of code for a clean dependency reduction.

### Why JWT over sessions?

Restaurant hardware runs POS, KDS, and cashier in separate browser tabs simultaneously, sometimes on different devices. JWT tokens:
- Work across any tab/device without a shared session store
- Enable horizontal API scaling without sticky sessions (cookie sessions break on round-robin load balancers)
- Work over WebSocket's initial HTTP handshake (pass as query param)

The tradeoff: tokens cannot be revoked before expiry. Mitigation: 24h expiry + logout clears token client-side. A v2 Redis token blacklist would close that gap.

### Why Zustand over Redux?

The state shape is simple and local:
- `authStore` — 3 fields, `persist` middleware, done
- `realtimeStore` — map of order ID → order, driven by WS events

Redux Toolkit would add 4 files, slices, selectors, a store config, and `useSelector`/`useDispatch` wiring — all for no architectural gain here. Zustand gives the same devtools integration in ~30 lines total.

### Why Zod at the API boundary?

Type narrowing at runtime. The `validate` middleware asserts the request body shape before it reaches the route handler. If the payload is wrong, you get a typed 400 error with field-level messages — not a database exception 3 stack frames deep.

---

## Real-Time Design Tradeoffs

### Snapshot on Reconnect

When a client reconnects after any gap (page refresh, network blip), it immediately receives:
1. All currently open orders
2. All table statuses

This means the KDS never shows stale data. The alternative — event sourcing (replay all events since disconnect) — would require a persistent event queue and a "last seen event ID" cursor. Too complex for this scale. Snapshot resync is simpler and correct.

### Client-Side Station Filtering vs. Per-Station Channels

All order events are broadcast to all authenticated WS clients. KDS pages filter by station client-side. 

**Why not per-station channels?**
- Expo station needs to see all items from all stations
- Admin/manager views need all events
- Adding a new station means no server-side changes

Tradeoff: higher WS message volume per client. At a realistic scale (~50 concurrent clients, ~500 orders/day), this is negligible.

### Draft Order Queue

`realtimeStore.draftOrders` is a client-side queue for offline order composition. If the API call fails (network loss between POS and backend), the draft persists in the store and can be retried. This is not yet hooked into the POSPage auto-retry — that's a v2 enhancement (tie it to a navigator.onLine event + queue drain on reconnect).

---

## Schema Design Reasoning

### Why enums in PostgreSQL instead of lookup tables?

`order_status`, `user_role`, `kitchen_station`, etc. are stable domain values that change only with a migration (deliberate versioning). Lookup tables add JOIN overhead and make queries noisier. PostgreSQL native enums are stored as integers internally but validated at the DB level — no invalid status can ever be stored.

### Why `order_events` as JSONB?

The audit trail needs to capture different shapes per event (e.g., status change vs. item added vs. payment made). A normalized structure would require 10 event-subtype tables with many NULLable columns. JSONB with `event_type` as discriminator is simpler, queryable (`->>` operators), and indexed with GIN if needed.

### Separate `order_item_modifiers` vs. JSONB

Order items are frequently updated individually (KDS status pipeline). Storing modifiers as JSONB inside order_items would mean deserializing on every status update. A join table means modifiers are read once at order creation and never touched again — cleaner write path.

---

## Authentication Strategy

1. `POST /api/auth/login` verifies email+password against bcrypt hash, issues JWT
2. JWT payload: `{ sub: userId, role: UserRole, iat, exp }`
3. Every protected route calls `authenticate` middleware: verifies signature, checks exp, attaches `req.user`
4. Route-level role guards: `requireRole(['admin', 'manager'])` — returns 403 if role not in allowlist
5. WS auth: `createServer` passes the upgrade request through `authenticate` logic; invalid tokens get `ws.close(4001)` (client skips reconnect on 4001)

---

## Hardest Bugs Fixed

### Bug 1 — `TS6059: rootDir` error

**Problem:** Backend `tsconfig.json` pointed `@mise/shared` to `../shared/src`. TypeScript's `rootDir` is computed as the common ancestor of all input files. With `../shared/src` in scope, the root became `packages/` — but `outDir` expected `packages/backend/dist/`, causing `TS6059: File is not under 'rootDir'`.

**Fix:** Changed path alias to `../shared/dist/index`. Backend typechecks against the *compiled* output of shared, not its source. Build shared first, then typecheck backend. Clean separation.

**Lesson:** When using TypeScript project references or path aliases across packages, point to the compiled output, not the source tree, unless you have explicit `references` entries in tsconfig.

---

### Bug 2 — `TS2769: JWT expiresIn` type error

**Problem:** `jsonwebtoken`'s `sign()` expects `expiresIn` as type `StringValue` (a template literal union like `${number}s` | `${number}m` | `${number}h` | `${number}d`). Passing `process.env.JWT_EXPIRES_IN` (a plain `string`) caused:
```
Argument of type 'string' is not assignable to parameter of type 'StringValue'
```

**Fix:**
```typescript
const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as `${number}${'s'|'m'|'h'|'d'}`;
```
The cast is safe because we control the env var. A more rigorous fix would be a Zod parse with `.refine()` to validate the format at startup.

---

### Bug 3 — `TS6310: Referenced project may not disable emit`

**Problem:** `tsconfig.json` referenced `tsconfig.node.json` via `"references"`. TypeScript composite projects require referenced configurations to emit output. `tsconfig.node.json` had `"noEmit": true`, which contradicts this requirement.

**Fix:** Removed the `references` array from `tsconfig.json` and added `vite.config.ts` directly to the root `include`. This eliminates the composite reference while still giving `vite.config.ts` full type coverage.

**Lesson:** Don't use `"references"` in a Vite project's root tsconfig unless you explicitly want composite project semantics. For a single-package frontend, include `vite.config.ts` in the main `include` array.

---

## Hostile Question Bank

**Q: How do you prevent two cashiers from assigning the same table simultaneously?**

The order creation transaction reads the table's current status with `SELECT ... FOR UPDATE` (row-level lock). If two transactions race, the second one blocks until the first commits, then sees the updated status and can return a conflict error. This is a pessimistic lock — correct for low-concurrency scenarios like table assignment.

**Q: What happens if a WebSocket broadcast fails?**

The `broadcast()` function iterates all connected clients and calls `ws.send()` with a try/catch per client. A single client failure (e.g., broken pipe) doesn't abort the broadcast loop. Failed clients will receive the full state snapshot on their next reconnect. At this scale, we don't need a dead-letter queue.

**Q: Your inventory deduction happens at payment, not at order creation. What are the risks?**

For a restaurant context: ingredients are consumed when food is prepared, not when the bill is paid. In theory, you could deduct at "order accepted" or "item in_progress" for more accuracy. The current approach is simpler and has predictable batch behavior (one deduction event per paid order). A v2 enhancement would deduct per item at the `in_progress → ready` transition, which maps better to when prep actually begins.

**Q: How does the split order feature work?**

`POST /api/orders/:id/split` accepts `{ item_ids: UUID[] }` — a subset of items to move into a new order. Inside a transaction:
1. Creates a new order cloning the parent's table, type, discounts
2. Moves the specified items to the new order (UPDATE order_items SET order_id)
3. Recalculates totals on both orders
4. Inserts audit events for both
5. Broadcasts `order:created` and `order:updated`

**Q: Why not use an ORM like Prisma?**

For this project: SQL is first-class. The complex queries (analytics aggregations, window functions, JSONB audit queries) benefit from explicit SQL. Prisma's `$queryRaw` escape hatch would be needed anyway. Raw SQL + a pg.Pool + the `withTransaction` helper gives full control, no abstraction overhead, and no schema-drift problems between Prisma schema and actual migrations.

In a team context with frequent schema changes and multiple developers writing queries, Prisma's migration tooling and type generation would be worth the tradeoff.

**Q: How would you scale this to 100 restaurant locations?**

Multi-tenant architecture:
1. Add `tenant_id` column to all tables, indexed, enforced in middleware
2. Row-level security (PostgreSQL RLS) for data isolation
3. WS connections scoped to tenant — `broadcast(tenantId, event)` filters by tenant
4. Read replica + pgBouncer per high-traffic tenant
5. Redis pub/sub for WS broadcasting across multiple API pods
6. Separate S3 bucket per tenant for receipt storage

---

## Metrics

| Metric | Value |
|--------|-------|
| Database tables | 16 |
| API endpoints | ~35 (across 9 route files) |
| WebSocket event types | 8 |
| Shared TypeScript types | 40+ |
| Unit tests | 19 |
| API tests | 7 (1 DB integration) |
| Menu items in seed data | 41 |
| Frontend pages | 8 |
| Build time (frontend) | ~5s |
| Bundle size (gzipped JS) | ~114 kB |

---

## Smoke Test Checklist

After `npm run dev` + `npm run db:migrate` + `npm run db:seed`:

- [ ] Login as `admin@mise.local` / `password` — should land on POS
- [ ] Login as `kitchen@mise.local` — should land on KDS (no POS nav)
- [ ] Create an order (dine-in, Table 1, 3 items with modifiers, 10% discount)
- [ ] KDS screen shows the ticket within 1 second of order creation
- [ ] Advance an item: Pending → Accepted → In Progress → Ready
- [ ] Mark order as Served — table status should update to "available"
- [ ] Open Inventory — find an item, set it to 1 unit → expect WS low-stock alert
- [ ] Open Analytics — select today's date range → revenue stat should reflect the test order
- [ ] Open Order History → find the test order → view timeline (audit log entries visible)
- [ ] Export CSV from Analytics — download should contain the test order
- [ ] Kill backend process — KDS should show "Reconnecting..." → restart → should resync automatically
- [ ] Open two browser tabs with the same cashier account — POS action in tab 1 should update tab 2 in real-time
