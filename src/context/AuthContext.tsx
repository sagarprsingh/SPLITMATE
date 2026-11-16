import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile } from '../types/models';
import { authService } from '../services/authService';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface AuthContextType {
  user: UserProfile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password?: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  resendOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  switchDemoUser: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const loadUserData = useCallback(async () => {
    try {
      setLoading(true);
      const session = await authService.getSession();
      if (session?.user) {
        const profile = await authService.getUserProfile(session.user.id);
        const resolvedUser: UserProfile = profile || {
          id: session.user.id,
          email: session.user.email || 'user@example.com',
          full_name: (session.user as any).user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
          default_currency: 'INR',
          created_at: new Date().toISOString(),
        };

        setUser(resolvedUser);

        // Crucial server-side database admin check
        const adminStatus = await authService.checkAdminStatus(resolvedUser.id);
        setIsAdmin(adminStatus);
      } else {
        setUser(null);
        setIsAdmin(false);
      }
    } catch (err) {
      console.error('Error loading session user:', err);
      setUser(null);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();

    if (isSupabaseConfigured) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user) {
          try {
            const profile = await authService.getUserProfile(session.user.id);
            const resolvedUser: UserProfile = profile || {
              id: session.user.id,
              email: session.user.email || 'user@example.com',
              full_name: (session.user as any).user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
              default_currency: 'INR',
              created_at: new Date().toISOString(),
            };
            setUser(resolvedUser);
            const adminStatus = await authService.checkAdminStatus(resolvedUser.id);
            setIsAdmin(adminStatus);
          } catch (err) {
            console.error('Error resolving user in auth state change:', err);
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [loadUserData]);

  const signIn = async (email: string, password?: string) => {
    await authService.signIn(email, password);
    await loadUserData();
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    await authService.signUp(email, password, fullName);
    // Note: User will verify OTP before active session is established
  };

  const verifyOtp = async (email: string, token: string) => {
    await authService.verifySignupOtp(email, token);
    await loadUserData();
  };

  const resendOtp = async (email: string) => {
    await authService.resendSignupOtp(email);
  };

  const signOut = async () => {
    await authService.signOut();
    setUser(null);
    setIsAdmin(false);
  };

  const refreshUser = async () => {
    await loadUserData();
  };

  const switchDemoUser = async (userId: string) => {
    authService.switchDemoUser(userId);
    await loadUserData();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        signIn,
        signUp,
        verifyOtp,
        resendOtp,
        signOut,
        refreshUser,
        switchDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
