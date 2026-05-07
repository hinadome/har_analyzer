import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.cloudfront.net','127.50.100.1'],
  output: 'standalone',
};

export default nextConfig;
