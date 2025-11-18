'use client'

import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface TokenUsageData {
  byMonth: Array<{
    month: string
    input_tokens: number
    output_tokens: number
    total_tokens: number
    total_cost: number
    total_cost_marked_up: number
    count: number
  }>
  total: {
    tokens: number
    cost: number
    costMarkedUp: number
  }
  summary: Array<{
    operation: string
    total_tokens: number
    total_cost_marked_up: number
    count: number
  }>
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { 
    style: 'currency', 
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  }).format(amount)
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(num)
}

export function TokenUsage() {
  const [data, setData] = useState<TokenUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/token-usage')
        if (!res.ok) {
          console.error('Erreur chargement token usage')
          return
        }
        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error('Erreur token usage:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-4 animate-pulse"></div>
        <div className="h-64 bg-gray-200 rounded animate-pulse"></div>
      </div>
    )
  }

  if (!data || data.byMonth.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Consommation de tokens</h2>
        <p className="text-sm text-gray-500">Aucune donnée disponible</p>
      </div>
    )
  }

  // Préparer les données pour le graphique (cumul mensuel)
  const chartData = data.byMonth.map((month, index) => {
    const cumulativeCost = data.byMonth
      .slice(0, index + 1)
      .reduce((sum, m) => sum + m.total_cost_marked_up, 0)
    
    return {
      month: month.month,
      'Coût (USD)': Number(month.total_cost_marked_up.toFixed(4)),
      'Cumul': Number(cumulativeCost.toFixed(4)),
    }
  })

  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Consommation de tokens</h2>
        <p className="text-sm text-gray-500">
          Suivi de l'utilisation des tokens OpenAI avec majoration de 5%
        </p>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Total tokens</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatNumber(data.total.tokens)}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Coût total</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatCurrency(data.total.cost)}
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg">
          <p className="text-sm text-gray-600 mb-1">Coût majoré (5%)</p>
          <p className="text-2xl font-semibold text-gray-900">
            {formatCurrency(data.total.costMarkedUp)}
          </p>
        </div>
      </div>

      {/* Graphique cumul mensuel */}
      <div>
        <h3 className="text-md font-medium text-gray-800 mb-3">Évolution mensuelle (cumul)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="month" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)}
              labelFormatter={(label) => `Mois: ${label}`}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="Cumul" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
            <Line 
              type="monotone" 
              dataKey="Coût (USD)" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tableau détaillé par mois */}
      <div>
        <h3 className="text-md font-medium text-gray-800 mb-3">Détail par mois</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mois
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coût (USD)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Coût majoré (USD)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Opérations
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.byMonth.map((month) => (
                <tr key={month.month}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {month.month}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(month.total_tokens)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatCurrency(month.total_cost)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-right">
                    {formatCurrency(month.total_cost_marked_up)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                    {month.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Résumé par type d'opération */}
      {data.summary.length > 0 && (
        <div>
          <h3 className="text-md font-medium text-gray-800 mb-3">Par type d'opération</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.summary.map((item) => (
              <div key={item.operation} className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  {item.operation === 'extraction' ? 'Extraction' : 
                   item.operation === 'classification' ? 'Classification' : 
                   item.operation === 'embedding' ? 'Embedding' : item.operation}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  {formatNumber(item.total_tokens)} tokens · {item.count} opérations
                </p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(item.total_cost_marked_up)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

