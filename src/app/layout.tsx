import type { Metadata } from 'next'
import { Inter_Tight, Manrope } from 'next/font/google'
import './globals.css'

const interTight = Inter_Tight({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-inter'
})
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'],
  variable: '--font-manrope'
})

export const metadata: Metadata = {
  title: 'Панель · Лист сборки',
  description: 'Выгрузка листов сборки из «Мой склад»'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${interTight.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  )
}
