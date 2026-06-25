"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles, ArrowRight, Mail, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const Footer: React.FC = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const links = [
    { name: "Dashboard", href: "/dashboard", icon: Zap, external: false },
    { name: "Settings", href: "/settings", icon: Shield, external: false },
    { name: "Contact", href: "mailto:hello@excerpt.app", icon: Mail, external: true },
  ];

  const footerLinks = [
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Launch Dashboard", href: "/dashboard" },
  ];

  return (
    <footer
      ref={ref}
      className="bg-[#030712] border-t border-[#1f2937] py-16 sm:py-20 px-4 sm:px-6 relative overflow-hidden"
    >
      {/* Background Glow */}
      <motion.div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] bg-primary opacity-[0.03] blur-[100px] rounded-full"
        animate={{
          opacity: [0.03, 0.05, 0.03],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="max-w-7xl mx-auto flex flex-col items-center relative z-10">
        {/* Logo */}
        <motion.div
          className="flex items-center gap-3 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-white font-black text-2xl"
            whileHover={{
              scale: 1.1,
              rotate: [0, -5, 5, 0],
            }}
            transition={{ duration: 0.4 }}
          >
            <Sparkles className="w-6 h-6" />
          </motion.div>
          <span className="text-2xl sm:text-3xl font-black text-[#e0e5f6] tracking-tighter">
            EXCERPT
          </span>
        </motion.div>

        {/* Social Links */}
        <motion.div
          className="flex items-center justify-center gap-4 sm:gap-6 mb-10 sm:mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {links.map((link, index) => (
            <motion.div
              key={link.name}
              whileHover={{ scale: 1.1, y: -4 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              {link.external ? (
                <a
                  href={link.href}
                  className="w-12 h-12 rounded-xl bg-[#111827] border border-[#1f2937] flex items-center justify-center text-[#64748b] hover:text-primary hover:border-primary/50 transition-colors group"
                  aria-label={link.name}
                >
                  <link.icon className="w-5 h-5" />
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="w-12 h-12 rounded-xl bg-[#111827] border border-[#1f2937] flex items-center justify-center text-[#64748b] hover:text-primary hover:border-primary/50 transition-colors group"
                  aria-label={link.name}
                >
                  <link.icon className="w-5 h-5" />
                </Link>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* Product CTA */}
        <motion.div
          className="w-full max-w-md mb-10 sm:mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="rounded-3xl border border-[#1f2937] bg-[#111827]/50 p-6 text-center">
            <p className="text-[#e0e5f6] text-lg font-semibold mb-2">
              Ready to turn long-form content into short-form winners?
            </p>
            <p className="text-[#94a3b8] text-sm mb-6">
              Upload a source video, generate highlights, and manage everything from one command center.
            </p>
            <Link href="/dashboard">
              <Button className="h-12 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white">
                Start Clipping
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </motion.div>

        {/* Links */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-x-8 sm:gap-x-12 gap-y-4 sm:gap-y-6 mb-10 sm:mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {footerLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-[11px] font-black text-[#4b5563] hover:text-primary transition-colors uppercase tracking-widest"
            >
              {link.name}
            </Link>
          ))}
        </motion.div>

        {/* Copyright */}
        <motion.p
          className="text-[9px] sm:text-[10px] font-black text-[#1f2937] uppercase tracking-[0.18em] sm:tracking-[0.2em] text-center"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          © 2026 EXCERPT INTELLIGENCE SYSTEMS. ALL RIGHTS RESERVED.
        </motion.p>
      </div>
    </footer>
  );
};
