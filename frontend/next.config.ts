import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating Next.js dev badge: in a meeting UI it sits on top of the
  // control dock. Build errors still show in the overlay.
  devIndicators: false,
};

export default nextConfig;
