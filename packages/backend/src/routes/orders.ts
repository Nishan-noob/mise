import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { OrderService } from '../services/orderService';
import { broadcast } from '../websocket/server';
import {
  WsOrderCreatedPayload,
  WsOrderUpdatedPayload,
  WsOrderStatusChangedPayload,
  WsOrderItemStatusChangedPayload,
  WsTableStatusChangedPayload,
} from '@mise/shared';

const router = Router();
router.use(authenticate);

// ─── Validation Schemas ───────────────────────────────────────
const createOrderItemSchema = z.object({
  menu_item_id: z.number().int().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).nullable().optional(),
  modifier_ids: z.array(z.number().int().positive()).optional(),
});

const createOrderSchema = z.object({
  table_id: z.number().int().positive().nullable().optional(),
  customer_name: z.string().max(100).nullable().optional(),
  type: z.enum(['dine_in', 'takeaway', 'delivery']),
  notes: z.string().max(1000).nullable().optional(),
  items: z.array(createOrderItemSchema).min(1),
  discount_pct: z.number().min(0).max(100).optional(),
  service_charge_pct: z.number().min(0).max(100).optional(),
  tax_pct: z.number().min(0).max(100).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['draft', 'open', 'in_progress', 'ready', 'served', 'paid', 'voided', 'merged']),
});

const updateItemStatusSchema = z.object({
  status: z.enum(['pending', 'accepted', 'in_progress', 'ready', 'served', 'voided']),
});

const addItemsSchema = z.object({
  items: z.array(createOrderItemSchema).min(1),
});

const mergeSchema = z.object({
  source_order_id: z.number().int().positive(),
  target_order_id: z.number().int().positive(),
});

const splitSchema = z.object({
  item_ids: z.array(z.number().int().positive()).min(1),
});

// ─── GET /api/orders ──────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, table_id, type, date_from, date_to, limit, offset } = req.query;
  const orders = await OrderService.list({
    status: status as string,
    table_id: table_id ? Number(table_id) : undefined,
    type: type as string,
    date_from: date_from as string,
    date_to: date_to as string,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });
  res.json({ success: true, data: orders });
});

// ─── GET /api/orders/open ──────────────────────────────────────
router.get('/open', async (_req, res: Response): Promise<void> => {
  const orders = await OrderService.listOpen();
  res.json({ success: true, data: orders });
});

// ─── GET /api/orders/:id ──────────────────────────────────────
router.get('/:id', async (req, res: Response): Promise<void> => {
  const order = await OrderService.getById(Number(req.params.id));
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }
  res.json({ success: true, data: order });
});

// ─── POST /api/orders ─────────────────────────────────────────
router.post(
  '/',
  requireRole('admin', 'manager', 'cashier'),
  validate(createOrderSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const order = await OrderService.create(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: order });

    broadcast<WsOrderCreatedPayload>('order:created', { order });
  }
);

// ─── PATCH /api/orders/:id/status ────────────────────────────
router.patch(
  '/:id/status',
  validate(updateStatusSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const { status } = req.body;
    const result = await OrderService.updateStatus(id, status, req.user!.userId);
    if (!result) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    res.json({ success: true, data: result.order });

    broadcast<WsOrderStatusChangedPayload>('order:status_changed', {
      order_id: id,
      old_status: result.oldStatus,
      new_status: status,
      updated_by: req.user!.userId,
    });

    // Broadcast table freed when order is served/voided/paid
    if (['served', 'voided', 'paid'].includes(status) && result.order.table_id) {
      broadcast<WsTableStatusChangedPayload>('table:status_changed', {
        table_id: result.order.table_id,
        old_status: 'occupied',
        new_status: 'available',
      });
    }
  }
);

// ─── PATCH /api/orders/:id/items/:itemId/status ───────────────
router.patch(
  '/:id/items/:itemId/status',
  validate(updateItemStatusSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const orderId = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const { status } = req.body;

    const result = await OrderService.updateItemStatus(orderId, itemId, status, req.user!.userId);
    if (!result) {
      res.status(404).json({ success: false, error: 'Order item not found' });
      return;
    }
    res.json({ success: true, data: result.item });

    broadcast<WsOrderItemStatusChangedPayload>('order_item:status_changed', {
      order_id: orderId,
      item_id: itemId,
      old_status: result.oldStatus,
      new_status: status,
      updated_by: req.user!.userId,
    });

    // Broadcast updated full order
    const updatedOrder = await OrderService.getById(orderId);
    if (updatedOrder) {
      broadcast<WsOrderUpdatedPayload>('order:updated', { order: updatedOrder });

      // Auto-void order when kitchen rejects all items (all items voided)
      const nonClosedStatuses = ['open', 'in_progress', 'ready', 'draft'];
      if (status === 'voided' && nonClosedStatuses.includes(updatedOrder.status)) {
        const allVoided = updatedOrder.items.every((i) => i.status === 'voided');
        if (allVoided) {
          const voidResult = await OrderService.updateStatus(orderId, 'voided', req.user!.userId);
          if (voidResult) {
            broadcast<WsOrderStatusChangedPayload>('order:status_changed', {
              order_id: orderId,
              old_status: voidResult.oldStatus,
              new_status: 'voided',
              updated_by: req.user!.userId,
            });
            if (voidResult.order.table_id) {
              broadcast<WsTableStatusChangedPayload>('table:status_changed', {
                table_id: voidResult.order.table_id,
                old_status: 'occupied',
                new_status: 'available',
              });
            }
          }
        }
      }
    }
  }
);

// ─── POST /api/orders/:id/items (add items to open order) ──────
router.post(
  '/:id/items',
  requireRole('admin', 'manager', 'cashier'),
  validate(addItemsSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const orderId = Number(req.params.id);
    const order = await OrderService.addItems(orderId, req.body.items, req.user!.userId);
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    res.json({ success: true, data: order });
    broadcast<WsOrderUpdatedPayload>('order:updated', { order });
  }
);

// ─── GET /api/orders/:id/timeline ─────────────────────────────
router.get('/:id/timeline', async (req, res: Response): Promise<void> => {
  const events = await OrderService.getTimeline(Number(req.params.id));
  res.json({ success: true, data: events });
});

// ─── POST /api/orders/merge ───────────────────────────────────
router.post(
  '/merge',
  requireRole('admin', 'manager', 'cashier'),
  validate(mergeSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { source_order_id, target_order_id } = req.body;
    const merged = await OrderService.merge(source_order_id, target_order_id, req.user!.userId);
    res.json({ success: true, data: merged });
    broadcast<WsOrderUpdatedPayload>('order:updated', { order: merged });
  }
);

// ─── POST /api/orders/:id/split ───────────────────────────────
router.post(
  '/:id/split',
  requireRole('admin', 'manager', 'cashier'),
  validate(splitSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { item_ids } = req.body;
    const result = await OrderService.split(Number(req.params.id), item_ids, req.user!.userId);
    res.json({ success: true, data: result });
    broadcast<WsOrderUpdatedPayload>('order:updated', { order: result.original });
    broadcast<WsOrderCreatedPayload>('order:created', { order: result.newOrder });
  }
);

export default router;
