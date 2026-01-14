import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User } from '@/types';
import { startLogin, doLogout, getUserFromStoredToken } from '@/api';

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  authenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUserFromStoredToken();
    if (user) {
      setUser(user);
    }
    setLoading(false);
  }, []);

  const handleLogin = async () => {
    await startLogin();
  };

  const handleLogout = async () => {
    await doLogout();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        authenticated: !!user,
        login: handleLogin,
        logout: handleLogout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
