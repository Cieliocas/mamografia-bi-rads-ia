/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/predict',
        destination: 'http://127.0.0.1:5000/predict',
      },
      {
        source: '/validate',
        destination: 'http://127.0.0.1:5000/validate',
      },
      {
        source: '/auth/:path*',
        destination: 'http://127.0.0.1:5000/auth/:path*',
      },
      {
        source: '/acervo/:path*',
        destination: 'http://127.0.0.1:5000/acervo/:path*',
      },
    ]
  },
}

export default nextConfig
