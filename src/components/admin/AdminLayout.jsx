import { Outlet, Navigate } from 'react-router-dom';
import { useAdmin } from '../../contexts/AdminContext';
import { useAuth } from '../../contexts/AuthContext';
import AdminNav from './AdminNav';

export default function AdminLayout() {
  const { isAdmin, loading: roleLoading } = useAdmin();
  const { user, loading: authLoading } = useAuth();

  if (authLoading || roleLoading) return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user || !isAdmin) return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-[#0a1628] text-white flex">
      <aside className="w-56 flex-shrink-0 glass border-r border-[#00d4ff]/10 flex flex-col">
        <AdminNav />
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
