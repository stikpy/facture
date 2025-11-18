'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

interface ColumnInfo {
  name: string
  type: string
  nullable: boolean
  default: string | null
}

export default function DatabaseExplorerPage() {
  const [tables, setTables] = useState<TableInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  useEffect(() => {
    loadDatabaseInfo()
  }, [])

  const loadDatabaseInfo = async () => {
    setLoading(true)
    const supabase = createClient()

    // Liste des tables connues
    const tableNames = [
      'users',
      'organizations',
      'organization_members',
      'suppliers',
      'invoices',
      'invoice_items',
      'invoice_allocations',
      'organization_accounts',
      'organization_vat_codes',
      'organization_invites',
      'processing_queue',
      'products',
      'document_embeddings',
      'token_usage',
      'inbound_aliases',
    ]

    const tablesData: TableInfo[] = []

    for (const tableName of tableNames) {
      try {
        // Récupérer le nombre de lignes
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })

        // Récupérer un exemple de ligne pour déduire les colonnes
        const { data: sample } = await supabase
          .from(tableName)
          .select('*')
          .limit(1)
          .single()

        const columns: ColumnInfo[] = []
        if (sample) {
          Object.entries(sample).forEach(([key, value]) => {
            columns.push({
              name: key,
              type: typeof value === 'object' && value !== null ? 'jsonb' : typeof value,
              nullable: value === null,
              default: null,
            })
          })
        }

        tablesData.push({
          name: tableName,
          columns,
          rowCount: count || 0,
        })
      } catch (error: any) {
        // Table n'existe pas ou erreur d'accès
        console.warn(`Table ${tableName}:`, error.message)
      }
    }

    setTables(tablesData)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Explorateur de Base de Données</h1>
        <p>Chargement...</p>
      </div>
    )
  }

  const selectedTableData = tables.find(t => t.name === selectedTable)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Explorateur de Base de Données</h1>
      <p className="text-gray-600 mb-6">
        Vue d'ensemble de toutes les tables de la base de données. 
        Pour les détails complets (contraintes, index, RLS), consultez les migrations SQL dans <code>supabase/migrations/</code>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Liste des tables */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold mb-4">Tables ({tables.length})</h2>
          <div className="space-y-2">
            {tables.map((table) => (
              <button
                key={table.name}
                onClick={() => setSelectedTable(table.name)}
                className={`w-full text-left p-2 rounded ${
                  selectedTable === table.name
                    ? 'bg-blue-100 text-blue-900'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="font-mono text-sm">{table.name}</div>
                <div className="text-xs text-gray-500">{table.rowCount} lignes</div>
              </button>
            ))}
          </div>
        </div>

        {/* Détails de la table sélectionnée */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-4">
          {selectedTableData ? (
            <>
              <h2 className="font-semibold mb-4">
                Table: <code className="text-blue-600">{selectedTableData.name}</code>
              </h2>
              <div className="mb-4">
                <span className="text-sm text-gray-600">
                  {selectedTableData.rowCount} ligne(s)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Colonne</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Nullable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTableData.columns.map((col) => (
                      <tr key={col.name} className="border-b">
                        <td className="p-2 font-mono">{col.name}</td>
                        <td className="p-2 text-gray-600">{col.type}</td>
                        <td className="p-2">
                          {col.nullable ? (
                            <span className="text-orange-600">Oui</span>
                          ) : (
                            <span className="text-green-600">Non</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 bg-yellow-50 rounded text-sm text-yellow-800">
                <strong>Note:</strong> Pour les détails complets (contraintes, clés étrangères, index, politiques RLS), 
                consultez les fichiers de migration dans <code>supabase/migrations/</code>
              </div>
            </>
          ) : (
            <p className="text-gray-500">Sélectionnez une table pour voir ses détails</p>
          )}
        </div>
      </div>
    </div>
  )
}

