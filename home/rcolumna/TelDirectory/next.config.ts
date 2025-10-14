
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // This is the new property to allow cross-origin requests in development.
    allowedDevOrigins: [
        "https://*.cloudworkstations.dev",
        "https://*.firebase.studio",
        "http://directorio.farmaciacarol.com",
        "https://directorio.farmaciacarol.com"
    ]
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

    