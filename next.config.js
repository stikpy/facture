/** @type {import('next').NextConfig} */
const path = require('path')
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  serverExternalPackages: ['sharp', 'pdf-parse', 'tesseract.js', 'pdfjs-dist'],
  images: {
    domains: ['localhost'],
    formats: ['image/webp', 'image/avif']
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false
    }
    return config
  }
}

module.exports = nextConfig
