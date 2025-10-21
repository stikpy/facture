'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

type Supplier = {
  id: string
  name: string
  display_name: string
  code: string
  normalized_key: string
  legal_name?: string
  address?: string
  city?: string
  postal_code?: string
  country?: string
  email?: string
  phone?: string
  website?: string
  siret?: string
  vat_number?: string
  registration_number?: string
  legal_form?: string
  capital?: number
  activity_code?: string
  bank_details?: any
  notes?: string
  is_active: boolean
  organization_id: string
  created_by: string
  created_at: string
  updated_at: string
}

export default function EditSupplierPage() {
  const params = useParams()
  const router = useRouter()
  const supplierId = params.id as string

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)

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

  // Charger le fournisseur
  useEffect(() => {
    if (user && supplierId) {
      fetchSupplier()
    }
  }, [user, supplierId])

  const fetchSupplier = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single()

      if (error) {
        console.error('Erreur lors du chargement du fournisseur:', error)
        return
      }

      setSupplier(data)
    } catch (error) {
      console.error('Erreur lors du chargement du fournisseur:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!supplier) return

    try {
      setSaving(true)
      const supabase = createClient()
      
      const { error } = await supabase
        .from('suppliers')
        .update({
          name: supplier.name,
          display_name: supplier.display_name,
          code: supplier.code,
          normalized_key: supplier.normalized_key,
          legal_name: supplier.legal_name,
          address: supplier.address,
          city: supplier.city,
          postal_code: supplier.postal_code,
          country: supplier.country,
          email: supplier.email,
          phone: supplier.phone,
          website: supplier.website,
          siret: supplier.siret,
          vat_number: supplier.vat_number,
          registration_number: supplier.registration_number,
          legal_form: supplier.legal_form,
          capital: supplier.capital,
          activity_code: supplier.activity_code,
          bank_details: supplier.bank_details,
          notes: supplier.notes,
          is_active: supplier.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', supplierId)

      if (error) {
        console.error('Erreur lors de la sauvegarde:', error)
        alert('Erreur lors de la sauvegarde')
        return
      }

      alert('Fournisseur mis à jour avec succès!')
      router.push('/suppliers')
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: keyof Supplier, value: any) => {
    if (!supplier) return
    setSupplier({ ...supplier, [field]: value })
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
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                Éditer le fournisseur
              </h1>
              <Button 
                variant="outline" 
                onClick={() => router.push('/suppliers')}
              >
                Annuler
              </Button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Informations de base */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Informations de base</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom d'affichage *
                  </label>
                  <Input
                    value={supplier.display_name || ''}
                    onChange={(e) => handleInputChange('display_name', e.target.value)}
                    placeholder="Nom d'affichage"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom commercial
                  </label>
                  <Input
                    value={supplier.name || ''}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Nom commercial"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code *
                  </label>
                  <Input
                    value={supplier.code || ''}
                    onChange={(e) => handleInputChange('code', e.target.value)}
                    placeholder="Code unique"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Raison sociale
                  </label>
                  <Input
                    value={supplier.legal_name || ''}
                    onChange={(e) => handleInputChange('legal_name', e.target.value)}
                    placeholder="Raison sociale"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={supplier.is_active}
                    onChange={(e) => handleInputChange('is_active', e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm text-gray-700">
                    Fournisseur actif
                  </label>
                </div>
              </div>

              {/* Informations de contact */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Contact</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={supplier.email || ''}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="email@exemple.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Input
                    value={supplier.phone || ''}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="01 23 45 67 89"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Site web
                  </label>
                  <Input
                    value={supplier.website || ''}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="https://www.exemple.com"
                  />
                </div>
              </div>

              {/* Adresse */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Adresse</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <Input
                    value={supplier.address || ''}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    placeholder="123 rue de la Paix"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ville
                    </label>
                    <Input
                      value={supplier.city || ''}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Paris"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal
                    </label>
                    <Input
                      value={supplier.postal_code || ''}
                      onChange={(e) => handleInputChange('postal_code', e.target.value)}
                      placeholder="75001"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pays
                  </label>
                  <Input
                    value={supplier.country || ''}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                    placeholder="France"
                  />
                </div>
              </div>

              {/* Informations légales */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Informations légales</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SIRET
                  </label>
                  <Input
                    value={supplier.siret || ''}
                    onChange={(e) => handleInputChange('siret', e.target.value)}
                    placeholder="12345678901234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro de TVA
                  </label>
                  <Input
                    value={supplier.vat_number || ''}
                    onChange={(e) => handleInputChange('vat_number', e.target.value)}
                    placeholder="FR12345678901"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forme juridique
                  </label>
                  <Input
                    value={supplier.legal_form || ''}
                    onChange={(e) => handleInputChange('legal_form', e.target.value)}
                    placeholder="SARL, SAS, etc."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Capital
                  </label>
                  <Input
                    type="number"
                    value={supplier.capital || ''}
                    onChange={(e) => handleInputChange('capital', parseFloat(e.target.value) || 0)}
                    placeholder="10000"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={supplier.notes || ''}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                placeholder="Notes supplémentaires..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>

            {/* Boutons d'action */}
            <div className="mt-8 flex justify-end space-x-4">
              <Button 
                variant="outline" 
                onClick={() => router.push('/suppliers')}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button 
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
