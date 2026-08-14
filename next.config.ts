import type { NextConfig } from "next";

const connectSources = [
  "'self'",
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "https://*.firebaseapp.com",
  "https://api.stripe.com",
  "https://checkout.stripe.com",
  "https://link.com",
  "https://*.link.com",
  "wss://*.firebaseio.com",
  ...(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
    ? ["http://127.0.0.1:*", "ws://127.0.0.1:*"]
    : []),
];
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.js.stripe.com https://checkout.stripe.com https://apis.google.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://link.com https://*.link.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true"
    ? ["upgrade-insecure-requests"]
    : []),
].join("; ");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  async redirects() {
    return [
      { source: "/forums", destination: "/forum", permanent: true },
      {
        source: "/forums/:path*",
        destination: "/forum/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
