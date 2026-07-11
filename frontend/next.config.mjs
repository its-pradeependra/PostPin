/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Tree-shake barrel packages so pages only ship the icons/charts/motion they
  // actually use — big First-Load-JS win on icon-heavy pages (lucide has ~100
  // icons in our registry; recharts + motion are large).
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "motion", "date-fns"],
  },
  images: {
    // Serve AVIF first (smaller than WebP), fall back to WebP.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
    ],
  },
  // 301s from common URL variants to the canonical slugs, so stray links and
  // typed-in URLs never 404 and search engines consolidate on one URL.
  async redirects() {
    return [
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/tos", destination: "/legal/terms", permanent: true },
      { source: "/documentation", destination: "/docs", permanent: true },
      { source: "/api-docs", destination: "/docs", permanent: true },
      { source: "/sign-up", destination: "/signup", permanent: true },
      { source: "/register", destination: "/signup", permanent: true },
      { source: "/sign-in", destination: "/login", permanent: true },
      { source: "/log-in", destination: "/login", permanent: true },
      { source: "/plans", destination: "/pricing", permanent: true },
      { source: "/home", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
