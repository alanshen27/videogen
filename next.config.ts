import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allow `next build` to finish despite TS errors (run `tsc` separately when you care).
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
