"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;

    // Load the existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) {
        setSession(data.session);
        setUser(data.session.user ?? null);
      }
      setLoading(false);
    }).catch((err) => {
      console.warn('[AuthProvider]: Session load error:', err);
      if (mounted) setLoading(false);
    });

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: "Supabase is not configured." };

    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    // If user doesn't exist or hasn't completed sign up, auto-register them seamlessly with the same credentials
    if (error && (error.message?.includes("Invalid login credentials") || error.message?.includes("User not found"))) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (!signUpError) {
        if (signUpData.session) {
          setSession(signUpData.session);
          setUser(signUpData.session.user);
          return {};
        }
        // Try sign-in once more after sign-up
        const { error: retryError } = await supabase.auth.signInWithPassword({ email, password });
        if (!retryError) return {};
      }
    }

    if (error) return { error: error.message };
    return {};
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: "Supabase is not configured." };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || "" },
      },
    });

    if (error) {
      // If user already exists, fallback to signing in
      if (error.message?.includes("already registered") || error.message?.includes("already exists")) {
        return signIn(email, password);
      }
      return { error: error.message };
    }

    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
    } else {
      // Attempt immediate sign-in in case auto-confirm is enabled
      await supabase.auth.signInWithPassword({ email, password });
    }

    return {};
  }, [signIn]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isLoading: loading,
      isSessionExpired: false,
      signIn,
      signUp,
      signOut
    }),
    [user, session, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
