import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RestaurantTable, TableStatus } from '@mise/shared';
import api from '../services/api';
import toast from 'react-hot-toast';
import { LayoutGrid, Users, Clock } from 'lucide-react';
import { useRealtimeStore } from '../store/realtimeStore';

const STATUS_STYLES: Record<TableStatus, string> = {
  available: 'border-emerald-500/50 bg-emerald-500/5 text-emerald-300',
  occupied: 'border-brand-500/50 bg-brand-500/5 text-brand-300',
  reserved: 'border-blue-500/50 bg-blue-500/5 text-blue-300',
  cleaning: 'border-yellow-500/50 bg-yellow-500/5 text-yellow-300',
};

const STATUS_BADGE: Record<TableStatus, string> = {
  available: 'badge-green',
  occupied: 'badge-orange',
  reserved: 'badge-blue',
  cleaning: 'badge-yellow',
};

export default function TablesPage() {
  const qc = useQueryClient();
  const { tables: liveTablesFromWs } = useRealtimeStore();
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get('/tables').then((r) => r.data.data as RestaurantTable[]),
    refetchInterval: 10_000,
  });

  // Prefer WS live data if available
  const tables = liveTablesFromWs.length > 0 ? liveTablesFromWs : (data ?? []);

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TableStatus }) =>
      api.patch(`/tables/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Table status updated');
    },
    onError: () => toast.error('Failed to update table'),
  });

  const floors = [...new Set(tables.map((t) => t.floor))].sort();

  const filteredTables = selectedFloor
    ? tables.filter((t) => t.floor === selectedFloor)
    : tables;

  const stats = {
    total: tables.length,
    available: tables.filter((t) => t.status === 'available').length,
    occupied: tables.filter((t) => t.status === 'occupied').length,
    reserved: tables.filter((t) => t.status === 'reserved').length,
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutGrid className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">Table Management</h1>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-white' },
          { label: 'Available', value: stats.available, color: 'text-emerald-400' },
          { label: 'Occupied', value: stats.occupied, color: 'text-brand-400' },
          { label: 'Reserved', value: stats.reserved, color: 'text-blue-400' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Floor filter */}
      {floors.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedFloor(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              !selectedFloor ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            All Floors
          </button>
          {floors.map((f) => (
            <button
              key={f}
              onClick={() => setSelectedFloor(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                selectedFloor === f ? 'bg-brand-500 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Tables grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filteredTables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onStatusChange={(status) => updateStatus.mutate({ id: table.id, status })}
          />
        ))}
      </div>
    </div>
  );
}

function TableCard({
  table,
  onStatusChange,
}: {
  table: RestaurantTable;
  onStatusChange: (s: TableStatus) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const nextStatuses: TableStatus[] = (['available', 'occupied', 'reserved', 'cleaning'] as TableStatus[]).filter(
    (s) => s !== table.status
  );

  return (
    <div
      className={`card border-2 p-4 cursor-pointer transition hover:shadow-lg relative ${STATUS_STYLES[table.status]}`}
      onClick={() => setShowMenu(!showMenu)}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-black text-white">{table.name}</h3>
        <span className={STATUS_BADGE[table.status]}>{table.status}</span>
      </div>

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Users className="w-3.5 h-3.5" />
          <span>Cap. {table.capacity}</span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-400">
          <span className="capitalize">{table.floor}</span>
        </div>
        {table.active_order_id && (
          <div className="flex items-center gap-1.5 text-brand-400 font-semibold">
            <Clock className="w-3.5 h-3.5" />
            <span>Order #{table.active_order_id}</span>
          </div>
        )}
      </div>

      {/* Status change dropdown */}
      {showMenu && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-xl z-10 overflow-hidden shadow-xl">
          {nextStatuses.map((s) => (
            <button
              key={s}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(s);
                setShowMenu(false);
              }}
              className="w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-gray-700 transition capitalize text-gray-200"
            >
              Mark {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="card p-4 h-28 animate-pulse bg-gray-800" />
      ))}
    </div>
  );
}
