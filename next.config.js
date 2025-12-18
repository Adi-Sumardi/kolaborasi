const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // External packages for Server Components (Next.js 14.x format)
  experimental: {
    serverComponentsExternalPackages: ['pg'],
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    // Get allowed origins from environment or use default for production
    const allowedOrigins = process.env.CORS_ORIGINS || 'https://kolaborasi.adilabs.id';

    return [
      {
        source: "/(.*)",
        headers: [
          // Security: Prevent clickjacking attacks
          { key: "X-Frame-Options", value: "DENY" },
          // Security: Strict CSP - only allow same origin framing
          { key: "Content-Security-Policy", value: "frame-ancestors 'self';" },
          // Security: Prevent MIME type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Security: XSS Protection
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Security: Referrer Policy
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // CORS: Restrict to allowed origins only
          { key: "Access-Control-Allow-Origin", value: allowedOrigins },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
