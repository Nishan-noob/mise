import { create } from 'zustand';
import {
  Order,
  RestaurantTable,
  WsEvent,
  WsOrderCreatedPayload,
  WsOrderUpdatedPayload,
  WsOrderStatusChangedPayload,
  WsOrderItemStatusChangedPayload,
  WsTableStatusChangedPayload,
  WsInventoryLowStockPayload,
  WsSnapshotPayload,
  InventoryItem,
  OrderStatus,
} from '@mise/shared';

interface RealtimeState {
  openOrders: Order[];
  tables: RestaurantTable[];
  lowStockItems: InventoryItem[];
  connected: boolean;
  lastSnapshot: string | null;
  // Draft orders for offline support
  draftOrders: Order[];

  setConnected: (v: boolean) => void;
  handleWsEvent: (event: WsEvent) => void;
  addDraftOrder: (order: Order) => void;
  removeDraftOrder: (id: number) => void;
}

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
  openOrders: [],
  tables: [],
  lowStockItems: [],
  connected: false,
  lastSnapshot: null,
  draftOrders: [],

  setConnected: (v) => set({ connected: v }),

  handleWsEvent: (event: WsEvent) => {
    switch (event.type) {
      case 'snapshot': {
        const { open_orders, tables } = event.payload as WsSnapshotPayload;
        set({ openOrders: open_orders, tables, lastSnapshot: event.timestamp, connected: true });
        break;
      }

      case 'order:created': {
        const { order } = event.payload as WsOrderCreatedPayload;
        set((s) => ({
          openOrders: [
            order,
            ...s.openOrders.filter((o) => o.id !== order.id),
          ],
          // Mark the table as occupied with this order
          tables: order.table_id
            ? s.tables.map((t) =>
                t.id === order.table_id
                  ? { ...t, status: 'occupied', active_order_id: order.id }
                  : t
              )
            : s.tables,
        }));
        break;
      }

      case 'order:updated': {
        const { order } = event.payload as WsOrderUpdatedPayload;
        set((s) => ({
          openOrders: s.openOrders.map((o) => (o.id === order.id ? order : o)),
        }));
        break;
      }

      case 'order:status_changed': {
        const p = event.payload as WsOrderStatusChangedPayload;
        const closedStatuses: OrderStatus[] = ['paid', 'voided', 'merged'];
        const tableFreedStatuses: OrderStatus[] = ['paid', 'voided', 'served'];
        set((s) => ({
          openOrders: closedStatuses.includes(p.new_status)
            ? s.openOrders.filter((o) => o.id !== p.order_id)
            : s.openOrders.map((o) =>
                o.id === p.order_id ? { ...o, status: p.new_status } : o
              ),
          // Free the table in the store when order is closed/served
          tables: tableFreedStatuses.includes(p.new_status)
            ? s.tables.map((t) =>
                t.active_order_id === p.order_id
                  ? { ...t, status: 'available', active_order_id: null }
                  : t
              )
            : s.tables,
        }));
        break;
      }

      case 'order_item:status_changed': {
        const p = event.payload as WsOrderItemStatusChangedPayload;
        set((s) => ({
          openOrders: s.openOrders.map((o) =>
            o.id === p.order_id
              ? {
                  ...o,
                  items: o.items.map((item) =>
                    item.id === p.item_id ? { ...item, status: p.new_status } : item
                  ),
                }
              : o
          ),
        }));
        break;
      }

      case 'table:status_changed': {
        const p = event.payload as WsTableStatusChangedPayload;
        set((s) => ({
          tables: s.tables.map((t) =>
            t.id === p.table_id ? { ...t, status: p.new_status } : t
          ),
        }));
        break;
      }

      case 'inventory:low_stock': {
        const { item } = event.payload as WsInventoryLowStockPayload;
        set((s) => ({
          lowStockItems: [
            item,
            ...s.lowStockItems.filter((i) => i.id !== item.id),
          ],
        }));
        break;
      }

      default:
        break;
    }
  },

  addDraftOrder: (order) =>
    set((s) => ({ draftOrders: [...s.draftOrders, order] })),

  removeDraftOrder: (id) =>
    set((s) => ({ draftOrders: s.draftOrders.filter((o) => o.id !== id) })),
}));
