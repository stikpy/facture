'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { SearchBar } from './search-bar'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { formatCurrency, formatDate } from '@/lib/utils'
import { FileText, Search } from 'lucide-react'
import type { Invoice } from '@/types/database'

interface SearchResult {
  invoice: Invoice
  relevanceScore?: number
  matchedFields?: string[]
}

export function SearchResults() {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')

  const truncate = (value: string | undefined | null, max: number): string => {
    if (!value) return '—'
    return value.length > max ? value.slice(0, max - 3) + '...' : value
  }

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      setQuery('')
      return
    }

    setQuery(searchQuery)
    setLoading(true)

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`)
      const data = await response.json()

      if (data.success) {
        const searchResults: SearchResult[] = data.results.map((invoice: Invoice) => ({
          invoice,
          relevanceScore: Math.random(), // En production, utiliser un vrai score de pertinence
          matchedFields: ['supplier_name', 'total_amount'] // En production, déterminer les champs correspondants
        }))
        
        setResults(searchResults)
      } else {
        console.error('Erreur recherche:', data.error)
        setResults([])
      }
    } catch (error) {
      console.error('Erreur recherche:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800'
    }

    const labels = {
      pending: 'En attente',
      processing: 'En cours',
      completed: 'Terminé',
      error: 'Erreur'
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <SearchBar onSearch={handleSearch} />
      
      {loading && (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {query && !loading && results.length === 0 && (
        <div className="text-center py-12">
          <Search className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Aucun résultat trouvé
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Essayez avec d'autres mots-clés.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Résultats de recherche ({results.length})
            </h3>
            <span className="text-sm text-gray-500">
              Pour "{query}"
            </span>
          </div>

          <div className="space-y-3">
            {results.map((result) => (
              <div
                key={result.invoice.id}
                className="bg-white p-4 rounded-lg border hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <FileText className="h-5 w-5 text-gray-400 mt-1" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900" title={result.invoice.file_name}>
                        {truncate(result.invoice.file_name, 40)}
                      </h4>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatDate(result.invoice.created_at)}
                      </p>
                      
                      {result.invoice.extracted_data && (
                        <div className="mt-2 space-y-1">
                          {(result.invoice.extracted_data as any).supplier_name && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Fournisseur:</span> {truncate((result.invoice.extracted_data as any).supplier_name, 30)}
                            </p>
                          )}
                          {(result.invoice.extracted_data as any).total_amount && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Montant:</span> {formatCurrency((result.invoice.extracted_data as any).total_amount)}
                            </p>
                          )}
                          {(result.invoice.extracted_data as any).invoice_date && (
                            <p className="text-sm text-gray-600">
                              <span className="font-medium">Date:</span> {formatDate((result.invoice.extracted_data as any).invoice_date)}
                            </p>
                          )}
                        </div>
                      )}

                      {result.matchedFields && result.matchedFields.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500">
                            Correspondances: {result.matchedFields.join(', ')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(result.invoice.status)}
                    {result.relevanceScore && (
                      <span className="text-xs text-gray-500">
                        {Math.round(result.relevanceScore * 100)}% de pertinence
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
