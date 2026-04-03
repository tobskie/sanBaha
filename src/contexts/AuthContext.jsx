import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthChange, signInWithGoogle, logOut } from '../services/firebase';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      await signInWithGoogle();
      setShowLoginPrompt(false);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await logOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Call this before gated actions; returns true if user is logged in
  const requireAuth = () => {
    if (!user) {
      setShowLoginPrompt(true);
      return false;
    }
    return true;
  };

  const value = {
    user,
    loading,
    login,
    logout,
    requireAuth,
    showLoginPrompt,
    setShowLoginPrompt,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
