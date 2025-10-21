'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import Input from '../../../components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { HOTEL_RESTAURANT_ACCOUNTS, suggestAccountForSupplier, searchAccounts, searchVat, suggestVatForRate, findVatByCode, VAT_PRESETS } from '@/lib/accounting-presets'

interface AllocationFormRow {
  account_code: string
  label: string
  amount: number
  vat_code?: string
}

export default function InvoiceEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [description, setDescription] = useState('')
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [supplierOptions, setSupplierOptions] = useState<Array<{ id: string, code?: string, display_name: string }>>([])
  const [allocations, setAllocations] = useState<AllocationFormRow[]>([])
  const [invoiceTotal, setInvoiceTotal] = useState<number>(0)
  const [invoice, setInvoice] = useState<any | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [pdfZoom, setPdfZoom] = useState(100)
  const [previewWidth, setPreviewWidth] = useState(33.33) // % de la largeur
  const [isResizing, setIsResizing] = useState(false)
  const [isEditingProps, setIsEditingProps] = useState(false)
  const [clientName, setClientName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [docDate, setDocDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtotal, setSubtotal] = useState<string>('')
  const [taxAmount, setTaxAmount] = useState<string>('')
  const [totalAmount, setTotalAmount] = useState<string>('')
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const vatRateFromCode = (code?: string) => {
    const v = findVatByCode(code)
    return v?.rate ?? 0
  }
  const taxForRow = (row: AllocationFormRow) => round2((Number(row.amount || 0) * vatRateFromCode(row.vat_code)) / 100)
  const totalForRow = (row: AllocationFormRow) => round2(Number(row.amount || 0) + taxForRow(row))

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const containerWidth = window.innerWidth - 64 // Soustraire les marges
      const newWidth = ((window.innerWidth - e.clientX) / containerWidth) * 100
      setPreviewWidth(Math.max(20, Math.min(70, newWidth)))
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/auth')
          return
        }
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/invoices/${params.id}` , {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erreur chargement facture')
        const supplier = data.invoice?.extracted_data?.supplier_name || ''
        setInvoice(data.invoice)
        setSupplierName(supplier)
        setSupplierId(data.invoice?.supplier_id || null)
        setDescription(data.invoice?.extracted_data?.description || '')
        setInvoiceTotal(Number(data.invoice?.extracted_data?.total_amount || 0))
        setClientName(data.invoice?.extracted_data?.client_name || '')
        setInvoiceNumber(data.invoice?.extracted_data?.invoice_number || '')
        // Dates en yyyy-mm-dd pour inputs
        const invDate = data.invoice?.extracted_data?.invoice_date
        const due = data.invoice?.extracted_data?.due_date
        const toYmd = (d?: string) => {
          if (!d) return ''
          const dt = new Date(d)
          if (isNaN(dt.getTime())) return ''
          const y = dt.getFullYear()
          const m = String(dt.getMonth() + 1).padStart(2, '0')
          const day = String(dt.getDate()).padStart(2, '0')
          return `${y}-${m}-${day}`
        }
        setDocDate(toYmd(invDate))
        setDueDate(toYmd(due))
        setSubtotal(String(data.invoice?.extracted_data?.subtotal ?? ''))
        setTaxAmount(String(data.invoice?.extracted_data?.tax_amount ?? ''))
        setTotalAmount(String(data.invoice?.extracted_data?.total_amount ?? ''))
        try {
          if (data.invoice?.file_path) {
            const { data: pub } = createClient().storage.from('invoices').getPublicUrl(data.invoice.file_path)
            setPdfUrl(pub.publicUrl || null)
          }
        } catch {}
        const incoming = (data.allocations || []).map((a: any) => ({
          account_code: a.account_code || '',
          label: a.label || '',
          amount: a.amount || 0,
        }))
        if (incoming.length > 0) {
          setAllocations(incoming)
        } else {
          // Pas de ventilation par défaut - l'utilisateur doit ajouter manuellement
          setAllocations([])
        }
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [params.id, router])

  const addRow = () => setAllocations((prev) => [...prev, { account_code: '', label: '', amount: 0 }])
  const removeRow = (idx: number) => setAllocations((prev) => prev.filter((_, i) => i !== idx))
  const updateRow = (idx: number, patch: Partial<AllocationFormRow>) =>
    setAllocations((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  const save = async () => {
    try {
      setSaving(true)
      setError(null)
      // Deriver HT + TVA 44566 par ligne
      const derived: AllocationFormRow[] = []
      allocations.forEach((row) => {
        if (String(row.account_code).trim() === '44566') return
        derived.push({ account_code: row.account_code, label: row.label, amount: round2(Number(row.amount || 0)) })
        const t = taxForRow(row)
        if (t > 0) derived.push({ account_code: '44566', label: 'TVA déductible', amount: t })
      })

      const totalTtc = round2(derived.reduce((s, a) => s + Number(a.amount || 0), 0))
      const expected = round2(invoiceTotal)
      if (Math.abs(totalTtc - expected) > 0.01) {
        setError(`La somme des ventilations (${totalTtc} €) doit être égale au total TTC (${expected} €).`)
        setSaving(false)
        return
      }
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/invoices/${params.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          supplier_name: supplierName,
          supplier_id: supplierId,
          description,
          // Propriétés éditées
          client_name: clientName || undefined,
          invoice_number: invoiceNumber || undefined,
          invoice_date: docDate || undefined,
          due_date: dueDate || undefined,
          subtotal: subtotal !== '' ? Number(subtotal) : undefined,
          tax_amount: taxAmount !== '' ? Number(taxAmount) : undefined,
          total_amount: totalAmount !== '' ? Number(totalAmount) : undefined,
          allocations: derived
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur sauvegarde')
      router.push('/invoices')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Recherche fournisseurs (autocomplete)
  const searchSuppliers = async (q: string) => {
    try {
      const supabase = createClient()
      const { data } = await (supabase
        .from('suppliers')
        .select('id, code, display_name')
        .ilike('display_name', `%${q}%`)
        .limit(10) as any)
      setSupplierOptions((data || []) as any)
    } catch {}
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  const formatShortDate = (iso?: string) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Édition facture</h1>
          <div className="flex items-center space-x-2">
            {!showPreview && (
              <Button variant="outline" onClick={() => setShowPreview(true)}>Afficher PDF</Button>
            )}
            <Button variant="outline" onClick={() => router.push('/invoices')}>Retour</Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="flex gap-0 relative">
          <div className="space-y-4" style={{ width: showPreview ? `${100 - previewWidth}%` : '100%', transition: isResizing ? 'none' : 'width 0.3s', paddingRight: showPreview ? '12px' : '0' }}>
            <div className="bg-white shadow rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Propriétés</h2>
                <Button size="sm" variant="outline" onClick={() => setIsEditingProps((v) => !v)}>
                  {isEditingProps ? 'Terminer' : 'Modifier'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-gray-500">Organisation</div>
                  {isEditingProps ? (
                    <Input value={clientName} onChange={(e: any) => setClientName(e.target.value)} />
                  ) : (
                    <div className="font-medium">{invoice?.extracted_data?.client_name || '—'}</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Type de document</div>
                  <div className="font-medium">Facture d'achat</div>
                </div>
                <div>
                  <div className="text-gray-500">Fournisseur</div>
                  <div className="font-medium">{supplierName || invoice?.extracted_data?.supplier_name || '—'}</div>
                </div>
                <div>
                  <div className="text-gray-500">N° document</div>
                  {isEditingProps ? (
                    <Input value={invoiceNumber} onChange={(e: any) => setInvoiceNumber(e.target.value)} />
                  ) : (
                    <div className="font-medium">{invoice?.extracted_data?.invoice_number || '—'}</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Date document</div>
                  {isEditingProps ? (
                    <input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} className="border rounded px-2 py-1" />
                  ) : (
                    <div className="font-medium">{formatShortDate(invoice?.extracted_data?.invoice_date)}</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Date de réception</div>
                  <div className="font-medium">{formatShortDate(invoice?.created_at)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Date d'échéance</div>
                  {isEditingProps ? (
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border rounded px-2 py-1" />
                  ) : (
                    <div className="font-medium">{formatShortDate(invoice?.extracted_data?.due_date)}</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Montant de base</div>
                  {isEditingProps ? (
                    <Input type="number" step="0.01" value={subtotal} onChange={(e: any) => setSubtotal(e.target.value)} />
                  ) : (
                    <div className="font-medium">{(invoice?.extracted_data?.subtotal ?? 0).toFixed(2)} €</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Montant de taxe</div>
                  {isEditingProps ? (
                    <Input type="number" step="0.01" value={taxAmount} onChange={(e: any) => setTaxAmount(e.target.value)} />
                  ) : (
                    <div className="font-medium">{(invoice?.extracted_data?.tax_amount ?? 0).toFixed(2)} €</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Montant total</div>
                  {isEditingProps ? (
                    <Input type="number" step="0.01" value={totalAmount} onChange={(e: any) => setTotalAmount(e.target.value)} />
                  ) : (
                    <div className="font-medium">{(invoice?.extracted_data?.total_amount ?? 0).toFixed(2)} €</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Données de la facture</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fournisseur</label>
                  <div className="relative">
                    <Input 
                      value={supplierName} 
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const v = e.target.value
                        setSupplierName(v)
                        setSupplierId(null)
                        if (v && v.length >= 2) searchSuppliers(v)
                        else setSupplierOptions([])
                      }} 
                      placeholder="Nom du fournisseur" 
                    />
                    {supplierOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border rounded shadow max-h-56 overflow-auto text-sm">
                        {supplierOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => { setSupplierName(opt.display_name); setSupplierId(opt.id); setSupplierOptions([]) }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          >
                            <div className="font-medium text-gray-900">{opt.display_name}</div>
                            <div className="text-xs text-gray-500">{opt.code || '—'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {supplierId && (
                      <div className="mt-1 text-xs text-gray-500">ID sélectionné: {supplierId}</div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <Input value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} placeholder="Description de la facture" />
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">Ventilation comptable</h2>
                <Button size="sm" onClick={addRow}>+ Ajouter une ligne</Button>
              </div>

              <div className="space-y-3">
                {allocations.map((row, idx) => (
                  <div key={idx} className="border rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="grid grid-cols-12 gap-3 items-start">
                      {/* Compte */}
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Compte comptable</label>
                        <select
                          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm hover:border-gray-400 transition-colors"
                          value={row.account_code}
                          onChange={(e) => updateRow(idx, { account_code: e.target.value })}
                        >
                          <option value="" className="text-gray-400">Sélectionner un compte</option>
                          <optgroup label="Achats et approvisionnements">
                            <option value="601">601 - Matières premières</option>
                            <option value="602">602 - Autres approvisionnements</option>
                            <option value="606">606 - Fournitures</option>
                            <option value="6061">6061 - Eau, énergie</option>
                            <option value="6063">6063 - Entretien et petit équipement</option>
                            <option value="6064">6064 - Fournitures administratives</option>
                            <option value="6068">6068 - Autres fournitures</option>
                            <option value="607">607 - Marchandises (alimentaire, boissons)</option>
                          </optgroup>
                          <optgroup label="Services extérieurs">
                            <option value="611">611 - Sous-traitance</option>
                            <option value="613">613 - Locations</option>
                            <option value="615">615 - Entretien et réparations</option>
                            <option value="622">622 - Honoraires</option>
                            <option value="623">623 - Publicité et marketing</option>
                            <option value="624">624 - Transports</option>
                            <option value="6251">6251 - Voyages et déplacements</option>
                            <option value="6256">6256 - Missions</option>
                            <option value="6257">6257 - Réceptions</option>
                            <option value="626">626 - Télécommunications</option>
                            <option value="627">627 - Services bancaires</option>
                            <option value="628">628 - Autres services</option>
                          </optgroup>
                          <optgroup label="TVA">
                            <option value="44566">44566 - TVA déductible</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Libellé */}
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
                        <Input 
                          value={row.label} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, { label: e.target.value })} 
                          placeholder="Description de la ligne"
                          className="border-gray-300 shadow-sm hover:border-gray-400 transition-colors"
                        />
                      </div>

                      {/* Code TVA */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Code TVA</label>
                        <select
                          className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm hover:border-gray-400 transition-colors"
                          value={row.vat_code || ''}
                          onChange={(e) => updateRow(idx, { vat_code: e.target.value })}
                        >
                          <option value="" className="text-gray-400">Sans TVA</option>
                          <optgroup label="TVA Taux normal (20%)">
                            <option value="002">002 - TVA déductible B&S</option>
                            <option value="B5">B5 - TVA déductible Prestations</option>
                            <option value="I5">I5 - TVA Immobilisations</option>
                          </optgroup>
                          <optgroup label="TVA Taux intermédiaire (10%)">
                            <option value="A6">A6 - TVA déductible B&S</option>
                            <option value="B6">B6 - TVA déductible Prestations</option>
                          </optgroup>
                          <optgroup label="TVA Taux réduit (5.5%)">
                            <option value="A2">A2 - TVA déductible B&S</option>
                            <option value="B2">B2 - TVA déductible Prestations</option>
                          </optgroup>
                        </select>
                      </div>

                      {/* Montant HT */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Montant HT (€)</label>
                        <Input 
                          type="number" 
                          step="0.01" 
                          value={row.amount} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, { amount: Number(e.target.value) })}
                          className="text-right border-gray-300 shadow-sm hover:border-gray-400 transition-colors font-medium"
                          placeholder="0.00"
                        />
                      </div>

                      {/* Montant TTC (calculé) */}
                      <div className="col-span-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">TTC (€)</label>
                        <div className="px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-md text-sm text-right font-semibold text-blue-900">
                          {totalForRow(row).toFixed(2)}
                        </div>
                      </div>

                      {/* Bouton supprimer */}
                      <div className="col-span-1 flex items-end">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeRow(idx)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>

                    {/* Info TVA si applicable */}
                    {row.vat_code && taxForRow(row) > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between px-3">
                        <div className="flex items-center space-x-2 text-xs text-gray-600">
                          <span className="font-medium">Détail TVA:</span>
                          <span className="bg-gray-100 px-2 py-1 rounded">{vatRateFromCode(row.vat_code)}%</span>
                        </div>
                        <div className="text-xs font-semibold text-gray-900">
                          + {taxForRow(row).toFixed(2)} € de TVA
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {allocations.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    Aucune ligne de ventilation. Cliquez sur "Ajouter une ligne" pour commencer.
                  </div>
                )}
              </div>

              {/* Récapitulatif */}
              {allocations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-gray-700">Total ventilé:</span>
                    <span className="text-lg font-semibold text-gray-900">
                      {allocations.reduce((sum, row) => sum + totalForRow(row), 0).toFixed(2)} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600 mt-1">
                    <span>Total facture:</span>
                    <span className="font-medium">{invoiceTotal.toFixed(2)} €</span>
                  </div>
                  {Math.abs(allocations.reduce((sum, row) => sum + totalForRow(row), 0) - invoiceTotal) > 0.01 && (
                    <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded">
                      ⚠️ La somme des ventilations ne correspond pas au total de la facture
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end mt-4 pt-4 border-t border-gray-200">
                <Button onClick={save} disabled={saving} size="lg">
                  {saving ? 'Enregistrement en cours…' : 'Enregistrer la facture'}
                </Button>
              </div>
            </div>
          </div>

          {showPreview && (
            <>
              {/* Poignée de redimensionnement */}
              <div
                className="hidden lg:flex items-center justify-center cursor-col-resize hover:bg-blue-100 transition-colors"
                style={{
                  width: '12px',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 10
                }}
                onMouseDown={() => setIsResizing(true)}
              >
                <div className="flex flex-col items-center justify-center h-24 bg-gray-300 rounded-full w-6 hover:bg-blue-400 transition-colors">
                  <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 5l-3 3 3 3M12 5l3 3-3 3" stroke="currentColor" strokeWidth="2" fill="none" />
                  </svg>
                </div>
              </div>

              <div className="hidden lg:block" style={{ width: `${previewWidth}%`, transition: isResizing ? 'none' : 'width 0.3s', paddingLeft: '12px' }}>
                <div className="bg-white shadow rounded p-2 sticky top-6" style={{ height: 'calc(100vh - 120px)' }}>
                <div className="flex items-center justify-between mb-2 px-2 border-b pb-2">
                  <h2 className="text-sm font-semibold text-gray-900">Aperçu PDF</h2>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-1 border rounded px-2 py-1">
                      <button 
                        onClick={() => setPdfZoom(Math.max(50, pdfZoom - 10))}
                        className="text-gray-600 hover:text-gray-900 text-lg font-bold"
                        title="Zoom arrière"
                      >
                        −
                      </button>
                      <span className="text-xs text-gray-600 min-w-[45px] text-center">{pdfZoom}%</span>
                      <button 
                        onClick={() => setPdfZoom(Math.min(200, pdfZoom + 10))}
                        className="text-gray-600 hover:text-gray-900 text-lg font-bold"
                        title="Zoom avant"
                      >
                        +
                      </button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>✕</Button>
                  </div>
                </div>
                {pdfUrl ? (
                  <div className="w-full h-[calc(100%-50px)] overflow-auto">
                    <iframe 
                      src={`${pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=1`} 
                      className="rounded border" 
                      style={{ 
                        width: '100%', 
                        height: '100%',
                        minHeight: '100%',
                        transform: `scale(${pdfZoom / 100})`,
                        transformOrigin: 'top left'
                      }} 
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">Aucun aperçu disponible</div>
                )}
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
