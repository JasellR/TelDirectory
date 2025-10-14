
import type {NextConfig} from 'next';

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
        "https://*.firebase.studio"
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
};

export default nextConfig;
