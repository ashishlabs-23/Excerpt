/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ['framer-motion'],
  experimental: {
    esmExternals: 'loose',
  },
  images: {
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
