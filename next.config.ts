import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // vinext inspects multipart requests as possible actions before API routing.
  // Allow our 10 MiB image plus form fields; the route still enforces 10 MiB.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;
