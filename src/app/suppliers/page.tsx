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
  created_at: string
}

export default function SuppliersPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  // const [showInactive, setShowInactive] = useState(false) // Colonne is_active n'existe pas

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
    }
  }, [user])

  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      console.log('🔍 [SUPPLIERS] Début du chargement des fournisseurs')
      console.log('🔍 [SUPPLIERS] User:', user?.email)
       // console.log('🔍 [SUPPLIERS] Show inactive:', showInactive) // Colonne is_active n'existe pas
      
      const supabaseClient = createClient()
      
      // Test avec une requête plus simple d'abord
      console.log('🔍 [SUPPLIERS] Test de connexion Supabase...')
      const { data: testData, error: testError } = await (supabaseClient as any)
        .from('suppliers')
        .select('id, display_name, code')
        .limit(5)
      
      console.log('🔍 [SUPPLIERS] Test simple:', { testData, testError })
      
      if (testError) {
        console.error('❌ [SUPPLIERS] Erreur sur requête simple:', testError)
        throw testError
      }
      
       // Si le test simple fonctionne, faire la vraie requête
       const { data, error } = await (supabaseClient as any)
         .from('suppliers')
         .select('*')
         .order('display_name')

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

  const filteredSuppliers = suppliers.filter(supplier =>
    (supplier.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.normalized_key || '').includes(searchTerm.toLowerCase()) ||
    (supplier.legal_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (supplier.siret || '').includes(searchTerm) ||
    (supplier.vat_number || '').includes(searchTerm)
  )

  if (authLoading || loading) {
    return <LoadingSpinner />
  }

  if (!user) {
    return <div>Veuillez vous connecter</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gestion des Fournisseurs</h1>
        <Button onClick={() => router.push('/suppliers/new')}>
          + Nouveau Fournisseur
        </Button>
      </div>

      {/* Filtres */}
      <div className="mb-6 flex gap-4 items-center">
        <Input
          placeholder="Rechercher par nom, code, SIRET, TVA..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md"
        />
        {/* Filtrage par statut supprimé car colonne is_active n'existe pas */}
      </div>

      {/* Liste des fournisseurs */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fournisseur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SIRET / TVA
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
              {filteredSuppliers.map((supplier) => (
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
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      supplier.is_active 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {supplier.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push(`/suppliers/${supplier.id}/edit`)}
                      >
                        Éditer
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => router.push(`/suppliers/${supplier.id}/invoices`)}
                      >
                        Factures
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredSuppliers.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? 'Aucun fournisseur trouvé' : 'Aucun fournisseur enregistré'}
        </div>
      )}
    </div>
  )
}
