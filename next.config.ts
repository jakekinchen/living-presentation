import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set the workspace root to this project
    root: __dirname,
  },
};

export default nextConfig;
