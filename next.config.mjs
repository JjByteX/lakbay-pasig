/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', '@mantine/dates', '@mantine/notifications'],
  },
};

export default nextConfig;
