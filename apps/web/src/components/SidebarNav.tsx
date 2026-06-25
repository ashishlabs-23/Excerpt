"use client";

import React, { useState, useEffect } from 'react';
import { Home, LayoutGrid, Scissors, Settings, ChevronRight, Zap, Mic2, Award } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { authFetch } from '@/lib/api';

export const SidebarNav: React.FC = () => {
  const pathname = usePathname();
  const [capacity, setCapacity] = useState(84); // Initial default
  const [status, setStatus] = useState('active');

  useEffect(() => {
    // Poll system health every 10 seconds
    const fetchHealth = async () => {
      try {
        const res = await authFetch('/api/system/health');
        if (res.ok) {
          const data = await res.json();
          setCapacity(data.capacity);
          setStatus(data.status);
        }
      } catch (err) {
        setStatus('offline');
      }
    };
    
    fetchHealth(); // initial fetch
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: 'Home', icon: Home, href: '/' },
    { name: 'Dashboard', icon: LayoutGrid, href: '/dashboard' },
    { name: 'Voiceover Studio', icon: Mic2, href: '/voiceover' },
    { name: 'Clip Editor', icon: Scissors, href: '/editor' },
    { name: 'Excerpt Arena', icon: Award, href: '/arena' },
  ];

  const mobileNavItems = [
    { name: 'Home', icon: Home, href: '/' },
    { name: 'Dashboard', icon: LayoutGrid, href: '/dashboard' },
    { name: 'Voiceover', icon: Mic2, href: '/voiceover' },
    { name: 'Settings', icon: Settings, href: '/settings' },
  ];

  return (
    <>
      <aside className="hidden lg:flex w-72 h-full shrink-0 border-r border-white/5 bg-[#030712] flex-col items-stretch py-10 transition-all relative z-30">
        {/* Brand Anchor */}
        <div className="px-8 mb-16 flex items-center gap-4">
          <div className="relative group">
            <div className="absolute -inset-2 bg-primary/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-black text-2xl shadow-[0_0_30px_rgba(200,119,64,0.3)] relative z-10 transition-transform group-hover:scale-105">
              E
            </div>
          </div>
          <div>
             <span className="text-xl font-black tracking-tighter text-white uppercase italic">Excerpt</span>
             <div className="text-[8px] font-bold text-primary tracking-[0.3em] uppercase">Pro Edition</div>
          </div>
        </div>
        
        {/* Navigation Matrix */}
        <nav className="flex-grow w-full px-6 space-y-2">
          <div className="mb-6 px-4">
             <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em]">Core Systems</span>
          </div>

          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href}
                href={item.href} 
                className={`flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden ${
                  isActive 
                    ? 'bg-white/[0.03] text-primary shadow-[inset_0_0_20px_rgba(0,0,0,0.4)] border border-white/5' 
                    : 'text-white/40 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-4 relative z-10">
                  <Icon size={20} className={`${isActive ? 'text-primary' : 'group-hover:text-primary'} transition-colors`} />
                  <span className="font-bold text-[11px] tracking-[0.1em] uppercase">{item.name}</span>
                </div>
                
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="w-1.5 h-6 bg-primary rounded-full absolute right-2" 
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                {!isActive && <ChevronRight size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />}
              </Link>
            );
          })}
        </nav>
        
        {/* Footer Interface */}
        <div className="mt-auto w-full px-6 space-y-4">
          <div className="p-6 rounded-3xl glass-card border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
             <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-primary" />
                <span className="text-[10px] font-black text-white uppercase italic tracking-widest">AI Capacity: {capacity}%</span>
             </div>
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mb-4">
                <div 
                  className={`h-full shadow-[0_0_10px_rgba(200,119,64,0.5)] transition-all duration-1000 ${
                    status === 'offline' ? 'bg-red-500 shadow-red-500/50' : 
                    status === 'degraded' ? 'bg-yellow-500 shadow-yellow-500/50' : 
                    'bg-primary'
                  }`}
                  style={{ width: `${capacity}%` }} 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">System Link</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    status === 'offline' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                    status === 'degraded' ? 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]' : 
                    'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  }`} />
                  <span className={`text-[9px] font-black uppercase tracking-widest ${
                    status === 'offline' ? 'text-red-400' : 
                    status === 'degraded' ? 'text-yellow-400' : 
                    'text-emerald-400'
                  }`}>
                    {status}
                  </span>
                </div>
              </div>
          </div>

          <Link
            href="/settings"
            className="flex items-center justify-between px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden text-white/40 hover:text-white hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-4 relative z-10">
              <Settings size={20} className="group-hover:text-primary transition-colors" />
              <span className="font-bold text-[11px] tracking-[0.1em] uppercase">Settings</span>
            </div>
            <ChevronRight size={14} className="opacity-0 group-hover:opacity-40 transition-opacity" />
          </Link>
        </div>
      </aside>

      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#030712]/95 backdrop-blur-2xl shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
        <div className="grid grid-cols-4 gap-1 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {mobileNavItems.map((item) => {
            const isActive = item.href === '/' ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 transition-all duration-300 ${
                  isActive
                    ? 'bg-white/[0.05] text-primary border border-white/10'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-primary' : ''} />
                <span className="text-[9px] font-black uppercase tracking-[0.12em] truncate">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};
