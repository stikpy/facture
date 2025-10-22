'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
// import { supabase } from '@/lib/supabase' // Commenté pour utiliser createClient
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface Supplier {
  id: string
  name: string
  display_name: string
  code: string
  normalized_key: string
  legal_name?: string
  address?: string
  city?: string
  postal_code?: string
  email?: string
  phone?: string
  siret?: string
  vat_number?: string
  is_active: boolean
  validation_status?: 'pending' | 'validated' | 'rejected'
  created_at: string
}

export default function SuppliersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [validationFilter, setValidationFilter] = useState<'all' | 'pending' | 'validated' | 'rejected'>('all')
  const [validationModal, setValidationModal] = useState<{ isOpen: boolean; supplier: Supplier | null; supplierInfo: any }>({ 
    isOpen: false, 
    supplier: null,
    supplierInfo: null
  })
  const [organization, setOrganization] = useState<{ name?: string; vat_number?: string; address?: string } | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('🔐 [AUTH] Vérification de l\'authentification')
        const supabase = createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        console.log('🔐 [AUTH] User:', user?.email, 'Error:', error)
        setUser(user)
      } catch (error) {
        console.error('❌ [AUTH] Erreur auth:', error)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) {
      fetchSuppliers()
      fetchOrganization()
    }
  }, [user])

  const fetchOrganization = async () => {
    try {
      const supabase = createClient()
      const { data: userRow } = await (supabase as any)
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()
      if (!userRow?.organization_id) return
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('name, address, vat_number')
        .eq('id', userRow.organization_id)
        .single()
      setOrganization(org || null)
    } catch (e) {
      console.warn('⚠️ [SUPPLIERS] Impossible de charger l\'organisation:', e)
    }
  }

  const openValidationModal = async (supplier: Supplier) => {
    try {
      // Récupérer les informations extraites de la première facture de ce fournisseur
      const supabase = createClient()
      const { data: invoices } = await (supabase as any)
        .from('invoices')
        .select('extracted_data')
        .eq('supplier_id', supplier.id)
        .limit(1)
        .single()
      
      const extractedData = invoices?.extracted_data || {}
      
      setValidationModal({
        isOpen: true,
        supplier,
        supplierInfo: {
          address: extractedData.supplier_address || supplier.address || '',
          email: extractedData.supplier_email || supplier.email || '',
          phone: extractedData.supplier_phone || supplier.phone || '',
          vat_number: extractedData.supplier_vat_number || supplier.vat_number || '',
          siret: supplier.siret || ''
        }
      })
    } catch (error) {
      console.error('❌ [SUPPLIERS] Erreur lors du chargement des infos:', error)
      // Ouvrir quand même le modal avec les données du supplier
      setValidationModal({
        isOpen: true,
        supplier,
        supplierInfo: {
          address: supplier.address || '',
          email: supplier.email || '',
          phone: supplier.phone || '',
          vat_number: supplier.vat_number || '',
          siret: supplier.siret || ''
        }
      })
    }
  }

  const updateValidationStatus = async (
    supplierId: string, 
    newStatus: 'validated' | 'rejected',
    updates?: Partial<Pick<Supplier, 'address' | 'email' | 'phone' | 'vat_number' | 'siret'>>
  ) => {
    try {
      console.log(`🔄 [SUPPLIERS] Mise à jour du statut pour ${supplierId} → ${newStatus}`)
      
      // Mise à jour optimiste de l'état local pour un feedback immédiat
      setSuppliers(prevSuppliers => 
        prevSuppliers.map(s => 
          s.id === supplierId 
            ? { ...s, validation_status: newStatus, is_active: newStatus === 'validated', ...(updates || {}) }
            : s
        )
      )
      
      // Mise à jour dans la base de données
      const supabase = createClient()
      const { data: updateResult, error } = await (supabase as any)
        .from('suppliers')
        .update({ 
          validation_status: newStatus,
          is_active: newStatus === 'validated',
          ...(updates || {})
        } as any)
        .eq('id', supplierId)
        .select()
      
      console.log('🔍 [SUPPLIERS] Résultat de l\'update:', { updateResult, error })
      
      if (error) {
        console.error('❌ [SUPPLIERS] Erreur Supabase lors de l\'update:', error)
        console.error('❌ [SUPPLIERS] Détails de l\'erreur:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        // Annuler la mise à jour optimiste en cas d'erreur
        await fetchSuppliers()
        throw error
      }
      
      if (!updateResult || updateResult.length === 0) {
        console.warn('⚠️ [SUPPLIERS] Aucune ligne mise à jour ! Possible problème de permissions RLS.')
      }
      
      console.log(`✅ [SUPPLIERS] Fournisseur ${newStatus === 'validated' ? 'validé' : 'rejeté'} avec succès`)
      
      // Rafraîchir depuis la base pour être sûr de la cohérence
      await fetchSuppliers()
    } catch (error) {
      console.error('❌ [SUPPLIERS] Erreur lors de la mise à jour du statut:', error)
      alert('Erreur lors de la mise à jour du statut')
    }
  }

  const deleteSupplier = async (supplierId: string, supplierName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le fournisseur "${supplierName}" ?\n\nCette action est irréversible.`)) {
      return
    }

    try {
      console.log(`🗑️ [SUPPLIERS] Suppression du fournisseur ${supplierId}`)
      
      const supabase = createClient()
      // 1) Détacher les factures liées si besoin (supplier_id -> null)
      try {
        const { error: detachError } = await (supabase as any)
          .from('invoices')
          .update({ supplier_id: null } as any)
          .eq('supplier_id', supplierId)
        if (detachError) {
          console.warn('⚠️ [SUPPLIERS] Impossible de détacher les factures avant suppression:', detachError)
        }
      } catch (e) {
        console.warn('⚠️ [SUPPLIERS] Erreur inattendue lors du détachement des factures:', e)
      }

      // 2) Supprimer le fournisseur
      const { error } = await (supabase as any)
        .from('suppliers')
        .delete()
        .eq('id', supplierId)
      
      if (error) {
        console.error('❌ [SUPPLIERS] Erreur lors de la suppression:', error)
        alert('Erreur lors de la suppression du fournisseur')
        throw error
      }
      
      console.log('✅ [SUPPLIERS] Fournisseur supprimé avec succès')
      
      // Rafraîchir la liste
      await fetchSuppliers()
    } catch (error) {
      console.error('❌ [SUPPLIERS] Erreur:', error)
    }
  }

  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      console.log('🔍 [SUPPLIERS] Début du chargement des fournisseurs')
      console.log('🔍 [SUPPLIERS] User:', user?.email)
       // console.log('🔍 [SUPPLIERS] Show inactive:', showInactive) // Colonne is_active n'existe pas
      
      const supabaseClient = createClient()

      // Déterminer l'organisation active
      let orgId: string | null = null
      try {
        const { data: member } = await (supabaseClient as any)
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .limit(1)
          .single()
        orgId = member?.organization_id || null
        console.log('🏢 [SUPPLIERS] Organisation active (members):', orgId)
      } catch (e) {
        const { data: userRow } = await (supabaseClient as any)
          .from('users')
          .select('organization_id')
          .eq('id', user.id)
          .single()
        orgId = userRow?.organization_id || null
        console.log('🏢 [SUPPLIERS] Organisation active (users):', orgId)
      }

      // Requête principale, scopée à l'organisation si disponible
      let query = (supabaseClient as any)
        .from('suppliers')
        .select('*')
        .order('display_name')

      if (orgId) {
        query = query.eq('organization_id', orgId)
      }

      const { data, error } = await query

      console.log('🔍 [SUPPLIERS] Réponse Supabase:', { data, error })

      if (error) {
        console.error('❌ [SUPPLIERS] Erreur Supabase:', error)
        throw error
      }
      
      console.log('✅ [SUPPLIERS] Fournisseurs chargés:', data?.length || 0)
      setSuppliers(data || [])
    } catch (error) {
      console.error('❌ [SUPPLIERS] Erreur lors du chargement des fournisseurs:', error)
      console.error('❌ [SUPPLIERS] Type d\'erreur:', typeof error)
      console.error('❌ [SUPPLIERS] Détails de l\'erreur:', {
        message: (error as any)?.message,
        code: (error as any)?.code,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        stack: (error as any)?.stack
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredSuppliers = suppliers.filter(supplier => {
    // Filtre par texte
    const matchesSearch = (supplier.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.normalized_key || '').includes(searchTerm.toLowerCase()) ||
      (supplier.legal_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (supplier.siret || '').includes(searchTerm) ||
      (supplier.vat_number || '').includes(searchTerm)
    
    // Filtre par statut de validation
    const matchesValidation = validationFilter === 'all' || supplier.validation_status === validationFilter
    
    return matchesSearch && matchesValidation
  })

  // Séparer les fournisseurs en attente et les autres
  const pendingSuppliers = filteredSuppliers.filter(s => s.validation_status === 'pending')
  const otherSuppliers = filteredSuppliers.filter(s => s.validation_status !== 'pending')

  if (authLoading || loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <div>Veuillez vous connecter</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Fournisseurs</h1>
              <p className="mt-2 text-base text-gray-600">
                Gérez vos fournisseurs et validez les nouvelles inscriptions
              </p>
            </div>
            <Button 
              onClick={() => router.push('/suppliers/new')}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-3 font-semibold"
            >
              <svg className="w-5 h-5 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau Fournisseur
            </Button>
          </div>
        </div>

        {/* Statistiques rapides */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{filteredSuppliers.length}</p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En attente</p>
                <p className="text-3xl font-bold text-yellow-600 mt-1">{pendingSuppliers.length}</p>
              </div>
              <div className="bg-yellow-100 rounded-full p-3">
                <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-200 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Validés</p>
                <p className="text-3xl font-bold text-green-600 mt-1">{otherSuppliers.filter(s => s.validation_status === 'validated').length}</p>
              </div>
              <div className="bg-green-100 rounded-full p-3">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div className="mb-6 bg-white rounded-xl shadow-sm p-5 border border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                placeholder="Rechercher par nom, code, SIRET, TVA..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <select
              value={validationFilter}
              onChange={(e) => setValidationFilter(e.target.value as any)}
              className="border border-gray-300 rounded-lg px-4 py-2.5 bg-white text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer hover:bg-gray-50"
            >
              <option value="all">📋 Tous les fournisseurs</option>
              <option value="pending">🟡 En attente</option>
              <option value="validated">✅ Validés</option>
              <option value="rejected">❌ Rejetés</option>
            </select>
          </div>
        </div>

        {/* Section: Fournisseurs en attente de validation */}
        {pendingSuppliers.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg p-2">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    En attente de validation
                    <span className="bg-yellow-500 text-white px-2.5 py-0.5 rounded-full text-xs font-bold">
                      {pendingSuppliers.length}
                    </span>
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5">Action requise • Nouveaux fournisseurs détectés</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border-l-4 border-yellow-500">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      SIRET / TVA
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {pendingSuppliers.map((supplier) => (
                    <tr key={supplier.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-yellow-100 rounded-lg p-2 flex-shrink-0">
                            <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">
                              {supplier.display_name}
                            </div>
                          {supplier.legal_name && (
                            <div className="text-sm text-gray-500">
                              {supplier.legal_name}
                            </div>
                          )}
                          {supplier.address && (
                            <div className="text-xs text-gray-500 mt-1">
                              📍 {supplier.address}
                              {supplier.city && `, ${supplier.city}`}
                              {supplier.postal_code && ` ${supplier.postal_code}`}
                            </div>
                          )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {supplier.code}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {supplier.email && (
                            <div>{supplier.email}</div>
                          )}
                          {supplier.phone && (
                            <div>{supplier.phone}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {supplier.siret && (
                            <div>SIRET: {supplier.siret}</div>
                          )}
                          {supplier.vat_number && (
                            <div>TVA: {supplier.vat_number}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end items-center">
                          <Button 
                            size="sm"
                            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-md hover:shadow-lg transition-all font-semibold"
                            onClick={() => openValidationModal(supplier)}
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Valider
                          </Button>
                          <Button 
                            size="sm"
                            className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md hover:shadow-lg transition-all font-semibold"
                            onClick={() => updateValidationStatus(supplier.id, 'rejected')}
                          >
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Rejeter
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-all"
                            onClick={() => deleteSupplier(supplier.id, supplier.display_name)}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

        {/* Section: Autres fournisseurs */}
        {otherSuppliers.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg p-2">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    Fournisseurs validés
                    <span className="bg-blue-500 text-white px-2.5 py-0.5 rounded-full text-xs font-bold">
                      {otherSuppliers.length}
                    </span>
                  </h2>
                  <p className="text-sm text-gray-600 mt-0.5">Fournisseurs approuvés et actifs</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200">
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      SIRET / TVA
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {otherSuppliers.map((supplier) => (
                <tr key={supplier.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {supplier.display_name}
                      </div>
                      {supplier.legal_name && (
                        <div className="text-sm text-gray-500">
                          {supplier.legal_name}
                        </div>
                      )}
                      {supplier.address && (
                        <div className="text-sm text-gray-500">
                          {supplier.address}
                          {supplier.city && `, ${supplier.city}`}
                          {supplier.postal_code && ` ${supplier.postal_code}`}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {supplier.code}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {supplier.email && (
                        <div>{supplier.email}</div>
                      )}
                      {supplier.phone && (
                        <div>{supplier.phone}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {supplier.siret && (
                        <div>SIRET: {supplier.siret}</div>
                      )}
                      {supplier.vat_number && (
                        <div>TVA: {supplier.vat_number}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-2">
                      {/* Statut de validation */}
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${
                        supplier.validation_status === 'validated' 
                          ? 'bg-green-100 text-green-800 border border-green-300' 
                          : supplier.validation_status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                          : supplier.validation_status === 'rejected'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-gray-100 text-gray-800 border border-gray-300'
                      }`}>
                        {supplier.validation_status === 'validated' && '✅ Validé'}
                        {supplier.validation_status === 'pending' && '🟡 En attente'}
                        {supplier.validation_status === 'rejected' && '❌ Rejeté'}
                        {!supplier.validation_status && '❓ Non défini'}
                      </span>
                      {/* Statut actif/inactif */}
                      <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full ${
                        supplier.is_active 
                          ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                          : 'bg-gray-100 text-gray-600 border border-gray-300'
                      }`}>
                        {supplier.is_active ? '🟢 Actif' : '⚫ Inactif'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex gap-2 justify-end items-center">
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-blue-300 text-blue-600 hover:bg-blue-50 hover:border-blue-400 font-medium transition-all"
                        onClick={() => router.push(`/suppliers/${supplier.id}/edit`)}
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Éditer
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-purple-300 text-purple-600 hover:bg-purple-50 hover:border-purple-400 font-medium transition-all"
                        onClick={() => router.push(`/suppliers/${supplier.id}/invoices`)}
                      >
                        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Factures
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-red-300 text-red-600 hover:bg-red-50 hover:border-red-400 transition-all"
                        onClick={() => deleteSupplier(supplier.id, supplier.display_name)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
          </div>
        )}

        {/* Message si aucun résultat */}
        {filteredSuppliers.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center border border-gray-200">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {searchTerm ? 'Aucun fournisseur trouvé' : 'Aucun fournisseur enregistré'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm 
                ? 'Essayez de modifier vos critères de recherche' 
                : 'Commencez par créer votre premier fournisseur'}
            </p>
            {!searchTerm && (
              <Button 
                onClick={() => router.push('/suppliers/new')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <span className="text-lg mr-1">+</span> Créer un fournisseur
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modal de validation */}
      {validationModal.isOpen && validationModal.supplier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Validation du fournisseur
                </h2>
                <button 
                  onClick={() => setValidationModal({ isOpen: false, supplier: null, supplierInfo: null })}
                  className="text-white hover:text-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Nom du fournisseur */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Nom du fournisseur</label>
                <div className="text-2xl font-bold text-gray-900">{validationModal.supplier.display_name}</div>
                <div className="text-sm text-gray-600 mt-1">Code: {validationModal.supplier.code}</div>
              </div>

              {/* Informations extraites */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Adresse */}
                  <div className="col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Adresse
                    </label>
                    <Input 
                      type="text" 
                      value={validationModal.supplierInfo.address}
                      onChange={(e) => setValidationModal(v => ({ ...v, supplierInfo: { ...v.supplierInfo, address: e.target.value } }))}
                      className=""
                    />
                    {organization?.name && validationModal.supplier && (
                      <p className="text-xs mt-1 text-gray-500">
                        Astuce: l'adresse du client semble être "{organization.name}"; si vous voyez cette adresse ici, remplacez-la par l'adresse du fournisseur.
                      </p>
                    )}
                  </div>

                {/* Email */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Email
                    </label>
                    <Input 
                      type="email" 
                      value={validationModal.supplierInfo.email}
                      onChange={(e) => setValidationModal(v => ({ ...v, supplierInfo: { ...v.supplierInfo, email: e.target.value } }))}
                    />
                  </div>

                {/* Téléphone */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Téléphone
                    </label>
                    <Input 
                      type="tel" 
                      value={validationModal.supplierInfo.phone}
                      onChange={(e) => setValidationModal(v => ({ ...v, supplierInfo: { ...v.supplierInfo, phone: e.target.value } }))}
                    />
                  </div>

                {/* N° TVA */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      N° TVA / SIRET
                    </label>
                    <Input 
                      type="text" 
                      value={validationModal.supplierInfo.vat_number}
                      onChange={(e) => setValidationModal(v => ({ ...v, supplierInfo: { ...v.supplierInfo, vat_number: e.target.value } }))}
                    />
                  </div>

                {/* SIRET */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      SIRET
                    </label>
                    <Input 
                      type="text" 
                      value={validationModal.supplierInfo.siret}
                      onChange={(e) => setValidationModal(v => ({ ...v, supplierInfo: { ...v.supplierInfo, siret: e.target.value } }))}
                    />
                  </div>
              </div>

              {/* Message d'information */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-yellow-800">
                    <p className="font-semibold mb-1">Ces informations ont été extraites automatiquement</p>
                    <p>Vérifiez leur exactitude avant de valider le fournisseur. Vous pourrez les modifier ultérieurement dans la fiche fournisseur.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex justify-end gap-3 border-t">
              <Button
                variant="outline"
                onClick={() => setValidationModal({ isOpen: false, supplier: null, supplierInfo: null })}
              >
                Annuler
              </Button>
              <Button
                className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-md hover:shadow-lg transition-all"
                onClick={() => {
                  if (validationModal.supplier) {
                    updateValidationStatus(validationModal.supplier.id, 'rejected')
                    setValidationModal({ isOpen: false, supplier: null, supplierInfo: null })
                  }
                }}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Rejeter
              </Button>
              <Button
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-md hover:shadow-lg transition-all"
                onClick={() => {
                  if (validationModal.supplier) {
                    updateValidationStatus(validationModal.supplier.id, 'validated', {
                      address: validationModal.supplierInfo?.address || undefined,
                      email: validationModal.supplierInfo?.email || undefined,
                      phone: validationModal.supplierInfo?.phone || undefined,
                      vat_number: validationModal.supplierInfo?.vat_number || undefined,
                      siret: validationModal.supplierInfo?.siret || undefined,
                    })
                    setValidationModal({ isOpen: false, supplier: null, supplierInfo: null })
                  }
                }}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Valider le fournisseur
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
