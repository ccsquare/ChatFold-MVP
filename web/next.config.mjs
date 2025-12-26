/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Temporarily disabled to debug SSE issues
  transpilePackages: ['molstar'],
  // Proxy API requests to Python backend in development
  async rewrites() {
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
