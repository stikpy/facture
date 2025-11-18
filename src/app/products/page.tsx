'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface Product {
  id: string
  organization_id: string
  supplier_id: string
  reference: string
  name: string
  price: number
  vat_rate?: number
  vat_code?: string
  unit: string
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
  suppliers?: {
    id: string
    display_name: string
    code: string
  }
}

interface Supplier {
  id: string
  display_name: string
  code: string
}

export default function ProductsPage() {
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all')
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [sortKey, setSortKey] = useState<'name' | 'reference' | 'updated_at' | 'created_at' | 'price'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    supplier_id: '',
    reference: '',
    name: '',
    price: '',
    vat_rate: '',
    vat_code: '',
    unit: 'pièce',
    description: '',
    is_active: true
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('Erreur auth:', error)
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    if (user) {
      fetchSuppliers()
      fetchProducts()
    }
  }, [user, selectedSupplierId, showActiveOnly, debouncedSearch, page, pageSize, sortKey, sortDir])

  // Debounce recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300)
    return () => clearTimeout(t)
  }, [searchTerm])

  const fetchSuppliers = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!membership) return

      const { data: suppliersData, error } = await supabase
        .from('suppliers')
        .select('id, display_name, code')
        .eq('organization_id', membership.organization_id)
        .eq('is_active', true)
        .order('display_name', { ascending: true })

      if (error) {
        console.error('Erreur Supabase lors du chargement des fournisseurs:', error)
        throw error
      }
      setSuppliers(suppliersData || [])
    } catch (error) {
      console.error('Erreur lors du chargement des fournisseurs:', error)
    }
  }

  const fetchProducts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedSupplierId !== 'all') {
        params.append('supplier_id', selectedSupplierId)
      }
      if (showActiveOnly) {
        params.append('is_active', 'true')
      }
      if (debouncedSearch) {
        params.append('search', debouncedSearch)
      }
      params.append('limit', String(pageSize))
      params.append('offset', String(page * pageSize))
      params.append('sort', sortKey)
      params.append('dir', sortDir)

      const response = await fetch(`/api/products?${params.toString()}`)
      if (!response.ok) throw new Error('Erreur lors du chargement des produits')
      const { products: productsData, count } = await response.json()
      setProducts(productsData || [])
      setTotalCount(count || 0)
      // Ajuster la page si elle dépasse le total après un filtre
      const maxPage = Math.max(Math.ceil((count || 0) / pageSize) - 1, 0)
      if (page > maxPage) setPage(maxPage)
    } catch (error) {
      console.error('Erreur lors du chargement des produits:', error)
    } finally {
      setLoading(false)
    }
  }

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product)
      setFormData({
        supplier_id: product.supplier_id,
        reference: product.reference,
        name: product.name,
        price: product.price.toString(),
        vat_rate: product.vat_rate?.toString() || '',
        vat_code: product.vat_code || '',
        unit: product.unit || 'pièce',
        description: product.description || '',
        is_active: product.is_active
      })
    } else {
      setEditingProduct(null)
      setFormData({
        supplier_id: selectedSupplierId !== 'all' ? selectedSupplierId : '',
        reference: '',
        name: '',
        price: '',
        vat_rate: '',
        vat_code: '',
        unit: 'pièce',
        description: '',
        is_active: true
      })
    }
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingProduct(null)
    setFormData({
      supplier_id: '',
      reference: '',
      name: '',
      price: '',
      vat_rate: '',
      vat_code: '',
      unit: 'pièce',
      description: '',
      is_active: true
    })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products'
      const method = editingProduct ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const { error } = await response.json()
        alert(`Erreur: ${error}`)
        return
      }

      closeModal()
      fetchProducts()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      alert('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (productId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) return

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const { error } = await response.json()
        alert(`Erreur: ${error}`)
        return
      }

      fetchProducts()
    } catch (error) {
      console.error('Erreur lors de la suppression:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const toggleActive = async (product: Product) => {
    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !product.is_active })
      })

      if (!response.ok) {
        const { error } = await response.json()
        alert(`Erreur: ${error}`)
        return
      }

      fetchProducts()
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error)
      alert('Erreur lors de la mise à jour')
    }
  }

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Veuillez vous connecter</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Produits</h1>
            <p className="text-gray-600 mt-1">Gérez votre catalogue de produits par fournisseur</p>
          </div>
          <Button onClick={() => openModal()} size="lg">
            + Nouveau produit
          </Button>
        </div>

        {/* Filtres */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 sticky top-0 z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fournisseur
              </label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tous les fournisseurs</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recherche
              </label>
              <Input
                type="text"
                placeholder="Référence ou nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-end justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Afficher uniquement les produits actifs</span>
              </label>
              <div className="hidden md:flex items-center gap-2 ml-auto">
                <span className="text-sm text-gray-500">
                  {totalCount} résultat{totalCount > 1 ? 's' : ''}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des produits */}
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">Aucun produit trouvé</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-[80px] z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('reference')}>
                        Référence {sortKey === 'reference' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('name')}>
                        Nom {sortKey === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('price')}>
                        Prix HT {sortKey === 'price' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      TVA
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unité
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('updated_at')}>
                        Statut {sortKey === 'updated_at' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className={!product.is_active ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{product.reference}</span>
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => copyToClipboard(product.reference)}
                            title="Copier"
                          >
                            Copier
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span>{product.name}</span>
                          {product.description && (
                            <span className="text-xs text-gray-500 line-clamp-1">{product.description}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                            {product.suppliers?.display_name || 'N/A'}
                          </span>
                          {product.suppliers?.code && (
                            <span className="text-[10px] text-gray-500">({product.suppliers.code})</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Number(product.price).toFixed(2)} €
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.vat_rate ? `${product.vat_rate}%` : product.vat_code || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {product.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            product.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {product.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleActive(product)}
                          >
                            {product.is_active ? 'Désactiver' : 'Activer'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openModal(product)}
                          >
                            Modifier
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(product.id)}
                          >
                            Supprimer
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-3 border-t bg-white">
              <div className="text-sm text-gray-600">
                {totalCount === 0 ? '0' : `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, totalCount)}`} sur {totalCount}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(p - 1, 0))}
                  disabled={page === 0}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => ((p + 1) * pageSize < totalCount ? p + 1 : p))}
                  disabled={(page + 1) * pageSize >= totalCount}
                >
                  Suivant
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal d'édition/création */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-4">
                  {editingProduct ? 'Modifier le produit' : 'Nouveau produit'}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Fournisseur *
                    </label>
                    <select
                      value={formData.supplier_id}
                      onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                      disabled={!!editingProduct}
                    >
                      <option value="">Sélectionner un fournisseur</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Référence *
                      </label>
                      <Input
                        value={formData.reference}
                        onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unité
                      </label>
                      <Input
                        value={formData.unit}
                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                        placeholder="pièce, kg, litre..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nom du produit *
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Prix HT (€) *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Taux TVA (%)
                      </label>
                      <Input
                        type="number"
                        step="0.1"
                        value={formData.vat_rate}
                        onChange={(e) => setFormData({ ...formData, vat_rate: e.target.value })}
                        placeholder="5.5, 10, 20..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Code TVA
                      </label>
                      <Input
                        value={formData.vat_code}
                        onChange={(e) => setFormData({ ...formData, vat_code: e.target.value })}
                        placeholder="102, 200..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Produit actif</span>
                    </label>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <Button variant="outline" onClick={closeModal} disabled={saving}>
                    Annuler
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

