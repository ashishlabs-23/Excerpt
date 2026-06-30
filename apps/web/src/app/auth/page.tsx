"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();

  useEffect(() => {
    // Auth is temporarily disabled for live testing
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
