import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  SalesSummary,
  ItemPerformance,
  HourlyTrend,
  StaffMetrics,
} from '@mise/shared';
import api from '../services/api';
import { BarChart3, TrendingUp, ShoppingCart, DollarSign, Download, Users } from 'lucide-react';

function fmt(n: number | string) {
  return `Rs. ${parseFloat(n as string).toFixed(2)}`;
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  const dateFrom = `${date}T00:00:00Z`;
  const dateTo = `${date}T23:59:59Z`;
  const params = `date_from=${dateFrom}&date_to=${dateTo}`;

  const summary = useQuery({
    queryKey: ['analytics-summary', date],
    queryFn: () => api.get(`/analytics/summary?${params}`).then((r) => r.data.data as SalesSummary),
  });

  const items = useQuery({
    queryKey: ['analytics-items', date],
    queryFn: () => api.get(`/analytics/items?${params}`).then((r) => r.data.data as ItemPerformance[]),
  });

  const hourly = useQuery({
    queryKey: ['analytics-hourly', date],
    queryFn: () => api.get(`/analytics/hourly?date=${date}`).then((r) => r.data.data as HourlyTrend[]),
  });

  const staff = useQuery({
    queryKey: ['analytics-staff', date],
    queryFn: () => api.get(`/analytics/staff?${params}`).then((r) => r.data.data as StaffMetrics[]),
  });

  const s = summary.data;

  async function handleExport() {
    const res = await api.get(`/analytics/export/csv?date=${date}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mise-sales-${date}.csv`;
    a.click();
  }

  // Build hourly chart data
  const maxRevenue = Math.max(...(hourly.data?.map((h) => parseFloat(h.revenue as unknown as string)) ?? [1]), 1);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-brand-500" />
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            className="input w-auto text-sm"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={today}
          />
          <button onClick={handleExport} className="btn-outline text-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Revenue"
          value={s ? fmt(s.total_revenue) : '—'}
          icon={DollarSign}
          color="bg-brand-500/20 text-brand-400"
        />
        <StatCard
          label="Paid Orders"
          value={s ? String(s.paid_orders) : '—'}
          icon={ShoppingCart}
          color="bg-emerald-500/20 text-emerald-400"
        />
        <StatCard
          label="Avg Order Value"
          value={s ? fmt(s.avg_order_value) : '—'}
          icon={TrendingUp}
          color="bg-blue-500/20 text-blue-400"
        />
        <StatCard
          label="Items Sold"
          value={s ? String(s.total_items_sold) : '—'}
          icon={ShoppingCart}
          color="bg-purple-500/20 text-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly trend chart */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Hourly Revenue
          </h2>
          {hourly.data && hourly.data.length > 0 ? (
            <div className="flex items-end gap-1 h-32">
              {Array.from({ length: 24 }, (_, i) => {
                const h = hourly.data!.find((d) => Number(d.hour) === i);
                const rev = h ? parseFloat(h.revenue as unknown as string) : 0;
                const height = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div
                      className="w-full bg-brand-500/50 hover:bg-brand-500 rounded-t transition relative"
                      style={{ height: `${height}%`, minHeight: height > 0 ? '4px' : '0' }}
                      title={`${i}:00 — ${fmt(rev)}`}
                    />
                    {i % 6 === 0 && <span className="text-xs text-gray-600">{i}h</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-600 text-sm">No data for this period</p>
          )}
        </div>

        {/* Staff metrics */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" /> Staff Performance
          </h2>
          <div className="space-y-3">
            {staff.data?.filter((s) => Number(s.orders_created) > 0).map((member) => (
              <div key={member.user_id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{member.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-brand-400">{fmt(member.total_revenue)}</p>
                  <p className="text-xs text-gray-500">{member.orders_created} orders</p>
                </div>
              </div>
            )) ?? <p className="text-gray-600 text-sm">No data</p>}
          </div>
        </div>
      </div>

      {/* Top items */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Top Selling Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-800">
                <th className="text-left pb-2">Item</th>
                <th className="text-left pb-2">Category</th>
                <th className="text-left pb-2">Station</th>
                <th className="text-right pb-2">Qty Sold</th>
                <th className="text-right pb-2">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {items.data?.slice(0, 15).map((item) => (
                <tr key={item.menu_item_id} className="hover:bg-gray-800/50">
                  <td className="py-2.5 font-medium text-white">{item.name}</td>
                  <td className="py-2.5 text-gray-400">{item.category}</td>
                  <td className="py-2.5">
                    <span className="badge-gray capitalize">{item.station}</span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-white">{item.quantity_sold}</td>
                  <td className="py-2.5 text-right font-bold text-brand-400">{fmt(item.revenue)}</td>
                </tr>
              )) ?? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-600">No sales data for this period</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
