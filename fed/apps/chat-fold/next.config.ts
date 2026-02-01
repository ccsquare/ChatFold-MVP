import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  typedRoutes: true,
  turbopack: {
    rules: {
      "*.svg": {
        condition: {
          query: "?react",
        },
        loaders: [
          {
            loader: "@svgr/webpack",
            options: {
              icon: true,
            },
          },
        ],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
