/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
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
