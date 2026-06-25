import { RecentClips } from "@/components/RecentClips";
import { SidebarNav } from "@/components/SidebarNav";
import { AuthGate } from "@/components/AuthGate";
import React from "react";
import { motion } from "framer-motion";

function GalleryContent() {
  return (
    <div className="flex min-h-screen lg:h-screen bg-[#030712] text-[#e0e5f6] relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] opacity-40" />
      <SidebarNav />

      <main className="flex-grow overflow-y-auto px-4 sm:px-6 lg:px-12 pt-8 sm:pt-10 pb-32 lg:pb-10 relative z-10">
        <div className="max-w-6xl mx-auto">
          <header className="mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white uppercase italic mb-4">
              Clip Gallery
            </h1>
            <p className="text-white/40 max-w-2xl leading-relaxed">
              Browse, download, and manage your AI-generated clips.
            </p>
          </header>

          <RecentClips />
        </div>
      </main>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <AuthGate>
      <GalleryContent />
    </AuthGate>
  );
}
