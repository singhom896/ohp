import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,

  // CMS menu URLs (Administration -> Menus) that point at content pages:
  // serve them from the CMS page route so the same menu URL works here and on
  // the Laravel site. See lib/data/site-navigation.ts CMS_PAGE_ALIASES.
  async rewrites() {
    return [
      { source: "/about-us", destination: "/content/about-us" },
      { source: "/contact-us", destination: "/content/contact-us" },
      { source: "/help-centre", destination: "/content/help-centre" },
      { source: "/faq", destination: "/content/faq" },
    ];
  },
};

export default nextConfig;
