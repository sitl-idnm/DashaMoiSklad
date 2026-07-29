/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // exceljs подтягивает опциональные нативные зависимости — не тащим их в бандл
  webpack: (config) => {
    config.externals = config.externals || []
    return config
  }
}

export default nextConfig
