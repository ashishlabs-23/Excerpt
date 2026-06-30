"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Temporarily bypass auth for live testing
  return <>{children}</>;
}
