'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

type SupplierFormData = {
  name: string
  display_name: string
  code: string
  legal_name: string
  address: string
  city: string
  postal_code: string
  country: string
  email: string
  phone: string
  website: string
  siret: string
  vat_number: string
  registration_number: string
  legal_form: string
  capital: number
  activity_code: string
  notes: string
  is_active: boolean
}

export default function NewSupplierPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    display_name: '',
    code: '',
    legal_name: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'France',
    email: '',
    phone: '',
    website: '',
    siret: '',
    vat_number: '',
    registration_number: '',
    legal_form: '',
    capital: 0,
    activity_code: '',
    notes: '',
    is_active: true
  })
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

  // Générer automatiquement le code et la clé normalisée
  useEffect(() => {
    if (formData.display_name && !formData.code) {
      const code = formData.display_name
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 8)
        + '-001'
      
      const normalizedKey = formData.display_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
      
      setFormData(prev => ({
        ...prev,
        code,
        normalized_key: normalizedKey
      }))
    }
  }, [formData.display_name])

  const handleInputChange = (field: keyof SupplierFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!formData.display_name || !formData.code) {
      alert('Le nom d\'affichage et le code sont obligatoires')
      return
    }

    try {
      setSaving(true)
      const supabase = createClient()
      
      // Récupérer l'organisation de l'utilisateur
      const { data: userOrgs, error: orgError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)

      if (orgError || !userOrgs || userOrgs.length === 0) {
        alert('Erreur: Aucune organisation trouvée pour cet utilisateur')
        return
      }

      const organizationId = userOrgs[0].organization_id

      // Générer la clé normalisée si elle n'existe pas
      const normalizedKey = formData.display_name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim()

      const { error } = await supabase
        .from('suppliers')
        .insert({
          name: formData.name || formData.display_name,
          display_name: formData.display_name,
          code: formData.code,
          normalized_key: normalizedKey,
          legal_name: formData.legal_name || null,
          address: formData.address || null,
          city: formData.city || null,
          postal_code: formData.postal_code || null,
          country: formData.country || null,
          email: formData.email || null,
          phone: formData.phone || null,
          website: formData.website || null,
          siret: formData.siret || null,
          vat_number: formData.vat_number || null,
          registration_number: formData.registration_number || null,
          legal_form: formData.legal_form || null,
          capital: formData.capital || null,
          activity_code: formData.activity_code || null,
          notes: formData.notes || null,
          is_active: formData.is_active,
          organization_id: organizationId,
          created_by: user.id
        })

      if (error) {
        console.error('Erreur lors de la création:', error)
        alert('Erreur lors de la création du fournisseur')
        return
      }

      alert('Fournisseur créé avec succès!')
      router.push('/suppliers')
    } catch (error) {
      console.error('Erreur lors de la création:', error)
      alert('Erreur lors de la création du fournisseur')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return <LoadingSpinner />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                Nouveau fournisseur
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
                    value={formData.display_name}
                    onChange={(e) => handleInputChange('display_name', e.target.value)}
                    placeholder="Nom d'affichage"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom commercial
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Nom commercial"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Code *
                  </label>
                  <Input
                    value={formData.code}
                    onChange={(e) => handleInputChange('code', e.target.value)}
                    placeholder="Code unique"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Raison sociale
                  </label>
                  <Input
                    value={formData.legal_name}
                    onChange={(e) => handleInputChange('legal_name', e.target.value)}
                    placeholder="Raison sociale"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
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
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="email@exemple.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="01 23 45 67 89"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Site web
                  </label>
                  <Input
                    value={formData.website}
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
                    value={formData.address}
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
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Paris"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code postal
                    </label>
                    <Input
                      value={formData.postal_code}
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
                    value={formData.country}
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
                    value={formData.siret}
                    onChange={(e) => handleInputChange('siret', e.target.value)}
                    placeholder="12345678901234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro de TVA
                  </label>
                  <Input
                    value={formData.vat_number}
                    onChange={(e) => handleInputChange('vat_number', e.target.value)}
                    placeholder="FR12345678901"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Forme juridique
                  </label>
                  <Input
                    value={formData.legal_form}
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
                    value={formData.capital}
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
                value={formData.notes}
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
                disabled={saving || !formData.display_name || !formData.code}
              >
                {saving ? 'Création...' : 'Créer le fournisseur'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
