// src/contexts/AdminContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database, onAuthChange } from '../services/firebase';

const AdminContext = createContext({ isAdmin: false, role: 'citizen' });

export function AdminProvider({ children }) {
  const [role, setRole] = useState('citizen');

  useEffect(() => {
    let roleUnsub = () => {};
    const authUnsub = onAuthChange((user) => {
      roleUnsub();
      if (!user) { setRole('citizen'); return; }
      const roleRef = ref(database, `users/${user.uid}/role`);
      roleUnsub = onValue(roleRef, (snap) => {
        setRole(snap.val() || 'citizen');
      });
    });
    return () => { authUnsub(); roleUnsub(); };
  }, []);

  return (
    <AdminContext.Provider value={{ isAdmin: role === 'admin', role }}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => useContext(AdminContext);
