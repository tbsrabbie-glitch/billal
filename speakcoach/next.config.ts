import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompt templates are read from disk at runtime; make sure they ship with the API routes.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Camera and mic are only needed by this app itself.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
