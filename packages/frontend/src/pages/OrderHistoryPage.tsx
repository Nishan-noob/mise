import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Order, OrderStatus } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { ClipboardList, CheckCircle, XCircle, Printer } from 'lucide-react';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import { useRealtimeStore } from '../store/realtimeStore';

const fmtLabel = (s: string) =>
  s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const PRINTABLE_STATUSES: OrderStatus[] = ['open', 'in_progress', 'ready', 'served', 'paid'];

function printReceipt(order: Order) {
  const fmt = (n: number | unknown) => `$${parseFloat(n as string).toFixed(2)}`;
  const date = format(parseISO(order.created_at), 'dd MMM yyyy HH:mm');

  const itemRows = order.items
    .filter((i) => i.status !== 'voided')
    .map((item) => {
      const modLine = item.modifiers?.length
        ? `<div style="color:#666;font-size:11px;padding-left:12px">${item.modifiers.map((m) => `+ ${m.modifier_name}${parseFloat(m.price_delta as unknown as string) ? ` (${fmt(m.price_delta)})` : ''}`).join(', ')}</div>`
        : '';
      const noteLine = item.notes
        ? `<div style="color:#888;font-size:11px;font-style:italic;padding-left:12px">Note: ${item.notes}</div>`
        : '';
      return `
        <tr>
          <td style="padding:3px 0;vertical-align:top">
            <div>${item.quantity} × ${item.menu_item_name}</div>
            ${modLine}${noteLine}
          </td>
          <td style="padding:3px 0;text-align:right;vertical-align:top;white-space:nowrap">${fmt(parseFloat(item.unit_price as unknown as string) * item.quantity)}</td>
        </tr>`;
    })
    .join('');

  const discountRow = parseFloat(order.discount_amount as unknown as string) > 0
    ? `<tr><td style="color:#888">Discount (${order.discount_pct}%)</td><td style="text-align:right;color:#888">-${fmt(order.discount_amount)}</td></tr>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt #${order.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 13px; width: 300px; margin: 0 auto; padding: 16px 8px; color: #111; }
    h1 { text-align: center; font-size: 20px; letter-spacing: 3px; margin-bottom: 2px; }
    .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 12px; }
    .divider { border: none; border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { font-size: 12px; }
    .totals td { padding: 2px 0; }
    .total-line td { font-weight: bold; font-size: 14px; border-top: 1px dashed #999; padding-top: 6px; margin-top: 4px; }
    .footer { text-align: center; font-size: 11px; color: #777; margin-top: 14px; }
    .badge { display:inline-block; background:#eee; padding: 1px 6px; border-radius: 3px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    @media print { @page { margin: 0; size: 80mm auto; } }
  </style>
</head>
<body>
  <h1>mise</h1>
  <div class="sub">Restaurant Management System</div>
  <hr class="divider"/>
  <table><tbody>
    <tr><td>Order</td><td style="text-align:right"><strong>#${order.id}</strong></td></tr>
    <tr><td>Date</td><td style="text-align:right">${date}</td></tr>
    <tr><td>Type</td><td style="text-align:right"><span class="badge">${order.type.replace('_', ' ')}</span></td></tr>
    ${order.table_name ? `<tr><td>Table</td><td style="text-align:right">${order.table_name}</td></tr>` : ''}
    ${order.customer_name ? `<tr><td>Customer</td><td style="text-align:right">${order.customer_name}</td></tr>` : ''}
    <tr><td>Status</td><td style="text-align:right"><span class="badge">${order.status}</span></td></tr>
  </tbody></table>
  <hr class="divider"/>
  <table><tbody>${itemRows}</tbody></table>
  <hr class="divider"/>
  <table class="totals"><tbody>
    <tr><td>Subtotal</td><td style="text-align:right">${fmt(order.subtotal)}</td></tr>
    ${discountRow}
    <tr><td>Service (${order.service_charge_pct}%)</td><td style="text-align:right">${fmt(order.service_charge_amount)}</td></tr>
    <tr><td>Tax (${order.tax_pct}%)</td><td style="text-align:right">${fmt(order.tax_amount)}</td></tr>
  </tbody></table>
  <table><tbody>
    <tr class="total-line"><td>TOTAL</td><td style="text-align:right">${fmt(order.total)}</td></tr>
  </tbody></table>
  ${order.notes ? `<hr class="divider"/><div style="font-size:11px;color:#555">Notes: ${order.notes}</div>` : ''}
  <div class="footer">
    <p>Thank you for dining with us!</p>
    <p style="margin-top:4px">Powered by mise</p>
  </div>
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=380,height=600,menubar=no,toolbar=no');
  if (!win) { toast.error('Allow pop-ups to print receipts'); return; }
  win.document.write(html);
  win.document.close();
}

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
  const openOrders = useRealtimeStore((s) => s.openOrders);

  // Refetch whenever live order state changes
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['orders'] });
  }, [openOrders, qc]);

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
              {s ? fmtLabel(s) : 'All'}
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
  const canPrint = PRINTABLE_STATUSES.includes(order.status);

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-800/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 flex items-center gap-3 flex-wrap min-w-0">
          <span className="text-base font-bold text-white">#{order.id}</span>
          <span className={STATUS_BADGE[order.status]}>{fmtLabel(order.status)}</span>
          <span className="badge-gray capitalize">{order.type.replace('_', ' ')}</span>
          {order.table_name && <span className="text-xs text-gray-400">{order.table_name}</span>}
          {order.customer_name && <span className="text-xs text-gray-400">· {order.customer_name}</span>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {canPrint && (
            <button
              onClick={(e) => { e.stopPropagation(); printReceipt(order); }}
              title="Print receipt"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
            >
              <Printer className="w-4 h-4" />
            </button>
          )}
          <div className="text-right">
            <p className="text-base font-bold text-brand-400">${parseFloat(order.total as unknown as string).toFixed(2)}</p>
            <p className="text-xs text-gray-500">
              {formatDistanceToNow(parseISO(order.created_at), { addSuffix: true })}
            </p>
          </div>
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
                  <span className={STATUS_BADGE[item.status]}>{fmtLabel(item.status)}</span>
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
            {order.status === 'open' && (
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
