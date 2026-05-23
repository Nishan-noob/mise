import { PoolClient } from 'pg';
import { getPool, withTransaction } from '../config/database';
import {
  Order,
  OrderItem,
  OrderStatus,
  OrderItemStatus,
  CreateOrderItemRequest,
} from '@mise/shared';

interface CreateOrderInput {
  table_id?: number | null;
  customer_name?: string | null;
  type: string;
  notes?: string | null;
  items: CreateOrderItemRequest[];
  discount_pct?: number;
  service_charge_pct?: number;
  tax_pct?: number;
}

interface OrderListOptions {
  status?: string;
  table_id?: number;
  type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

function calcTotals(
  itemsTotal: number,
  discountPct: number,
  serviceChargePct: number,
  taxPct: number
) {
  const subtotal = Math.round(itemsTotal * 100) / 100;
  const discountAmount = Math.round(subtotal * (discountPct / 100) * 100) / 100;
  const afterDiscount = subtotal - discountAmount;
  const serviceChargeAmount = Math.round(afterDiscount * (serviceChargePct / 100) * 100) / 100;
  const taxable = afterDiscount + serviceChargeAmount;
  const taxAmount = Math.round(taxable * (taxPct / 100) * 100) / 100;
  const total = Math.round((taxable + taxAmount) * 100) / 100;
  return { subtotal, discountAmount, serviceChargeAmount, taxAmount, total };
}

async function buildOrderItems(
  client: PoolClient,
  orderId: number,
  items: CreateOrderItemRequest[]
): Promise<number> {
  let itemsTotal = 0;

  for (const item of items) {
    const { rows: menuRows } = await client.query(
      'SELECT id, price FROM menu_items WHERE id = $1 AND active = true',
      [item.menu_item_id]
    );
    if (!menuRows[0]) throw new Error(`Menu item ${item.menu_item_id} not found or inactive`);

    let unitPrice = parseFloat(menuRows[0].price);

    // Resolve modifiers
    const resolvedModifiers: Array<{ modifier_id: number; modifier_name: string; price_delta: number }> = [];
    if (item.modifier_ids?.length) {
      const { rows: modRows } = await client.query(
        'SELECT id, name, price_delta FROM modifiers WHERE id = ANY($1::int[]) AND active = true',
        [item.modifier_ids]
      );
      for (const mod of modRows) {
        unitPrice += parseFloat(mod.price_delta);
        resolvedModifiers.push({
          modifier_id: mod.id,
          modifier_name: mod.name,
          price_delta: parseFloat(mod.price_delta),
        });
      }
    }

    itemsTotal += unitPrice * item.quantity;

    const { rows: oi } = await client.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orderId, item.menu_item_id, item.quantity, unitPrice, item.notes ?? null]
    );

    for (const mod of resolvedModifiers) {
      await client.query(
        `INSERT INTO order_item_modifiers (order_item_id, modifier_id, modifier_name, price_delta)
         VALUES ($1, $2, $3, $4)`,
        [oi[0].id, mod.modifier_id, mod.modifier_name, mod.price_delta]
      );
    }
  }

  return itemsTotal;
}

async function fetchFullOrder(client: PoolClient, orderId: number): Promise<Order | null> {
  const { rows: orderRows } = await client.query(
    `SELECT o.*, u.name AS created_by_name, rt.name AS table_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.created_by
     LEFT JOIN restaurant_tables rt ON rt.id = o.table_id
     WHERE o.id = $1`,
    [orderId]
  );
  if (!orderRows[0]) return null;

  const { rows: items } = await client.query(
    `SELECT oi.*, mi.name AS menu_item_name, mc.station
     FROM order_items oi
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     JOIN menu_categories mc ON mc.id = mi.category_id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at`,
    [orderId]
  );

  for (const item of items) {
    const { rows: mods } = await client.query(
      'SELECT * FROM order_item_modifiers WHERE order_item_id = $1',
      [item.id]
    );
    item.modifiers = mods;
  }

  return { ...orderRows[0], items } as Order;
}

export const OrderService = {
  async create(input: CreateOrderInput, userId: number): Promise<Order> {
    return withTransaction(async (client) => {
      const discountPct = input.discount_pct ?? 0;
      const serviceChargePct = input.service_charge_pct ?? 10;
      const taxPct = input.tax_pct ?? 10;

      // Create order skeleton
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (table_id, customer_name, type, notes, discount_pct, service_charge_pct, tax_pct, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          input.table_id ?? null,
          input.customer_name ?? null,
          input.type,
          input.notes ?? null,
          discountPct,
          serviceChargePct,
          taxPct,
          userId,
        ]
      );
      const orderId = orderRows[0].id;

      const itemsTotal = await buildOrderItems(client, orderId, input.items);
      const { subtotal, discountAmount, serviceChargeAmount, taxAmount, total } =
        calcTotals(itemsTotal, discountPct, serviceChargePct, taxPct);

      await client.query(
        `UPDATE orders SET subtotal=$1, discount_amount=$2, service_charge_amount=$3, tax_amount=$4, total=$5, updated_at=NOW()
         WHERE id=$6`,
        [subtotal, discountAmount, serviceChargeAmount, taxAmount, total, orderId]
      );

      // Mark table occupied
      if (input.table_id) {
        await client.query(
          `UPDATE restaurant_tables SET status='occupied', updated_at=NOW() WHERE id=$1`,
          [input.table_id]
        );
      }

      // Audit event
      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id)
         VALUES ($1, 'order_created', $2::jsonb, $3)`,
        [orderId, JSON.stringify({ type: input.type, item_count: input.items.length }), userId]
      );

      const order = await fetchFullOrder(client, orderId);
      return order!;
    });
  },

  async getById(id: number): Promise<Order | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      return await fetchFullOrder(client, id);
    } finally {
      client.release();
    }
  },

  async listOpen(): Promise<Order[]> {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT o.id FROM orders o
       WHERE o.status NOT IN ('paid', 'voided', 'merged')
       ORDER BY o.created_at`
    );
    const orders: Order[] = [];
    const client = await pool.connect();
    try {
      for (const row of rows) {
        const order = await fetchFullOrder(client, row.id);
        if (order) orders.push(order);
      }
    } finally {
      client.release();
    }
    return orders;
  },

  async list(opts: OrderListOptions): Promise<Order[]> {
    const pool = getPool();
    let sql = `SELECT o.id FROM orders o WHERE 1=1`;
    const params: unknown[] = [];

    if (opts.status) {
      params.push(opts.status);
      sql += ` AND o.status = $${params.length}`;
    }
    if (opts.table_id) {
      params.push(opts.table_id);
      sql += ` AND o.table_id = $${params.length}`;
    }
    if (opts.type) {
      params.push(opts.type);
      sql += ` AND o.type = $${params.length}`;
    }
    if (opts.date_from) {
      params.push(opts.date_from);
      sql += ` AND o.created_at >= $${params.length}`;
    }
    if (opts.date_to) {
      params.push(opts.date_to);
      sql += ` AND o.created_at <= $${params.length}`;
    }

    params.push(opts.limit ?? 50);
    sql += ` ORDER BY o.created_at DESC LIMIT $${params.length}`;
    params.push(opts.offset ?? 0);
    sql += ` OFFSET $${params.length}`;

    const { rows } = await pool.query(sql, params);
    const client = await pool.connect();
    const orders: Order[] = [];
    try {
      for (const row of rows) {
        const order = await fetchFullOrder(client, row.id);
        if (order) orders.push(order);
      }
    } finally {
      client.release();
    }
    return orders;
  },

  async updateStatus(
    orderId: number,
    newStatus: OrderStatus,
    userId: number
  ): Promise<{ order: Order; oldStatus: OrderStatus } | null> {
    return withTransaction(async (client) => {
      // Lock the row
      const { rows } = await client.query(
        'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
        [orderId]
      );
      if (!rows[0]) return null;

      const oldStatus = rows[0].status as OrderStatus;

      // Idempotency check
      if (oldStatus === newStatus) {
        const order = await fetchFullOrder(client, orderId);
        return { order: order!, oldStatus };
      }

      await client.query(
        `UPDATE orders SET status=$1, updated_at=NOW() WHERE id=$2`,
        [newStatus, orderId]
      );

      // Release table when order is paid/voided
      if (['paid', 'voided'].includes(newStatus)) {
        await client.query(
          `UPDATE restaurant_tables rt
           SET status='available', updated_at=NOW()
           FROM orders o
           WHERE o.id=$1 AND rt.id=o.table_id`,
          [orderId]
        );

        // Deduct inventory on completion
        if (newStatus === 'paid') {
          await deductInventory(client, orderId, userId);
        }
      }

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id)
         VALUES ($1, 'status_changed', $2::jsonb, $3)`,
        [orderId, JSON.stringify({ from: oldStatus, to: newStatus }), userId]
      );

      const order = await fetchFullOrder(client, orderId);
      return { order: order!, oldStatus };
    });
  },

  async updateItemStatus(
    orderId: number,
    itemId: number,
    newStatus: OrderItemStatus,
    userId: number
  ): Promise<{ item: OrderItem; oldStatus: OrderItemStatus } | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM order_items WHERE id=$1 AND order_id=$2 FOR UPDATE',
        [itemId, orderId]
      );
      if (!rows[0]) return null;

      const oldStatus = rows[0].status as OrderItemStatus;
      if (oldStatus === newStatus) {
        return { item: rows[0] as OrderItem, oldStatus };
      }

      const { rows: updated } = await client.query(
        `UPDATE order_items SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
        [newStatus, itemId]
      );

      // Auto-advance order status based on item statuses
      await autoAdvanceOrderStatus(client, orderId, userId);

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id)
         VALUES ($1, 'item_status_changed', $2::jsonb, $3)`,
        [orderId, JSON.stringify({ item_id: itemId, from: oldStatus, to: newStatus }), userId]
      );

      const { rows: modRows } = await client.query(
        'SELECT * FROM order_item_modifiers WHERE order_item_id=$1',
        [itemId]
      );
      const item = { ...updated[0], modifiers: modRows } as OrderItem;
      return { item, oldStatus };
    });
  },

  async addItems(orderId: number, items: CreateOrderItemRequest[], userId: number): Promise<Order | null> {
    return withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM orders WHERE id=$1 AND status NOT IN ('paid','voided','merged') FOR UPDATE`,
        [orderId]
      );
      if (!rows[0]) return null;

      const existingSubtotal = parseFloat(rows[0].subtotal);
      const newItemsTotal = await buildOrderItems(client, orderId, items);
      const itemsTotal = existingSubtotal + newItemsTotal;

      const { subtotal, discountAmount, serviceChargeAmount, taxAmount, total } = calcTotals(
        itemsTotal,
        parseFloat(rows[0].discount_pct),
        parseFloat(rows[0].service_charge_pct),
        parseFloat(rows[0].tax_pct)
      );

      await client.query(
        `UPDATE orders SET subtotal=$1, discount_amount=$2, service_charge_amount=$3, tax_amount=$4, total=$5, updated_at=NOW()
         WHERE id=$6`,
        [subtotal, discountAmount, serviceChargeAmount, taxAmount, total, orderId]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id)
         VALUES ($1, 'items_added', $2::jsonb, $3)`,
        [orderId, JSON.stringify({ count: items.length }), userId]
      );

      return fetchFullOrder(client, orderId);
    });
  },

  async getTimeline(orderId: number): Promise<unknown[]> {
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT oe.*, u.name AS user_name
       FROM order_events oe
       LEFT JOIN users u ON u.id = oe.user_id
       WHERE oe.order_id = $1
       ORDER BY oe.created_at`,
      [orderId]
    );
    return rows;
  },

  async merge(
    sourceId: number,
    targetId: number,
    userId: number
  ): Promise<Order> {
    return withTransaction(async (client) => {
      if (sourceId === targetId) throw new Error('Cannot merge an order into itself');

      const { rows: sourceRows } = await client.query(
        `SELECT * FROM orders WHERE id=$1 AND status NOT IN ('paid','voided','merged') FOR UPDATE`,
        [sourceId]
      );
      const { rows: targetRows } = await client.query(
        `SELECT * FROM orders WHERE id=$1 AND status NOT IN ('paid','voided','merged') FOR UPDATE`,
        [targetId]
      );
      if (!sourceRows[0] || !targetRows[0]) throw new Error('One or both orders not found or not mergeable');

      // Move items to target
      await client.query(
        `UPDATE order_items SET order_id=$1 WHERE order_id=$2`,
        [targetId, sourceId]
      );

      // Recalculate target totals
      const { rows: allItems } = await client.query(
        `SELECT oi.unit_price, oi.quantity FROM order_items oi WHERE oi.order_id=$1`,
        [targetId]
      );
      const newItemsTotal = allItems.reduce(
        (sum: number, i: { unit_price: string; quantity: number }) => sum + parseFloat(i.unit_price) * i.quantity,
        0
      );
      const { subtotal, discountAmount, serviceChargeAmount, taxAmount, total } = calcTotals(
        newItemsTotal,
        parseFloat(targetRows[0].discount_pct),
        parseFloat(targetRows[0].service_charge_pct),
        parseFloat(targetRows[0].tax_pct)
      );
      await client.query(
        `UPDATE orders SET subtotal=$1, discount_amount=$2, service_charge_amount=$3, tax_amount=$4, total=$5, updated_at=NOW()
         WHERE id=$6`,
        [subtotal, discountAmount, serviceChargeAmount, taxAmount, total, targetId]
      );

      // Mark source voided/merged
      await client.query(
        `UPDATE orders SET status='merged', merged_into=$1, updated_at=NOW() WHERE id=$2`,
        [targetId, sourceId]
      );

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id) VALUES ($1,'order_merged',$2::jsonb,$3)`,
        [targetId, JSON.stringify({ merged_from: sourceId }), userId]
      );

      return (await fetchFullOrder(client, targetId))!;
    });
  },

  async split(
    orderId: number,
    itemIds: number[],
    userId: number
  ): Promise<{ original: Order; newOrder: Order }> {
    return withTransaction(async (client) => {
      const { rows: orderRows } = await client.query(
        `SELECT * FROM orders WHERE id=$1 AND status NOT IN ('paid','voided','merged') FOR UPDATE`,
        [orderId]
      );
      if (!orderRows[0]) throw new Error('Order not found or not splittable');

      // Create new order copy
      const { rows: newOrderRows } = await client.query(
        `INSERT INTO orders (table_id, customer_name, type, notes, discount_pct, service_charge_pct, tax_pct, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          orderRows[0].table_id,
          orderRows[0].customer_name,
          orderRows[0].type,
          orderRows[0].notes,
          orderRows[0].discount_pct,
          orderRows[0].service_charge_pct,
          orderRows[0].tax_pct,
          userId,
        ]
      );
      const newOrderId = newOrderRows[0].id;

      // Move selected items
      await client.query(
        `UPDATE order_items SET order_id=$1 WHERE id=ANY($2::int[]) AND order_id=$3`,
        [newOrderId, itemIds, orderId]
      );

      // Recalculate both orders
      for (const oid of [orderId, newOrderId]) {
        const { rows: oi } = await client.query(
          `SELECT unit_price, quantity FROM order_items WHERE order_id=$1`,
          [oid]
        );
        const tot = oi.reduce((s: number, i: { unit_price: string; quantity: number }) => s + parseFloat(i.unit_price) * i.quantity, 0);
        const orig = oid === orderId ? orderRows[0] : orderRows[0];
        const { subtotal, discountAmount, serviceChargeAmount, taxAmount, total } = calcTotals(
          tot,
          parseFloat(orig.discount_pct),
          parseFloat(orig.service_charge_pct),
          parseFloat(orig.tax_pct)
        );
        await client.query(
          `UPDATE orders SET subtotal=$1,discount_amount=$2,service_charge_amount=$3,tax_amount=$4,total=$5,updated_at=NOW() WHERE id=$6`,
          [subtotal, discountAmount, serviceChargeAmount, taxAmount, total, oid]
        );
      }

      await client.query(
        `INSERT INTO order_events (order_id, event_type, payload, user_id) VALUES ($1,'order_split',$2::jsonb,$3)`,
        [orderId, JSON.stringify({ new_order_id: newOrderId, item_ids: itemIds }), userId]
      );

      return {
        original: (await fetchFullOrder(client, orderId))!,
        newOrder: (await fetchFullOrder(client, newOrderId))!,
      };
    });
  },
};

async function autoAdvanceOrderStatus(client: PoolClient, orderId: number, userId: number) {
  const { rows: items } = await client.query(
    `SELECT status FROM order_items WHERE order_id=$1 AND status != 'voided'`,
    [orderId]
  );

  if (items.length === 0) return;

  const statuses = items.map((i: { status: string }) => i.status);
  const allReady = statuses.every((s: string) => s === 'ready' || s === 'served');
  const anyInProgress = statuses.some((s: string) => s === 'in_progress' || s === 'accepted');

  const { rows: orderRows } = await client.query(
    `SELECT status FROM orders WHERE id=$1`,
    [orderId]
  );
  if (!orderRows[0]) return;

  const currentStatus = orderRows[0].status;

  if (allReady && currentStatus === 'in_progress') {
    await client.query(`UPDATE orders SET status='ready', updated_at=NOW() WHERE id=$1`, [orderId]);
    await client.query(
      `INSERT INTO order_events (order_id, event_type, payload, user_id) VALUES ($1,'status_changed',$2::jsonb,$3)`,
      [orderId, JSON.stringify({ from: 'in_progress', to: 'ready', auto: true }), userId]
    );
  } else if (anyInProgress && currentStatus === 'open') {
    await client.query(`UPDATE orders SET status='in_progress', updated_at=NOW() WHERE id=$1`, [orderId]);
    await client.query(
      `INSERT INTO order_events (order_id, event_type, payload, user_id) VALUES ($1,'status_changed',$2::jsonb,$3)`,
      [orderId, JSON.stringify({ from: 'open', to: 'in_progress', auto: true }), userId]
    );
  }
}

async function deductInventory(client: PoolClient, orderId: number, userId: number) {
  const { rows: items } = await client.query(
    `SELECT oi.menu_item_id, oi.quantity FROM order_items oi WHERE oi.order_id=$1 AND oi.status != 'voided'`,
    [orderId]
  );

  for (const item of items) {
    const { rows: ingredients } = await client.query(
      `SELECT ri.inventory_item_id, ri.quantity_per_unit FROM recipe_ingredients ri WHERE ri.menu_item_id=$1`,
      [item.menu_item_id]
    );

    for (const ingredient of ingredients) {
      const deduct = ingredient.quantity_per_unit * item.quantity;
      await client.query(
        `UPDATE inventory_items SET quantity = GREATEST(0, quantity - $1), updated_at=NOW() WHERE id=$2`,
        [deduct, ingredient.inventory_item_id]
      );

      await client.query(
        `INSERT INTO inventory_transactions (inventory_item_id, type, quantity, reason, order_id, created_by)
         VALUES ($1, 'deduction', $2, 'order_completion', $3, $4)`,
        [ingredient.inventory_item_id, deduct, orderId, userId]
      );

      // Check low stock
      await client.query(
        `UPDATE inventory_items SET updated_at=NOW() WHERE id=$1`,
        [ingredient.inventory_item_id]
      );
    }
  }
}
