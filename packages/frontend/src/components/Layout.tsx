import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import {
  ShoppingCart,
  ChefHat,
  LayoutGrid,
  Package,
  BarChart3,
  Users,
  ClipboardList,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRealtimeStore } from '../store/realtimeStore';
import { useWebSocket } from '../hooks/useWebSocket';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/pos', icon: ShoppingCart, label: 'POS', roles: ['admin', 'manager', 'cashier'] },
  { to: '/kds', icon: ChefHat, label: 'Kitchen', roles: ['admin', 'manager', 'kitchen'] },
  { to: '/tables', icon: LayoutGrid, label: 'Tables', roles: ['admin', 'manager', 'cashier'] },
  { to: '/inventory', icon: Package, label: 'Inventory', roles: ['admin', 'manager'] },
  { to: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['admin', 'manager'] },
  { to: '/orders', icon: ClipboardList, label: 'Orders', roles: ['admin', 'manager', 'cashier'] },
  { to: '/users', icon: Users, label: 'Users', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const { handleWsEvent, connected, lowStockItems } = useRealtimeStore();

  useWebSocket({
    onMessage: (event) => {
      handleWsEvent(event);
      if (event.type === 'order:created') {
        // Play sound effect
        playNotificationSound();
        toast.success('New order received!', { icon: '🔔' });
      }
      if (event.type === 'inventory:low_stock') {
        toast.error('Low stock alert!', { icon: '⚠️' });
      }
    },
  });

  const visibleNav = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="flex flex-col w-16 md:w-56 bg-gray-900 border-r border-gray-800 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <span className="hidden md:block text-lg font-bold text-white tracking-tight">mise</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto scrollbar-hide">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-brand-500/20 text-brand-400'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span className="hidden md:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 py-4 border-t border-gray-800 space-y-2">
          {/* WS status */}
          <div className="flex items-center gap-2 px-3 py-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0 animate-pulse" />
            )}
            <span className="hidden md:block text-xs text-gray-500">
              {connected ? 'Live' : 'Reconnecting...'}
            </span>
          </div>

          {/* User */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-800">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="hidden md:block min-w-0">
              <p className="text-xs font-medium text-gray-200 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span className="hidden md:block">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Low stock badge (top-right corner) */}
      {lowStockItems.length > 0 && (
        <div className="fixed top-4 right-4 z-50">
          <div className="badge-red px-3 py-1.5 text-xs font-semibold shadow-lg">
            ⚠️ {lowStockItems.length} low-stock item{lowStockItems.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio not available
  }
}
