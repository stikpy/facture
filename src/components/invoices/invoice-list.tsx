'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatCurrency, formatTitleCaseName, getActiveOrganizationId } from '@/lib/utils'
import { FileText, Download, Eye, Trash2, CheckCircle2, Clock3, TriangleAlert, Package, RotateCcw, FilePenLine, FileQuestion, Link2, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type DocumentTypeKey = 'invoice' | 'delivery_note' | 'credit_note' | 'quote' | 'other'

interface ListDocumentTypeMeta {
  key: DocumentTypeKey
  label: string
  icon: LucideIcon
  badge: string
  iconClass: string
}

const resolveDocumentTypeMeta = (raw?: string | null): ListDocumentTypeMeta => {
  const normalized = (raw || '').toString().toLowerCase()
  switch (normalized) {
    case 'delivery_note':
      return {
        key: 'delivery_note',
        label: 'Bon de livraison',
        icon: Package,
        badge: 'border-purple-200 bg-purple-50 text-purple-700',
        iconClass: 'text-purple-500'
      }
    case 'credit_note':
      return {
        key: 'credit_note',
        label: 'Avoir',
        icon: RotateCcw,
        badge: 'border-amber-200 bg-amber-50 text-amber-700',
        iconClass: 'text-amber-500'
      }
    case 'quote':
      return {
        key: 'quote',
        label: 'Devis',
        icon: FilePenLine,
        badge: 'border-sky-200 bg-sky-50 text-sky-700',
        iconClass: 'text-sky-500'
      }
    case 'other':
      return {
        key: 'other',
        label: 'Document',
        icon: FileQuestion,
        badge: 'border-gray-200 bg-gray-100 text-gray-700',
        iconClass: 'text-gray-500'
      }
    default:
      return {
        key: 'invoice',
        label: 'Facture',
        icon: FileText,
        badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        iconClass: 'text-emerald-500'
      }
  }
}

export function InvoiceList({ from, to }: { from?: string; to?: string }) {
  const [rawInvoices, setRawInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'processing' | 'awaiting_user' | 'error'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [sortKey, setSortKey] = useState<'date'|'supplier'|'code'|'subtotal'|'total'|'status'>('date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const router = useRouter()

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
  }, [filter, from, to])

  useEffect(() => {
    setPage(1)
  }, [searchTerm, filter, from, to])

  const fetchInvoices = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRawInvoices([])
        return
      }
      const orgId = await getActiveOrganizationId(supabase, user.id)

      let query = supabase
        .from('invoices')
        .select('id, file_name, file_path, created_at, status, document_type, document_reference, paired_document_id, extracted_data, user_id, organization_id, supplier_id, supplier:suppliers ( id, code, display_name, validation_status, is_active )')
        .order('created_at', { ascending: false })

      if (filter !== 'all') {
        if (filter === 'processing') {
          query = query.in('status', ['processing', 'queued'] as any)
        } else if (filter === 'awaiting_user') {
          query = query.eq('status', 'awaiting_user')
        } else if (filter === 'error') {
          query = query.in('status', ['error', 'duplicate'] as any)
        } else {
          query = query.eq('status', filter)
        }
      }

      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      let { data, error } = await query

      if (error) throw error

      // Filtrage par date de document (extracted_data.invoice_date) pour cohérence avec le dashboard
      if (from || to) {
        data = (data || []).filter((inv: any) => {
          const ed = inv.extracted_data || {}
          const invoiceDateStr = ed.invoice_date || inv.created_at
          if (!invoiceDateStr) return true
          const invoiceDate = new Date(invoiceDateStr)
          if (from && invoiceDate < new Date(from)) return false
          if (to) {
            const toDate = new Date(to)
            toDate.setHours(23, 59, 59, 999)
            if (invoiceDate > toDate) return false
          }
          return true
        })
      }

      setRawInvoices(data as any || [])
    } catch (error) {
      console.error('Erreur lors du chargement des factures:', error)
    }
    finally {
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
      
      setRawInvoices(prev => prev.filter(invoice => invoice.id !== invoiceId))
    } catch (error) {
      console.error('Erreur lors de la suppression:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleBulkDelete = async () => {
    const ids = Object.keys(selected).filter(id => selected[id])
    if (ids.length === 0) return
    if (!confirm(`Supprimer ${ids.length} facture(s) ?`)) return

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('invoices')
        .delete()
        .in('id', ids)
      if (error) throw error
      setRawInvoices(prev => prev.filter(inv => !ids.includes((inv as any).id)))
      setSelected({})
    } catch (error) {
      console.error('Erreur suppression multiple:', error)
      alert('Erreur lors de la suppression multiple')
    }
  }

  const handleView = async (filePath: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await (supabase.storage.from('invoices') as any).createSignedUrl(filePath, 60)
      if (error) throw error
      const url = data?.signedUrl
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

  // Téléchargement direct (URL publique avec paramètre download)
  const handleDirectDownload = async (filePath: string, fileName: string) => {
    try {
      const supabase = createClient()
      const { data, error } = await (supabase.storage.from('invoices') as any).createSignedUrl(filePath, 60, { download: fileName })
      if (error) throw error
      const url = data?.signedUrl
      if (!url) throw new Error('URL introuvable')
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (error) {
      console.error('Erreur téléchargement direct:', error)
      alert('Impossible de télécharger la facture')
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-700',
      queued: 'bg-blue-50 text-blue-700 border border-blue-200',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
      duplicate: 'bg-amber-100 text-amber-800 border border-amber-300',
      awaiting_user: 'bg-yellow-100 text-yellow-800 border border-yellow-300'
    } as any

    const labels = {
      pending: 'En attente',
      queued: 'En file',
      processing: 'En cours',
      completed: 'Terminé',
      error: 'Erreur',
      duplicate: 'Doublon',
      awaiting_user: 'Action requise'
    } as any

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
        {labels[status] || status}
      </span>
    )
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'processing':
        return <Clock3 className="h-4 w-4 text-blue-600" />
      case 'queued':
        return <Clock3 className="h-4 w-4 text-blue-400" />
      case 'error':
        return <TriangleAlert className="h-4 w-4 text-red-600" />
      case 'duplicate':
      case 'awaiting_user':
        return <TriangleAlert className="h-4 w-4 text-amber-600" />
      default:
        return <Clock3 className="h-4 w-4 text-gray-400" />
    }
  }

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {}
    filteredInvoices.forEach((i) => (next[i.id] = checked))
    setSelected(next)
  }

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return rawInvoices

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

    return rawInvoices.filter((inv: any) => {
      const ed = inv.extracted_data || {}
      const items = Array.isArray(ed.items) ? ed.items : []

      // Recherche texte: fichier, fournisseur, client, numéro, items.description
      const hay = [
        inv.file_name,
        inv.mime_type,
        ed.invoice_number,
        ed.supplier_name,
        inv?.supplier?.display_name,
        inv?.supplier?.code,
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
  }, [rawInvoices, searchTerm])

  // Tri + pagination (calculés une seule fois par changement d'état)
  const sortedInvoices = useMemo(() => {
    const getKey = (inv: any) => {
      const ed: any = inv.extracted_data || {}
      switch (sortKey) {
        case 'supplier': return String(inv?.supplier?.display_name || ed.supplier_name || '').toLowerCase()
        case 'code': return String(inv?.supplier?.code || '')
        case 'subtotal': return Number(ed.subtotal || 0)
        case 'total': return Number(ed.total_amount || 0)
        case 'status': return String(inv.status)
        case 'date':
        default: return new Date(ed.invoice_date || inv.created_at || 0).getTime()
      }
    }
    const arr = [...filteredInvoices]
    arr.sort((a: any, b: any) => {
      const av = getKey(a)
      const bv = getKey(b)
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })
    return arr
  }, [filteredInvoices, sortKey, sortDir])

  const pagedInvoices = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedInvoices.slice(start, start + pageSize)
  }, [sortedInvoices, page, pageSize])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    )
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
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-2 text-xs text-gray-500 hover:text-gray-800">Effacer</button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {[
            { key: 'all', label: 'Toutes' },
            { key: 'completed', label: 'Terminées' },
            { key: 'processing', label: 'En cours' },
            { key: 'awaiting_user', label: 'À traiter' },
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
          <Button variant="outline" size="sm" onClick={handleBulkDelete} disabled={Object.values(selected).filter(Boolean).length===0}>Supprimer sélection</Button>
        </div>
      </div>

      {/* Tableau façon Yooz */}
      {filteredInvoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune facture</h3>
          <p className="mt-1 text-sm text-gray-500">Commencez par uploader vos premières factures.</p>
        </div>
      ) : (
        <div className="overflow-auto border rounded-md bg-white">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-1"><input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="px-2 py-1 text-left">Rang</th>
                <th className="px-2 py-1 text-left w-[420px]">Nom</th>
                <th className="px-2 py-1 text-left w-[260px] cursor-pointer" onClick={() => { setSortKey('supplier'); setSortDir(sortKey==='supplier' && sortDir==='asc' ? 'desc' : 'asc') }}>Fournisseur</th>
                <th className="px-2 py-1 text-left cursor-pointer" onClick={() => { setSortKey('date'); setSortDir(sortKey==='date' && sortDir==='asc' ? 'desc' : 'asc') }}>Date document</th>
                <th className="px-2 py-1 text-right cursor-pointer" onClick={() => { setSortKey('subtotal'); setSortDir(sortKey==='subtotal' && sortDir==='asc' ? 'desc' : 'asc') }}>Montant de base</th>
                <th className="px-2 py-1 text-right cursor-pointer" onClick={() => { setSortKey('total'); setSortDir(sortKey==='total' && sortDir==='asc' ? 'desc' : 'asc') }}>Montant total</th>
                <th className="px-2 py-1 text-left">Devise</th>
                <th className="px-2 py-1 text-left">Statut</th>
                <th className="px-2 py-1 text-left">Créé le</th>
                <th className="px-2 py-1 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedInvoices.map((inv, idx) => {
                const ed: any = inv.extracted_data || {}
                const fileNameDisplay = truncate(inv.file_name, 40)
                const supplierDisplay = truncate(formatTitleCaseName(String(inv?.supplier?.display_name || ed.supplier_name || '')), 30)
                const rowIndex = (page - 1) * pageSize + idx + 1
                const docMeta = resolveDocumentTypeMeta(inv.document_type ?? ed.document_type)
                const DocumentIcon = docMeta.icon
                const documentReference = inv.document_reference || ed.document_reference || ed.invoice_number || ''
                const documentReferenceDisplay = documentReference ? truncate(documentReference, 40) : ''

                // Vérifier si le fournisseur est en attente de validation
                const isSupplierPending = inv?.supplier?.validation_status === 'pending'
                  || (!inv?.supplier_id && !!ed?.supplier_name) // pas encore lié, mais un nom a été extrait
                const rowClassName = isSupplierPending
                  ? "border-t bg-gradient-to-r from-yellow-50 to-orange-50 hover:from-yellow-100 hover:to-orange-100 cursor-pointer border-l-4 border-l-yellow-500"
                  : "border-t odd:bg-gray-50 hover:bg-blue-50/40 cursor-pointer"
                
                return (
                  <tr key={inv.id} className={rowClassName} onClick={(e) => {
                    const tag = (e.target as HTMLElement).tagName
                    if (['INPUT', 'BUTTON', 'A', 'SVG', 'PATH'].includes(tag)) return
                    router.push(`/invoices/${inv.id}`)
                  }}>
                    <td className="px-2 py-1"><input type="checkbox" checked={!!selected[inv.id]} onChange={(e) => setSelected({ ...selected, [inv.id]: e.target.checked })} /></td>
                    <td className="px-2 py-1">{rowIndex}</td>
                    <td className="px-2 py-1 w-[420px]">
                      <div className="flex items-center space-x-1.5">
                        <DocumentIcon className={`h-3 w-3 ${docMeta.iconClass}`} />
                        <Link href={`/invoices/${inv.id}`} className="font-medium text-gray-900 truncate block max-w-[380px] hover:underline" title={inv.file_name}>
                          {fileNameDisplay}
                        </Link>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${docMeta.badge}`}>
                          {docMeta.label}
                        </span>
                        {inv.paired_document_id && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-blue-700">
                            <Link2 className="h-3 w-3" />
                            Apparié
                          </span>
                        )}
                      </div>
                      {documentReference && (
                        <div className="mt-1 text-[10px] uppercase tracking-wide text-gray-500" title={documentReference}>
                          Réf. {documentReferenceDisplay}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 w-[260px]">
                      <div className="flex items-center gap-2">
                        <span className="truncate block max-w-[180px]" title={ed.supplier_name || ''}>
                          {supplierDisplay}
                        </span>
                        {isSupplierPending && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                            ⏳ En attente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1">{formatShortDate(ed.invoice_date)}</td>
                    <td className="px-2 py-1 text-right">{ed.subtotal ? formatCurrency(ed.subtotal) : '—'}</td>
                    <td className="px-2 py-1 text-right">{ed.total_amount ? formatCurrency(ed.total_amount) : '—'}</td>
                    <td className="px-2 py-1">{ed.currency || '—'}</td>
                    <td className="px-2 py-1">{statusIcon(inv.status)}</td>
                    <td className="px-2 py-1">{formatShortDate(inv.created_at)}</td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex justify-end space-x-1">
                        <Button title="Voir" variant="outline" size="sm" className="h-7" onClick={(e) => { e.stopPropagation(); handleView(inv.file_path) }}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button title="Télécharger" variant="outline" size="sm" className="h-7" onClick={(e) => { e.stopPropagation(); handleDirectDownload(inv.file_path, inv.file_name) }}>
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button title="Supprimer" variant="outline" size="sm" className="text-red-600 hover:text-red-700 h-7" onClick={(e) => { e.stopPropagation(); handleDelete(inv.id) }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filteredInvoices.length > pageSize && (
            <div className="flex items-center justify-between p-2 text-xs border-t bg-gray-50">
              <div className="flex items-center space-x-2">
                <span className="text-gray-600">Lignes par page</span>
                <select className="border rounded px-1 py-0.5" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}>
                  {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="text-gray-600">
                {Math.min((page-1)*pageSize+1, filteredInvoices.length)}–{Math.min(page*pageSize, filteredInvoices.length)} sur {filteredInvoices.length}
              </div>
              <div className="space-x-1">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p-1))}>Préc.</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => (p*pageSize < filteredInvoices.length ? p+1 : p))}>Suiv.</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
