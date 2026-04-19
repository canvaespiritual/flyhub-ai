import type { NextConfig } from 'next'

const API_PROXY_TARGET =
  process.env.NEXT_PUBLIC_API_PROXY_TARGET ||
  'https://api-production-0096.up.railway.app/api'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${API_PROXY_TARGET}/:path*`
      }
    ]
  }
}

export default nextConfig