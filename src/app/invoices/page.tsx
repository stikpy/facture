'use client'

import { InvoiceList } from '@/components/invoices/invoice-list'

export default function InvoicesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Mes factures</h1>
      </div>

      <InvoiceList />
    </div>
  )
}


