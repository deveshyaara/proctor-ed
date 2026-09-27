import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        // Add your production domain here when deploying
        // "your-domain.com",
      ],
    },
  },

  images: {
    remotePatterns: [
      // Add allowed image hosts here in production
      // e.g. { protocol: 'https', hostname: 'your-bucket.s3.amazonaws.com' }
    ],
  },

  // Allow .env.local to override environment variables
  env: {
    NEXT_PUBLIC_APP_URL: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  },

  // Security headers applied to all responses.
  // Note: Content-Security-Policy is intentionally omitted at this stage.
  // Next.js 16 hydration requires nonce-based CSP; camera access requires
  // careful Permissions-Policy. Planned for post-staging hardening.
  async headers() {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing attacks
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Prevent clickjacking — teacher dashboard and exam must not be framed
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Limit referrer information sent to external sites
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // XSS protection (legacy browsers — modern browsers use CSP instead)
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // Permissions Policy — explicitly allow camera (required for proctoring)
          // Deny microphone, geolocation, payment, usb (not needed)
          {
            key: "Permissions-Policy",
            value: [
              "camera=(self)",
              "microphone=()",
              "geolocation=()",
              "payment=()",
              "usb=()",
            ].join(", "),
          },
        ],
      },
      // CORS — restrict API routes to requests originating from the app's own domain.
      // sameSite:strict on cookies already blocks most cross-origin attacks, but
      // explicit CORS headers make the security posture unambiguous and prevent
      // any future misconfiguration from silently widening access.
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: appUrl,
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
          {
            key: "Access-Control-Allow-Credentials",
            value: "true",
          },
        ],
      },
      // HSTS — only applied in production over HTTPS
      // Uncomment when HTTPS is configured on your deployment
      // {
      //   source: "/(.*)",
      //   headers: [
      //     {
      //       key: "Strict-Transport-Security",
      //       value: "max-age=63072000; includeSubDomains; preload",
      //     },
      //   ],
      // },
    ];
  },
};

export default nextConfig;

