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

> All bugs below were discovered through live end-to-end testing across all four roles (admin, manager, cashier, kitchen) after deployment to Render. Each bug was diagnosed by reading WS event logs, tracing the data flow from UI to DB, and identifying the exact layer where the assumption broke.

---

### Bug 1 — `TS6059: rootDir` error (Build / TypeScript)

**Problem:** Backend `tsconfig.json` pointed `@mise/shared` to `../shared/src`. TypeScript's `rootDir` is computed as the common ancestor of all input files. With `../shared/src` in scope, the root became `packages/` — but `outDir` expected `packages/backend/dist/`, causing `TS6059: File is not under 'rootDir'`.

**Fix:** Changed path alias to `../shared/dist/index`. Backend typechecks against the *compiled* output of shared, not its source. Build shared first, then typecheck backend. Clean separation.

**Lesson:** When using TypeScript project references or path aliases across packages, point to the compiled output, not the source tree, unless you have explicit `references` entries in tsconfig.

---

### Bug 2 — `TS2769: JWT expiresIn` type error (Build / TypeScript)

**Problem:** `jsonwebtoken`'s `sign()` expects `expiresIn` as type `StringValue` (a template literal union like `${number}s` | `${number}m` | `${number}h` | `${number}d`). Passing `process.env.JWT_EXPIRES_IN` (a plain `string`) caused:
```
Argument of type 'string' is not assignable to parameter of type 'StringValue'
```

**Fix:**
```typescript
const expiresIn = (process.env.JWT_EXPIRES_IN || '24h') as `${number}${'s'|'m'|'h'|'d'}`;
```

---

### Bug 3 — `TS6310: Referenced project may not disable emit` (Build / TypeScript)

**Problem:** `tsconfig.json` referenced `tsconfig.node.json` via `"references"`. TypeScript composite projects require referenced configurations to emit output. `tsconfig.node.json` had `"noEmit": true`.

**Fix:** Removed the `references` array from `tsconfig.json` and added `vite.config.ts` directly to the root `include`.

---

### Bug 4 — Kitchen login lands on POS (Live Testing — Role Routing)

**Problem:** `LoginPage.tsx` hardcoded `navigate('/pos', { replace: true })` after successful login regardless of user role. Kitchen staff hit the POS instead of KDS.

**Root cause:** The navigate call happened before the code was updated to support multiple role destinations. Classic oversight when adding a new role.

**Fix:** Read `res.data.data.user.role` from the login response:
```typescript
navigate(user.role === 'kitchen' ? '/kds' : '/pos', { replace: true });
```

**Lesson:** Any time you add a role, audit every place that assumes a single destination after login.

---

### Bug 5 — Payment always failed with "Payment failed" toast (Live Testing — API)

**Problem:** `OrderHistoryPage.tsx` sent `{ amount: 0 }` in the payment mutation body. The backend payment schema had `z.number().positive()` — so 0 failed Zod validation every time. The error was swallowed into a generic toast.

**Root cause:** The mutation was written without passing the order total:
```typescript
// wrong
mutationFn: (id) => api.post(`/orders/${id}/pay`, { amount: 0 })
// correct
mutationFn: ({ id, total }) => api.post(`/orders/${id}/pay`, { amount: total })
```

**Fix:** Pass `total: parseFloat(order.total as unknown as string)` at the call site.

**Lesson:** Always test the happy path of every form action end-to-end. Zod validation errors should be surfaced with field detail, not just a generic toast.

---

### Bug 6 — Table badge (active_order_id) disappeared on page refresh (Live Testing — WS Snapshot)

**Problem:** After placing an order, the table showed the order badge correctly. On page refresh:
1. React Query fetched `/api/tables` → tables returned WITH `active_order_id` (correct)
2. WS connected → `snapshot` event fired → `realtimeStore.tables` was overwritten
3. The snapshot query in `server.ts` was `SELECT * FROM restaurant_tables` — **no `active_order_id` subquery** — so snapshot tables had `active_order_id: undefined`
4. TablesPage reads from realtimeStore → badge disappeared

**Root cause:** The snapshot query and the REST API query for tables were diverged. REST API had the correct subquery; snapshot used a bare SELECT.

**Fix:** Made the snapshot query identical to the REST API tables query:
```sql
SELECT rt.*,
  (SELECT id FROM orders WHERE table_id=rt.id
   AND status NOT IN ('paid','voided','merged','served')
   ORDER BY created_at DESC LIMIT 1) AS active_order_id,
  (SELECT status FROM orders ...)  AS active_order_status
FROM restaurant_tables rt WHERE rt.active=true
```

**Lesson:** Any time you have two code paths that build the same data shape, they must use the same underlying query — or extract a shared function. Diverging queries will drift.

---

### Bug 7 — Table stayed occupied after void/serve (Live Testing — WS Handler)

**Problem:** Voiding or serving an order freed the table in the DB (via `UPDATE restaurant_tables SET status='available'`), and the `table:status_changed` WS event was broadcast. But the `realtimeStore` handler for `table:status_changed` only updated `status` — it left `active_order_id` untouched:
```typescript
// before
tables: s.tables.map(t =>
  t.id === p.table_id ? { ...t, status: p.new_status } : t
)
```
So the table badge still showed the old order ID even though status was "available".

**Fix:**
```typescript
tables: s.tables.map(t =>
  t.id === p.table_id
    ? { ...t, status: p.new_status,
        ...(p.new_status === 'available' ? { active_order_id: null, active_order_status: null } : {}) }
    : t
)
```

**Lesson:** WS state patches must mirror the full shape the REST API would return. Partial updates silently leave stale fields.

---

### Bug 8 — `served` orders still showed order badge on refresh (Live Testing — SQL Filter)

**Problem:** After a cashier marked an order as served, the table showed "Available" in real-time (WS event handled). But on refresh, the badge reappeared because the `active_order_id` subquery in the REST API used:
```sql
status NOT IN ('paid','voided','merged')
```
`served` was not in the exclusion list, so a served order was incorrectly treated as "active."

**Fix:** Added `'served'` to the NOT IN list in both the REST API tables query and the WS snapshot query.

---

### Bug 9 — Items showed "Ready" instead of "Served" after order marked served (Live Testing — Business Logic)

**Problem:** When the kitchen used the KDS bulk "Mark Served" button (which calls `PATCH /orders/:id/status` with `status: 'served'`), the order-level status flipped to `served`. But the individual `order_items` rows still had `status: 'ready'`. The cashier's Order History expanded view showed "Ready" badges instead of "Served".

**Root cause:** `orderService.updateStatus()` didn't cascade status changes to child items.

**Fix:** Inside the `updateStatus` transaction, after freeing the table, auto-advance all non-voided items when the order becomes served:
```typescript
if (newStatus === 'served') {
  await client.query(
    `UPDATE order_items SET status='served', updated_at=NOW()
     WHERE order_id=$1 AND status IN ('pending','accepted','in_progress','ready')`,
    [orderId]
  );
}
```

---

### Bug 10 — Blocked items in POS only updated on refresh (Live Testing — Missing WS Broadcast)

**Problem:** When kitchen toggled a menu item's availability via the Menu page, the POS cashier's grid didn't update until they manually refreshed. The item could still be added to an order.

**Root cause:** `PATCH /menu/items/:id/availability` updated the DB but broadcast **no WS event**. The frontend only had the stale React Query cache.

**Fix — three-layer change:**
1. **Shared**: Added `menu:item_updated` to `WsEventType` + `WsMenuItemUpdatedPayload` interface
2. **Backend**: After the availability DB update, `broadcast<WsMenuItemUpdatedPayload>('menu:item_updated', { item: rows[0] })`
3. **Frontend**: `realtimeStore` handles `menu:item_updated` → stores in `menuItemOverrides: Record<number, MenuItem>`. `POSPage` applies overrides on top of React Query cache on every render:
```typescript
const allItems = (itemsRes ?? []).map(item =>
  menuItemOverrides[item.id] ? { ...item, ...menuItemOverrides[item.id] } : item
);
```

**Why this pattern instead of invalidating React Query?** The store doesn't have access to `queryClient`. An override map is zero-latency and doesn't require a network round-trip.

---

### Bug 11 — All items rejected by kitchen left table occupied indefinitely (Live Testing — Missing Auto-Void)

**Problem:** Kitchen can reject individual items by marking them `voided`. If ALL items in an order are rejected, the order stays as `open` — the cashier has to manually void it. Until then, the table shows as occupied with no active ticket in KDS.

**Root cause:** No logic existed to detect "all items voided" as a terminal state for the order.

**Fix:** In the `PATCH /orders/:id/items/:itemId/status` route, after broadcasting the item change and fetching the updated order, check for the all-voided condition:
```typescript
if (status === 'voided' && updatedOrder &&
    ['open','in_progress','ready','draft'].includes(updatedOrder.status)) {
  const allVoided = updatedOrder.items.every(i => i.status === 'voided');
  if (allVoided) {
    const voidResult = await OrderService.updateStatus(orderId, 'voided', userId);
    // broadcast order:status_changed + table:status_changed
  }
}
```

**Table frees immediately** — no cashier action needed.

---

## Deployment Journey

### Platform: Render (free tier)

The app is deployed as a single Render web service: Express serves the built React SPA as static files from `packages/frontend/dist/`, then handles all `/api/*` requests. PostgreSQL runs on Render's managed free-tier database.

### Iterations Required

**Iteration 1 — Build order issue**

First deploy failed because the `npm run build` script built `frontend` and `backend` in parallel but `backend` needed `shared` to be compiled first. Fixed by serializing the build: `npm run build -w packages/shared && npm run build -w packages/backend && npm run build -w packages/frontend`.

**Iteration 2 — Static file serving**

React SPA needed the Express backend to serve `index.html` for all non-API routes (client-side routing). Added:
```typescript
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }
});
```

**Iteration 3 — WebSocket on Render**

Render's free tier proxies HTTP through their load balancer. WS connections need the `Upgrade` header to pass through. Render handles this automatically for WebSocket connections — no special config needed. However, the WS URL had to match the same host/port as HTTP (since they share the same process), so the frontend uses `wss://` on production and `ws://` on localhost:
```typescript
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const wsUrl = `${protocol}://${window.location.host}/ws?token=${token}`;
```

**Iteration 4 — Environment variables on Render**

`JWT_SECRET` and `DATABASE_URL` must be set in Render's dashboard as environment variables. First deploy hit `JWT_SECRET not configured` error. Added a startup check in `index.ts`:
```typescript
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
```

**Iteration 5 — Database migrations on deploy**

Render doesn't run `npm run db:migrate` automatically. Added a `postbuild` script that runs migrations after build, so every deploy automatically applies pending migrations. Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `INSERT ... ON CONFLICT DO NOTHING`) so re-running is safe.

**Key lesson:** The difference between "works locally" and "works in production" is almost always: build order, environment variables, and assumptions about file paths.

---

## Hostile Question Bank

**Q: How do you prevent two cashiers from assigning the same table simultaneously?**

The order creation transaction reads the table's current status with `SELECT ... FOR UPDATE` (row-level lock). If two transactions race, the second one blocks until the first commits, then sees the updated status and can return a conflict error. This is a pessimistic lock — correct for low-concurrency scenarios like table assignment.

**Q: What happens if a WebSocket broadcast fails for one client?**

The `broadcast()` function iterates all connected clients and calls `ws.send()` individually. A single client failure (e.g., broken pipe) doesn't abort the broadcast loop. Failed clients will receive the full state snapshot on their next reconnect. At this scale, we don't need a dead-letter queue.

**Q: Your inventory deduction happens at payment, not at order creation. What are the risks?**

For a restaurant context: ingredients are consumed when food is prepared, not when the bill is paid. The current approach is simpler and has predictable batch behavior (one deduction event per paid order). A v2 enhancement would deduct per item at the `in_progress → ready` transition, which maps better to when prep actually begins.

**Q: How does the split order feature work?**

`POST /api/orders/:id/split` accepts `{ item_ids: UUID[] }` — a subset of items to move into a new order. Inside a transaction:
1. Creates a new order cloning the parent's table, type, discounts
2. Moves the specified items to the new order (`UPDATE order_items SET order_id`)
3. Recalculates totals on both orders
4. Inserts audit events for both
5. Broadcasts `order:created` and `order:updated`

**Q: Why not use an ORM like Prisma?**

The complex queries (analytics aggregations, window functions, JSONB audit queries) benefit from explicit SQL. Prisma's `$queryRaw` escape hatch would be needed anyway. Raw SQL + a pg.Pool + the `withTransaction` helper gives full control, no abstraction overhead, and no schema-drift problems between Prisma schema and actual migrations.

In a team context with frequent schema changes and multiple developers writing queries, Prisma's migration tooling and type generation would be worth the tradeoff.

**Q: How would you scale this to 100 restaurant locations?**

Multi-tenant architecture:
1. Add `tenant_id` column to all tables, indexed, enforced in middleware
2. Row-level security (PostgreSQL RLS) for data isolation
3. WS connections scoped to tenant — `broadcast(tenantId, event)` filters by tenant
4. Read replica + pgBouncer per high-traffic tenant
5. Redis pub/sub for WS broadcasting across multiple API pods

**Q: Why does your snapshot resync the full state instead of event sourcing?**

Event sourcing (replay all events since disconnect) requires a persistent event queue and a "last seen event ID" cursor on every client. At this scale, snapshot resync is simpler, correct, and has bounded payload size. The tradeoff is that very high-frequency updates (>100/s) would make snapshots expensive — at restaurant scale that never happens.

**Q: You mentioned menuItemOverrides in the store — why not just invalidate the React Query cache?**

`realtimeStore` is a Zustand store that has no access to the React Query `queryClient` (it lives outside the React tree). Options:
1. Pass `queryClient` into the store — creates a circular dependency
2. Use a custom event/hook to bridge — adds complexity
3. Store overrides in Zustand and merge in the component — zero latency, no network round-trip, minimal code

Option 3 is the cleanest. The component applies `menuItemOverrides` on top of the React Query result: if kitchen blocks item ID 42, the override `{ 42: { active: false } }` is applied immediately, and the React Query cache remains as a fallback for items not yet overridden.

**Q: How do you handle the case where kitchen rejects ALL items on an order?**

The system auto-voids the order. When `PATCH /orders/:id/items/:itemId/status` sets an item to `voided`, the backend fetches the updated full order and checks `items.every(i => i.status === 'voided')`. If true and the order isn't already closed, it calls `OrderService.updateStatus(orderId, 'voided')`, which:
1. Sets the order status to `voided`
2. Frees the table (`UPDATE restaurant_tables SET status='available'`)
3. Broadcasts `order:status_changed` + `table:status_changed`

The table goes green and the order disappears from the cashier's "open" view — no manual intervention.

**Q: What's the risk of a race condition in the auto-void logic?**

If two items are voided simultaneously (e.g., kitchen taps "Reject" on two items at the same millisecond), both requests could reach the server before either has committed. Both would call `getById`, see 1 item remaining non-voided, and skip the auto-void. Then both complete, leaving 0 active items but no auto-void triggered.

Mitigation: Move the "all items voided" check into the `withTransaction` block in `orderService.updateItemStatus`, using `SELECT ... FOR UPDATE` on the order row. This serializes concurrent item updates for the same order. Currently not implemented (an open improvement).

**Q: Walk me through what happens from the moment a cashier taps "Place Order" to when the KDS ticket appears.**

1. `POSPage` calls `POST /api/orders` with the cart payload
2. `authenticate` middleware verifies JWT, attaches `req.user`
3. `validate(createOrderSchema)` middleware runs Zod schema check
4. `OrderService.create()` opens a transaction:
   - Locks the target table row with `FOR UPDATE`
   - Inserts the order row
   - For each cart item: looks up price, inserts `order_items`, inserts `order_item_modifiers`
   - Calculates totals, updates `orders.subtotal/total`
   - Sets `restaurant_tables.status = 'occupied'`
   - Inserts an `order_events` audit entry
5. Transaction commits; `201 { order }` returned to cashier
6. Route handler calls `broadcast('order:created', { order })`
7. `broadcast()` iterates all `wss.clients`, sends the JSON event to each open WS
8. Kitchen's `useWebSocket` hook receives the message, calls `realtimeStore.handleWsEvent`
9. Store handler for `order:created` pushes the order to `openOrders`
10. `KDSPage` is subscribed to `openOrders` via `useRealtimeStore` — React re-renders the ticket list
11. Ticket appears on screen, notification sound plays, elapsed timer starts

Total round-trip: typically < 100ms on the same network.

---

## Metrics

| Metric | Value |
|--------|-------|
| Database tables | 16 |
| API endpoints | ~37 (across 9 route files) |
| WebSocket event types | 9 |
| Shared TypeScript types | 45+ |
| Unit tests | 19 |
| API tests | 7 (1 DB integration) |
| Menu items in seed data | 41 |
| Frontend pages | 9 |
| Build time (frontend) | ~5s |
| Bundle size (gzipped JS) | ~114 kB |
| Live testing bugs found & fixed | 11 |
| Deployment iterations | 5 |

---

## Smoke Test Checklist

After `npm run dev` + `npm run db:migrate` + `npm run db:seed`:

- [ ] Login as `admin@mise.local` / `password` — should land on POS
- [ ] Login as `kitchen@mise.local` — should land on KDS directly (not POS)
- [ ] Create an order (dine-in, Table 1, 3 items with modifiers, 10% discount)
- [ ] KDS screen shows the ticket within 1 second of order creation
- [ ] Advance an item: Pending → Accepted → In Progress → Ready
- [ ] Mark order as Served — table status should update to "available" without refresh
- [ ] Kitchen: block a menu item → cashier POS should show it greyed-out instantly (no refresh)
- [ ] Kitchen: reject ALL items on an order → table should auto-free, order auto-voids
- [ ] Cashier: Mark Paid (Cash) — should succeed and deduct inventory
- [ ] Open Inventory — find an item, set it to 1 unit → expect WS low-stock alert
- [ ] Open Analytics — select today's date range → revenue stat should reflect the test order
- [ ] Open Order History → find the test order → view timeline (audit log entries visible)
- [ ] Export CSV from Analytics — download should contain the test order
- [ ] Kill backend process — KDS should show "Reconnecting..." → restart → should resync automatically
- [ ] Open two browser tabs — action in tab 1 should update tab 2 in real-time
- [ ] Refresh the page after placing an order — table badge should persist after refresh

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
