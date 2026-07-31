/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // unpdf (serverless-сборка pdfjs) — грузим как внешний серверный пакет
  experimental: { serverComponentsExternalPackages: ['unpdf'] },
  // exceljs подтягивает опциональные нативные зависимости — не тащим их в бандл
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  }
}

export default nextConfig
