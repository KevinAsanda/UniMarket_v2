import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId) => {
    try {
      const { data: student, error } = await supabase
        .from('students')
        .select('student_id, student_number, first_name, last_name, email, contact_number, account_status, card_verified, face_verified, qualification_id')
        .eq('student_id', userId)
        .single();

      if (error) {
        // PGRST116 = no rows found. This is expected briefly after signup
        // (auth user created, student row not yet inserted). Not a real error.
        if (error.code !== 'PGRST116') {
          console.error('Error fetching student profile:', error.message);
        }
        return null;
      }

      if (!student) return null;

      // If user is suspended or banned, sign out and clear
      if (student.account_status === 'suspended' || student.account_status === 'banned') {
        await supabase.auth.signOut();
        sessionStorage.clear();
        setUser(null);
        return null;
      }

      return student;
    } catch (err) {
      console.error('fetchProfile exception:', err);
      return null;
    }
  };

  const resolveSession = async () => {
    setLoading(true);

    try {
      // Rely exclusively on the Supabase Auth session.
      // Face ID login now creates a real session via the face-login Edge Function,
      // so no sessionStorage fallback is needed or safe.
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      if (!userId) {
        setUser(null);
        setLoading(false);
        return;
      }

      const profile = await fetchProfile(userId);
      if (profile) {
        setUser(profile);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session resolution error:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    resolveSession();

    // Listen for auth changes (skip INITIAL_SESSION — resolveSession() already handles that)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase sign out error:', err.message);
    }
    sessionStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refreshUser: resolveSession, signOut: handleSignOut }}>
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
