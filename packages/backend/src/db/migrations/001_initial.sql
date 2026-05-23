-- Mise DB Migration 001: Initial Schema
-- ==============================================================

-- ─── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enum Types ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'kitchen');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE kitchen_station AS ENUM ('grill', 'fry', 'bar', 'cold', 'pastry', 'expo');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE table_status AS ENUM ('available', 'occupied', 'reserved', 'cleaning');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('draft', 'open', 'in_progress', 'ready', 'served', 'paid', 'voided', 'merged');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE order_item_status AS ENUM ('pending', 'accepted', 'in_progress', 'ready', 'served', 'voided');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_tx_type AS ENUM ('restock', 'deduction', 'adjustment', 'waste');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mobile', 'complimentary');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ─── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'cashier',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Shifts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time   TIMESTAMPTZ,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time DESC);

-- ─── Restaurant Tables ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  capacity   INTEGER NOT NULL DEFAULT 4,
  floor      TEXT NOT NULL DEFAULT 'main',
  status     table_status NOT NULL DEFAULT 'available',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Menu Categories ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  station    kitchen_station NOT NULL DEFAULT 'expo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── Menu Items ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES menu_categories(id),
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(active);

-- ─── Modifier Groups ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifier_groups (
  id           SERIAL PRIMARY KEY,
  menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  required     BOOLEAN NOT NULL DEFAULT FALSE,
  min_select   INTEGER NOT NULL DEFAULT 0,
  max_select   INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_modifier_groups_item ON modifier_groups(menu_item_id);

-- ─── Modifiers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modifiers (
  id                SERIAL PRIMARY KEY,
  modifier_group_id INTEGER NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  price_delta       NUMERIC(10,2) NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_modifiers_group ON modifiers(modifier_group_id);

-- ─── Inventory Items ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  unit                TEXT NOT NULL DEFAULT 'unit',
  quantity            NUMERIC(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,3) NOT NULL DEFAULT 5,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Recipe Ingredients ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id                SERIAL PRIMARY KEY,
  menu_item_id      INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_per_unit NUMERIC(12,3) NOT NULL,
  UNIQUE (menu_item_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_item ON recipe_ingredients(menu_item_id);

-- ─── Inventory Transactions ──────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                SERIAL PRIMARY KEY,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  type              inventory_tx_type NOT NULL,
  quantity          NUMERIC(12,3) NOT NULL,
  reason            TEXT,
  order_id          INTEGER,
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_item ON inventory_transactions(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON inventory_transactions(created_at DESC);

-- ─── Orders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                   SERIAL PRIMARY KEY,
  table_id             INTEGER REFERENCES restaurant_tables(id),
  customer_name        TEXT,
  type                 order_type NOT NULL DEFAULT 'dine_in',
  status               order_status NOT NULL DEFAULT 'open',
  subtotal             NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_pct         NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  service_charge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_pct              NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                TEXT,
  created_by           INTEGER NOT NULL REFERENCES users(id),
  merged_into          INTEGER REFERENCES orders(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);

-- ─── Order Items ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id   INTEGER NOT NULL REFERENCES menu_items(id),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  unit_price     NUMERIC(10,2) NOT NULL,
  notes          TEXT,
  status         order_item_status NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_status ON order_items(status);

-- ─── Order Item Modifiers ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id            SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  modifier_id   INTEGER NOT NULL REFERENCES modifiers(id),
  modifier_name TEXT NOT NULL,
  price_delta   NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oim_order_item ON order_item_modifiers(order_item_id);

-- ─── Payments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  amount     NUMERIC(10,2) NOT NULL,
  method     payment_method NOT NULL,
  reference  TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ─── Order Events (Audit Log) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS order_events (
  id         SERIAL PRIMARY KEY,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  user_id    INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_type ON order_events(event_type);
CREATE INDEX IF NOT EXISTS idx_order_events_created ON order_events(created_at DESC);

-- ─── Migrations table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migrations (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
