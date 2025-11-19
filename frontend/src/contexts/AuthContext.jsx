import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthChange, signOut as firebaseSignOut, getCurrentUserToken } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        const idToken = await firebaseUser.getIdToken();
        setUser(firebaseUser);
        setToken(idToken);
      } else {
        // User is signed out
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    // Cleanup subscription
    return unsubscribe;
  }, []);

  const signOut = async () => {
    try {
      await firebaseSignOut();
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('Error signing out:', err);
      throw err;
    }
  };

  const refreshToken = async () => {
    if (user) {
      const newToken = await getCurrentUserToken();
      setToken(newToken);
      return newToken;
    }
    return null;
  };

  const value = {
    user,
    token,
    loading,
    signOut,
    refreshToken,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

