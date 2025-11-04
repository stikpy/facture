'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import Input from '../../../components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { HOTEL_RESTAURANT_ACCOUNTS, suggestAccountForSupplier, searchAccounts, searchVat, suggestVatForRate, findVatByCode, VAT_PRESETS } from '@/lib/accounting-presets'
import { FileText, Package, RotateCcw, FilePenLine, FileQuestion, Hash, Link2, type LucideIcon } from 'lucide-react'

type DocumentTypeKey = 'invoice' | 'delivery_note' | 'credit_note' | 'quote' | 'other'

interface DocumentTypeMeta {
  key: DocumentTypeKey
  label: string
  description: string
  icon: LucideIcon
  badge: string
}

const getDocumentTypeMeta = (type?: string | null): DocumentTypeMeta => {
  const normalized = (type || '').toString().toLowerCase()
  switch (normalized) {
    case 'delivery_note':
      return {
        key: 'delivery_note',
        label: 'Bon de livraison',
        description: 'Document de livraison détecté automatiquement',
        icon: Package,
        badge: 'border-purple-200 bg-purple-100 text-purple-800'
      }
    case 'credit_note':
      return {
        key: 'credit_note',
        label: 'Avoir',
        description: 'Avoir ou note de crédit identifiée',
        icon: RotateCcw,
        badge: 'border-amber-200 bg-amber-100 text-amber-800'
      }
    case 'quote':
      return {
        key: 'quote',
        label: 'Devis',
        description: 'Devis ou proposition commerciale détecté',
        icon: FilePenLine,
        badge: 'border-sky-200 bg-sky-100 text-sky-800'
      }
    case 'other':
      return {
        key: 'other',
        label: 'Document',
        description: 'Document non catégorisé',
        icon: FileQuestion,
        badge: 'border-gray-200 bg-gray-100 text-gray-700'
      }
    default:
      return {
        key: 'invoice',
        label: 'Facture',
        description: 'Facture fournisseur détectée',
        icon: FileText,
        badge: 'border-emerald-200 bg-emerald-100 text-emerald-800'
      }
  }
}

interface AllocationFormRow {
  account_code: string
  label: string
  amount: number
  vat_code?: string
  vat_rate?: number
}

export default function InvoiceEditPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const ctxSupplierId = searchParams.get('supplier_id') || undefined
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [description, setDescription] = useState('')
  const [supplierId, setSupplierId] = useState<string | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<{ id: string, code?: string, display_name: string } | null>(null)
  const [supplierOptions, setSupplierOptions] = useState<Array<{ id: string, code?: string, display_name: string }>>([])
  const [searchingSuppliers, setSearchingSuppliers] = useState(false)
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null)
  const [dropdownSearchTerm, setDropdownSearchTerm] = useState('')
  const [supplierCode, setSupplierCode] = useState('')
  const [supplierValidationStatus, setSupplierValidationStatus] = useState<string | null>(null)
  const [orgAccounts, setOrgAccounts] = useState<Array<{ code: string; label: string }>>([])

  // Fonction pour uniformiser le texte (Title Case)
  const formatText = (text: string) => {
    return text
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Client Supabase
  const supabase = createClient()
  const [allocations, setAllocations] = useState<AllocationFormRow[]>([])
  const [invoiceTotal, setInvoiceTotal] = useState<number>(0)
  const [invoice, setInvoice] = useState<any | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [pdfZoom, setPdfZoom] = useState(100)
  const [pdfRotation, setPdfRotation] = useState(0)
  const [previewWidth, setPreviewWidth] = useState(33.33) // % de la largeur
  const [isResizing, setIsResizing] = useState(false)
  const [isEditingProps, setIsEditingProps] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [clientName, setClientName] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [docDate, setDocDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [subtotal, setSubtotal] = useState<string>('')
  const [taxAmount, setTaxAmount] = useState<string>('')
  const [totalAmount, setTotalAmount] = useState<string>('')
  const [retrying, setRetrying] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [queueMeta, setQueueMeta] = useState<{ taskId?: string, status?: string, attempts?: number, errorMessage?: string, createdAt?: string, startedAt?: string, completedAt?: string } | null>(null)
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([])
  const propsRef = useRef<HTMLDivElement | null>(null)
  // Gestion de l'état de modification pour griser le bouton Enregistrer
  const [initialSignature, setInitialSignature] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  // Navigation contexte
  const [prevId, setPrevId] = useState<string | null>(null)
  const [nextId, setNextId] = useState<string | null>(null)
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
  const vatRateFromCode = (code?: string) => {
    const v = findVatByCode(code)
    return v?.rate ?? 0
  }
  const taxForRow = (row: AllocationFormRow) => {
    const rate = row.vat_rate != null ? Number(row.vat_rate) : vatRateFromCode(row.vat_code)
    return round2((Number(row.amount || 0) * rate) / 100)
  }
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

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.supplier-dropdown-container')) {
        setShowSupplierDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Nettoyer le timeout au démontage
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout)
      }
    }
  }, [searchTimeout])


  useEffect(() => {
    const fetchData = async () => {
      try {
        // Utilise le client Supabase déjà initialisé
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
        
        // Synchroniser le code fournisseur si disponible
        if (data.invoice?.supplier_id && data.invoice?.supplier) {
          setSupplierCode(data.invoice.supplier.code || '')
          setSelectedSupplier(data.invoice.supplier)
          setSupplierValidationStatus(data.invoice.supplier.validation_status || null)
        }
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
            console.log('🔍 [PDF] Chemin du fichier:', data.invoice.file_path)
            
            // Générer l'URL publique directement (même méthode que invoice-list.tsx)
            const { data: pub } = supabase.storage.from('invoices').getPublicUrl(data.invoice.file_path)
            console.log('🔍 [PDF] URL générée:', pub.publicUrl)
            setPdfUrl(pub.publicUrl || null)
          } else {
            console.log('❌ [PDF] Aucun chemin de fichier trouvé')
            setPdfUrl(null)
          }
        } catch (error) {
          console.error('❌ [PDF] Erreur lors de la génération de l\'URL:', error)
          setPdfUrl(null)
        }
        console.log('🔍 [ALLOCATIONS] Données reçues:', data.allocations)
        const incoming = (data.allocations || []).map((a: any) => ({
          account_code: a.account_code || '',
          label: a.label || '',
          amount: a.amount || 0,
          vat_code: a.vat_code || '',
          vat_rate: a.vat_rate != null ? Number(a.vat_rate) : undefined,
        }))
        console.log('🔍 [ALLOCATIONS] Ventilations formatées:', incoming)
        if (incoming.length > 0) {
          setAllocations(incoming)
          console.log('✅ [ALLOCATIONS] Ventilations chargées:', incoming.length, 'lignes')
        } else {
          // Pas de ventilation par défaut - l'utilisateur doit ajouter manuellement
          setAllocations([])
          console.log('⚠️ [ALLOCATIONS] Aucune ventilation trouvée, tableau vide')
        }

        // Enregistrer la signature initiale (snapshot) pour détecter les changements
        const initSig = JSON.stringify({
          supplierId: data.invoice?.supplier_id || null,
          supplierName: supplier,
          description: data.invoice?.extracted_data?.description || '',
          clientName: data.invoice?.extracted_data?.client_name || '',
          invoiceNumber: data.invoice?.extracted_data?.invoice_number || '',
          invoiceDate: toYmd(invDate),
          dueDate: toYmd(due),
          subtotal: String(data.invoice?.extracted_data?.subtotal ?? ''),
          taxAmount: String(data.invoice?.extracted_data?.tax_amount ?? ''),
          totalAmount: String(data.invoice?.extracted_data?.total_amount ?? ''),
          allocations: incoming,
        })
        setInitialSignature(initSig)

        // Calculer les voisins (précédent/suivant) selon le contexte
        try {
          const currentCreatedAt = data.invoice?.created_at as string
          const orgId = data.invoice?.organization_id as string
          if (currentCreatedAt && orgId) {
            // previous = plus récent; next = plus ancien dans tri desc
            const makeBase = () => {
              let q = supabase.from('invoices').select('id, created_at').eq('organization_id', orgId)
              if (ctxSupplierId) q = q.eq('supplier_id', ctxSupplierId)
              return q
            }

            const { data: newer } = await (makeBase()
              .gt('created_at', currentCreatedAt)
              .order('created_at', { ascending: false })
              .limit(1) as any)
            const { data: older } = await (makeBase()
              .lt('created_at', currentCreatedAt)
              .order('created_at', { ascending: false })
              .limit(1) as any)

            setPrevId(newer && newer.length ? newer[0].id : null)
            setNextId(older && older.length ? older[0].id : null)
            console.log('[NAV] voisins calculés', { prev: newer?.[0]?.id || null, next: older?.[0]?.id || null, ctxSupplierId })
          }
        } catch (e) {
          // silencieux
        }
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [params.id, router, ctxSupplierId])

  // Charger les comptes de l'organisation pour enrichir la liste
  useEffect(() => {
    const loadOrgAccounts = async () => {
      try {
        const res = await fetch('/api/orgs/accounts')
        const data = await res.json()
        if (res.ok) {
          setOrgAccounts((data.accounts || []).map((a: any) => ({ code: a.code, label: a.label })))
        }
      } catch {}
    }
    loadOrgAccounts()
  }, [])

  // Charger / sauvegarder la rotation d'aperçu (par facture) en localStorage
  useEffect(() => {
    try {
      const key = `invoice-rotation-${params.id}`
      const saved = localStorage.getItem(key)
      if (saved != null) setPdfRotation(Number(saved) || 0)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      const key = `invoice-rotation-${params.id}`
      localStorage.setItem(key, String(((pdfRotation % 360) + 360) % 360))
    } catch {}
  }, [pdfRotation, params.id])

  // Charger les métadonnées de queue pour afficher des détails utiles lorsque status === error
  useEffect(() => {
    const loadQueueMeta = async () => {
      try {
        if (!invoice?.id) return
        const { data: { session } } = await supabase.auth.getSession()
        const r = await fetch(`/api/queue/status?invoiceId=${invoice.id}`, {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
        })
        if (r.ok) {
          const d = await r.json()
          setQueueMeta({
            taskId: d.taskId,
            status: d.status,
            attempts: d.attempts,
            errorMessage: d.errorMessage,
            createdAt: d.createdAt,
            startedAt: d.startedAt,
            completedAt: d.completedAt,
          })
        } else {
          setQueueMeta(null)
        }
      } catch {
        setQueueMeta(null)
      }
    }
    // Charger si on a une erreur ou pendant un retry/pending
    if (invoice?.status === 'error' || invoice?.status === 'processing') {
      loadQueueMeta()
    }
  }, [invoice?.id, invoice?.status])

  // Charger des factures candidates si doublon détecté (sans dépendances non initialisées)
  useEffect(() => {
    const loadDuplicates = async () => {
      try {
        const invNumber = (invoice as any)?.extracted_data?.invoice_number
        if (!invoice?.id || !invoice?.organization_id || !invNumber) {
          setDuplicateCandidates([])
          return
        }
        let query = (supabase
          .from('invoices')
          .select('id, file_name, created_at, status, extracted_data')
          .eq('organization_id', invoice.organization_id)
          .neq('id', invoice.id)
          .filter('extracted_data->>invoice_number', 'eq', String(invNumber)) as any)
        if ((invoice as any)?.supplier_id) {
          query = query.eq('supplier_id', (invoice as any).supplier_id)
        }
        const { data } = await (query
          .order('created_at', { ascending: false })
          .limit(5) as any)
        setDuplicateCandidates((data || []) as any[])
      } catch {
        setDuplicateCandidates([])
      }
    }
    const dup = (invoice?.status === 'duplicate')
      || String(queueMeta?.errorMessage || '').includes('duplicate_invoice_number')
      || String((invoice as any)?.extracted_data?.error || '').toLowerCase().includes('duplicate')
    if (dup) {
      loadDuplicates()
    }
  }, [invoice?.status, queueMeta?.errorMessage, invoice?.id, invoice?.organization_id, (invoice as any)?.extracted_data?.invoice_number])

  // Navigation clavier ← →
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevId) {
        e.preventDefault()
        router.push(`/invoices/${prevId}${ctxSupplierId ? `?ctx=supplier&supplier_id=${ctxSupplierId}` : ''}`)
      } else if (e.key === 'ArrowRight' && nextId) {
        e.preventDefault()
        router.push(`/invoices/${nextId}${ctxSupplierId ? `?ctx=supplier&supplier_id=${ctxSupplierId}` : ''}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prevId, nextId, router, ctxSupplierId])

  // Déterminer si des changements ont été faits
  useEffect(() => {
    if (initialSignature == null) {
      setIsDirty(false)
      return
    }
    const currentSig = JSON.stringify({
      supplierId,
      supplierName,
      description,
      clientName,
      invoiceNumber,
      invoiceDate: docDate,
      dueDate,
      subtotal,
      taxAmount,
      totalAmount,
      allocations,
    })
    setIsDirty(currentSig !== initialSignature)
  }, [supplierId, supplierName, description, clientName, invoiceNumber, docDate, dueDate, subtotal, taxAmount, totalAmount, allocations, initialSignature])

  const addRow = () => setAllocations((prev) => [...prev, { account_code: '', label: '', amount: 0 }])
  const removeRow = (idx: number) => setAllocations((prev) => prev.filter((_, i) => i !== idx))
  const updateRow = (idx: number, patch: Partial<AllocationFormRow>) =>
    setAllocations((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  // Sauvegarde automatique des propriétés
  const saveProperties = async () => {
    try {
      // Autoriser la sauvegarde même sans supplierId pour saisie manuelle
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`/api/invoices/${params.id}`, {
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
          // Dès que l'utilisateur enregistre des propriétés, considérer la saisie manuelle
          manual_mode: true,
        }),
      })
      
      if (response.ok) {
        // Mettre à jour l'objet invoice local pour l'affichage
        setInvoice((prev: any) => ({
          ...prev,
          extracted_data: {
            ...prev?.extracted_data,
            supplier_name: supplierName,
            client_name: clientName,
            invoice_number: invoiceNumber,
            invoice_date: docDate,
            due_date: dueDate,
            subtotal: subtotal !== '' ? Number(subtotal) : prev?.extracted_data?.subtotal,
            tax_amount: taxAmount !== '' ? Number(taxAmount) : prev?.extracted_data?.tax_amount,
            total_amount: totalAmount !== '' ? Number(totalAmount) : prev?.extracted_data?.total_amount,
          }
        }))
        // passer en awaiting_user côté UI (mode manuel)
        setInvoice((prev: any) => prev ? { ...prev, status: 'awaiting_user', extracted_data: { ...(prev.extracted_data||{}), ocr_mode: 'manual' } } : prev)
        console.log('✅ Propriétés sauvegardées (mode manuel) et affichage mis à jour')
      }
    } catch (e) {
      console.error('Erreur sauvegarde automatique:', e)
    }
  }

  const save = async () => {
    try {
      setSaving(true)
      setError(null)
      
      // Validation : le fournisseur doit être sélectionné
      if (!supplierId) {
        setError('❌ Vous devez sélectionner un fournisseur existant dans la liste d\'autocomplétion pour valider cette facture.')
        setSaving(false)
        return
      }
      
      // Sauvegarder les allocations telles qu'elles sont saisies (sans dérivation automatique)
      console.log('🔍 [SAVE] Allocations avant sauvegarde:', allocations)
      const derived: AllocationFormRow[] = allocations.map(row => ({
        account_code: row.account_code,
        label: row.label,
        amount: round2(Number(row.amount || 0)),
        vat_code: row.vat_code || '',
        vat_rate: row.vat_rate != null ? Number(row.vat_rate) : vatRateFromCode(row.vat_code)
      }))
      console.log('🔍 [SAVE] Allocations formatées pour sauvegarde:', derived)

      const totalTtc = round2(allocations.reduce((sum, row) => sum + totalForRow(row), 0))
      const expected = round2(invoiceTotal)
      if (Math.abs(totalTtc - expected) > 0.01) {
        setError(`La somme des ventilations (${totalTtc} €) doit être égale au total TTC (${expected} €).`)
        setSaving(false)
        return
      }
      // Utilise le client Supabase déjà initialisé
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
      console.log('✅ Facture enregistrée avec succès')
      // Mettre à jour la signature initiale pour désactiver le bouton tant qu'aucun autre changement n'est fait
      const newSig = JSON.stringify({
        supplierId,
        supplierName,
        description,
        clientName,
        invoiceNumber,
        invoiceDate: docDate,
        dueDate,
        subtotal,
        taxAmount,
        totalAmount,
        allocations,
      })
      setInitialSignature(newSig)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // Charger tous les fournisseurs (pour dropdown initial)
  const loadAllSuppliers = async () => {
    try {
      setSearchingSuppliers(true)
      // Utilise le client Supabase déjà initialisé
      const { data } = await (supabase
        .from('suppliers')
        .select('id, code, display_name')
        .order('display_name')
        .limit(20) as any)
      setSupplierOptions((data || []) as any)
    } catch (error) {
      console.error('Erreur lors du chargement des fournisseurs:', error)
      setSupplierOptions([])
    } finally {
      setSearchingSuppliers(false)
    }
  }


  // Recherche fournisseurs (autocomplete) - Recherche intelligente comme YOoz
  const searchSuppliers = async (q: string) => {
    try {
      setSearchingSuppliers(true)
      // Utilise le client Supabase déjà initialisé
      
      // Recherche plus intelligente : nom, code, et mots-clés
      const searchTerms = q.toLowerCase().trim().split(/\s+/)
      let query = supabase
        .from('suppliers')
        .select('id, code, display_name')
        .order('display_name')
        .limit(20)
      
      if (searchTerms.length === 1) {
        // Recherche simple : nom ou code
        query = query.or(`display_name.ilike.%${q}%,code.ilike.%${q}%`)
      } else {
        // Recherche multi-mots : chaque mot doit être trouvé dans le nom
        const conditions = searchTerms.map(term => 
          `display_name.ilike.%${term}%`
        ).join(',')
        query = query.or(conditions)
      }
      
      const { data } = await (query as any)
      setSupplierOptions((data || []) as any)
    } catch (error) {
      console.error('Erreur lors de la recherche de fournisseurs:', error)
      setSupplierOptions([])
    } finally {
      setSearchingSuppliers(false)
    }
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

  const extracted: any = invoice?.extracted_data || {}
  const errorMessage: string = (() => {
    const err = extracted?.error
    if (!err) return ''
    return typeof err === 'string' ? err : JSON.stringify(err)
  })()
  const isDuplicate = (invoice?.status === 'duplicate')
    || (queueMeta?.errorMessage || '').includes('duplicate_invoice_number')
    || (errorMessage || '').toLowerCase().includes('duplicate')

  const formatBytes = (n?: number) => {
    const b = Number(n || 0)
    if (!b) return '—'
    const u = ['o', 'Ko', 'Mo', 'Go']
    let i = 0
    let v = b
    while (v >= 1024 && i < u.length - 1) {
      v = v / 1024
      i++
    }
    return `${v.toFixed(1)} ${u[i]}`
  }

  const friendlyHelp = (() => {
    const tips: string[] = []
    const em = (errorMessage || queueMeta?.errorMessage || '').toLowerCase()
    const mime = String(invoice?.mime_type || '')
    const size = Number(invoice?.file_size || 0)

    let headline = "Le document n'a pas pu être traité"

    if (em.includes('duplicate_invoice_number') || em.includes('duplicate')) {
      headline = 'Doublon détecté'
      tips.push('Cette facture semble déjà exister avec le même numéro. Vérifiez la liste des factures.')
    }
    if (em.includes('unsupported') || em.includes('mime') || (!mime.match(/^application\/pdf|^image\//))) {
      headline = 'Format non supporté'
      tips.push(`Le format de fichier (${mime || 'inconnu'}) peut ne pas être supporté. Convertissez en PDF ou image (JPG/PNG).`)
    }
    if (em.includes('timeout') || em.includes('timed out')) {
      tips.push('Le traitement a expiré. Réessayez: le serveur était peut‑être occupé.')
    }
    if (em.includes('ocr') || em.includes('tesseract') || em.includes('no text') || em.includes('text') && em.includes('extract')) {
      tips.push('Le texte est difficile à lire. Préférez un PDF natif ou un scan 300 dpi en niveaux de gris, bien cadré.')
    }
    if (size > 20 * 1024 * 1024 || em.includes('too large') || em.includes('payload')) {
      tips.push(`Le fichier est volumineux (${formatBytes(size)}). Compressez ou scindez le document avant de réessayer.`)
    }
    if (tips.length === 0) {
      tips.push('Réessayez la relance. Si le problème persiste, vérifiez la lisibilité et le format du fichier.')
    }
    return { headline, tips }
  })()
  const documentMeta = getDocumentTypeMeta(invoice?.document_type ?? extracted.document_type)
  const DocumentIcon = documentMeta.icon
  const documentTypeKey = documentMeta.key
  const documentReference: string | null = invoice?.document_reference
    ?? extracted.document_reference
    ?? extracted.invoice_number
    ?? null
  const deliveryNoteNumber: string | null = extracted.delivery_note_number || null
  const normalizedInvoiceNumber: string | null = extracted.invoice_number || null
  const relatedDeliveryNotes: string[] = Array.isArray(extracted.related_delivery_note_numbers)
    ? extracted.related_delivery_note_numbers
    : []
  const relatedInvoiceNumbers: string[] = Array.isArray(extracted.related_invoice_numbers)
    ? extracted.related_invoice_numbers
    : []
  const relatedList = documentTypeKey === 'invoice' ? relatedDeliveryNotes : relatedInvoiceNumbers
  const relatedLabel = documentTypeKey === 'invoice' ? 'Bons de livraison associés' : 'Factures associées'
  const pairedDocument = invoice?.paired_document
  const pairedExtracted: any = pairedDocument?.extracted_data || {}
  const pairedMeta = pairedDocument
    ? getDocumentTypeMeta(pairedDocument.document_type ?? pairedExtracted.document_type)
    : null
  const pairedReference = pairedDocument
    ? (pairedDocument.document_reference
        ?? pairedExtracted.document_reference
        ?? pairedExtracted.invoice_number
        ?? '')
    : ''

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6 min-w-0">
          <h1 className="text-2xl font-semibold text-gray-900">Édition facture</h1>
          <div className="flex items-center space-x-2">
            {!showPreview && (
              <Button variant="outline" onClick={() => setShowPreview(true)}>Afficher PDF</Button>
            )}
            {/* Navigation */}
            <div className="hidden md:flex items-center gap-2">
              <Button variant="outline" disabled={!prevId} onClick={() => prevId && router.push(`/invoices/${prevId}${ctxSupplierId ? `?ctx=supplier&supplier_id=${ctxSupplierId}` : ''}`)}>
                ← Précédente
              </Button>
              <Button variant="outline" disabled={!nextId} onClick={() => nextId && router.push(`/invoices/${nextId}${ctxSupplierId ? `?ctx=supplier&supplier_id=${ctxSupplierId}` : ''}`)}>
                Suivante →
              </Button>
            </div>
            <Button variant="outline" onClick={() => router.push('/invoices')}>Retour</Button>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-dashed border-gray-200 bg-white/60 p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold shadow-sm ${documentMeta.badge}`}>
              <DocumentIcon className="h-4 w-4" />
              {documentMeta.label}
            </span>
            {documentReference && (
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 font-medium text-gray-700 shadow-sm">
                <Hash className="h-4 w-4 text-gray-500" />
                Réf. {documentReference}
              </span>
            )}
            {documentTypeKey === 'invoice' && deliveryNoteNumber && (
              <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-purple-700 shadow-sm">
                <Package className="h-4 w-4" />
                BL {deliveryNoteNumber}
              </span>
            )}
            {documentTypeKey === 'delivery_note' && normalizedInvoiceNumber && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 shadow-sm">
                <FileText className="h-4 w-4" />
                Facture {normalizedInvoiceNumber}
              </span>
            )}
          </div>

          {relatedList.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold uppercase tracking-wide text-gray-500">{relatedLabel}</span>
              {relatedList.map(ref => (
                <span key={ref} className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                  {ref}
                </span>
              ))}
            </div>
          )}

          {pairedDocument && pairedMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={`/invoices/${pairedDocument.id}`}
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 shadow-sm transition hover:bg-blue-100"
              >
                <Link2 className="h-4 w-4" />
                {pairedMeta.label}
                {pairedReference ? `• ${pairedReference}` : ''}
              </Link>
              {pairedDocument.created_at && (
                <span className="text-xs text-blue-500">({formatShortDate(pairedDocument.created_at)})</span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        {(invoice?.status === 'error' || isDuplicate) && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-md p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-900 mb-1">{friendlyHelp.headline}</h3>
                <p className="text-sm text-red-800">La dernière tentative d'extraction a échoué.</p>
                <div className="mt-2 text-xs text-red-900">
                  <ul className="list-disc pl-5 space-y-1">
                    {friendlyHelp.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-3 text-[11px] text-gray-600">
                  <span className="mr-2">Fichier: <span className="font-mono">{invoice?.file_name || '—'}</span></span>
                  <span className="mr-2">Type: {invoice?.mime_type || '—'}</span>
                  <span>Taille: {formatBytes(invoice?.file_size)}</span>
                </div>
                {isDuplicate && duplicateCandidates.length > 0 && (
                  <div className="mt-4 bg-white border border-amber-200 rounded p-3 text-xs">
                    <div className="font-semibold text-amber-800 mb-2">Facture(s) existante(s) avec le même numéro</div>
                    <div className="space-y-2">
                      {duplicateCandidates.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-2 border border-amber-100 rounded px-2 py-1">
                          <div className="min-w-0">
                            <div className="text-gray-900 truncate">{d.file_name || 'Facture'}</div>
                            <div className="text-[11px] text-gray-500">
                              N°: {String(d?.extracted_data?.invoice_number || '')} • {formatShortDate(d.created_at)} • Statut: {d.status}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                              onClick={() => router.push(`/invoices/${d.id}`)}
                            >Ouvrir</button>
                            <button
                              className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                              onClick={() => {
                                setIsEditingProps(true)
                                setTimeout(() => propsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                              }}
                            >Éditer le N° ici</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {showErrorDetails && errorMessage && (
                  <div className="mt-3 bg-white border border-red-200 rounded p-3 text-xs text-red-900 whitespace-pre-wrap">
                    {errorMessage}
                  </div>
                )}
                {showErrorDetails && (
                  <div className="mt-3 bg-white border border-gray-200 rounded p-3 text-xs text-gray-800">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-gray-500">Statut de la queue</div>
                        <div className="font-medium">{queueMeta?.status || '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Tentatives</div>
                        <div className="font-medium">{queueMeta?.attempts ?? '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Créée</div>
                        <div className="font-medium">{queueMeta?.createdAt ? formatShortDate(queueMeta.createdAt) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Démarrée</div>
                        <div className="font-medium">{queueMeta?.startedAt ? formatShortDate(queueMeta.startedAt) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Terminée</div>
                        <div className="font-medium">{queueMeta?.completedAt ? formatShortDate(queueMeta.completedAt) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Task ID</div>
                        <div className="font-mono break-all text-[11px]">{queueMeta?.taskId || '—'}</div>
                      </div>
                    </div>
                    {queueMeta?.errorMessage && (
                      <div className="mt-3">
                        <div className="text-gray-500 mb-1">Erreur renvoyée par le worker</div>
                        <div className="bg-red-50 border border-red-200 rounded p-2 text-red-900 whitespace-pre-wrap">
                          {queueMeta.errorMessage}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button 
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                            onClick={() => navigator.clipboard.writeText(queueMeta.errorMessage || '')}
                          >Copier l'erreur</button>
                          {errorMessage && (
                            <button 
                              className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                              onClick={() => navigator.clipboard.writeText(errorMessage)}
                            >Copier le détail</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  disabled={refreshing}
                  onClick={async () => {
                    try {
                      setRefreshing(true)
                      const { data: { session } } = await supabase.auth.getSession()
                      const token = session?.access_token || ''
                      // Tenter une réconciliation via l'endpoint de statut
                      try {
                        await fetch(`/api/queue/status?invoiceId=${params.id}`, {
                          headers: token ? { Authorization: `Bearer ${token}` } as any : undefined
                        })
                      } catch {}
                      // Recharger la facture
                      const rr = await fetch(`/api/invoices/${params.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
                      const dd = await rr.json()
                      if (rr.ok) {
                        setInvoice(dd.invoice)
                      } else if (dd?.error) {
                        setError(dd.error)
                      }
                    } catch (e: any) {
                      setError(e.message)
                    } finally {
                      setRefreshing(false)
                    }
                  }}
                >
                  {refreshing ? 'Actualisation…' : 'Actualiser le statut'}
                </Button>
                {(errorMessage.toLowerCase().includes('ocr') || String(queueMeta?.errorMessage || '').toLowerCase().includes('ocr')) && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-yellow-300 text-yellow-800 hover:bg-yellow-100"
                    onClick={async () => {
                      try {
                        const { data: { session } } = await supabase.auth.getSession()
                        const res = await fetch(`/api/invoices/${params.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                          },
                          body: JSON.stringify({ manual_mode: true })
                        })
                        const j = await res.json().catch(() => ({}))
                        if (!res.ok) throw new Error(j.error || 'Activation du mode manuel impossible')
                        // Mettre à jour localement
                        setInvoice((prev: any) => prev ? { ...prev, status: 'awaiting_user', extracted_data: { ...(prev.extracted_data||{}), ocr_mode: 'manual' } } : prev)
                      } catch (e: any) {
                        setError(e.message)
                      }
                    }}
                  >
                    Basculer en saisie manuelle
                  </Button>
                )}
                {isDuplicate && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100"
                    onClick={() => {
                      setIsEditingProps(true)
                      setTimeout(() => propsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
                    }}
                  >
                    Modifier le N°
                  </Button>
                )}
                {pdfUrl && (
                  <a 
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                  >
                    Télécharger
                  </a>
                )}
                {errorMessage && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-red-300 text-red-800 hover:bg-red-100"
                    onClick={() => setShowErrorDetails(v => !v)}
                  >
                    {showErrorDetails ? 'Masquer le détail' : 'Voir le détail'}
                  </Button>
                )}
                <Button 
                  size="sm"
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  onClick={async () => {
                    if (!confirm('Supprimer définitivement cette facture ?')) return
                    try {
                      const { data: { session } } = await supabase.auth.getSession()
                      const res = await fetch(`/api/invoices/${params.id}`, {
                        method: 'DELETE',
                        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined
                      })
                      if (!res.ok) {
                        const d = await res.json().catch(() => ({}))
                        throw new Error(d.error || 'Suppression impossible')
                      }
                      router.push('/invoices')
                    } catch (e: any) {
                      setError(e.message)
                    }
                  }}
                >
                  Supprimer
                </Button>
                <Button 
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={retrying}
                  onClick={async () => {
                    try {
                      setRetrying(true)
                      setError(null)
                      const { data: { session } } = await supabase.auth.getSession()
                      const res = await fetch('/api/queue/add', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                        },
                        body: JSON.stringify({ invoiceId: params.id })
                      })
                      const data = await res.json()
                      if (!res.ok) throw new Error(data.error || 'Échec de la relance')

                      // Refléter localement: en file d'attente
                      setInvoice((prev: any) => prev ? { ...prev, status: 'queued' } : prev)

                      // Démarrer un petit polling pour mettre à jour l'état
                      const token = session?.access_token || ''
                      let attempts = 0
                      const maxAttempts = 60
                      const poll = async () => {
                        if (attempts++ >= maxAttempts) return
                        try {
                          const r = await fetch(`/api/queue/status?invoiceId=${params.id}`, {
                            headers: token ? { Authorization: `Bearer ${token}` } as any : undefined
                          })
                          if (r.ok) {
                            const s = await r.json()
                            if (s.status === 'completed') {
                              try {
                                const rr = await fetch(`/api/invoices/${params.id}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
                                const dd = await rr.json()
                                if (rr.ok) {
                                  setInvoice(dd.invoice)
                                }
                              } catch {}
                              return
                            } else if (s.status === 'failed' || s.status === 'error') {
                              setInvoice((prev: any) => prev ? { ...prev, status: 'error' } : prev)
                              return
                            } else if (s.status === 'processing') {
                              setInvoice((prev: any) => prev ? { ...prev, status: 'processing' } : prev)
                            }
                          }
                        } catch {}
                        setTimeout(poll, 4000)
                      }
                      poll()
                    } catch (e: any) {
                      setError(e.message)
                    } finally {
                      setRetrying(false)
                    }
                  }}
                >
                  {retrying ? 'Relance…' : "Relancer l'extraction"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Banner d'alerte si le fournisseur est en attente de validation */}
        {supplierValidationStatus === 'pending' && (
          <div className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-500 rounded-lg shadow-md p-5">
            <div className="flex items-start gap-4">
              <div className="bg-yellow-500 rounded-full p-2 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  ⏳ Fournisseur en attente de validation
                </h3>
                <p className="text-gray-700 mb-3">
                  Le fournisseur <strong className="text-yellow-800">{selectedSupplier?.display_name || supplierName}</strong> a été détecté automatiquement lors de l'import et est en attente de validation.
                </p>
                <div className="flex gap-3">
                  <Button 
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                    onClick={() => router.push('/suppliers')}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Aller valider le fournisseur
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-100"
                    onClick={() => window.open('/suppliers', '_blank')}
                  >
                    Ouvrir dans un nouvel onglet
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-0 relative min-w-0">
          <div className="space-y-4 min-w-0" style={{ width: showPreview ? `${100 - previewWidth}%` : '100%', transition: isResizing ? 'none' : 'width 0.3s', paddingRight: showPreview ? '12px' : '0' }}>
            <div ref={propsRef} className={`shadow rounded p-4 ${supplierValidationStatus === 'pending' ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-500' : 'bg-white'}`}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Propriétés</h2>
                <div className="flex items-center gap-2">
                {invoice?.status === 'awaiting_user' && (
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={finalizing}
                    onClick={async () => {
                      try {
                        setFinalizing(true)
                        const { data: { session } } = await supabase.auth.getSession()
                        const res = await fetch(`/api/invoices/${params.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                          },
                          body: JSON.stringify({ finalize: true })
                        })
                        const j = await res.json().catch(() => ({}))
                        if (!res.ok) throw new Error(j.error || 'Impossible de marquer comme terminée')
                        setInvoice((prev: any) => prev ? { ...prev, status: 'completed' } : prev)
                      } catch (e: any) {
                        setError(e.message)
                      } finally {
                        setFinalizing(false)
                      }
                    }}
                  >
                    {finalizing ? 'Validation…' : 'Marquer comme terminée'}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={async () => {
                  if (isEditingProps) {
                    await saveProperties()
                  }
                  setIsEditingProps((v) => !v)
                }}>
                  {isEditingProps ? 'Terminer' : 'Modifier'}
                </Button>
                </div>
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
                <div>
                  <div className="text-gray-500">Fournisseur</div>
                  {isEditingProps ? (
                    <div className="relative supplier-dropdown-container">
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <Input 
                          value={supplierName} 
                          onFocus={() => {
                            if (supplierOptions.length === 0) {
                              loadAllSuppliers()
                            }
                            setShowSupplierDropdown(true)
                          }}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const v = e.target.value
                            setSupplierName(v)
                            setSupplierId(null)
                            setSelectedSupplier(null)
                            setDropdownSearchTerm('') // Reset dropdown search
                          }} 
                          placeholder="Rechercher un fournisseur..." 
                          className="pl-10"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (showSupplierDropdown) {
                              setShowSupplierDropdown(false)
                            } else {
                              if (supplierOptions.length === 0) {
                                loadAllSuppliers()
                              }
                              setShowSupplierDropdown(true)
                            }
                          }}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                          <svg 
                            className={`h-4 w-4 transition-transform ${showSupplierDropdown ? 'rotate-180' : ''}`} 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      {showSupplierDropdown && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden text-sm">
                          {/* Barre de recherche dans le dropdown */}
                          <div className="p-2 border-b border-gray-200">
                            <div className="relative">
                              <Input
                                value={dropdownSearchTerm}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setDropdownSearchTerm(value)
                                  
                                  // Annuler la recherche précédente
                                  if (searchTimeout) {
                                    clearTimeout(searchTimeout)
                                  }
                                  
                                  if (value && value.length >= 1) {
                                    // Debounce : attendre 300ms avant de rechercher
                                    const timeout = setTimeout(() => {
                                      searchSuppliers(value)
                                    }, 300)
                                    setSearchTimeout(timeout)
                                  } else if (value.length === 0) {
                                    // Recherche immédiate pour afficher tous les fournisseurs
                                    loadAllSuppliers()
                                  }
                                }}
                                placeholder="Rechercher dans la liste..."
                                className="pl-8 text-sm"
                              />
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </div>
                            </div>
                          </div>
                          
                          {/* Liste des résultats */}
                          <div className="max-h-40 overflow-auto">
                            {supplierOptions.length > 0 ? (
                              supplierOptions.map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => { 
                                    setSupplierName(opt.display_name); 
                                    setSupplierCode(opt.code || ''); // Synchroniser le code
                                    setSupplierId(opt.id); 
                                    setSelectedSupplier(opt);
                                    setShowSupplierDropdown(false);
                                    setDropdownSearchTerm('');
                                    setSupplierOptions([]) 
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                                >
                                  <div className="font-medium text-gray-900 text-sm">
                                    {formatText(opt.display_name)}
                                  </div>
                                </button>
                              ))
                            ) : (
                              <div className="px-4 py-8 text-center text-gray-500">
                                {searchingSuppliers ? (
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin h-4 w-4 border border-gray-400 border-t-transparent rounded-full"></div>
                                    <span>Recherche en cours...</span>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-gray-400 mb-2">🔍</div>
                                    <div>Aucun fournisseur trouvé</div>
                                    <div className="text-xs text-gray-400 mt-1">Essayez un autre terme de recherche</div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {supplierId && selectedSupplier && (
                        <div className="mt-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                          ✅ Fournisseur sélectionné: {formatText(selectedSupplier.display_name)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="font-medium">{invoice?.extracted_data?.supplier_name || '—'}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Données de la facture</h2>
              <div className="grid grid-cols-2 gap-3">
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
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      {/* Compte */}
                      <div className="col-span-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Compte comptable</label>
                        <select
                          className="w-full h-9 border border-gray-300 rounded-md px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                          value={row.account_code}
                          title={(() => {
                            const a = HOTEL_RESTAURANT_ACCOUNTS.find(p => p.code === (row.account_code || ''))
                            return a ? `${a.code} — ${a.label}` : 'Sélectionner un compte'
                          })()}
                          onChange={(e) => updateRow(idx, { account_code: e.target.value })}
                        >
                          <option value="" className="text-gray-400">Sélectionner un compte</option>
                          {orgAccounts.length > 0 && (
                            <optgroup label="Comptes organisation">
                              {orgAccounts.map((a) => (
                                <option key={`org-${a.code}`} value={a.code}>{a.code} - {a.label}</option>
                              ))}
                            </optgroup>
                          )}
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
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
                        <Input 
                          value={row.label} 
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, { label: e.target.value })} 
                          placeholder="Libellé de la ligne"
                          className="h-9 border-gray-300 hover:border-gray-400 transition-colors"
                        />
                      </div>

                      {/* Code TVA */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Code TVA</label>
                        <select
                          className="w-full h-9 border border-gray-300 rounded-md px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white hover:border-gray-400 transition-colors"
                          value={row.vat_code || ''}
                          title={(() => {
                            const v = VAT_PRESETS.find(p => p.code === (row.vat_code || ''))
                            return v ? `${v.code} — ${v.label} (${v.rate}%)` : 'Sans TVA'
                          })()}
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
                        <label className="block text-xs font-medium text-gray-700 mb-1">Montant HT</label>
                        <div className="relative">
                          <Input 
                            type="number" 
                            step="0.01" 
                            value={row.amount} 
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(idx, { amount: Number(e.target.value) })}
                            className="h-9 pr-8 text-right border-gray-300 hover:border-gray-400 transition-colors font-medium"
                            placeholder="0.00"
                          />
                          <span className="absolute inset-y-0 right-2 flex items-center text-gray-400 text-xs">€</span>
                        </div>
                      </div>

                      {/* Montant TTC (calculé) */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">TTC (€)</label>
                        <div className="px-3 bg-blue-50 border border-blue-200 rounded-md text-sm font-semibold text-blue-900 h-9 flex items-center justify-end whitespace-nowrap min-w-[96px]">
                          <span className="tabular-nums">{totalForRow(row).toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Bouton supprimer */}
                      <div className="col-span-1 flex items-end">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="h-9 w-9 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
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
                <Button onClick={save} disabled={saving || !isDirty} size="lg">
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
                <div className="flex items-center space-x-1 border rounded px-2 py-1">
                  <button 
                    onClick={() => setPdfRotation((r) => (r - 90 + 360) % 360)}
                    className="text-gray-600 hover:text-gray-900 text-sm font-bold"
                    title="Rotation gauche 90°"
                  >
                    ⟲
                  </button>
                  <span className="text-xs text-gray-600 min-w-[28px] text-center">{pdfRotation}°</span>
                  <button 
                    onClick={() => setPdfRotation((r) => (r + 90) % 360)}
                    className="text-gray-600 hover:text-gray-900 text-sm font-bold"
                    title="Rotation droite 90°"
                  >
                    ⟳
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
                        transform: (() => {
                          const r = ((pdfRotation % 360) + 360) % 360
                          const s = pdfZoom / 100
                          if (r === 90) return `rotate(90deg) translateY(-100%) scale(${s})`
                          if (r === 180) return `rotate(180deg) translate(-100%, -100%) scale(${s})`
                          if (r === 270) return `rotate(270deg) translateX(-100%) scale(${s})`
                          return `rotate(0deg) scale(${s})`
                        })(),
                        transformOrigin: 'top left'
                      }} 
                      onError={(e) => {
                        console.error('❌ [PDF] Erreur de chargement de l\'iframe:', e)
                        console.error('❌ [PDF] URL problématique:', pdfUrl)
                      }}
                      onLoad={() => {
                        console.log('✅ [PDF] Iframe chargée avec succès:', pdfUrl)
                      }} 
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-gray-500">
                    <div className="text-center">
                      <div className="text-gray-400 mb-2">📄</div>
                      <div>Aucun aperçu disponible</div>
                      <div className="text-xs text-gray-400 mt-1">Le fichier PDF n'a pas été trouvé</div>
                    </div>
                  </div>
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
