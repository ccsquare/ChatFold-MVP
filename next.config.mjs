/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['molstar'],
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    // Handle molstar's ES modules and WebAssembly
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default nextConfig;
