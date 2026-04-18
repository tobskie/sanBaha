// src/contexts/AdminContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database, onAuthChange } from '../services/firebase';

const AdminContext = createContext({ isAdmin: false, role: 'user', loading: true });

export function AdminProvider({ children }) {
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let roleUnsub = () => {};
    const authUnsub = onAuthChange((user) => {
      roleUnsub();
      if (!user) { setRole('user'); setLoading(false); return; }
      const roleRef = ref(database, `users/${user.uid}/role`);
      roleUnsub = onValue(roleRef, (snap) => {
        setRole(snap.val() || 'user');
        setLoading(false);
      });
    });
    return () => { authUnsub(); roleUnsub(); };
  }, []);

  return (
    <AdminContext.Provider value={{ isAdmin: role === 'admin', role, loading }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
