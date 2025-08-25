
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  serverActions: true, // Enable Server Actions
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    allowedDevOrigins: ["directorio.farmaciacarol.com"],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: ['sqlite3', 'ldapjs', 'bcrypt'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sqlite3', 'ldapjs', 'bcrypt');
    }
    return config;
  },
};

export default nextConfig;
