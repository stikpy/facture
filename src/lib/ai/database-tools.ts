/**
 * Outils de base de données pour le chatbot
 * Utilise le serveur MCP Supabase pour interagir avec la base de données
 */

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

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
 * Outil pour exécuter des requêtes SQL SELECT (lecture seule)
 */
export const executeSQLQueryTool = new DynamicStructuredTool({
  name: 'execute_sql_query',
  description: `Exécute une requête SQL SELECT sur la base de données Supabase.
  UTILISEZ CET OUTIL pour répondre à des questions complexes qui nécessitent des requêtes SQL personnalisées.
  IMPORTANT: 
  - Seules les requêtes SELECT sont autorisées (lecture seule)
  - Toujours filtrer par organization_id pour respecter la sécurité
  - Limiter les résultats à 100 lignes maximum
  - Utiliser des paramètres pour éviter les injections SQL
  
  Exemples d'utilisation:
  - "Combien de factures par fournisseur cette année?"
  - "Quels sont les produits les plus achetés?"
  - "Montant total par centre de coûts pour septembre 2025"`,
  schema: z.object({
    query: z.string().describe('Requête SQL SELECT à exécuter. Doit être une requête de lecture seule.'),
    description: z.string().optional().describe('Description de ce que vous cherchez à obtenir avec cette requête'),
  }),
  func: async ({ query, description }) => {
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
      
      // Exécuter la requête via Supabase (utilise RLS automatiquement)
      // Note: Supabase ne permet pas d'exécuter du SQL arbitraire directement
      // On doit utiliser l'API Supabase ou des fonctions RPC
      
      // Pour l'instant, retourner un message indiquant qu'il faut utiliser les outils spécifiques
      return `Pour exécuter des requêtes SQL, utilisez les outils spécifiques disponibles:
      - Pour les factures: utilisez les données déjà récupérées dans le contexte
      - Pour les allocations: utilisez les données déjà récupérées dans le contexte
      - Pour les statistiques: utilisez les données déjà récupérées dans le contexte
      
      Si vous avez besoin de données spécifiques, décrivez-les et je les récupérerai via l'API Supabase.`
    } catch (error: any) {
      return `Erreur lors de l'exécution de la requête: ${error.message}`
    }
  },
})

/**
 * Outil pour lister les tables disponibles
 */
export const listTablesTool = new DynamicStructuredTool({
  name: 'list_database_tables',
  description: `Liste toutes les tables disponibles dans la base de données.
  Utilisez cet outil pour comprendre la structure de la base de données avant de faire des requêtes.`,
  schema: z.object({
    schema: z.string().optional().default('public').describe('Schéma de la base de données (par défaut: public)'),
  }),
  func: async ({ schema }) => {
    try {
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
      
      return `Tables disponibles dans le schéma "${schema}":\n${tables.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
    } catch (error: any) {
      return `Erreur lors de la récupération des tables: ${error.message}`
    }
  },
})

/**
 * Outil pour obtenir le schéma d'une table
 */
export const getTableSchemaTool = new DynamicStructuredTool({
  name: 'get_table_schema',
  description: `Obtient le schéma (colonnes, types) d'une table spécifique.
  Utilisez cet outil pour comprendre la structure d'une table avant de faire des requêtes.`,
  schema: z.object({
    tableName: z.string().describe('Nom de la table dont vous voulez connaître le schéma'),
  }),
  func: async ({ tableName }) => {
    try {
      // Schémas des tables principales (basés sur les migrations)
      const schemas: Record<string, string> = {
        invoices: `Table: invoices
Colonnes:
  - id (uuid, PK)
  - user_id (uuid, FK -> users)
  - organization_id (uuid, FK -> organizations)
  - supplier_id (uuid, FK -> suppliers)
  - file_name (text)
  - file_path (text)
  - file_size (bigint)
  - mime_type (text)
  - extracted_data (jsonb) - Contient: invoice_number, supplier_name, invoice_date, total_amount, subtotal, items[], etc.
  - status (text) - 'pending', 'processing', 'completed', 'error', 'duplicate', 'queued', 'awaiting_user'
  - classification (text)
  - created_at (timestamptz)
  - updated_at (timestamptz)`,

        invoice_allocations: `Table: invoice_allocations
Colonnes:
  - id (uuid, PK)
  - invoice_id (uuid, FK -> invoices)
  - user_id (uuid, FK -> users)
  - organization_id (uuid, FK -> organizations)
  - account_code (text) - Code du compte comptable
  - label (text) - Libellé du centre de coûts
  - amount (decimal) - Montant HT
  - vat_code (text) - Code TVA
  - vat_rate (numeric) - Taux de TVA (%)
  - item_indices (jsonb) - Indices des articles de la facture ventilés
  - created_at (timestamptz)
  - updated_at (timestamptz)`,

        organization_accounts: `Table: organization_accounts
Colonnes:
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - code (text) - Code du compte (ex: 1003)
  - label (text) - Libellé (ex: solide_pdj)
  - created_at (timestamptz)
  - updated_at (timestamptz)`,

        organization_vat_codes: `Table: organization_vat_codes
Colonnes:
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - code (text) - Code TVA (ex: A, S, I, 1)
  - label (text) - Libellé
  - rate (numeric) - Taux de TVA (%)
  - created_at (timestamptz)
  - updated_at (timestamptz)`,

        products: `Table: products
Colonnes:
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - supplier_id (uuid, FK -> suppliers)
  - reference (text) - Référence produit
  - name (text) - Nom du produit
  - description (text)
  - price (decimal) - Prix unitaire HT
  - vat_rate (decimal) - Taux de TVA
  - vat_code (text) - Code TVA
  - unit (text) - Unité (kg, litre, pièce, etc.)
  - is_active (boolean)
  - created_at (timestamptz)
  - updated_at (timestamptz)`,

        suppliers: `Table: suppliers
Colonnes:
  - id (uuid, PK)
  - organization_id (uuid, FK -> organizations)
  - display_name (text) - Nom d'affichage
  - code (text) - Code fournisseur
  - normalized_key (text) - Clé normalisée pour la correspondance
  - is_active (boolean)
  - created_at (timestamptz)
  - updated_at (timestamptz)`,
      }

      const schema = schemas[tableName.toLowerCase()]
      if (schema) {
        return schema
      }

      return `Table "${tableName}" non trouvée. Tables disponibles: ${Object.keys(schemas).join(', ')}`
    } catch (error: any) {
      return `Erreur lors de la récupération du schéma: ${error.message}`
    }
  },
})

/**
 * Outil pour rechercher des données dans une table avec filtres
 */
export const searchTableDataTool = new DynamicStructuredTool({
  name: 'search_table_data',
  description: `Recherche des données dans une table avec des filtres spécifiques.
  Utilisez cet outil pour récupérer des données précises qui ne sont pas dans le contexte initial.`,
  schema: z.object({
    tableName: z.string().describe('Nom de la table à interroger'),
    filters: z.record(z.any()).optional().describe('Filtres à appliquer (ex: { organization_id: "...", status: "completed" })'),
    columns: z.array(z.string()).optional().describe('Colonnes à récupérer (par défaut: toutes)'),
    limit: z.number().optional().default(50).describe('Nombre maximum de résultats (défaut: 50, max: 100)'),
    description: z.string().optional().describe('Description de ce que vous cherchez'),
  }),
  func: async ({ tableName, filters = {}, columns, limit = 50 }) => {
    try {
      const supabase = await getSupabaseClient()
      
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
      
      if (!organizationId && filters.organization_id) {
        organizationId = filters.organization_id as string
      }
      
      if (!organizationId) {
        return 'ERREUR: Aucune organisation trouvée. Veuillez fournir organization_id dans les filtres ou être authentifié.'
      }

      // Toujours filtrer par organization_id pour la sécurité
      filters.organization_id = organizationId

      // Gérer le filtrage par date pour invoice_allocations
      let invoiceDateFilter: { startDate?: string, endDate?: string } = {}
      if (tableName === 'invoice_allocations' && filters.invoice_date) {
        const dateValue = new Date(filters.invoice_date as string)
        const year = dateValue.getFullYear()
        const month = dateValue.getMonth() + 1
        invoiceDateFilter.startDate = `${year}-${String(month).padStart(2, '0')}-01`
        invoiceDateFilter.endDate = month === 12 
          ? `${year + 1}-01-01`
          : `${year}-${String(month + 1).padStart(2, '0')}-01`
        // Retirer invoice_date des filtres car on le gère séparément
        delete filters.invoice_date
      }

      // Construire la requête
      let selectClause = columns?.join(',') || '*'
      if (tableName === 'invoice_allocations' && invoiceDateFilter.startDate) {
        // Joindre avec invoices pour filtrer par date
        selectClause = `${selectClause}, invoices!inner(id, invoice_date, extracted_data)`
      }
      let query = supabase.from(tableName).select(selectClause)
      
      // Appliquer les filtres (sauf invoice_date qui est géré séparément)
      Object.entries(filters).forEach(([key, value]) => {
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
      const actualLimit = Math.min(limit, 100)
      query = query.limit(actualLimit)

      const { data, error } = await query

      if (error) {
        return `ERREUR: ${error.message}`
      }

      if (!data || data.length === 0) {
        return `Aucun résultat trouvé dans la table "${tableName}" avec les filtres appliqués.`
      }

      return `Résultats de la table "${tableName}" (${data.length} résultat(s)):\n${JSON.stringify(data, null, 2)}`
    } catch (error: any) {
      return `Erreur lors de la recherche: ${error.message}`
    }
  },
})

/**
 * Liste de tous les outils de base de données disponibles
 */
export const databaseTools = [
  listTablesTool,
  getTableSchemaTool,
  searchTableDataTool,
  // executeSQLQueryTool - désactivé pour l'instant car Supabase ne permet pas SQL arbitraire
]

