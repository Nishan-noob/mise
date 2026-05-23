import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { InventoryItem } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Package, AlertTriangle, Plus, TrendingUp } from 'lucide-react';

export default function InventoryPage() {
  const qc = useQueryClient();
  const [showRestock, setShowRestock] = useState(false);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [filter, setFilter] = useState<'all' | 'low'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then((r) => r.data.data as InventoryItem[]),
    refetchInterval: 30_000,
  });

  const restock = useMutation({
    mutationFn: ({ id, qty }: { id: number; qty: number }) =>
      api.post('/inventory/restock', { inventory_item_id: id, quantity: qty }).then((r) => r.data),
    onSuccess: () => {
      toast.success('Restocked successfully');
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setShowRestock(false);
      setRestockItem(null);
      setRestockQty('');
    },
    onError: () => toast.error('Failed to restock'),
  });

  const items = data ?? [];
  const displayed = filter === 'low' ? items.filter((i) => i.is_low_stock) : items;
  const lowCount = items.filter((i) => i.is_low_stock).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          {lowCount > 0 && (
            <span className="badge-red flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {lowCount} low stock
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === 'all' ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            All ({items.length})
          </button>
          <button
            onClick={() => setFilter('low')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === 'low' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}
          >
            Low Stock ({lowCount})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 h-16 animate-pulse bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Item</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Unit</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Threshold</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {displayed.map((item) => (
                <tr key={item.id} className="hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${item.is_low_stock ? 'text-red-400' : 'text-white'}`}>
                    {parseFloat(item.quantity as unknown as string).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {parseFloat(item.low_stock_threshold as unknown as string).toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.is_low_stock ? (
                      <span className="badge-red flex items-center justify-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Low
                      </span>
                    ) : (
                      <span className="badge-green">OK</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        setRestockItem(item);
                        setShowRestock(true);
                      }}
                      className="btn-outline text-xs px-3 py-1.5"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      Restock
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Restock Modal */}
      {showRestock && restockItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-bold text-white">Restock — {restockItem.name}</h3>
            <p className="text-sm text-gray-400">
              Current stock: <span className="text-white font-semibold">{parseFloat(restockItem.quantity as unknown as string).toFixed(1)} {restockItem.unit}</span>
            </p>
            <div>
              <label className="text-xs text-gray-400 font-medium">Quantity to add ({restockItem.unit})</label>
              <input
                type="number"
                className="input mt-1"
                min={0.1}
                step={0.1}
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowRestock(false); setRestockItem(null); setRestockQty(''); }} className="btn-ghost flex-1">
                Cancel
              </button>
              <button
                onClick={() => restock.mutate({ id: restockItem.id, qty: parseFloat(restockQty) })}
                disabled={!restockQty || parseFloat(restockQty) <= 0 || restock.isPending}
                className="btn-primary flex-1"
              >
                {restock.isPending ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
