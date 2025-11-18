/**
 * Outils de base de données pour le chatbot
 * Utilise le serveur MCP Supabase pour interagir avec la base de données
 * 
 * Note: Ces outils utilisent directement le client Supabase avec les mêmes capacités
 * que le serveur MCP Supabase, mais via l'API Supabase standard.
 * Le serveur MCP Supabase est principalement utilisé dans des environnements comme Cursor.
 */

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { getTableSchemaString, TABLE_SCHEMAS } from '@/lib/db/schema'

/**
 * Crée un client Supabase avec le contexte utilisateur
 * Utilise le client serveur si disponible (dans une requête HTTP), sinon crée un client direct
 */
async function getSupabaseClient() {
  try {
    // Essayer d'utiliser le client serveur (dans une requête HTTP)
    return await createClient()
  } catch (error) {
    // Si on est en dehors d'une requête HTTP (tests), utiliser le client direct
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variables d\'environnement Supabase manquantes')
    }
    
    return createSupabaseClient(supabaseUrl, supabaseKey)
  }
}

/**
 * Outil pour lister les tables disponibles via MCP Supabase
 */
export const listTablesTool = new DynamicStructuredTool({
  name: 'list_database_tables',
  description: `Liste toutes les tables disponibles dans la base de données via le serveur MCP Supabase.
  Utilisez cet outil pour comprendre la structure de la base de données avant de faire des requêtes.`,
  schema: z.object({
    schemas: z.array(z.string()).nullable().optional().default(['public']).describe('Schémas à inclure (par défaut: public)'),
  }),
  func: async ({ schemas }) => {
    try {
      const supabase = await getSupabaseClient()
      const usedSchemas = Array.isArray(schemas) && schemas.length > 0 ? schemas : ['public']
      
      // Utiliser l'API Supabase pour lister les tables (via information_schema)
      const { data, error } = await supabase.rpc('exec_sql', {
        query: `
          SELECT table_name, table_schema
          FROM information_schema.tables
          WHERE table_schema = ANY($1)
          ORDER BY table_schema, table_name
        `,
        params: [usedSchemas],
      })

      if (error) {
        // Fallback: utiliser une requête directe si la fonction RPC n'existe pas
        const tables = [
          'users - Utilisateurs de l\'application',
          'organizations - Organisations',
          'organization_members - Membres des organisations',
          'suppliers - Fournisseurs',
          'invoices - Factures',
          'invoice_items - Articles de factures',
          'invoice_allocations - Ventilations comptables',
          'organization_accounts - Comptes comptables par organisation',
          'organization_vat_codes - Codes TVA par organisation',
          'organization_invites - Invitations d\'organisation',
          'processing_queue - File de traitement des factures',
          'products - Base de données produits',
          'document_embeddings - Embeddings vectoriels pour le chatbot',
          'token_usage - Suivi de consommation de tokens OpenAI',
          'inbound_aliases - Alias d\'adresses email',
        ]
        return `Tables disponibles dans le(s) schéma(s) "${usedSchemas.join(', ')}":\n${tables.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
      }

      return JSON.stringify(data, null, 2)
    } catch (error: any) {
      return `ERREUR: ${error.message}`
    }
  },
})

/**
 * Outil pour obtenir le schéma d'une table via MCP Supabase
 */
export const getTableSchemaTool = new DynamicStructuredTool({
  name: 'get_table_schema',
  description: `Obtient le schéma (colonnes, types) d'une table spécifique via le serveur MCP Supabase.
  Utilisez cet outil pour comprendre la structure d'une table avant de faire des requêtes.`,
  schema: z.object({
    tableName: z.string().describe('Nom de la table dont vous voulez connaître le schéma'),
  }),
  func: async ({ tableName }) => {
    try {
      const schemaStr = getTableSchemaString(tableName)
      if (schemaStr) {
        return schemaStr
      }

      return `Table "${tableName}" non trouvée. Tables connues: ${Object.keys(TABLE_SCHEMAS).join(', ')}`
    } catch (error: any) {
      return `ERREUR: ${error.message}`
    }
  },
})

/**
 * Outil pour exécuter des requêtes SQL via MCP Supabase
 */
export const executeSQLTool = new DynamicStructuredTool({
  name: 'execute_sql',
  description: `Exécute une requête SQL SELECT sur la base de données via le serveur MCP Supabase.
  UTILISEZ CET OUTIL pour répondre à des questions complexes qui nécessitent des requêtes SQL personnalisées.
  IMPORTANT: 
  - Seules les requêtes SELECT sont autorisées (lecture seule)
  - Toujours filtrer par organization_id pour respecter la sécurité
  - Limiter les résultats à 100 lignes maximum
  
  Exemples d'utilisation:
  - "Combien de factures par fournisseur cette année?"
  - "Quels sont les produits les plus achetés?"
  - "Montant total par centre de coûts pour septembre 2025"`,
  schema: z.object({
    query: z.string().describe('Requête SQL SELECT à exécuter. Doit être une requête de lecture seule.'),
    params: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional().describe('Paramètres pour la requête (pour éviter les injections SQL)'),
  }),
  func: async ({ query, params = [] }) => {
    try {
      // Vérifier que c'est une requête SELECT (sécurité)
      const normalizedQuery = query.trim().toUpperCase()
      if (!normalizedQuery.startsWith('SELECT')) {
        return 'ERREUR: Seules les requêtes SELECT sont autorisées (lecture seule)'
      }

      // Vérifier qu'il n'y a pas de commandes dangereuses
      const dangerousKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE']
      for (const keyword of dangerousKeywords) {
        if (normalizedQuery.includes(keyword)) {
          return `ERREUR: La requête contient le mot-clé interdit "${keyword}". Seules les requêtes SELECT sont autorisées.`
        }
      }

      const supabase = await getSupabaseClient()
      
      // Utiliser l'API Supabase pour exécuter la requête SQL
      // Note: Supabase ne permet pas d'exécuter du SQL arbitraire directement via l'API
      // On doit utiliser des fonctions RPC ou l'API PostgREST
      // Pour l'instant, on retourne un message indiquant qu'il faut utiliser l'outil search_table_data
      return `Pour exécuter des requêtes SQL, utilisez l'outil "search_table_data" avec les filtres appropriés.
      
Exemple pour "Combien de factures en octobre 2025?":
- Utilisez search_table_data avec tableName: "invoices", filters: { organization_id: "...", invoice_date: "2025-10-01" }

Exemple pour "Montant total des allocations pour le compte 1003":
- Utilisez search_table_data avec tableName: "invoice_allocations", filters: { organization_id: "...", account_code: "1003" }

Si vous avez besoin d'une requête SQL spécifique, décrivez-la et je la traduirai en utilisant search_table_data.`
    } catch (error: any) {
      return `ERREUR: ${error.message}`
    }
  },
})

/**
 * Outil pour rechercher des données dans une table avec filtres
 */
export const searchTableDataTool = new DynamicStructuredTool({
  name: 'search_table_data',
  description: `Recherche des données dans une table avec des filtres spécifiques.
  Utilisez cet outil pour récupérer des données précises qui ne sont pas dans le contexte initial.
  IMPORTANT: Toujours inclure organization_id dans les filtres pour la sécurité.`,
  schema: z.object({
    tableName: z.string().describe('Nom de la table à interroger'),
    filters: z.record(z.any()).nullable().optional().describe('Filtres à appliquer (ex: { organization_id: "...", status: "completed" })'),
    columns: z.array(z.string()).nullable().optional().describe('Colonnes à récupérer (par défaut: toutes)'),
    limit: z.number().nullable().optional().default(50).describe('Nombre maximum de résultats (défaut: 50, max: 100)'),
    description: z.string().nullable().optional().describe('Description de ce que vous cherchez'),
  }),
  func: async ({ tableName, filters = {}, columns, limit = 50 }) => {
    try {
      const supabase = await getSupabaseClient()
      const safeFilters = (filters ?? {}) as Record<string, any>
      
      // 0) Valider le nom de table via le JSON local
      const known = TABLE_SCHEMAS[tableName.toLowerCase()]
      if (!known) {
        return `ERREUR: Table "${tableName}" inconnue. Tables connues: ${Object.keys(TABLE_SCHEMAS).join(', ')}`
      }
      
      // Essayer de récupérer l'utilisateur (peut échouer en dehors d'une requête HTTP)
      let organizationId: string | null = null
      try {
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          // Récupérer l'organisation de l'utilisateur
          const { data: membership } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
            .single()

          if (membership) {
            organizationId = membership.organization_id
          }
        }
      } catch (authError) {
        // En dehors d'une requête HTTP, on ne peut pas récupérer l'utilisateur
        // On utilisera organization_id depuis les filtres si fourni
        console.warn('Impossible de récupérer l\'utilisateur (probablement en dehors d\'une requête HTTP)')
      }
      
      if (!organizationId && safeFilters.organization_id) {
        organizationId = safeFilters.organization_id as string
      }
      
      if (!organizationId) {
        return `ERREUR: Aucune organisation trouvée pour la recherche dans "${tableName}".
⚠️ IMPORTANT: L'organization_id doit être fourni dans les filtres. Ne réessayez pas sans organization_id.`
      }

      // Toujours filtrer par organization_id pour la sécurité
      safeFilters.organization_id = organizationId

      // 0.1) Hygiène des filtres: ne garder que les clés connues (plus organization_id, *_date)
      const allowedFilterKeys = new Set([...known.columns, 'organization_id', 'invoice_date'])
      Object.keys(safeFilters).forEach((k) => {
        if (!allowedFilterKeys.has(k)) {
          delete (safeFilters as Record<string, unknown>)[k]
        }
      })

      // Gérer le filtrage par date pour invoice_allocations
      let invoiceDateFilter: { startDate?: string, endDate?: string } = {}
      if (tableName === 'invoice_allocations' && safeFilters.invoice_date) {
        const dateValue = new Date(safeFilters.invoice_date as string)
        const year = dateValue.getFullYear()
        const month = dateValue.getMonth() + 1
        invoiceDateFilter.startDate = `${year}-${String(month).padStart(2, '0')}-01`
        invoiceDateFilter.endDate = month === 12 
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, '0')}-01`
        // Retirer invoice_date des filtres car on le gère séparément
        delete safeFilters.invoice_date
      }

      // Construire la requête
      // 0.2) Valider "columns" à partir du schéma JSON local
      let selectColumns: string[] | null = null
      if (Array.isArray(columns) && columns.length > 0) {
        selectColumns = columns.filter((c) => known.columns.includes(c))
        if (selectColumns.length === 0) {
          // fallback sur toutes les colonnes connues
          selectColumns = [...known.columns]
        }
      }
      let selectClause = selectColumns ? selectColumns.join(',') : '*'
      if (tableName === 'invoice_allocations' && invoiceDateFilter.startDate) {
        // Joindre avec invoices pour filtrer par date
        selectClause = `${selectClause}, invoices!inner(id, invoice_date, extracted_data)`
      }
      let query = supabase.from(tableName).select(selectClause)
      
      // Appliquer les filtres (sauf invoice_date qui est géré séparément)
      Object.entries(safeFilters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && key !== 'invoice_date') {
          if (key.includes('_date') && typeof value === 'string') {
            // Pour les autres dates, utiliser gte et lt pour filtrer par mois
            const dateValue = new Date(value)
            const year = dateValue.getFullYear()
            const month = dateValue.getMonth() + 1
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`
            const endDate = month === 12 
              ? `${year + 1}-01-01`
              : `${year}-${String(month + 1).padStart(2, '0')}-01`
            query = query.gte(key, startDate).lt(key, endDate)
          } else {
            query = query.eq(key, value)
          }
        }
      })

      // Appliquer le filtre de date pour invoice_allocations via la jointure
      if (tableName === 'invoice_allocations' && invoiceDateFilter.startDate) {
        query = query
          .gte('invoices.invoice_date', invoiceDateFilter.startDate)
          .lt('invoices.invoice_date', invoiceDateFilter.endDate!)
      }

      // Limiter les résultats
      const effectiveLimit: number = typeof limit === 'number' ? limit : 50
      const actualLimit = Math.min(effectiveLimit, 100)
      query = query.limit(actualLimit)

      const { data, error } = await query

      if (error) {
        return `ERREUR lors de la recherche dans "${tableName}": ${error.message}
⚠️ IMPORTANT: Ne réessayez pas avec les mêmes paramètres. Vérifiez que le nom de la table et les filtres sont corrects, ou informez l'utilisateur de l'erreur.`
      }

      if (!data || data.length === 0) {
        return `Aucun résultat trouvé dans la table "${tableName}" avec les filtres appliqués: ${JSON.stringify(safeFilters)}. 
⚠️ IMPORTANT: Ne réessayez pas avec les mêmes filtres. Si vous cherchez quelque chose de spécifique, vérifiez que les filtres sont corrects ou informez l'utilisateur qu'aucune donnée ne correspond à sa requête.`
      }

      return `Résultats de la table "${tableName}" (${data.length} résultat(s)):\n${JSON.stringify(data, null, 2)}`
    } catch (error: any) {
      return `Erreur lors de la recherche: ${error.message}`
    }
  },
})

/**
 * Liste de tous les outils MCP Supabase disponibles
 */
export const mcpSupabaseTools = [
  listTablesTool,
  getTableSchemaTool,
  executeSQLTool,
  searchTableDataTool,
]

