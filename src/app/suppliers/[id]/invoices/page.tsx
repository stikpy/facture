'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

type Supplier = {
  id: string
  display_name: string
  code: string
  email?: string
  phone?: string
}

type Invoice = {
  id: string
  file_name: string
  status: string
  created_at: string
  updated_at: string
  extracted_data?: {
    invoice_number?: string
    invoice_date?: string
    due_date?: string
    total_amount?: number
    subtotal?: number
    tax_amount?: number
    supplier_name?: string
    currency?: string
    [key: string]: any
  }
  supplier_id?: string
  organization_id?: string
}

export default function SupplierInvoicesPage() {
  const params = useParams()
  const router = useRouter()
  const supplierId = params.id as string

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  // Vérification de l'authentification
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error || !user) {
          router.push('/auth')
          return
        }
        
        setUser(user)
      } catch (error) {
        console.error('Erreur d\'authentification:', error)
        router.push('/auth')
      } finally {
        setAuthLoading(false)
      }
    }

    checkAuth()
  }, [router])

  // Charger le fournisseur et ses factures
  useEffect(() => {
    if (user && supplierId) {
      fetchSupplierAndInvoices()
    }
  }, [user, supplierId])

  const fetchSupplierAndInvoices = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      console.log('📦 [SUPPLIER INVOICES] Chargement du fournisseur:', supplierId)
      
      // Charger le fournisseur
      const { data: supplierData, error: supplierError } = await (supabase as any)
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single()

      console.log('🔍 [SUPPLIER INVOICES] Détails erreur:', { supplierError, supplierData })

      if (supplierError) {
        console.error('❌ [SUPPLIER INVOICES] Erreur fournisseur:', supplierError)
        console.error('❌ [SUPPLIER INVOICES] Détails:', {
          message: supplierError.message,
          details: supplierError.details,
          hint: supplierError.hint,
          code: supplierError.code
        })
        return
      }

      console.log('✅ [SUPPLIER INVOICES] Fournisseur chargé:', supplierData.display_name)
      setSupplier(supplierData)

      // Charger les factures du fournisseur
      console.log('📄 [SUPPLIER INVOICES] Chargement des factures pour supplier_id:', supplierId)
      const { data: invoicesData, error: invoicesError } = await (supabase as any)
        .from('invoices')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })

      console.log('📄 [SUPPLIER INVOICES] Réponse factures:', { 
        count: invoicesData?.length || 0, 
        error: invoicesError,
        data: invoicesData 
      })

      if (invoicesError) {
        console.error('❌ [SUPPLIER INVOICES] Erreur factures:', invoicesError)
        return
      }

      // Log des colonnes disponibles sur la première facture
      if (invoicesData && invoicesData.length > 0) {
        console.log('📋 [SUPPLIER INVOICES] Colonnes disponibles:', Object.keys(invoicesData[0]))
        console.log('📋 [SUPPLIER INVOICES] Première facture:', invoicesData[0])
        console.log('💰 [SUPPLIER INVOICES] extracted_data de la première facture:', invoicesData[0].extracted_data)
        console.log('💰 [SUPPLIER INVOICES] Clés de extracted_data:', Object.keys(invoicesData[0].extracted_data || {}))
      }

      setInvoices(invoicesData || [])
      console.log(`✅ [SUPPLIER INVOICES] ${invoicesData?.length || 0} facture(s) chargée(s)`)
    } catch (error) {
      console.error('❌ [SUPPLIER INVOICES] Erreur générale:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredInvoices = invoices.filter(invoice =>
    invoice.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (invoice.extracted_data?.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'processed':
        return 'Traité'
      case 'pending':
        return 'En attente'
      case 'error':
        return 'Erreur'
      default:
        return status
    }
  }

  if (authLoading || loading) {
    return <LoadingSpinner />
  }

  if (!supplier) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Fournisseur non trouvé</h1>
          <Button onClick={() => router.push('/suppliers')}>
            Retour à la liste
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* En-tête */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Factures de {supplier.display_name}
              </h1>
              <p className="text-gray-600 mt-2">
                Code: {supplier.code} • {invoices.length} facture{invoices.length > 1 ? 's' : ''}
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => router.push('/suppliers')}
            >
              Retour aux fournisseurs
            </Button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Rechercher par nom de fichier, statut, numéro de facture..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Liste des factures */}
        <div className="bg-white rounded-lg shadow">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-500 text-lg mb-4">
                {searchTerm ? 'Aucune facture trouvée pour cette recherche' : 'Aucune facture trouvée pour ce fournisseur'}
              </div>
              {!searchTerm && (
                <Button onClick={() => router.push('/import')}>
                  Importer une facture
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fichier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Numéro
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Montant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.file_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {formatDate(invoice.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {invoice.extracted_data?.invoice_number || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {invoice.extracted_data?.invoice_date ? formatDate(invoice.extracted_data.invoice_date) : '-'}
                        </div>
                        {invoice.extracted_data?.due_date && (
                          <div className="text-sm text-gray-500">
                            Échéance: {formatDate(invoice.extracted_data.due_date)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {invoice.extracted_data?.total_amount ? formatCurrency(invoice.extracted_data.total_amount) : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(invoice.status)}`}>
                          {getStatusText(invoice.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => router.push(`/invoices/${invoice.id}?ctx=supplier&supplier_id=${supplierId}`)}
                          >
                            Voir
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              // TODO: Télécharger le fichier
                              console.log('Télécharger:', invoice.file_name)
                            }}
                          >
                            Télécharger
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Statistiques */}
        {invoices.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Total des factures</h3>
              <p className="text-3xl font-bold text-blue-600">
                {invoices.length}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Montant total</h3>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(invoices.reduce((sum, invoice) => sum + (invoice.extracted_data?.total_amount || 0), 0))}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Factures traitées</h3>
              <p className="text-3xl font-bold text-green-600">
                {invoices.filter(invoice => invoice.status === 'processed').length}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
