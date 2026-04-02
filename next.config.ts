import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.cloudfront.net'],
  output: 'standalone',
};

export default nextConfig;
