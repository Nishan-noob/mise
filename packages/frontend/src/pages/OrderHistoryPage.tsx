import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Order, OrderStatus } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ClipboardList, Clock, CheckCircle, XCircle } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-gray',
  open: 'badge-yellow',
  in_progress: 'badge-orange',
  ready: 'badge-blue',
  served: 'badge-green',
  paid: 'badge-green',
  voided: 'badge-red',
  merged: 'badge-gray',
};

export default function OrderHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter],
    queryFn: () =>
      api
        .get(`/orders?limit=100${statusFilter ? `&status=${statusFilter}` : ''}`)
        .then((r) => r.data.data as Order[]),
    refetchInterval: 15_000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Order updated');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Failed to update'),
  });

  const payOrder = useMutation({
    mutationFn: ({ id, method }: { id: number; method: string }) =>
      api.post(`/payments/orders/${id}/pay`, { method, amount: 0 }),
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Payment failed'),
  });

  const orders = data ?? [];

  const STATUSES = ['', 'open', 'in_progress', 'ready', 'served', 'paid', 'voided'];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">Order History</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === s ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 h-20 animate-pulse bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="card p-12 text-center text-gray-600">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No orders found</p>
            </div>
          )}
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onUpdateStatus={(s) => updateStatus.mutate({ id: order.id, status: s })}
              onPay={(method) => payOrder.mutate({ id: order.id, method })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderRow({
  order,
  onUpdateStatus,
  onPay,
}: {
  order: Order;
  onUpdateStatus: (s: string) => void;
  onPay: (method: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 flex items-center gap-3 flex-wrap min-w-0">
          <span className="text-base font-bold text-white">#{order.id}</span>
          <span className={STATUS_BADGE[order.status]}>{order.status}</span>
          <span className="badge-gray capitalize">{order.type.replace('_', ' ')}</span>
          {order.table_name && <span className="text-xs text-gray-400">{order.table_name}</span>}
          {order.customer_name && <span className="text-xs text-gray-400">· {order.customer_name}</span>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-brand-400">${parseFloat(order.total as unknown as string).toFixed(2)}</p>
          <p className="text-xs text-gray-500">
            {formatDistanceToNow(parseISO(order.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 px-4 py-3 space-y-3">
          {/* Items */}
          <div className="space-y-1.5">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">
                  ×{item.quantity} {item.menu_item_name}
                  {item.notes && <span className="text-yellow-400 italic"> · {item.notes}</span>}
                </span>
                <div className="flex items-center gap-3">
                  <span className={STATUS_BADGE[item.status]}>{item.status}</span>
                  <span className="text-gray-400">${(parseFloat(item.unit_price as unknown as string) * item.quantity).toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Totals summary */}
          <div className="pt-2 border-t border-gray-800 text-xs space-y-1 text-gray-400">
            <div className="flex justify-between"><span>Subtotal</span><span>${parseFloat(order.subtotal as unknown as string).toFixed(2)}</span></div>
            {parseFloat(order.discount_amount as unknown as string) > 0 && (
              <div className="flex justify-between text-green-400"><span>Discount</span><span>-${parseFloat(order.discount_amount as unknown as string).toFixed(2)}</span></div>
            )}
            <div className="flex justify-between"><span>Service charge</span><span>${parseFloat(order.service_charge_amount as unknown as string).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Tax</span><span>${parseFloat(order.tax_amount as unknown as string).toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-white text-sm pt-1"><span>Total</span><span className="text-brand-400">${parseFloat(order.total as unknown as string).toFixed(2)}</span></div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {order.status === 'served' && (
              <button
                onClick={() => onPay('cash')}
                className="btn-success text-xs px-3 py-2"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Mark Paid (Cash)
              </button>
            )}
            {order.status === 'served' && (
              <button
                onClick={() => onPay('card')}
                className="btn-outline text-xs px-3 py-2"
              >
                Mark Paid (Card)
              </button>
            )}
            {['open', 'in_progress', 'ready'].includes(order.status) && (
              <button
                onClick={() => onUpdateStatus('voided')}
                className="btn-danger text-xs px-3 py-2"
              >
                <XCircle className="w-3.5 h-3.5" /> Void
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
