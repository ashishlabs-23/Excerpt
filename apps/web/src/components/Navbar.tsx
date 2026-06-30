"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Sparkles, Menu, X, Play, LogOut, ChevronDown, User, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export const Navbar: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, signOut, loading } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navLinks = [
    { name: "Features", href: "/#features" },
    { name: "How It Works", href: "/#how-it-works" },
  ];

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
    await signOut();
  };

  // Get initials for avatar
  const getInitials = () => {
    if (!user) return "?";
    const name = user.user_metadata?.full_name || user.email || "";
    if (user.user_metadata?.full_name) {
      return name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return (user.email?.[0] || "U").toUpperCase();
  };

  return (
    <>
      <motion.nav
        className={`fixed top-0 left-0 right-0 z-[70] transition-all duration-500 ${
          scrolled
            ? "py-3 bg-background/60 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl"
            : "py-6 bg-transparent"
        }`}
        initial={false}
      >
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group relative">
            <div className="absolute -inset-2 bg-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <motion.div
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-[#7c3aed] flex items-center justify-center text-white shadow-lg shadow-primary/20 relative z-10"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="w-6 h-6" />
            </motion.div>
            <span className="text-xl sm:text-2xl font-bold tracking-tight text-white relative z-10">
              EXCERPT
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1.5 p-1 glass-card rounded-full">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className="px-5 py-2 text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.05] rounded-full transition-all duration-300"
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* CTA Buttons */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {!loading && (
              <>
                {user ? (
                  /* Authenticated user menu */
                  <div ref={userMenuRef} className="relative hidden sm:block">
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-200 group"
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white text-xs font-bold">
                        {getInitials()}
                      </div>
                      <span className="text-sm text-white/70 font-medium max-w-[140px] truncate">
                        {user.user_metadata?.full_name || user.email}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-white/40 transition-transform duration-200 ${
                          userMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {userMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.95 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-56 rounded-2xl border border-white/10 bg-[#0a0a12]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                        >
                          {/* User info */}
                          <div className="px-4 py-3 border-b border-white/[0.06]">
                            <p className="text-xs text-white/40 font-medium uppercase tracking-wider">
                              Signed in as
                            </p>
                            <p className="text-sm text-white font-semibold truncate mt-0.5">
                              {user.email}
                            </p>
                          </div>

                          {/* Menu items */}
                          <div className="py-1">
                            <Link
                              href="/dashboard"
                              onClick={() => setUserMenuOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                            >
                              <LayoutDashboard className="w-4 h-4" />
                              Dashboard
                            </Link>
                            <button
                              onClick={handleSignOut}
                              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            >
                              <LogOut className="w-4 h-4" />
                              Sign Out
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  /* Unauthenticated buttons */
                  <>
                    <Link href="/dashboard" className="hidden sm:block">
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button className="px-6 py-2 h-auto text-sm font-semibold rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 animate-glow border border-white/10 group">
                          Get Started
                          <Play className="ml-2 w-4 h-4 fill-current group-hover:translate-x-0.5 transition-transform" />
                        </Button>
                      </motion.div>
                    </Link>
                  </>
                )}
              </>
            )}

            {/* Mobile Menu Button */}
            <motion.button
              className="md:hidden shrink-0 p-2 text-white/70 hover:text-white"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              whileTap={{ scale: 0.9 }}
            >
              {mobileMenuOpen ? (
                <X className="w-7 h-7" />
              ) : (
                <Menu className="w-7 h-7" />
              )}
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-2xl md:hidden"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex flex-col items-center justify-center h-full gap-8 p-6">
              {navLinks.map((link, index) => (
                <motion.div
                  key={link.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Link
                    href={link.href}
                    className="text-3xl font-bold text-white hover:text-primary transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                </motion.div>
              ))}

              <motion.div
                className="flex flex-col gap-4 w-full max-w-xs mt-8"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {user ? (
                  <>
                    {/* Mobile user info */}
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-white/[0.04]">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white text-sm font-bold">
                        {getInitials()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {user.user_metadata?.full_name && (
                          <p className="text-sm text-white font-semibold truncate">
                            {user.user_metadata.full_name}
                          </p>
                        )}
                        <p className="text-xs text-white/50 truncate">{user.email}</p>
                      </div>
                    </div>
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button className="w-full py-7 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20">
                        Dashboard
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      onClick={handleSignOut}
                      className="w-full py-7 text-lg font-bold rounded-2xl border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 bg-transparent"
                    >
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                      <Button className="w-full py-7 text-lg font-bold rounded-2xl bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20">
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
