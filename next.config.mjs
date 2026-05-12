/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  webpack: (config) => {
    config.externals.push({ 'better-sqlite3': 'commonjs better-sqlite3' });
    return config;
  },
};

export default nextConfig;
