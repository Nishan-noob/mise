import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Minus, Trash2, Send, Search, SplitSquareVertical, Merge, X, ChevronDown } from 'lucide-react';
import api from '../services/api';
import {
  MenuItem,
  MenuCategory,
  RestaurantTable,
  CreateOrderRequest,
  OrderType,
} from '@mise/shared';
import toast from 'react-hot-toast';

interface CartItem {
  menu_item_id: number;
  name: string;
  unit_price: number;
  quantity: number;
  notes: string;
  modifier_ids: number[];
  modifier_names: string[];
}

export default function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTable, setSelectedTable] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const qc = useQueryClient();

  const { data: categoriesRes } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => api.get('/menu/categories').then((r) => r.data.data as MenuCategory[]),
  });
  const { data: itemsRes } = useQuery({
    queryKey: ['menu-items'],
    queryFn: () => api.get('/menu/items?active=true').then((r) => r.data.data as MenuItem[]),
  });
  const { data: tablesRes } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/tables').then((r) => r.data.data as RestaurantTable[]),
  });

  const categories = categoriesRes ?? [];
  const allItems = itemsRes ?? [];
  const tables = tablesRes ?? [];

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const catMatch = selectedCat ? item.category_id === selectedCat : true;
      const searchMatch = search
        ? item.name.toLowerCase().includes(search.toLowerCase())
        : true;
      return catMatch && searchMatch;
    });
  }, [allItems, selectedCat, search]);

  const TAX_PCT = 10;
  const SERVICE_PCT = 10;

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const discountAmt = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmt;
  const serviceAmt = afterDiscount * (SERVICE_PCT / 100);
  const taxAmt = (afterDiscount + serviceAmt) * (TAX_PCT / 100);
  const total = afterDiscount + serviceAmt + taxAmt;

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          menu_item_id: item.id,
          name: item.name,
          unit_price: parseFloat(item.price as unknown as string),
          quantity: 1,
          notes: '',
          modifier_ids: [],
          modifier_names: [],
        },
      ];
    });
  }

  function updateQty(itemId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => (c.menu_item_id === itemId ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0)
    );
  }

  function removeFromCart(itemId: number) {
    setCart((prev) => prev.filter((c) => c.menu_item_id !== itemId));
  }

  function updateNotes(itemId: number, notes: string) {
    setCart((prev) =>
      prev.map((c) => (c.menu_item_id === itemId ? { ...c, notes } : c))
    );
  }

  async function submitOrder() {
    if (!cart.length) { toast.error('Cart is empty'); return; }
    if (orderType === 'dine_in' && !selectedTable) { toast.error('Select a table for dine-in'); return; }

    setSubmitting(true);
    try {
      const body: CreateOrderRequest = {
        type: orderType,
        table_id: orderType === 'dine_in' ? selectedTable : null,
        customer_name: customerName || null,
        notes: notes || null,
        discount_pct: discountPct,
        service_charge_pct: SERVICE_PCT,
        tax_pct: TAX_PCT,
        items: cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          notes: c.notes || null,
          modifier_ids: c.modifier_ids,
        })),
      };

      await api.post('/orders', body);
      toast.success('Order sent to kitchen!');
      setCart([]);
      setSelectedTable(null);
      setCustomerName('');
      setNotes('');
      setDiscountPct(0);
      qc.invalidateQueries({ queryKey: ['tables'] });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create order';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* ── Left: Menu Browser ────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-gray-800">
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-white">Point of Sale</h1>
            <div className="flex gap-2">
              {(['dine_in', 'takeaway', 'delivery'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    orderType === t
                      ? 'bg-brand-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              className="input pl-9"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-hide border-b border-gray-800">
          <button
            onClick={() => setSelectedCat(null)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              !selectedCat ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                selectedCat === cat.id
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredItems.map((item) => {
              const inCart = cart.find((c) => c.menu_item_id === item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`relative card p-3 text-left transition hover:border-brand-500/50 hover:bg-gray-800 active:scale-95 ${
                    inCart ? 'border-brand-500/40 bg-brand-500/5' : ''
                  }`}
                >
                  <p className="text-sm font-semibold text-white leading-tight">{item.name}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{item.description}</p>
                  <p className="text-sm font-bold text-brand-400 mt-2">
                    ${parseFloat(item.price as unknown as string).toFixed(2)}
                  </p>
                  {inCart && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-xs font-bold text-white">
                      {inCart.quantity}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right: Cart / Order ───────────────────────────────── */}
      <div className="w-80 xl:w-96 flex flex-col bg-gray-900 flex-shrink-0">
        {/* Order details */}
        <div className="px-4 py-4 border-b border-gray-800 space-y-3">
          {orderType === 'dine_in' && (
            <div>
              <label className="text-xs text-gray-400 font-medium">Table</label>
              <select
                className="input mt-1"
                value={selectedTable ?? ''}
                onChange={(e) => setSelectedTable(Number(e.target.value) || null)}
              >
                <option value="">Select table</option>
                {tables
                  .filter((t) => t.status === 'available')
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} (cap. {t.capacity})
                    </option>
                  ))}
              </select>
            </div>
          )}
          {(orderType === 'takeaway' || orderType === 'delivery') && (
            <div>
              <label className="text-xs text-gray-400 font-medium">Customer Name</label>
              <input
                className="input mt-1"
                placeholder="Optional"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 font-medium">Discount %</label>
              <input
                type="number"
                className="input mt-1"
                min={0}
                max={100}
                value={discountPct}
                onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
              />
            </div>
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-600">
              <ShoppingCartEmpty />
              <p className="mt-2 text-sm">Cart is empty</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.menu_item_id} className="card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{item.name}</p>
                    <p className="text-xs text-brand-400">${item.unit_price.toFixed(2)} ea</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateQty(item.menu_item_id, -1)}
                      className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.menu_item_id, 1)}
                      className="w-7 h-7 rounded-lg bg-gray-700 hover:bg-gray-600 flex items-center justify-center transition"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.menu_item_id)}
                      className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <input
                    className="flex-1 bg-transparent text-xs text-gray-400 border-b border-gray-700 focus:border-brand-500 outline-none pb-0.5 placeholder:text-gray-600"
                    placeholder="Add note..."
                    value={item.notes}
                    onChange={(e) => updateNotes(item.menu_item_id, e.target.value)}
                  />
                  <span className="text-sm font-bold text-white ml-2">
                    ${(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals & Submit */}
        {cart.length > 0 && (
          <div className="px-4 py-4 border-t border-gray-800 space-y-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-green-400">
                  <span>Discount ({discountPct}%)</span>
                  <span>-${discountAmt.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-400">
                <span>Service ({SERVICE_PCT}%)</span>
                <span>${serviceAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Tax ({TAX_PCT}%)</span>
                <span>${taxAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white font-bold text-base pt-1.5 border-t border-gray-700">
                <span>Total</span>
                <span className="text-brand-400">${total.toFixed(2)}</span>
              </div>
            </div>
            <button
              onClick={submitOrder}
              disabled={submitting}
              className="btn-primary w-full py-3 text-base"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Sending...' : 'Send to Kitchen'}
            </button>
            <button
              onClick={() => setCart([])}
              className="btn-ghost w-full text-sm"
            >
              Clear Cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ShoppingCartEmpty() {
  return (
    <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
