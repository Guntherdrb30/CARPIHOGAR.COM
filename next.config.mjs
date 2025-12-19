/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdfkit"],
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  },
  images: {
    domains: [
      'public.blob.vercel-storage.com',
      'blob.vercel-storage.com',
      'carpihogar.com',
      'www.carpihogar.com',
      'i.pravatar.cc',
      'picsum.photos',
    ],
    remotePatterns: [
      { protocol: 'https', hostname: 'public.blob.vercel-storage.com', pathname: '/**' },
      { protocol: 'https', hostname: 'blob.vercel-storage.com', pathname: '/**' },
      { protocol: 'https', hostname: 'carpihogar.com', pathname: '/**' },
      { protocol: 'https', hostname: 'www.carpihogar.com', pathname: '/**' },
      { protocol: 'https', hostname: 'i.pravatar.cc', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', pathname: '/**' },
    ],
  },
  transpilePackages: ['agents'],
};

export default nextConfig;
