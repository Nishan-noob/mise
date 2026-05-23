// ─── Auth Types ─────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'cashier' | 'kitchen';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface AuthPayload {
  userId: number;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// ─── Menu Types ──────────────────────────────────────────────────────────────
export type KitchenStation = 'grill' | 'fry' | 'bar' | 'cold' | 'pastry' | 'expo';

export interface MenuCategory {
  id: number;
  name: string;
  station: KitchenStation;
  sort_order: number;
  active: boolean;
}

export interface ModifierGroup {
  id: number;
  menu_item_id: number;
  name: string;
  required: boolean;
  min_select: number;
  max_select: number;
}

export interface Modifier {
  id: number;
  modifier_group_id: number;
  name: string;
  price_delta: number;
  active: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  category_name?: string;
  station?: KitchenStation;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
  modifier_groups?: ModifierGroup[];
}

// ─── Table Types ─────────────────────────────────────────────────────────────
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

export interface RestaurantTable {
  id: number;
  name: string;
  capacity: number;
  floor: string;
  status: TableStatus;
  active_order_id?: number | null;
  active_order_status?: OrderStatus | null;
}

// ─── Order Types ─────────────────────────────────────────────────────────────
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'ready'
  | 'served'
  | 'paid'
  | 'voided'
  | 'merged';

export type OrderItemStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'ready'
  | 'served'
  | 'voided';

export interface OrderItemModifier {
  id: number;
  modifier_id: number;
  modifier_name: string;
  price_delta: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  menu_item_id: number;
  menu_item_name: string;
  station?: KitchenStation;
  quantity: number;
  unit_price: number;
  modifiers: OrderItemModifier[];
  notes: string | null;
  status: OrderItemStatus;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: number;
  table_id: number | null;
  table_name: string | null;
  customer_name: string | null;
  type: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount_amount: number;
  discount_pct: number;
  service_charge_pct: number;
  service_charge_amount: number;
  tax_pct: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  table_id?: number | null;
  customer_name?: string | null;
  type: OrderType;
  notes?: string | null;
  items: CreateOrderItemRequest[];
  discount_pct?: number;
  service_charge_pct?: number;
  tax_pct?: number;
}

export interface CreateOrderItemRequest {
  menu_item_id: number;
  quantity: number;
  notes?: string | null;
  modifier_ids?: number[];
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export interface UpdateOrderItemStatusRequest {
  status: OrderItemStatus;
}

// ─── Inventory Types ─────────────────────────────────────────────────────────
export interface InventoryItem {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

export interface InventoryTransaction {
  id: number;
  inventory_item_id: number;
  item_name?: string;
  type: 'restock' | 'deduction' | 'adjustment' | 'waste';
  quantity: number;
  reason: string | null;
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface RestockRequest {
  inventory_item_id: number;
  quantity: number;
  reason?: string;
}

// ─── Analytics Types ─────────────────────────────────────────────────────────
export interface SalesSummary {
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  total_items_sold: number;
  paid_orders: number;
  voided_orders: number;
  period_start: string;
  period_end: string;
}

export interface ItemPerformance {
  menu_item_id: number;
  name: string;
  category: string;
  station: string;
  quantity_sold: number;
  revenue: number;
}

export interface HourlyTrend {
  hour: number;
  order_count: number;
  revenue: number;
}

export interface StaffMetrics {
  user_id: number;
  name: string;
  role: UserRole;
  orders_created: number;
  total_revenue: number;
}

// ─── Audit / Events ──────────────────────────────────────────────────────────
export interface OrderEvent {
  id: number;
  order_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  user_id: number | null;
  user_name?: string;
  created_at: string;
}

// ─── WebSocket Event Types ────────────────────────────────────────────────────
export type WsEventType =
  | 'order:created'
  | 'order:updated'
  | 'order:status_changed'
  | 'order_item:status_changed'
  | 'table:status_changed'
  | 'inventory:low_stock'
  | 'menu:item_updated'
  | 'snapshot'
  | 'ping'
  | 'pong'
  | 'error';

export interface WsEvent<T = unknown> {
  type: WsEventType;
  payload: T;
  timestamp: string;
}

export interface WsOrderCreatedPayload {
  order: Order;
}

export interface WsOrderUpdatedPayload {
  order: Order;
}

export interface WsOrderStatusChangedPayload {
  order_id: number;
  old_status: OrderStatus;
  new_status: OrderStatus;
  updated_by: number;
}

export interface WsOrderItemStatusChangedPayload {
  order_id: number;
  item_id: number;
  old_status: OrderItemStatus;
  new_status: OrderItemStatus;
  updated_by: number;
}

export interface WsTableStatusChangedPayload {
  table_id: number;
  old_status: TableStatus;
  new_status: TableStatus;
}

export interface WsInventoryLowStockPayload {
  item: InventoryItem;
}

export interface WsMenuItemUpdatedPayload {
  item: MenuItem;
}

export interface WsSnapshotPayload {
  open_orders: Order[];
  tables: RestaurantTable[];
}

// ─── Shift Types ─────────────────────────────────────────────────────────────
export interface Shift {
  id: number;
  user_id: number;
  user_name?: string;
  start_time: string;
  end_time: string | null;
  notes: string | null;
}

// ─── Payment Types ───────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'complimentary';

export interface Payment {
  id: number;
  order_id: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  created_at: string;
}

export interface ProcessPaymentRequest {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

// ─── API Response Wrappers ───────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── Pagination ──────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}
