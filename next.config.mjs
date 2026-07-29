/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // pdf-parse (pdfjs) не бандлим — грузим как внешний серверный пакет
  experimental: { serverComponentsExternalPackages: ['pdf-parse'] },
  // exceljs подтягивает опциональные нативные зависимости — не тащим их в бандл
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  }
}

export default nextConfig
