import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Facture AI - Alternative à Yooz',
  description: 'Solution IA pour le traitement intelligent de factures',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex">
            <aside className="hidden md:block w-56 border-r bg-white">
              <div className="p-4 font-semibold text-gray-900">Facture AI</div>
              <nav className="px-2 space-y-1">
                <Link href="/" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Dashboard</Link>
                <Link href="/invoices" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Mes factures</Link>
                <Link href="/stats" className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">Stats</Link>
              </nav>
            </aside>
            <main className="flex-1">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}