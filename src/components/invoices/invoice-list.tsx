'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Download, Eye, Trash2 } from 'lucide-react'
import type { Invoice } from '@/types/database'

export function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'error'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetchInvoices()
  }, [filter, searchTerm])

  const fetchInvoices = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      let query = supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      // On récupère d'abord la liste, puis on filtre côté client (pour couvrir le JSON extrait)
      let { data, error } = await query

      if (error) throw error

      // Filtre complémentaire côté client (recherche texte + montants)
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase()
        const maybeAmount = Number(term.replace(',', '.'))
        const isAmount = !Number.isNaN(maybeAmount)

        const normalizeAmountStrings = (n: number) => {
          const s1 = n.toFixed(2) // 162.63
          const s2 = s1.replace('.', ',') // 162,63
          const s3 = String(Math.round(n)) // 163
          const s4 = String(Math.floor(n)) // 162
          const s5 = String(n) // raw
          return [s1, s2, s3, s4, s5]
        }

        data = (data || []).filter((inv: any) => {
          const ed = inv.extracted_data || {}
          const items = Array.isArray(ed.items) ? ed.items : []

          // Recherche texte: fichier, fournisseur, client, numéro, items.description
          const hay = [
            inv.file_name,
            inv.mime_type,
            ed.invoice_number,
            ed.supplier_name,
            ed.client_name,
            ...items.map((it: any) => it?.description)
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          const textMatch = hay.includes(term)

          if (!isAmount) return textMatch

          // Recherche montant: TTC/HT/TVA + items (unit/total)
          const amountFields = [ed.total_amount, ed.subtotal, ed.tax_amount]
            .filter((n: any) => typeof n === 'number') as number[]
          const itemAmounts = items
            .flatMap((it: any) => [it?.unit_price, it?.total_price])
            .filter((n: any) => typeof n === 'number') as number[]
          const allAmounts = [...amountFields, ...itemAmounts]

          const amountMatch = allAmounts.some((n) => {
            if (Math.abs(n - maybeAmount) < 0.01) return true // match précis
            if (Math.floor(n) === Math.floor(maybeAmount)) return true // match entier
            const tokens = normalizeAmountStrings(n)
            return tokens.some((t) => t.includes(term))
          })

          return textMatch || amountMatch
        })
      }

      setInvoices(data || [])
    } catch (error) {
      console.error('Erreur lors du chargement des factures:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (invoiceId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette facture ?')) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId)

      if (error) throw error
      
      setInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId))
    } catch (error) {
      console.error('Erreur lors de la suppression:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleView = async (filePath: string) => {
    try {
      const supabase = createClient()
      const { data } = supabase.storage.from('invoices').getPublicUrl(filePath)
      const url = data.publicUrl
      if (!url) throw new Error('URL introuvable')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error('Erreur ouverture facture:', error)
      alert('Impossible d\'ouvrir la facture')
    }
  }

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const supabase = createClient()
      const { data } = supabase.storage.from('invoices').getPublicUrl(filePath)
      const url = data.publicUrl
      if (!url) throw new Error('URL introuvable')
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (error) {
      console.error('Erreur téléchargement facture:', error)
      alert('Impossible de télécharger la facture')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800'
    }

    const labels = {
      pending: 'En attente',
      processing: 'En cours',
      completed: 'Terminé',
      error: 'Erreur'
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Recherche + Filtres */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher (fichier, fournisseur, n° facture...)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex space-x-2">
        {[
          { key: 'all', label: 'Toutes' },
          { key: 'completed', label: 'Terminées' },
          { key: 'processing', label: 'En cours' },
          { key: 'error', label: 'Erreurs' }
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(key as any)}
          >
            {label}
          </Button>
        ))}
        </div>
      </div>

      {/* Liste des factures */}
      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Aucune facture
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par uploader vos premières factures.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {invoice.file_name}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(invoice.created_at)}
                      </p>
                      {invoice.extracted_data && (
                        <p className="text-sm text-gray-600">
                          {invoice.extracted_data.supplier_name && (
                            <span>Fournisseur: {invoice.extracted_data.supplier_name}</span>
                          )}
                          {invoice.extracted_data.total_amount && (
                            <span className="ml-4">
                              Total: {formatCurrency(invoice.extracted_data.total_amount)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(invoice.status)}
                    <div className="flex space-x-1">
                      <Button variant="outline" size="sm" onClick={() => handleView(invoice.file_path)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(invoice.file_path, invoice.file_name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(invoice.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
