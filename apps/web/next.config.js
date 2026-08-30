/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pure static export — generates out/ with plain HTML/CSS/JS
  // No server functions, no lambdas, works perfectly on Netlify CDN
  output: 'export',
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://maldlbmoeorpetllaceg.supabase.co",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8010",
    // Firebase Client SDK — Excerpt Web app (registered 2026-08-30)
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAwV6h6Ax-N7VJaZ27_sT6Vtf9oalh0YVQ",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "excerpt-d0ab8.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "excerpt-d0ab8",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "excerpt-d0ab8.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "348809974501",
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:348809974501:web:35b759bd0abb045bc3fa0c",
  },
  reactStrictMode: false,
  transpilePackages: ['framer-motion'],
  experimental: {
    esmExternals: 'loose',
  },
  images: {
    // Static export doesn't support Next.js image optimization server
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'contribution.usercontent.google.com' },
      { protocol: 'https', hostname: '*.backblazeb2.com' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
      config.watchOptions = {
        ...(config.watchOptions || {}),
        ignored: [
          '**/node_modules_old/**',
          '**/node_modules_old_web/**',
          '**/.next/**',
          '**/public/clips/**',
          '**/temp/**',
          '**/*.log',
        ],
      };
    }
    return config;
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
