import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@fitly/layout-engine', '@fitly/content'],
};

export default nextConfig;
