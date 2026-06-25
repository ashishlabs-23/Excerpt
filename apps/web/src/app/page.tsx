"use client";

import React from "react";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { Footer } from "@/components/Footer";
import {
  FloatingOrbs,
  AnimatedGradient,
  SpotlightCursor,
} from "@/components/animations";

export default function Home() {
  return (
    <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-[#030712] selection:bg-primary/30">
      {/* Background Effects */}
      <FloatingOrbs />
      <AnimatedGradient />
      <SpotlightCursor />

      {/* Navigation */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-grow relative z-10">
        <Hero />
        <Features />
        <HowItWorks />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
