'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Supplier = Database['public']['Tables']['suppliers']['Row']
type SupplierInsert = Database['public']['Tables']['suppliers']['Insert']
type SupplierUpdate = Database['public']['Tables']['suppliers']['Update']

// Type pour le formulaire (sans les champs auto-générés)
type SupplierFormData = {
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
  notes?: string
  is_active: boolean
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

// Utilisation des types générés par Supabase

interface SupplierFormProps {
  supplier?: Supplier
  onSave: (supplier: SupplierFormData) => void
  onCancel: () => void
}

export default function SupplierForm({ supplier, onSave, onCancel }: SupplierFormProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    name: '',
    display_name: '',
    code: '',
    normalized_key: '',
    legal_name: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'FRANCE',
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
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (supplier) {
      // Convertir Supplier en SupplierFormData
      setFormData({
        name: supplier.name || '',
        display_name: supplier.display_name || '',
        code: supplier.code || '',
        normalized_key: supplier.normalized_key || '',
        legal_name: supplier.legal_name || '',
        address: supplier.address || '',
        city: supplier.city || '',
        postal_code: supplier.postal_code || '',
        country: supplier.country || '',
        email: supplier.email || '',
        phone: supplier.phone || '',
        website: supplier.website || '',
        siret: supplier.siret || '',
        vat_number: supplier.vat_number || '',
        registration_number: supplier.registration_number || '',
        legal_form: supplier.legal_form || '',
        capital: supplier.capital || 0,
        activity_code: supplier.activity_code || '',
        notes: supplier.notes || '',
        is_active: supplier.is_active || true
      })
    }
  }, [supplier])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Le nom du fournisseur est requis'
    }

    if (!formData.display_name.trim()) {
      newErrors.display_name = 'Le nom d\'affichage est requis'
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Format d\'email invalide'
    }

    if (formData.siret && !/^\d{14}$/.test(formData.siret.replace(/\s/g, ''))) {
      newErrors.siret = 'Le SIRET doit contenir 14 chiffres'
    }

    if (formData.vat_number && !/^[A-Z]{2}[A-Z0-9]{2,12}$/.test(formData.vat_number)) {
      newErrors.vat_number = 'Format de numéro de TVA invalide'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      if (supplier?.id) {
        // Mise à jour
        const updateData: SupplierUpdate = {
          name: formData.name,
          display_name: formData.display_name,
          code: formData.code,
          normalized_key: formData.normalized_key,
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
          is_active: formData.is_active
        }
        
        const { error } = await (supabase as any)
          .from('suppliers')
          .update(updateData)
          .eq('id', supplier.id)

        if (error) throw error
      } else {
        // Création
        const insertData: SupplierInsert = {
          name: formData.name,
          display_name: formData.display_name,
          code: formData.code,
          normalized_key: formData.normalized_key,
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
          is_active: formData.is_active
        }
        
        const { error } = await (supabase as any)
          .from('suppliers')
          .insert(insertData)

        if (error) throw error
      }

      onSave(formData)
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      setErrors({ general: 'Erreur lors de la sauvegarde' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof SupplierFormData, value: string | number | boolean) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value }
      
      // Génération automatique du code et de la clé normalisée
      if (field === 'name' || field === 'display_name') {
        const name = field === 'name' ? value as string : newData.name
        const displayName = field === 'display_name' ? value as string : newData.display_name
        
        if (name && displayName) {
          // Générer le code (format: PREFIX-001)
          const prefix = name.substring(0, 6).toUpperCase().replace(/[^A-Z]/g, '')
          const normalizedKey = displayName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
          
          newData.code = `${prefix}-001` // Sera mis à jour côté serveur
          newData.normalized_key = normalizedKey
        }
      }
      
      return newData
    })
    
    // Effacer l'erreur du champ modifié
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.general && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {errors.general}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Informations générales */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Informations générales</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom commercial *
            </label>
            <Input
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom d'affichage *
            </label>
            <Input
              value={formData.display_name}
              onChange={(e) => handleChange('display_name', e.target.value)}
              className={errors.display_name ? 'border-red-500' : ''}
            />
            {errors.display_name && <p className="text-red-500 text-sm mt-1">{errors.display_name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code (généré automatiquement)
            </label>
            <Input
              value={formData.code}
              disabled
              className="bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dénomination sociale
            </label>
            <Input
              value={formData.legal_name || ''}
              onChange={(e) => handleChange('legal_name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse
            </label>
            <Input
              value={formData.address || ''}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ville
              </label>
              <Input
                value={formData.city || ''}
                onChange={(e) => handleChange('city', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Code postal
              </label>
              <Input
                value={formData.postal_code || ''}
                onChange={(e) => handleChange('postal_code', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Contact</h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <Input
              type="email"
              value={formData.email || ''}
              onChange={(e) => handleChange('email', e.target.value)}
              className={errors.email ? 'border-red-500' : ''}
            />
            {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Téléphone
            </label>
            <Input
              value={formData.phone || ''}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site web
            </label>
            <Input
              value={formData.website || ''}
              onChange={(e) => handleChange('website', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Informations légales */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Informations légales</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SIRET
            </label>
            <Input
              value={formData.siret || ''}
              onChange={(e) => handleChange('siret', e.target.value)}
              className={errors.siret ? 'border-red-500' : ''}
            />
            {errors.siret && <p className="text-red-500 text-sm mt-1">{errors.siret}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Numéro de TVA
            </label>
            <Input
              value={formData.vat_number || ''}
              onChange={(e) => handleChange('vat_number', e.target.value)}
              className={errors.vat_number ? 'border-red-500' : ''}
            />
            {errors.vat_number && <p className="text-red-500 text-sm mt-1">{errors.vat_number}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Forme juridique
            </label>
            <Input
              value={formData.legal_form || ''}
              onChange={(e) => handleChange('legal_form', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Capital (€)
            </label>
            <Input
              type="number"
              value={formData.capital || ''}
              onChange={(e) => handleChange('capital', parseFloat(e.target.value) || 0)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code activité
            </label>
            <Input
              value={formData.activity_code || ''}
              onChange={(e) => handleChange('activity_code', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
        />
      </div>

      {/* Statut */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="is_active"
          checked={formData.is_active}
          onChange={(e) => handleChange('is_active', e.target.checked)}
          className="rounded"
        />
        <label htmlFor="is_active" className="ml-2 text-sm font-medium text-gray-700">
          Fournisseur actif
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? <LoadingSpinner /> : supplier?.id ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </form>
  )
}
