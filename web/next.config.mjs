/** @type {import('next').NextConfig} */

// Base path for deployment (e.g., '/chatfold' for http://ip/chatfold)
// Set via NEXT_PUBLIC_BASE_PATH environment variable
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  reactStrictMode: false, // Temporarily disabled to debug SSE issues
  transpilePackages: ['molstar'],

  // Base path for sub-path deployment
  // Empty string for root path, '/chatfold' for sub-path
  ...(basePath && { basePath }),
  ...(basePath && { assetPrefix: basePath }),

  // Proxy API requests to Python backend in development
  async rewrites() {
    // In production with basePath, API calls go through Ingress
    if (basePath) {
      return [];
    }
    // In development, proxy to local backend
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://localhost:8000/api/v1/:path*',
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = { fs: false, path: false };
    // Handle molstar's ES modules and WebAssembly
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };

    // Fix chunk naming for molstar dynamic imports
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          cacheGroups: {
            ...config.optimization?.splitChunks?.cacheGroups,
            molstar: {
              test: /[\\/]node_modules[\\/]molstar[\\/]/,
              name: 'molstar',
              chunks: 'async',
              priority: 10,
            },
          },
        },
      };
    }

    return config;
  },
};

export default nextConfig;
