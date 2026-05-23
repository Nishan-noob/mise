import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import POSPage from './pages/POSPage';
import KDSPage from './pages/KDSPage';
import TablesPage from './pages/TablesPage';
import InventoryPage from './pages/InventoryPage';
import AnalyticsPage from './pages/AnalyticsPage';
import UsersPage from './pages/UsersPage';
import OrderHistoryPage from './pages/OrderHistoryPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  if (!isAuth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function DefaultRedirect() {
  const user = useAuthStore((s) => s.user);
  return <Navigate to={user?.role === 'kitchen' ? '/kds' : '/pos'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<DefaultRedirect />} />
          <Route path="pos" element={<POSPage />} />
          <Route path="kds" element={<KDSPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="orders" element={<OrderHistoryPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
