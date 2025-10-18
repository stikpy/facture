'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Download, Eye, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { Invoice } from '@/types/database'

export function InvoiceList() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'error'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  const formatShortDate = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
  }

  const truncate = (value: string | undefined | null, max: number): string => {
    if (!value) return '—'
    return value.length > max ? value.slice(0, max - 3) + '...' : value
  }

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

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {}
    invoices.forEach((i) => (next[i.id] = checked))
    setSelected(next)
  }

  return (
    <div className="space-y-4">
      {/* Barre d'actions / Recherche */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative w-full sm:max-w-sm">
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher (fichier, fournisseur, n° facture, montant…)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center space-x-2">
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

      {/* Tableau façon Yooz */}
      {invoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune facture</h3>
          <p className="mt-1 text-sm text-gray-500">Commencez par uploader vos premières factures.</p>
        </div>
      ) : (
        <div className="overflow-auto border rounded-md bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1"><input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="px-2 py-1 text-left">Rang</th>
                <th className="px-2 py-1 text-left w-[420px]">Nom</th>
                <th className="px-2 py-1 text-left w-[260px]">Fournisseur</th>
                <th className="px-2 py-1 text-left">Date document</th>
                <th className="px-2 py-1 text-right">Montant de base</th>
                <th className="px-2 py-1 text-right">Montant total</th>
                <th className="px-2 py-1 text-left">Devise</th>
                <th className="px-2 py-1 text-left">Statut</th>
                <th className="px-2 py-1 text-left">Créé le</th>
                <th className="px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, idx) => {
                const ed: any = inv.extracted_data || {}
                const fileNameDisplay = truncate(inv.file_name, 40)
                const supplierDisplay = truncate(String(ed.supplier_name || ''), 30)
                const invoiceNumberDisplay = truncate(String(ed.invoice_number || ''), 20)
                return (
                  <tr key={inv.id} className="border-t">
                    <td className="px-2 py-1"><input type="checkbox" checked={!!selected[inv.id]} onChange={(e) => setSelected({ ...selected, [inv.id]: e.target.checked })} /></td>
                    <td className="px-2 py-1">{idx + 1}</td>
                    <td className="px-2 py-1 w-[420px]">
                      <div className="flex items-center space-x-1.5">
                        <FileText className="h-3 w-3 text-gray-400" />
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-gray-900 truncate block max-w-[380px] hover:underline" title={inv.file_name}>
                          {fileNameDisplay}
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-1 w-[260px]">
                      <span className="truncate block max-w-[220px]" title={ed.supplier_name || ''}>
                        {supplierDisplay}
                      </span>
                    </td>
                    <td className="px-2 py-1">{formatShortDate(ed.invoice_date)}</td>
                    <td className="px-2 py-1 text-right">{ed.subtotal ? formatCurrency(ed.subtotal) : '—'}</td>
                    <td className="px-2 py-1 text-right">{ed.total_amount ? formatCurrency(ed.total_amount) : '—'}</td>
                    <td className="px-2 py-1">{ed.currency || '—'}</td>
                    <td className="px-2 py-1">{getStatusBadge(inv.status)}</td>
                    <td className="px-2 py-1">{formatShortDate(inv.created_at)}</td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex justify-end space-x-1">
                        <Button variant="outline" size="sm" className="h-7" onClick={() => handleView(inv.file_path)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-7" onClick={() => handleDownload(inv.file_path, inv.file_name)}>
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 h-7" onClick={() => handleDelete(inv.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
