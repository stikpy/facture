'use client'

import { useEffect, useRef, useState, useMemo, useCallback, type ChangeEvent } from 'react'
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
  amount_input: string
  vat_code?: string
  vat_rate?: number
  item_indices?: number[] // Indices des articles extraits utilisés dans cette allocation
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
  const [orgVatCodes, setOrgVatCodes] = useState<Array<{ code: string; label: string; rate?: number }>>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [duplicating, setDuplicating] = useState(false)

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
  const [rightPanelTab, setRightPanelTab] = useState<'pdf' | 'invoice'>('pdf') // 'pdf' ou 'invoice'
  const [pdfZoom, setPdfZoom] = useState(100)
  const [pdfRotation, setPdfRotation] = useState(0)
  const [previewWidth, setPreviewWidth] = useState(33.33) // % de la largeur
  const [isResizing, setIsResizing] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)
  const [selectedItemsForAllocation, setSelectedItemsForAllocation] = useState<Set<number>>(new Set())
  
  // Calculer quels articles sont déjà ventilés
  const allocatedItemIndices = useMemo(() => {
    const allocated = new Set<number>()
    allocations.forEach((alloc) => {
      if (Array.isArray(alloc.item_indices)) {
        alloc.item_indices.forEach((idx: number) => allocated.add(idx))
      }
    })
    return allocated
  }, [allocations])
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
  
  // Helper pour normaliser le taux de TVA selon le fournisseur
  // Certains fournisseurs utilisent des codes (ex: "1" = 5.5%) au lieu de pourcentages
  const normalizeTaxRate = (extractedRate: number | undefined, supplierName?: string | null): number | null => {
    if (!extractedRate) return null
    
    const rate = Number(extractedRate)
    
    // Mapping spécifique par fournisseur pour les codes TVA
    // Exemple: code "1" = 5.5% pour certains fournisseurs
    const supplierVatMappings: Record<string, Record<number, number>> = {
      // Ajouter ici les mappings spécifiques par nom de fournisseur
      // Exemple: "NOM_FOURNISSEUR": { 1: 5.5, 2: 10, 3: 20 }
    }
    
    // Mapping par défaut pour les codes TVA courants (si le fournisseur n'a pas de mapping spécifique)
    // Les codes 1, 2, 3 correspondent souvent aux taux réduit, intermédiaire, normal
    const defaultVatCodeMapping: Record<number, number> = {
      1: 5.5,  // Code 1 = Taux réduit 5.5%
      2: 10,   // Code 2 = Taux intermédiaire 10%
      3: 20    // Code 3 = Taux normal 20%
    }
    
    // Vérifier si le fournisseur a un mapping spécifique
    if (supplierName && supplierVatMappings[supplierName] && supplierVatMappings[supplierName][rate]) {
      return supplierVatMappings[supplierName][rate]
    }
    
    // Si le taux est exactement 1, 2 ou 3 (codes courants), utiliser le mapping par défaut
    if (rate === 1 || rate === 2 || rate === 3) {
      return defaultVatCodeMapping[rate] ?? null
    }
    
    // Si le taux est un code numérique faible (entre 0 et 1) et non un pourcentage réel
    if (rate > 0 && rate < 1) {
      // C'est probablement un code, pas un pourcentage
      return null
    }
    
    // Si le taux est entre 0.1% et 2%, c'est suspect (très rare en France)
    // Les taux courants sont 0%, 2.1%, 5.5%, 10%, 20%
    if (rate > 0 && rate < 2.1) {
      return null // Ne pas afficher un taux suspect
    }
    
    // Taux normalisé (déjà en pourcentage)
    return rate
  }
  
  // Helper pour calculer HT et TTC en fonction de is_ht
  const calculateItemAmounts = (item: any) => {
    const totalPrice = Number(item.total_price || 0)
    const normalizedRate = normalizeTaxRate(item.tax_rate, invoice?.extracted_data?.supplier_name)
    const taxRate = (normalizedRate ?? Number(item.tax_rate || 0)) / 100
    const isHT = item.is_ht !== false // Par défaut true si non défini (compatibilité)
    
    let itemHT: number
    let itemTTC: number
    let itemTVA: number
    
    if (isHT) {
      // total_price est déjà HT
      itemHT = totalPrice
      itemTTC = totalPrice * (1 + taxRate)
      itemTVA = itemTTC - itemHT
    } else {
      // total_price est TTC
      itemTTC = totalPrice
      itemHT = totalPrice / (1 + taxRate)
      itemTVA = itemTTC - itemHT
    }
    
    return {
      ht: round2(itemHT),
      ttc: round2(itemTTC),
      tva: round2(itemTVA),
      normalizedTaxRate: normalizedRate // Retourner le taux normalisé pour l'affichage
    }
  }
  
  const vatRateFromCode = useCallback((code?: string) => {
    if (!code) return 0
    try {
      const fromOrg = orgVatCodes.find(v => v.code === code)
      if (fromOrg) return Number(fromOrg.rate || 0)
      if (findVatByCode && typeof findVatByCode === 'function') {
    const v = findVatByCode(code)
    return v?.rate ?? 0
  }
    } catch (error) {
      console.error('Error in vatRateFromCode:', error)
    }
    return 0
  }, [orgVatCodes])
  const taxForRow = (row: AllocationFormRow) => {
    const rate = row.vat_rate != null ? Number(row.vat_rate) : vatRateFromCode(row.vat_code)
    return round2((Number(row.amount || 0) * rate) / 100)
  }
  const totalForRow = (row: AllocationFormRow) => round2(Number(row.amount || 0) + taxForRow(row))
  const normalizeDecimalInput = (value: string) => {
    if (value == null) return ''
    let sanitized = value.replace(/\s+/g, '')
    sanitized = sanitized.replace(/,/g, '.')
    sanitized = sanitized.replace(/[^0-9.-]/g, '')
    if (sanitized.startsWith('.')) sanitized = `0${sanitized}`
    const firstDot = sanitized.indexOf('.')
    if (firstDot !== -1) {
      sanitized = sanitized.slice(0, firstDot + 1) + sanitized.slice(firstDot + 1).replace(/\./g, '')
    }
    const minusIndex = sanitized.indexOf('-')
    if (minusIndex > 0) {
      sanitized = sanitized.replace(/-/g, '')
    } else if (minusIndex === 0) {
      sanitized = `-${sanitized.slice(1).replace(/-/g, '')}`
    }
    if (sanitized === '-') return ''
    return sanitized
  }
  const parseDecimalInput = (value: string): number | undefined => {
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const formatDecimalForInput = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return ''
    return normalizeDecimalInput(String(value))
  }
  const isEditableElement = (element: Element | null) => {
    if (!element) return false
    const el = element as HTMLElement
    if (el.isContentEditable) return true
    const tag = el.tagName?.toLowerCase()
    if (!tag) return false
    if (['input', 'textarea', 'select'].includes(tag)) return true
    const role = el.getAttribute('role')
    return role === 'textbox' || role === 'combobox'
  }

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
        setSubtotal(formatDecimalForInput(data.invoice?.extracted_data?.subtotal))
        setTaxAmount(formatDecimalForInput(data.invoice?.extracted_data?.tax_amount))
        setTotalAmount(formatDecimalForInput(data.invoice?.extracted_data?.total_amount))
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
        const incoming = (data.allocations || []).map((a: any) => {
          const amountInput = formatDecimalForInput(a.amount)
          const amountNumber = parseDecimalInput(amountInput) ?? 0
          return {
          account_code: a.account_code || '',
          label: a.label || '',
            amount: amountNumber,
            amount_input: amountInput,
          vat_code: a.vat_code || '',
          vat_rate: a.vat_rate != null ? Number(a.vat_rate) : undefined,
            item_indices: Array.isArray(a.item_indices) ? a.item_indices : [],
          }
        })
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
          subtotal: formatDecimalForInput(data.invoice?.extracted_data?.subtotal),
          taxAmount: formatDecimalForInput(data.invoice?.extracted_data?.tax_amount),
          totalAmount: formatDecimalForInput(data.invoice?.extracted_data?.total_amount),
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

  // Charger les comptes de l'organisation et les codes TVA pour enrichir la liste
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
    const loadOrgVat = async () => {
      try {
        const res = await fetch('/api/orgs/vat')
        const data = await res.json()
        if (res.ok) {
          setOrgVatCodes((data.vatCodes || []).map((v: any) => ({ code: v.code, label: v.label, rate: Number(v.rate) })))
        }
      } catch {}
    }
    loadOrgAccounts()
    loadOrgVat()
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
      const target = (e.target as Element) || null
      if (isEditableElement(target) || isEditableElement(document.activeElement)) return
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

  const addRow = () => setAllocations((prev) => {
    const baseHt = (parseDecimalInput(subtotal) ?? Number(invoice?.extracted_data?.subtotal || 0))
    const usedHt = prev.reduce((sum, r) => sum + Number(r.amount || 0), 0)
    const remaining = round2(Math.max(Number(baseHt || 0) - usedHt, 0))
    const amount_input = remaining > 0 ? String(remaining) : ''
    return [...prev, { account_code: '', label: '', amount: remaining, amount_input }]
  })
  const removeRow = (idx: number) => setAllocations((prev) => prev.filter((_, i) => i !== idx))
  const updateRow = (idx: number, patch: Partial<AllocationFormRow>) =>
    setAllocations((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))

  // Sauvegarde automatique des propriétés
  const saveProperties = async () => {
    try {
      // Autoriser la sauvegarde même sans supplierId pour saisie manuelle
      const { data: { session } } = await supabase.auth.getSession()
      const subtotalValue = parseDecimalInput(subtotal)
      const taxAmountValue = parseDecimalInput(taxAmount)
      const totalAmountValue = parseDecimalInput(totalAmount)
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
          subtotal: subtotalValue,
          tax_amount: taxAmountValue,
          total_amount: totalAmountValue,
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
            subtotal: subtotalValue ?? prev?.extracted_data?.subtotal,
            tax_amount: taxAmountValue ?? prev?.extracted_data?.tax_amount,
            total_amount: totalAmountValue ?? prev?.extracted_data?.total_amount,
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
      const derived = allocations.map(row => ({
        account_code: row.account_code,
        label: row.label,
        amount: round2(Number(row.amount || 0)),
        vat_code: row.vat_code || '',
        vat_rate: row.vat_rate != null ? Number(row.vat_rate) : vatRateFromCode(row.vat_code),
        item_indices: Array.isArray(row.item_indices) ? row.item_indices : []
      }))
      console.log('🔍 [SAVE] Allocations formatées pour sauvegarde:', derived)

      // Calculer le total HT et TTC des ventilations
      const totalVentileHT = round2(allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0))
      const totalVentileTTC = round2(allocations.reduce((sum, row) => sum + totalForRow(row), 0))
      
      // Calculer le total HT et TTC réel à partir des articles extraits (plus fiable que extracted_data.total_amount)
      let calculatedInvoiceTotalHT = 0
      let calculatedInvoiceTotalTTC = 0
      if (invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items)) {
        invoice.extracted_data.items.forEach((item: any) => {
          const amounts = calculateItemAmounts(item)
          calculatedInvoiceTotalHT += amounts.ht
          calculatedInvoiceTotalTTC += amounts.ttc
        })
      }
      const extractedTotal = Number(invoice?.extracted_data?.total_amount || 0)
      const extractedTax = Number(invoice?.extracted_data?.tax_amount || 0)
      const extractedTotalHT = extractedTotal - extractedTax
      const expectedHT = round2(calculatedInvoiceTotalHT > 0 ? calculatedInvoiceTotalHT : extractedTotalHT)
      const expectedTTC = round2(calculatedInvoiceTotalTTC > 0 ? calculatedInvoiceTotalTTC : extractedTotal)
      
      // Valider que le total HT des ventilations correspond au total HT attendu
      if (Math.abs(totalVentileHT - expectedHT) > 0.01) {
        setError(`La somme des ventilations HT (${totalVentileHT.toFixed(2)} €) doit être égale au total HT calculé (${expectedHT.toFixed(2)} €).`)
        setSaving(false)
        return
      }
      
      // Valider que le total TTC des ventilations correspond au total TTC attendu
      // Cela permet de détecter les erreurs de taux de TVA sélectionnés
      if (Math.abs(totalVentileTTC - expectedTTC) > 0.01) {
        const difference = totalVentileTTC - expectedTTC
        setError(`La somme des ventilations TTC (${totalVentileTTC.toFixed(2)} €) ne correspond pas au total TTC calculé (${expectedTTC.toFixed(2)} €). Différence: ${difference > 0 ? '+' : ''}${difference.toFixed(2)} €. Vérifiez les taux de TVA sélectionnés.`)
        setSaving(false)
        return
      }
      const subtotalValue = parseDecimalInput(subtotal)
      const taxAmountValue = parseDecimalInput(taxAmount)
      const totalAmountValue = parseDecimalInput(totalAmount)
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
          subtotal: subtotalValue,
          tax_amount: taxAmountValue,
          total_amount: totalAmountValue,
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
      let q = (supabase
        .from('suppliers')
        .select('id, code, display_name') as any)
      const orgId = (invoice as any)?.organization_id
      if (orgId) q = q.eq('organization_id', orgId)
      const { data } = await q.order('display_name').limit(20)
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
      let query = (supabase
        .from('suppliers')
        .select('id, code, display_name') as any)
      const orgId = (invoice as any)?.organization_id
      if (orgId) query = query.eq('organization_id', orgId)
      query = query.order('display_name').limit(20)
      
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
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={subtotal}
                      onChange={(e) => setSubtotal(normalizeDecimalInput(e.target.value))}
                    />
                  ) : (
                  <div className="font-medium">{(invoice?.extracted_data?.subtotal ?? 0).toFixed(2)} €</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Montant de taxe</div>
                  {isEditingProps ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(normalizeDecimalInput(e.target.value))}
                    />
                  ) : (
                  <div className="font-medium">{(invoice?.extracted_data?.tax_amount ?? 0).toFixed(2)} €</div>
                  )}
                </div>
                <div>
                  <div className="text-gray-500">Montant total</div>
                  {isEditingProps ? (
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(normalizeDecimalInput(e.target.value))}
                    />
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
                          onChange={(e: ChangeEvent<HTMLInputElement>) => {
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
                  <Input value={description} onChange={(e: ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} placeholder="Description de la facture" />
                </div>
              </div>
              
              {/* Section Articles et Duplication */}
              {invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items) && invoice.extracted_data.items.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-gray-700">Articles de la facture ({invoice.extracted_data.items.length})</h3>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-xs"
                        disabled={retrying || invoice?.status === 'processing' || invoice?.status === 'queued'}
                        onClick={async () => {
                          try {
                            setRetrying(true)
                            setError(null)
                            const { data: { session } } = await supabase.auth.getSession()
                            const token = session?.access_token || ''
                            
                            const addRes = await fetch('/api/queue/add', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {})
                              },
                              body: JSON.stringify({ invoiceId: params.id })
                            })
                            
                            const addData = await addRes.json()
                            if (!addRes.ok) {
                              throw new Error(addData.error || 'Impossible de relancer l\'extraction')
                            }
                            
                            setInvoice((prev: any) => prev ? { ...prev, status: 'queued' } : prev)
                            
                            const poll = async () => {
                              try {
                                const statusRes = await fetch(`/api/queue/status?invoiceId=${params.id}`, {
                                  headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                })
                                const statusData = await statusRes.json()
                                if (statusData.status === 'completed' || statusData.status === 'failed') {
                                  const rr = await fetch(`/api/invoices/${params.id}`, {
                                    headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                  })
                                  const dd = await rr.json()
                                  if (rr.ok) {
                                    setInvoice(dd.invoice)
                                    setRetrying(false)
                                  }
                                } else if (statusData.status === 'processing') {
                                  setInvoice((prev: any) => prev ? { ...prev, status: 'processing' } : prev)
                                  setTimeout(poll, 4000)
                                } else {
                                  setTimeout(poll, 4000)
                                }
                              } catch {}
                            }
                            poll()
                          } catch (e: any) {
                            setError(e.message)
                            setRetrying(false)
                          }
                        }}
                      >
                        {retrying || invoice?.status === 'processing' || invoice?.status === 'queued' 
                          ? '⏳ Extraction...' 
                          : '🔄 Relancer l\'extraction'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setSelectedItems(new Set())
                          setShowDuplicateModal(true)
                        }}
                      >
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                        Dupliquer avec sélection
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {invoice.extracted_data.items.map((item: any, idx: number) => {
                      const isAllocated = allocatedItemIndices.has(idx)
                      return (
                        <div 
                          key={idx} 
                          className={`text-xs rounded p-2 border ${
                            isAllocated 
                              ? 'bg-green-50 border-green-300 opacity-75' 
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-gray-900">{item.description || `Article ${idx + 1}`}</div>
                              {item.reference && (
                                <div className="text-xs text-gray-500 mt-0.5">Réf: {item.reference}</div>
                              )}
                            </div>
                            {isAllocated && (
                              <span className="text-xs text-green-700 font-medium" title="Déjà ventilé">
                                ✓ Ventilé
                              </span>
                            )}
                          </div>
                          <div className="flex justify-between text-gray-600 mt-1">
                            <span>Qté: {item.quantity || 1} × {Number(item.unit_price || 0).toFixed(2)} €</span>
                            <span className="font-semibold">{Number(item.total_price || 0).toFixed(2)} €</span>
                          </div>
                          {(() => {
                            const normalizedRate = normalizeTaxRate(item.tax_rate, invoice?.extracted_data?.supplier_name)
                            return normalizedRate !== null ? (
                              <div className="text-gray-500 mt-0.5">TVA: {normalizedRate.toFixed(2)}%</div>
                            ) : null
                          })()}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white shadow rounded p-4" data-section="ventilation">
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
                            const aOrg = orgAccounts.find(p => p.code === (row.account_code || ''))
                            if (aOrg) return `${aOrg.code} — ${aOrg.label}`
                            const a = HOTEL_RESTAURANT_ACCOUNTS.find(p => p.code === (row.account_code || ''))
                            return a ? `${a.code} — ${a.label}` : 'Sélectionner un compte'
                          })()}
                          onChange={(e) => updateRow(idx, { account_code: e.target.value })}
                        >
                          <option value="" className="text-gray-400">Sélectionner un compte</option>
                          {orgAccounts.length > 0 ? (
                            <optgroup label="Comptes organisation">
                              {orgAccounts.map((a) => (
                                <option key={`org-${a.code}`} value={a.code}>{a.code} - {a.label}</option>
                              ))}
                            </optgroup>
                          ) : (
                            <>
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
                            </>
                          )}
                        </select>
                      </div>

                      {/* Libellé */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
                        <Input 
                          value={row.label} 
                          onChange={(e: ChangeEvent<HTMLInputElement>) => updateRow(idx, { label: e.target.value })}
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
                            const vOrg = orgVatCodes.find(p => p.code === (row.vat_code || ''))
                            if (vOrg) return `${vOrg.code} — ${vOrg.label} (${vOrg.rate}%)`
                            const v = VAT_PRESETS.find(p => p.code === (row.vat_code || ''))
                            return v ? `${v.code} — ${v.label} (${v.rate}%)` : 'Sans TVA'
                          })()}
                          onChange={(e) => {
                            const newVatCode = e.target.value
                            const newVatRate = vatRateFromCode(newVatCode)
                            updateRow(idx, { vat_code: newVatCode, vat_rate: newVatRate })
                          }}
                        >
                          <option value="" className="text-gray-400">Sans TVA</option>
                          {orgVatCodes.length > 0 ? (
                            <optgroup label="Codes TVA organisation">
                              {orgVatCodes.map((v) => (
                                <option key={`org-vat-${v.code}`} value={v.code}>{v.code} - {v.label}{v.rate!=null?` (${v.rate}%)`:''}</option>
                              ))}
                            </optgroup>
                          ) : (
                            <>
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
                            </>
                          )}
                        </select>
                      </div>

                      {/* Montant HT */}
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Montant HT</label>
                        <div className="relative">
                          <Input 
                            type="text"
                            inputMode="decimal"
                            value={row.amount_input}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => {
                              const normalized = normalizeDecimalInput(e.target.value)
                              const parsed = parseDecimalInput(normalized)
                              updateRow(idx, { amount_input: normalized, amount: parsed ?? 0 })
                            }}
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
                      <span className="font-medium text-gray-700">Total ventilé (HT):</span>
                    <span className="text-lg font-semibold text-gray-900">
                        {(() => {
                          // Calculer le total HT des ventilations (somme des amount)
                          const totalHT = allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0)
                          const totalTTC = allocations.reduce((sum, row) => sum + totalForRow(row), 0)
                          const totalTVA = totalTTC - totalHT
                          
                          // Log détaillé des ventilations
                          console.log('📊 [VENTILATION] === RÉCAPITULATIF DES VENTILATIONS ===')
                          allocations.forEach((row, idx) => {
                            const itemIndices = Array.isArray(row.item_indices) ? row.item_indices : []
                            const itemsDetails = itemIndices.map((itemIdx: number) => {
                              const item = invoice?.extracted_data?.items?.[itemIdx]
                              if (!item) return null
                              const amounts = calculateItemAmounts(item)
                              return {
                                index: itemIdx,
                                description: item.description || `Article ${itemIdx + 1}`,
                                quantity: Number(item.quantity || 1),
                                unit_price: Number(item.unit_price || 0),
                                total_price: amounts.ttc,
                                tax_rate: Number(item.tax_rate || 0),
                                calculatedHT: amounts.ht,
                                calculatedTVA: amounts.tva
                              }
                            }).filter(Boolean)
                            
                            const rowHT = Number(row.amount || 0)
                            const rowTVA = taxForRow(row)
                            const rowTTC = totalForRow(row)
                            
                            console.log(`📊 [VENTILATION] Ligne ${idx + 1}:`, {
                              compte: row.account_code,
                              libellé: row.label,
                              'HT (€)': rowHT.toFixed(2),
                              'TVA (€)': rowTVA.toFixed(2),
                              'TTC (€)': rowTTC.toFixed(2),
                              'TVA (%)': row.vat_rate?.toFixed(2) || row.vat_code || 'N/A',
                              'Articles associés': itemsDetails.length > 0 ? itemsDetails.map((i: any) => ({
                                description: i.description,
                                'HT (€)': i.calculatedHT.toFixed(2),
                                'TVA (€)': i.calculatedTVA.toFixed(2),
                                'TTC (€)': i.total_price.toFixed(2),
                                'TVA (%)': i.tax_rate.toFixed(2)
                              })) : 'Aucun (saisie manuelle)',
                              'item_indices': itemIndices
                            })
                            
                            if (itemsDetails.length > 0) {
                              const itemsTotalHT = itemsDetails.reduce((sum: number, item: any) => sum + item.calculatedHT, 0)
                              const itemsTotalTTC = itemsDetails.reduce((sum: number, item: any) => sum + item.total_price, 0)
                              console.log(`📊 [VENTILATION]   → Somme HT des articles: ${itemsTotalHT.toFixed(2)} € (devrait correspondre au HT de la ligne: ${rowHT.toFixed(2)} €)`)
                              console.log(`📊 [VENTILATION]   → Somme TTC des articles: ${itemsTotalTTC.toFixed(2)} € (devrait correspondre au TTC de la ligne: ${rowTTC.toFixed(2)} €)`)
                              console.log(`📊 [VENTILATION]   → Différence HT: ${(rowHT - itemsTotalHT).toFixed(2)} €`)
                              console.log(`📊 [VENTILATION]   → Différence TTC: ${(rowTTC - itemsTotalTTC).toFixed(2)} €`)
                            }
                          })
                          
                          // Calculer le total réel à partir des articles extraits (en HT)
                          let calculatedInvoiceTotalHT = 0
                          if (invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items)) {
                            invoice.extracted_data.items.forEach((item: any) => {
                              const amounts = calculateItemAmounts(item)
                              calculatedInvoiceTotalHT += amounts.ht
                            })
                          }
                          const invoiceTotal = Number(invoice?.extracted_data?.total_amount || 0)
                          const invoiceTotalHT = calculatedInvoiceTotalHT > 0 ? calculatedInvoiceTotalHT : (invoiceTotal - Number(invoice?.extracted_data?.tax_amount || 0))
                          
                          console.log('📊 [VENTILATION] Total ventilé (HT):', totalHT.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Total ventilé (TTC):', totalTTC.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Total ventilé (TVA):', totalTVA.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Total facture (extrait):', invoiceTotal.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Total facture HT (calculé depuis articles):', calculatedInvoiceTotalHT.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Total facture HT (utilisé):', invoiceTotalHT.toFixed(2) + ' €')
                          console.log('📊 [VENTILATION] Différence HT:', (invoiceTotalHT - totalHT).toFixed(2) + ' €')
                          
                          // Vérifier si la différence correspond à la TVA attendue (cas normal: articles en HT, total extrait en TTC)
                          const difference = Math.abs(calculatedInvoiceTotalHT - invoiceTotal)
                          const extractedTax = Number(invoice?.extracted_data?.tax_amount || 0)
                          const calculatedTax = invoiceTotal - calculatedInvoiceTotalHT
                          const isTaxDifference = Math.abs(difference - extractedTax) < 0.02 || Math.abs(difference - calculatedTax) < 0.02
                          
                          // Afficher l'avertissement seulement si la différence ne correspond pas à la TVA
                          if (difference > 0.01 && calculatedInvoiceTotalHT > 0 && !isTaxDifference) {
                            console.log('⚠️ [VENTILATION] ATTENTION: Le total extrait ne correspond pas à la somme des articles!')
                            console.log('⚠️ [VENTILATION]   → Utilisez le total calculé (' + calculatedInvoiceTotalHT.toFixed(2) + ' € HT) pour les ventilations.')
                          } else if (difference > 0.01 && isTaxDifference) {
                            console.log('ℹ️ [VENTILATION] La différence correspond à la TVA (normal: articles en HT, total extrait en TTC)')
                          }
                          console.log('📊 [VENTILATION] === FIN RÉCAPITULATIF ===')
                          return totalHT.toFixed(2)
                        })()} €
                      </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>Total ventilé (TTC):</span>
                    <span>{allocations.reduce((sum, row) => sum + totalForRow(row), 0).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-500 mt-1">
                    <span>Total facture (TTC):</span>
                    <span>
                      {(() => {
                        // Calculer le total TTC réel à partir des articles extraits
                        let calculatedTotalTTC = 0
                        if (invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items)) {
                          invoice.extracted_data.items.forEach((item: any) => {
                            const amounts = calculateItemAmounts(item)
                            calculatedTotalTTC += amounts.ttc
                          })
                        }
                        const extractedTotal = Number(invoice?.extracted_data?.total_amount || 0)
                        const displayTotalTTC = calculatedTotalTTC > 0 ? calculatedTotalTTC : extractedTotal
                        return displayTotalTTC.toFixed(2)
                      })()} €
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-gray-600 mt-1">
                    <span>Total facture (HT):</span>
                    <span className="font-medium">
                      {(() => {
                        // Calculer le total HT réel à partir des articles extraits
                        let calculatedTotalHT = 0
                        if (invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items)) {
                          invoice.extracted_data.items.forEach((item: any) => {
                            const amounts = calculateItemAmounts(item)
                            calculatedTotalHT += amounts.ht
                          })
                        }
                        const extractedTotal = Number(invoice?.extracted_data?.total_amount || 0)
                        const extractedTax = Number(invoice?.extracted_data?.tax_amount || 0)
                        const extractedTotalHT = extractedTotal - extractedTax
                        const displayTotalHT = calculatedTotalHT > 0 ? calculatedTotalHT : extractedTotalHT
                        const difference = Math.abs(calculatedTotalHT - extractedTotal)
                        const calculatedTax = extractedTotal - calculatedTotalHT
                        const isTaxDifference = Math.abs(difference - extractedTax) < 0.02 || Math.abs(difference - calculatedTax) < 0.02
                        // Afficher l'avertissement seulement si la différence ne correspond pas à la TVA
                        const hasDifference = calculatedTotalHT > 0 && difference > 0.01 && !isTaxDifference
                        
                        return (
                          <>
                            {displayTotalHT.toFixed(2)} €
                            {hasDifference && (
                              <span className="text-orange-600 text-xs ml-1">⚠️ (extrait: {extractedTotal.toFixed(2)} € TTC)</span>
                            )}
                          </>
                        )
                      })()}
                    </span>
                  </div>
                  {(() => {
                    // Calculer le total HT et TTC des ventilations
                    const totalVentileHT = allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0)
                    const totalVentileTTC = allocations.reduce((sum, row) => sum + totalForRow(row), 0)
                    
                    // Calculer le total HT et TTC réel à partir des articles extraits
                    let calculatedTotalHT = 0
                    let calculatedTotalTTC = 0
                    if (invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items)) {
                      invoice.extracted_data.items.forEach((item: any) => {
                        const amounts = calculateItemAmounts(item)
                        calculatedTotalHT += amounts.ht
                        calculatedTotalTTC += amounts.ttc
                      })
                    }
                    const extractedTotal = Number(invoice?.extracted_data?.total_amount || 0)
                    const extractedTax = Number(invoice?.extracted_data?.tax_amount || 0)
                    const extractedTotalHT = extractedTotal - extractedTax
                    const expectedTotalHT = calculatedTotalHT > 0 ? calculatedTotalHT : extractedTotalHT
                    const expectedTotalTTC = calculatedTotalTTC > 0 ? calculatedTotalTTC : extractedTotal
                    
                    // Vérifier si la différence correspond à la TVA attendue
                    const difference = Math.abs(calculatedTotalHT - extractedTotal)
                    const calculatedTax = extractedTotal - calculatedTotalHT
                    const isTaxDifference = Math.abs(difference - extractedTax) < 0.02 || Math.abs(difference - calculatedTax) < 0.02
                    const hasRealDifference = calculatedTotalHT > 0 && difference > 0.01 && !isTaxDifference
                    
                    const hasHTDifference = Math.abs(totalVentileHT - expectedTotalHT) > 0.01
                    const hasTTCDifference = Math.abs(totalVentileTTC - expectedTotalTTC) > 0.01
                    
                    if (hasHTDifference || hasTTCDifference) {
                      return (
                    <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-3 py-2 rounded">
                          {hasHTDifference && (
                            <div>
                              ⚠️ La somme des ventilations HT ({totalVentileHT.toFixed(2)} €) ne correspond pas au total calculé HT ({expectedTotalHT.toFixed(2)} €)
                    </div>
                  )}
                          {hasTTCDifference && (
                            <div className={hasHTDifference ? 'mt-2' : ''}>
                              ⚠️ La somme des ventilations TTC ({totalVentileTTC.toFixed(2)} €) ne correspond pas au total calculé TTC ({expectedTotalTTC.toFixed(2)} €). Vérifiez les taux de TVA sélectionnés.
                            </div>
                          )}
                          {hasRealDifference && (
                            <div className="mt-1 text-xs">
                              Le total extrait ({extractedTotal.toFixed(2)} € TTC) ne correspond pas à la somme des articles ({calculatedTotalHT.toFixed(2)} € HT). Utilisez le total calculé.
                            </div>
                          )}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              )}

              <div className="hidden lg:flex justify-end mt-4 pt-4 border-t border-gray-200">
                <Button onClick={save} disabled={saving || !isDirty} size="lg">
                  {saving ? 'Enregistrement en cours…' : 'Enregistrer la facture'}
                </Button>
              </div>
              {/* Barre d'action mobile */}
              <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t z-30">
                <div className="max-w-4xl mx-auto px-3 py-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Total ventilé (HT):</span>
                      <span>{allocations.reduce((s,r)=> s + Number(r.amount || 0), 0).toFixed(2)} €</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Facture:</span>
                      <span className="font-medium">{invoiceTotal.toFixed(2)} €</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pdfUrl && (
                      <Button variant="outline" size="sm" onClick={()=>setShowMobilePreview(true)}>Aperçu</Button>
                    )}
                    {pdfUrl && (
                      <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Télécharger</a>
                    )}
                    <Button onClick={save} disabled={saving || !isDirty} size="sm">{saving ? '...':'Enregistrer'}</Button>
                  </div>
                </div>
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
                  {/* Onglets */}
                  <div className="flex items-center border-b border-gray-200 mb-2">
                    <button
                      onClick={() => setRightPanelTab('pdf')}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        rightPanelTab === 'pdf'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      📄 Aperçu PDF
                    </button>
                    <button
                      onClick={() => setRightPanelTab('invoice')}
                      className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                        rightPanelTab === 'invoice'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                      }`}
                    >
                      📋 Facture extraite
                    </button>
                    <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)} className="ml-2">✕</Button>
                  </div>

                  {/* Contenu selon l'onglet */}
                  {rightPanelTab === 'pdf' ? (
                    <>
                      {/* Contrôles PDF */}
                      <div className="flex items-center justify-between mb-2 px-2">
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
                </div>
                      </div>
                      {/* PDF Viewer */}
                {pdfUrl ? (
                        <div className="w-full h-[calc(100%-100px)] overflow-auto">
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
                        <div className="h-[calc(100%-100px)] flex items-center justify-center text-sm text-gray-500">
                    <div className="text-center">
                      <div className="text-gray-400 mb-2">📄</div>
                      <div>Aucun aperçu disponible</div>
                      <div className="text-xs text-gray-400 mt-1">Le fichier PDF n'a pas été trouvé</div>
                    </div>
                  </div>
                      )}
                    </>
                  ) : (
                    /* Vue Facture reconstituée */
                    <div className="h-[calc(100%-50px)] overflow-y-auto">
                      {invoice?.extracted_data?.items && Array.isArray(invoice.extracted_data.items) && invoice.extracted_data.items.length > 0 ? (
                        <div className="space-y-3 p-2">
                          {/* En-tête de la facture */}
                          <div className="border-b border-gray-200 pb-3 mb-3">
                            <div className="text-xs text-gray-500 mb-1">Fournisseur</div>
                            <div className="font-semibold text-sm">{invoice.extracted_data.supplier_name || '—'}</div>
                            {invoice.extracted_data.invoice_number && (
                              <>
                                <div className="text-xs text-gray-500 mt-2 mb-1">N° facture</div>
                                <div className="text-sm">{invoice.extracted_data.invoice_number}</div>
                              </>
                            )}
                            {invoice.extracted_data.invoice_date && (
                              <>
                                <div className="text-xs text-gray-500 mt-2 mb-1">Date</div>
                                <div className="text-sm">{formatShortDate(invoice.extracted_data.invoice_date)}</div>
                              </>
                )}
              </div>

                          {/* Articles avec checkboxes */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-gray-700">
                                Articles ({invoice.extracted_data.items.length})
                                {(() => {
                                  const unallocatedCount = invoice.extracted_data.items.filter((_: any, idx: number) => !allocatedItemIndices.has(idx)).length
                                  return unallocatedCount > 0 ? (
                                    <span className="ml-2 text-orange-600 font-bold">
                                      • {unallocatedCount} à ventiler
                                    </span>
                                  ) : null
                                })()}
            </div>
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const unallocatedCount = invoice.extracted_data.items.filter((_: any, idx: number) => !allocatedItemIndices.has(idx)).length
                                  return unallocatedCount > 0 ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() => {
                                        // Sélectionner tous les articles non ventilés
                                        const allUnallocatedIndices = new Set<number>(
                                          invoice.extracted_data.items
                                            .map((_: any, idx: number) => idx)
                                            .filter((idx: number) => !allocatedItemIndices.has(idx))
                                        )
                                        setSelectedItemsForAllocation(allUnallocatedIndices)
                                      }}
                                    >
                                      ✓ Tout sélectionner
                                    </Button>
                                  ) : null
                                })()}
                                <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                disabled={retrying || invoice?.status === 'processing' || invoice?.status === 'queued'}
                                onClick={async () => {
                                  try {
                                    setRetrying(true)
                                    setError(null)
                                    const { data: { session } } = await supabase.auth.getSession()
                                    const token = session?.access_token || ''
                                    
                                    const addRes = await fetch('/api/queue/add', {
                                      method: 'POST',
                                      headers: {
                                        'Content-Type': 'application/json',
                                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                                      },
                                      body: JSON.stringify({ invoiceId: params.id })
                                    })
                                    
                                    const addData = await addRes.json()
                                    if (!addRes.ok) {
                                      throw new Error(addData.error || 'Impossible de relancer l\'extraction')
                                    }
                                    
                                    setInvoice((prev: any) => prev ? { ...prev, status: 'queued' } : prev)
                                    
                                    const poll = async () => {
                                      try {
                                        const statusRes = await fetch(`/api/queue/status?invoiceId=${params.id}`, {
                                          headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                        })
                                        const statusData = await statusRes.json()
                                        if (statusData.status === 'completed' || statusData.status === 'failed') {
                                          const rr = await fetch(`/api/invoices/${params.id}`, {
                                            headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                          })
                                          const dd = await rr.json()
                                          if (rr.ok) {
                                            setInvoice(dd.invoice)
                                            setRetrying(false)
                                          }
                                        } else if (statusData.status === 'processing') {
                                          setInvoice((prev: any) => prev ? { ...prev, status: 'processing' } : prev)
                                          setTimeout(poll, 4000)
                                        } else {
                                          setTimeout(poll, 4000)
                                        }
                                      } catch {}
                                    }
                                    poll()
                                  } catch (e: any) {
                                    setError(e.message)
                                    setRetrying(false)
                                  }
                                }}
                              >
                                {retrying || invoice?.status === 'processing' || invoice?.status === 'queued' 
                                  ? '⏳ Extraction...' 
                                  : '🔄 Relancer'}
                              </Button>
                              </div>
                            </div>
                            
                            {/* Articles non ventilés */}
                            {(() => {
                              const unallocatedItems = invoice.extracted_data.items
                                .map((item: any, idx: number) => ({ item, idx }))
                                .filter(({ idx }: { idx: number }) => !allocatedItemIndices.has(idx))
                              
                              if (unallocatedItems.length === 0) {
                                return null
                              }
                              
                              return (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded">
                                      ⚠️ {unallocatedItems.length} article{unallocatedItems.length > 1 ? 's' : ''} à ventiler
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-xs h-7"
                                      onClick={() => {
                                        // Sélectionner tous les articles non ventilés
                                        const allUnallocatedIndices = new Set<number>(
                                          invoice.extracted_data.items
                                            .map((_: any, idx: number) => idx)
                                            .filter((idx: number) => !allocatedItemIndices.has(idx))
                                        )
                                        setSelectedItemsForAllocation(allUnallocatedIndices)
                                      }}
                                    >
                                      ✓ Tout sélectionner
                                    </Button>
                                  </div>
                                  {unallocatedItems.map(({ item, idx }: { item: any, idx: number }) => {
                                    const isSelected = selectedItemsForAllocation.has(idx)
                                    const amounts = calculateItemAmounts(item)
                                    const itemHT = amounts.ht
                                    const itemTTC = amounts.ttc
                                    
                                    return (
                                      <div
                                        key={idx}
                                        className={`border rounded-lg p-3 transition-all ${
                                          isSelected
                                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                      >
                                        <div className="flex items-start gap-3">
                                          <div className="mt-1">
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => {
                                                const newSet = new Set(selectedItemsForAllocation)
                                                if (isSelected) {
                                                  newSet.delete(idx)
                                                } else {
                                                  newSet.add(idx)
                                                }
                                                setSelectedItemsForAllocation(newSet)
                                              }}
                                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-gray-900 mb-1">
                                              {item.description || `Article ${idx + 1}`}
                                            </div>
                                            {item.reference && (
                                              <div className="text-xs text-gray-500 mb-2">Réf: {item.reference}</div>
                                            )}
                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                              <div>
                                                <span className="text-gray-500">Qté:</span>
                                                <div className="font-semibold">{item.quantity || 1}</div>
                                              </div>
                                              <div>
                                                <span className="text-gray-500">P.U.:</span>
                                                <div className="font-semibold">{Number(item.unit_price || 0).toFixed(2)} €</div>
                                              </div>
                                              <div>
                                                <span className="text-gray-500">HT:</span>
                                                <div className="font-semibold">{round2(itemHT).toFixed(2)} €</div>
                                              </div>
                                            </div>
                                            {(() => {
                                              const normalizedRate = normalizeTaxRate(item.tax_rate, invoice?.extracted_data?.supplier_name)
                                              return normalizedRate !== null ? (
                                                <div className="mt-1 text-xs text-gray-500">TVA: {normalizedRate.toFixed(2)}%</div>
                                              ) : null
                                            })()}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                            
                            {/* Articles ventilés */}
                            {(() => {
                              const allocatedItems = invoice.extracted_data.items
                                .map((item: any, idx: number) => ({ item, idx }))
                                .filter(({ idx }: { idx: number }) => allocatedItemIndices.has(idx))
                              
                              if (allocatedItems.length === 0) {
                                return null
                              }
                              
                              return (
                                <div className="space-y-2 mt-4">
                                  <div className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded">
                                    ✓ {allocatedItems.length} article{allocatedItems.length > 1 ? 's' : ''} ventilé{allocatedItems.length > 1 ? 's' : ''}
                                  </div>
                                  {allocatedItems.map(({ item, idx }: { item: any, idx: number }) => {
                                    const amounts = calculateItemAmounts(item)
                                    const itemHT = amounts.ht
                                    const itemTTC = amounts.ttc
                                    
                                    return (
                                      <div
                                        key={idx}
                                        className="border border-green-300 bg-green-50 rounded-lg p-3 opacity-75"
                                      >
                                        <div className="flex items-start gap-3">
                                          <div className="mt-1">
                                            <span className="text-xs text-green-700 font-medium" title="Déjà ventilé">
                                              ✓
                                            </span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm text-gray-900 mb-1">
                                              {item.description || `Article ${idx + 1}`}
                                            </div>
                                            {item.reference && (
                                              <div className="text-xs text-gray-500 mb-2">Réf: {item.reference}</div>
                                            )}
                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                              <div>
                                                <span className="text-gray-500">Qté:</span>
                                                <div className="font-semibold">{item.quantity || 1}</div>
                                              </div>
                                              <div>
                                                <span className="text-gray-500">P.U.:</span>
                                                <div className="font-semibold">{Number(item.unit_price || 0).toFixed(2)} €</div>
                                              </div>
                                              <div>
                                                <span className="text-gray-500">HT:</span>
                                                <div className="font-semibold">{round2(itemHT).toFixed(2)} €</div>
                                              </div>
                                            </div>
                                            {(() => {
                                              const normalizedRate = normalizeTaxRate(item.tax_rate, invoice?.extracted_data?.supplier_name)
                                              return normalizedRate !== null ? (
                                                <div className="mt-1 text-xs text-gray-500">TVA: {normalizedRate.toFixed(2)}%</div>
                                              ) : null
                                            })()}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>

                          {/* Bouton pour créer une ventilation depuis les articles sélectionnés */}
                          {selectedItemsForAllocation.size > 0 && (
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="text-xs font-semibold text-blue-900 mb-2">
                                {selectedItemsForAllocation.size} article{selectedItemsForAllocation.size > 1 ? 's' : ''} sélectionné{selectedItemsForAllocation.size > 1 ? 's' : ''}
                              </div>
                              <div className="text-xs text-gray-600 mb-3">
                                Total: {(() => {
                                  let totalHT = 0
                                  selectedItemsForAllocation.forEach((idx) => {
                                    const item = invoice.extracted_data.items[idx]
                                    const amounts = calculateItemAmounts(item)
                                    const itemHT = amounts.ht
                                    totalHT += itemHT
                                  })
                                  return totalHT.toFixed(2)
                                })()} € HT
                              </div>
                              <Button
                                size="sm"
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs"
                                onClick={() => {
                                  // Calculer le montant HT total pour les articles sélectionnés
                                  // BASE: On part du HT (et non du TTC) pour les calculs
                                  // Le montant HT reste tel quel, la TVA sera calculée à partir du code TVA choisi
                                  let totalHT = 0
                                  const selectedItemsDetails: Array<{
                                    idx: number
                                    description: string
                                    quantity: number
                                    unit_price: number
                                    total_price: number
                                    tax_rate: number
                                    calculatedHT: number
                                    calculatedTVA: number
                                  }> = []
                                  
                                  selectedItemsForAllocation.forEach((idx) => {
                                    const item = invoice.extracted_data.items[idx]
                                    const amounts = calculateItemAmounts(item)
                                    const itemHT = amounts.ht
                                    const itemTTC = amounts.ttc
                                    const itemTVA = amounts.tva
                                    
                                    totalHT += itemHT
                                    
                                    selectedItemsDetails.push({
                                      idx,
                                      description: item.description || `Article ${idx + 1}`,
                                      quantity: Number(item.quantity || 1),
                                      unit_price: Number(item.unit_price || 0),
                                      total_price: itemTTC,
                                      tax_rate: Number(item.tax_rate || 0),
                                      calculatedHT: itemHT,
                                      calculatedTVA: itemTVA
                                    })
                                  })
                                  
                                  console.log('📊 [VENTILATION] === CRÉATION D\'UNE VENTILATION ===')
                                  console.log('📊 [VENTILATION] Articles sélectionnés:', selectedItemsDetails.map(i => ({
                                    index: i.idx,
                                    description: i.description,
                                    qty: i.quantity,
                                    'PU (€)': i.unit_price.toFixed(2),
                                    'TTC article (€)': i.total_price.toFixed(2),
                                    'HT calculé (€)': i.calculatedHT.toFixed(2),
                                    'TVA calculée (€)': i.calculatedTVA.toFixed(2),
                                    'TVA (%)': i.tax_rate.toFixed(2)
                                  })))
                                  console.log('📊 [VENTILATION] Totaux calculés:')
                                  console.log('📊 [VENTILATION]   - Total HT (somme des HT):', totalHT.toFixed(2) + ' €')
                                  console.log('📊 [VENTILATION]   - Note: Le montant HT reste tel quel, le code TVA doit être choisi manuellement, la TVA sera calculée automatiquement à partir du code TVA choisi')

                                  // Créer une nouvelle ligne de ventilation avec ces montants
                                  // Le montant HT est celui calculé depuis les articles
                                  // Le code TVA doit être choisi par l'utilisateur, la TVA sera calculée automatiquement
                                  const newRow: AllocationFormRow = {
                                    account_code: '',
                                    label: `Articles sélectionnés (${selectedItemsForAllocation.size})`,
                                    amount: round2(totalHT), // Montant HT (BASE) - reste tel quel
                                    amount_input: totalHT.toFixed(2).replace('.', ','),
                                    vat_code: undefined, // L'utilisateur doit choisir le code TVA
                                    vat_rate: undefined, // Ne pas pré-remplir, sera calculé depuis vat_code
                                    item_indices: Array.from(selectedItemsForAllocation) // Sauvegarder les indices des articles utilisés
                                  }
                                  
                                  console.log('📊 [VENTILATION] Ligne créée:', {
                                    label: newRow.label,
                                    'HT (€)': newRow.amount.toFixed(2),
                                    'vat_code': newRow.vat_code || '(à choisir)',
                                    'item_indices': newRow.item_indices
                                  })
                                  console.log('📊 [VENTILATION]   → Le montant HT reste tel quel, la TVA sera calculée à partir du code TVA choisi')
                                  console.log('📊 [VENTILATION] === FIN CRÉATION ===')
                                  
                                  setAllocations([...allocations, newRow])
                                  setSelectedItemsForAllocation(new Set())
                                  
                                  // Scroller vers la section de ventilation
                                  setTimeout(() => {
                                    const ventilationSection = document.querySelector('[data-section="ventilation"]')
                                    if (ventilationSection) {
                                      ventilationSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }
                                  }, 100)
                                }}
                              >
                                ➕ Créer une ventilation
                              </Button>
                            </div>
                          )}

                          {/* Totaux de la facture */}
                          <div className="mt-4 pt-3 border-t border-gray-200">
                            {(() => {
                              // Calculer les totaux réels à partir des articles extraits
                              let calculatedSubtotal = 0
                              let calculatedTax = 0
                              let calculatedTotal = 0
                              
                              if (invoice.extracted_data.items && Array.isArray(invoice.extracted_data.items)) {
                                invoice.extracted_data.items.forEach((item: any) => {
                                  const amounts = calculateItemAmounts(item)
                                  calculatedSubtotal += amounts.ht
                                  calculatedTax += amounts.tva
                                  calculatedTotal += amounts.ttc
                                })
                              }
                              
                              const extractedSubtotal = Number(invoice.extracted_data.subtotal || 0)
                              const extractedTax = Number(invoice.extracted_data.tax_amount || 0)
                              const extractedTotal = Number(invoice.extracted_data.total_amount || 0)
                              
                              // Afficher les totaux calculés (plus fiables) avec indication si différent de extracted_data
                              const hasDifference = Math.abs(calculatedTotal - extractedTotal) > 0.01
                              
                              return (
                                <>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-600">Sous-total HT:</span>
                                    <span className="font-semibold">
                                      {calculatedSubtotal.toFixed(2)} €
                                      {hasDifference && extractedSubtotal > 0 && (
                                        <span className="text-gray-400 ml-1">(extrait: {extractedSubtotal.toFixed(2)} €)</span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-gray-600">TVA:</span>
                                    <span className="font-semibold">
                                      {calculatedTax.toFixed(2)} €
                                      {hasDifference && extractedTax > 0 && (
                                        <span className="text-gray-400 ml-1">(extrait: {extractedTax.toFixed(2)} €)</span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-sm mt-2 pt-2 border-t border-gray-300">
                                    <span className="font-semibold text-gray-900">Total TTC:</span>
                                    <span className="font-bold text-blue-600">
                                      {calculatedTotal.toFixed(2)} €
                                      {hasDifference && extractedTotal > 0 && (
                                        <span className="text-orange-600 text-xs ml-1">⚠️ (extrait: {extractedTotal.toFixed(2)} €)</span>
                                      )}
                                    </span>
                                  </div>
                                  {hasDifference && (
                                    <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
                                      ⚠️ Le total calculé ({calculatedTotal.toFixed(2)} €) diffère du total extrait ({extractedTotal.toFixed(2)} €). Utilisez le total calculé pour les ventilations.
                                    </div>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-gray-500">
                          <div className="text-center p-4">
                            <div className="text-gray-400 mb-3 text-4xl">📋</div>
                            <div className="font-medium text-gray-700 mb-1">Aucun article extrait</div>
                            <div className="text-xs text-gray-500 mb-4">Les articles n'ont pas pu être extraits de cette facture</div>
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              disabled={retrying || invoice?.status === 'processing' || invoice?.status === 'queued'}
                              onClick={async () => {
                                try {
                                  setRetrying(true)
                                  setError(null)
                                  const { data: { session } } = await supabase.auth.getSession()
                                  const token = session?.access_token || ''
                                  
                                  // Ajouter la tâche à la queue
                                  const addRes = await fetch('/api/queue/add', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      ...(token ? { Authorization: `Bearer ${token}` } : {})
                                    },
                                    body: JSON.stringify({ invoiceId: params.id })
                                  })
                                  
                                  const addData = await addRes.json()
                                  if (!addRes.ok) {
                                    throw new Error(addData.error || 'Impossible de relancer l\'extraction')
                                  }
                                  
                                  // Mettre à jour le statut local
                                  setInvoice((prev: any) => prev ? { ...prev, status: 'queued' } : prev)
                                  
                                  // Polling pour suivre le statut
                                  const poll = async () => {
                                    try {
                                      const statusRes = await fetch(`/api/queue/status?invoiceId=${params.id}`, {
                                        headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                      })
                                      const statusData = await statusRes.json()
                                      if (statusData.status === 'completed' || statusData.status === 'failed') {
                                        // Recharger la facture
                                        const rr = await fetch(`/api/invoices/${params.id}`, {
                                          headers: token ? { Authorization: `Bearer ${token}` } : undefined
                                        })
                                        const dd = await rr.json()
                                        if (rr.ok) {
                                          setInvoice(dd.invoice)
                                          setRetrying(false)
                                        }
                                      } else if (statusData.status === 'processing') {
                                        setInvoice((prev: any) => prev ? { ...prev, status: 'processing' } : prev)
                                        setTimeout(poll, 4000)
                                      } else {
                                        setTimeout(poll, 4000)
                                      }
                                    } catch {}
                                  }
                                  poll()
                                } catch (e: any) {
                                  setError(e.message)
                                  setRetrying(false)
                                }
                              }}
                            >
                              {retrying || invoice?.status === 'processing' || invoice?.status === 'queued' 
                                ? 'Extraction en cours...' 
                                : "🔄 Relancer l'extraction"}
                            </Button>
                            {(invoice?.status === 'processing' || invoice?.status === 'queued') && (
                              <div className="mt-2 text-xs text-blue-600">
                                Extraction en cours, veuillez patienter...
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Aperçu mobile plein écran */}
      {showMobilePreview && (
        <div className="fixed inset-0 z-40 bg-black/70 flex flex-col lg:hidden">
          <div className="p-3 flex items-center justify-between bg-white">
            <div className="text-sm font-semibold">Aperçu PDF</div>
            <div className="flex items-center gap-2">
              {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Télécharger</a>}
              <Button size="sm" variant="outline" onClick={()=>setShowMobilePreview(false)}>Fermer</Button>
            </div>
          </div>
          <div className="flex-1 bg-white">
            {pdfUrl ? (
              <iframe src={`${pdfUrl}#view=FitH`} className="w-full h-full" />
            ) : (
              <div className="h-full flex items-center justify-center text-white">Aucun aperçu</div>
            )}
          </div>
        </div>
      )}

      {/* Modal de duplication avec sélection d'articles */}
      {showDuplicateModal && invoice?.extracted_data?.items && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Dupliquer la facture avec sélection d'articles</h2>
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 text-sm text-gray-600">
                Sélectionnez les articles à inclure dans la facture dupliquée. Les montants seront recalculés automatiquement.
              </div>
              
              <div className="space-y-2">
                {invoice.extracted_data.items.map((item: any, idx: number) => {
                  const isSelected = selectedItems.has(idx)
                  const amounts = calculateItemAmounts(item)
                  const itemHT = amounts.ht
                  const itemTTC = amounts.ttc
                  const itemTVA = amounts.tva
                  
                  return (
                    <div
                      key={idx}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                      onClick={() => {
                        const newSet = new Set(selectedItems)
                        if (isSelected) {
                          newSet.delete(idx)
                        } else {
                          newSet.add(idx)
                        }
                        setSelectedItems(newSet)
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{item.description || `Article ${idx + 1}`}</div>
                          {item.reference && (
                            <div className="text-xs text-gray-500 mt-1">Réf: {item.reference}</div>
                          )}
                          <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-gray-600">
                            <div>
                              <span className="text-gray-500">Qté:</span> {item.quantity || 1}
                            </div>
                            <div>
                              <span className="text-gray-500">P.U.:</span> {Number(item.unit_price || 0).toFixed(2)} €
                            </div>
                            <div>
                              <span className="text-gray-500">HT:</span> {itemHT.toFixed(2)} €
                            </div>
                            <div>
                              <span className="text-gray-500">TTC:</span> <span className="font-semibold">{itemTTC.toFixed(2)} €</span>
                            </div>
                          </div>
                          {(() => {
                            const normalizedRate = normalizeTaxRate(item.tax_rate, invoice?.extracted_data?.supplier_name)
                            return normalizedRate !== null ? (
                              <div className="mt-1 text-xs text-gray-500">TVA: {normalizedRate.toFixed(2)}%</div>
                            ) : null
                          })()}
        </div>
      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Résumé des montants sélectionnés */}
              {selectedItems.size > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm font-semibold text-gray-700 mb-2">Résumé de la facture dupliquée</div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500">Articles sélectionnés</div>
                      <div className="font-semibold text-gray-900">{selectedItems.size} / {invoice.extracted_data.items.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total HT</div>
                      <div className="font-semibold text-gray-900">
                        {(() => {
                          let totalHT = 0
                          selectedItems.forEach((idx) => {
                            const item = invoice.extracted_data.items[idx]
                            const amounts = calculateItemAmounts(item)
                            totalHT += amounts.ht
                          })
                          return totalHT.toFixed(2)
                        })()} €
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500">Total TTC</div>
                      <div className="font-semibold text-blue-600">
                        {(() => {
                          let totalTTC = 0
                          selectedItems.forEach((idx) => {
                            const item = invoice.extracted_data.items[idx]
                            totalTTC += Number(item.total_price || 0)
                          })
                          return totalTTC.toFixed(2)
                        })()} €
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDuplicateModal(false)}
                disabled={duplicating}
              >
                Annuler
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={async () => {
                  if (selectedItems.size === 0) {
                    setError('Veuillez sélectionner au moins un article')
                    return
                  }
                  
                  try {
                    setDuplicating(true)
                    setError(null)
                    
                    const { data: { session } } = await supabase.auth.getSession()
                    const res = await fetch('/api/invoices/duplicate', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
                      },
                      body: JSON.stringify({
                        source_invoice_id: params.id,
                        selected_item_indices: Array.from(selectedItems)
                      })
                    })
                    
                    const data = await res.json()
                    
                    if (!res.ok) {
                      throw new Error(data.error || 'Erreur lors de la duplication')
                    }
                    
                    // Rediriger vers la nouvelle facture
                    router.push(`/invoices/${data.invoice.id}`)
                  } catch (e: any) {
                    setError(e.message)
                  } finally {
                    setDuplicating(false)
                  }
                }}
                disabled={selectedItems.size === 0 || duplicating}
              >
                {duplicating ? 'Création en cours...' : `Créer la facture dupliquée (${selectedItems.size} article${selectedItems.size > 1 ? 's' : ''})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
