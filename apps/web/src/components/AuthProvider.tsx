"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { 
  getFirebaseAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  googleProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User
} from "@/lib/firebase";

export interface FirebaseUserSession {
  userId: string;
  email: string;
  expiresAt: number;
  getIdToken: () => Promise<string>;
}

export type AuthContextValue = {
  user: User | null;
  session: FirebaseUserSession | null;
  loading: boolean;
  isLoading: boolean;
  isSessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithDemo: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({
  children,
  initialSession = null,
}: {
  children: React.ReactNode;
  initialSession?: any;
}) {
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [session, setSession] = useState<FirebaseUserSession | null>(initialSession);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!mounted) return;
      if (currentUser) {
        setUser(currentUser);
        setSession({
          userId: currentUser.uid,
          email: currentUser.email || "",
          expiresAt: Date.now() + 3600 * 1000,
          getIdToken: () => currentUser.getIdToken(),
        });
      } else {
        setUser(null);
        setSession(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: "Firebase Auth not initialized" };
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
      return {};
    } catch (err: any) {
      if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        try {
          const newCred = await createUserWithEmailAndPassword(auth, email, password);
          setUser(newCred.user);
          return {};
        } catch (signupErr: any) {
          return { error: signupErr.message };
        }
      }
      return { error: err.message };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: "Firebase Auth not initialized" };
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
      return {};
    } catch (err: any) {
      if (err.code === "auth/email-already-in-use") {
        return signIn(email, password);
      }
      return { error: err.message };
    }
  }, [signIn]);

  const signInWithGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return { error: "Firebase Auth not initialized" };
    }

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      setUser(cred.user);
      return {};
    } catch (err: any) {
      return { error: err.message };
    }
  }, []);

  const signInWithDemo = useCallback(async () => {
    return signIn("demo@excerpt.ai", "DemoPassword123!");
  }, [signIn]);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    if (auth) {
      try {
        await firebaseSignOut(auth);
      } catch {}
    }
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
      signInWithGoogle,
      signInWithDemo,
      signOut,
    }),
    [user, session, loading, signIn, signUp, signInWithGoogle, signInWithDemo, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  session: null,
  loading: false,
  isLoading: false,
  isSessionExpired: false,
  signIn: async () => ({}),
  signUp: async () => ({}),
  signInWithGoogle: async () => ({}),
  signInWithDemo: async () => ({}),
  signOut: async () => {},
};

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContext;
}
