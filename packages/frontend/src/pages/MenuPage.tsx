import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MenuItem, MenuCategory } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { UtensilsCrossed, Plus, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface EditForm {
  name: string;
  description: string;
  price: string;
  category_id: number;
  active: boolean;
}

const EMPTY_FORM: EditForm = { name: '', description: '', price: '', category_id: 0, active: true };

export default function MenuPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isManager = user?.role === 'admin' || user?.role === 'manager';
  const isKitchen = user?.role === 'kitchen';

  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(true);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);

  const { data: categoriesRes } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => api.get('/menu/categories').then((r) => r.data.data as MenuCategory[]),
  });

  const { data: itemsRes, isLoading } = useQuery({
    queryKey: ['menu-items-all'],
    queryFn: () => api.get('/menu/items').then((r) => r.data.data as MenuItem[]),
  });

  const categories = categoriesRes ?? [];
  const allItems = itemsRes ?? [];

  const filtered = allItems
    .filter((i) => (selectedCat ? i.category_id === selectedCat : true))
    .filter((i) => (showInactive ? true : i.active));

  // Toggle availability (kitchen + manager)
  const toggleAvailability = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/menu/items/${id}/availability`, { active }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items-all'] });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      toast.success('Item updated');
    },
    onError: () => toast.error('Failed to update item'),
  });

  // Full save (manager only)
  const saveItem = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; description: string; price: number; category_id: number; active: boolean } }) =>
      api.patch(`/menu/items/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items-all'] });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      toast.success('Item saved');
      setEditItem(null);
    },
    onError: () => toast.error('Failed to save item'),
  });

  // Create item (manager only)
  const createItem = useMutation({
    mutationFn: (data: { name: string; description: string; price: number; category_id: number; active: boolean }) =>
      api.post('/menu/items', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items-all'] });
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      toast.success('Item created');
      setShowCreate(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error('Failed to create item'),
  });

  function openEdit(item: MenuItem) {
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(parseFloat(item.price as unknown as string).toFixed(2)),
      category_id: item.category_id,
      active: item.active,
    });
    setEditItem(item);
  }

  function handleSave() {
    if (!editItem) return;
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) { toast.error('Invalid price'); return; }
    saveItem.mutate({ id: editItem.id, data: { ...form, price } });
  }

  function handleCreate() {
    const price = parseFloat(form.price);
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (isNaN(price) || price < 0) { toast.error('Invalid price'); return; }
    if (!form.category_id) { toast.error('Select a category'); return; }
    createItem.mutate({ ...form, description: form.description || '', price });
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">
            {isKitchen ? 'Item Availability' : 'Menu Management'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-xs text-gray-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition"
          >
            {showInactive ? <ToggleRight className="w-4 h-4 text-brand-400" /> : <ToggleLeft className="w-4 h-4" />}
            {showInactive ? 'Showing all' : 'Active only'}
          </button>
          {isManager && (
            <button
              onClick={() => { setForm({ ...EMPTY_FORM, category_id: categories[0]?.id ?? 0 }); setShowCreate(true); }}
              className="btn-primary text-sm"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setSelectedCat(null)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            !selectedCat ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCat(cat.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedCat === cat.id ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Items table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-14 animate-pulse bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Item</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Category</th>
                {isManager && <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Price</th>}
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filtered.map((item) => (
                <tr key={item.id} className={`hover:bg-gray-800/50 transition ${!item.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-gray-500 truncate max-w-xs">{item.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.category_name}</td>
                  {isManager && (
                    <td className="px-4 py-3 text-right font-mono text-brand-400">
                      Rs. {parseFloat(item.price as unknown as string).toFixed(2)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    <span className={item.active ? 'badge-green' : 'badge-red'}>
                      {item.active ? 'Available' : '86\'d'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleAvailability.mutate({ id: item.id, active: !item.active })}
                      className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                        item.active
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      }`}
                      title={item.active ? '86 this item (mark unavailable)' : 'Make available'}
                    >
                      {item.active ? '86 Item' : 'Restore'}
                    </button>
                    {isManager && (
                      <button
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition"
                        title="Edit item"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={isManager ? 5 : 4} className="px-4 py-12 text-center text-gray-600">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {(editItem || showCreate) && isManager && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-brand-500" />
              {editItem ? 'Edit Item' : 'New Item'}
            </h3>

            <div>
              <label className="text-xs text-gray-400 font-medium">Name</label>
              <input className="input mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-medium">Description</label>
              <input className="input mt-1" placeholder="Optional" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-400 font-medium">Price (Rs.)</label>
                <input type="number" className="input mt-1" min={0} step={0.01} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 font-medium">Category</label>
                <select className="input mt-1" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: Number(e.target.value) }))}>
                  <option value={0}>Select…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active-check" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="active-check" className="text-sm text-gray-300">Available for ordering</label>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setEditItem(null); setShowCreate(false); setForm(EMPTY_FORM); }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={editItem ? handleSave : handleCreate}
                disabled={saveItem.isPending || createItem.isPending}
                className="btn-primary flex-1"
              >
                {saveItem.isPending || createItem.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
