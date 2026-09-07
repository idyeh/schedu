import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.SCHEDU_TARGET === 'node' ? { output: 'standalone' } : {};

export default nextConfig;
