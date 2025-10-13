
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
  serverExternalPackages: ['sqlite3', 'bcrypt'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('sqlite3', 'bcrypt');
    }
    return config;
  },
};

export default nextConfig;
