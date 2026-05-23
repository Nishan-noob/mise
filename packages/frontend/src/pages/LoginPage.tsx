import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Eye, EyeOff } from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@mise.local');
  const [password, setPassword] = useState('password');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.data.token, res.data.data.user);
      navigate('/pos', { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Login failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-500/30">
            <ChefHat className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">mise</h1>
          <p className="text-gray-400 text-sm mt-1">Restaurant Management System</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary w-full py-3 text-base"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {/* Demo credentials */}
        <div className="mt-4 card p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Demo Credentials</p>
          {[
            { role: 'Admin', email: 'admin@mise.local' },
            { role: 'Manager', email: 'manager@mise.local' },
            { role: 'Cashier', email: 'cashier@mise.local' },
            { role: 'Kitchen', email: 'kitchen@mise.local' },
          ].map((d) => (
            <button
              key={d.role}
              onClick={() => { setEmail(d.email); setPassword('password'); }}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-gray-800 transition text-left"
            >
              <span className="text-xs font-medium text-gray-300">{d.role}</span>
              <span className="text-xs text-gray-500">{d.email}</span>
            </button>
          ))}
          <p className="text-xs text-gray-600 text-center">All passwords: <code className="text-gray-400">password</code></p>
        </div>
      </div>
    </div>
  );
}
