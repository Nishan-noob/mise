import { useState, useEffect } from 'react';
import { useRealtimeStore } from '../store/realtimeStore';
import { useMutation } from '@tanstack/react-query';
import {
  Order,
  OrderItem,
  OrderItemStatus,
  KitchenStation,
} from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Clock, ChefHat, CheckCircle2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

const STATIONS: { key: KitchenStation | 'all'; label: string }[] = [
  { key: 'all', label: 'All Stations' },
  { key: 'grill', label: '🔥 Grill' },
  { key: 'fry', label: '🍟 Fry' },
  { key: 'bar', label: '🍹 Bar' },
  { key: 'cold', label: '🥗 Cold' },
  { key: 'pastry', label: '🍰 Pastry' },
  { key: 'expo', label: '📤 Expo' },
];

const ITEM_STATUS_PIPELINE: OrderItemStatus[] = [
  'pending',
  'accepted',
  'in_progress',
  'ready',
  'served',
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-yellow-500/50 bg-yellow-500/5',
  accepted: 'border-blue-500/50 bg-blue-500/5',
  in_progress: 'border-brand-500/50 bg-brand-500/5',
  ready: 'border-emerald-500/50 bg-emerald-500/5',
  served: 'border-gray-700 bg-gray-800/50 opacity-60',
  open: 'border-yellow-500/50',
  in_progress_order: 'border-brand-500/50',
  ready_order: 'border-emerald-500/50',
};

function ElapsedTimer({ createdAt }: { createdAt: string }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const elapsed = formatDistanceToNow(parseISO(createdAt), { addSuffix: false });
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);

  return (
    <span
      className={`flex items-center gap-1 text-xs font-mono ${
        minutes >= 15
          ? 'text-red-400 animate-pulse'
          : minutes >= 8
          ? 'text-yellow-400'
          : 'text-gray-400'
      }`}
    >
      <Clock className="w-3 h-3" />
      {elapsed}
      {minutes >= 15 && <AlertCircle className="w-3 h-3" />}
    </span>
  );
}

function nextItemStatus(current: OrderItemStatus): OrderItemStatus | null {
  const idx = ITEM_STATUS_PIPELINE.indexOf(current);
  if (idx < 0 || idx >= ITEM_STATUS_PIPELINE.length - 1) return null;
  return ITEM_STATUS_PIPELINE[idx + 1];
}

function ItemStatusBadge({ status }: { status: OrderItemStatus }) {
  const map: Record<OrderItemStatus, string> = {
    pending: 'badge-yellow',
    accepted: 'badge-blue',
    in_progress: 'badge-orange',
    ready: 'badge-green',
    served: 'badge-gray',
    voided: 'badge-red',
  };
  return <span className={map[status]}>{status.replace('_', ' ')}</span>;
}

export default function KDSPage() {
  const { openOrders } = useRealtimeStore();
  const [station, setStation] = useState<KitchenStation | 'all'>('all');

  const updateItemStatus = useMutation({
    mutationFn: ({
      orderId,
      itemId,
      status,
    }: {
      orderId: number;
      itemId: number;
      status: OrderItemStatus;
    }) =>
      api
        .patch(`/orders/${orderId}/items/${itemId}/status`, { status })
        .then((r) => r.data),
    onError: () => toast.error('Failed to update item status'),
  });

  const updateOrderStatus = useMutation({
    mutationFn: ({ orderId, status }: { orderId: number; status: string }) =>
      api.patch(`/orders/${orderId}/status`, { status }).then((r) => r.data),
    onError: () => toast.error('Failed to update order'),
  });

  // Filter orders: only in-kitchen statuses
  const kitchenOrders = openOrders.filter((o) =>
    ['open', 'in_progress', 'ready'].includes(o.status)
  );

  // Filter items by station
  const getStationItems = (order: Order): OrderItem[] => {
    if (station === 'all') return order.items;
    return order.items.filter((i) => i.station === station);
  };

  const visibleOrders = kitchenOrders.filter((o) => {
    const stationItems = getStationItems(o);
    return (
      stationItems.length > 0 &&
      stationItems.some((i) => i.status !== 'served' && i.status !== 'voided')
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-brand-500" />
          <h1 className="text-xl font-bold text-white">Kitchen Display</h1>
          <span className="badge-orange">{kitchenOrders.length} active</span>
        </div>

        {/* Station filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {STATIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStation(s.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                station === s.key
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Order tickets grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <CheckCircle2 className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold">All clear!</p>
            <p className="text-sm">No pending orders in this station</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleOrders.map((order) => {
              const stationItems = getStationItems(order);
              const allReady = stationItems
                .filter((i) => i.status !== 'voided')
                .every((i) => i.status === 'ready' || i.status === 'served');

              return (
                <KDSTicket
                  key={order.id}
                  order={order}
                  stationItems={stationItems}
                  allReady={allReady}
                  onItemAdvance={(itemId, newStatus) => {
                    updateItemStatus.mutate({
                      orderId: order.id,
                      itemId,
                      status: newStatus,
                    });
                  }}
                  onOrderComplete={() => {
                    updateOrderStatus.mutate({
                      orderId: order.id,
                      status: order.status === 'ready' ? 'served' : 'ready',
                    });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface KDSTicketProps {
  order: Order;
  stationItems: OrderItem[];
  allReady: boolean;
  onItemAdvance: (itemId: number, newStatus: OrderItemStatus) => void;
  onOrderComplete: () => void;
}

function KDSTicket({ order, stationItems, allReady, onItemAdvance, onOrderComplete }: KDSTicketProps) {
  const borderColor = allReady
    ? 'border-emerald-500/60'
    : order.status === 'in_progress'
    ? 'border-brand-500/60'
    : 'border-yellow-500/60';

  return (
    <div className={`card border-2 ${borderColor} flex flex-col`}>
      {/* Ticket header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-white">#{order.id}</span>
            {order.table_name && (
              <span className="text-xs font-bold text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                {order.table_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`badge ${order.type === 'dine_in' ? 'badge-blue' : order.type === 'takeaway' ? 'badge-yellow' : 'badge-orange'}`}>
              {order.type.replace('_', ' ')}
            </span>
          </div>
        </div>
        <ElapsedTimer createdAt={order.created_at} />
      </div>

      {/* Items */}
      <div className="flex-1 p-3 space-y-2">
        {stationItems
          .filter((i) => i.status !== 'voided')
          .map((item) => {
            const next = nextItemStatus(item.status);
            return (
              <div
                key={item.id}
                className={`rounded-xl p-3 border ${STATUS_COLORS[item.status] || 'border-gray-700'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        ×{item.quantity}
                      </span>
                      <span className="text-sm font-semibold text-white truncate">
                        {item.menu_item_name}
                      </span>
                    </div>
                    {item.modifiers?.length > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        + {item.modifiers.map((m) => m.modifier_name).join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-yellow-400 mt-0.5 italic">⚠ {item.notes}</p>
                    )}
                  </div>
                  <ItemStatusBadge status={item.status} />
                </div>

                {next && (
                  <button
                    onClick={() => onItemAdvance(item.id, next)}
                    className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 transition text-white"
                  >
                    Mark {next.replace('_', ' ')} →
                  </button>
                )}
              </div>
            );
          })}
      </div>

      {/* Ticket footer */}
      <div className="px-4 pb-3 pt-2 border-t border-gray-800">
        {allReady ? (
          <button
            onClick={onOrderComplete}
            className="w-full btn-success text-sm py-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            {order.status === 'ready' ? 'Mark Served' : 'All Ready!'}
          </button>
        ) : (
          <button
            onClick={() => {
              // Mark all pending/accepted items to in_progress at once
              stationItems
                .filter((i) => i.status === 'pending' || i.status === 'accepted')
                .forEach((i) => onItemAdvance(i.id, 'in_progress'));
            }}
            className="w-full btn-outline text-xs py-2"
          >
            Start All Items
          </button>
        )}
      </div>
    </div>
  );
}
