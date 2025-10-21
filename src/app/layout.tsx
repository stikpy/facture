import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { AppFrame } from './AppFrame'

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
          <AppFrame>
            {children}
          </AppFrame>
        </Providers>
      </body>
    </html>
  )
}