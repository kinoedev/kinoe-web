import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/signals", destination: "/scanner", permanent: false },
      { source: "/agent", destination: "/scanner", permanent: false },
    ];
  },
};

export default nextConfig;
