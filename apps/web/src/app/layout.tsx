import './globals.css';
import React from 'react';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata = {
  title: 'Excerpt — AI Video Clipping Pipeline',
  description: 'Automated viral short-form video clip generation engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mockInitialSession = {
    userId: 'usr-demo',
    email: 'creator@excerpt.ai',
    expiresAt: Date.now() + 86400000
  };

  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 antialiased min-h-screen">
        <AuthProvider initialSession={mockInitialSession}>
          <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">✂️</span>
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                  EXCERPT
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v5.7 Engine
                </span>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-slate-400">creator@excerpt.ai</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Engine Connected" />
              </div>
            </div>
          </header>
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
