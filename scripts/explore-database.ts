#!/usr/bin/env tsx

/**
 * Script pour explorer la structure complète de la base de données Supabase
 * Affiche toutes les tables, colonnes, types, contraintes, index, etc.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variables d\'environnement Supabase manquantes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface TableInfo {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  column_default: string | null
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
}

interface ConstraintInfo {
  table_name: string
  constraint_name: string
  constraint_type: string
  column_name: string | null
  foreign_table_name: string | null
  foreign_column_name: string | null
}

interface IndexInfo {
  tablename: string
  indexname: string
  indexdef: string
}

async function exploreDatabase() {
  console.log('🔍 Exploration de la base de données Supabase...\n')
  console.log('=' .repeat(80))

  try {
    // 1. Lister toutes les tables du schéma public
    console.log('\n📋 TABLES DU SCHÉMA PUBLIC:\n')
    const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `
    })

    if (tablesError) {
      // Alternative: utiliser une requête directe
      const { data: tablesData, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE')

      if (error) {
        console.error('❌ Erreur lors de la récupération des tables:', error)
        // Utiliser une liste manuelle basée sur les migrations
        const knownTables = [
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
        console.log('Tables connues (basées sur les migrations):')
        knownTables.forEach(table => console.log(`  - ${table}`))
        await exploreTableDetails(knownTables)
        return
      }
    }

    // 2. Pour chaque table, récupérer les détails
    const tableNames = tables?.map((t: any) => t.table_name) || []
    if (tableNames.length === 0) {
      // Fallback: utiliser les tables connues
      const knownTables = [
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
      await exploreTableDetails(knownTables)
    } else {
      await exploreTableDetails(tableNames)
    }

  } catch (error: any) {
    console.error('❌ Erreur lors de l\'exploration:', error)
  }
}

async function exploreTableDetails(tableNames: string[]) {
  for (const tableName of tableNames) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`\n📊 TABLE: ${tableName.toUpperCase()}`)
    console.log('='.repeat(80))

    try {
      // Colonnes et types
      const { data: columns, error: colsError } = await supabase
        .from('information_schema.columns')
        .select('*')
        .eq('table_schema', 'public')
        .eq('table_name', tableName)
        .order('ordinal_position')

      if (colsError) {
        console.log(`⚠️  Impossible de récupérer les colonnes: ${colsError.message}`)
        continue
      }

      if (columns && columns.length > 0) {
        console.log('\n📝 COLONNES:')
        console.log('-'.repeat(80))
        columns.forEach((col: any) => {
          let typeInfo = col.data_type
          if (col.character_maximum_length) {
            typeInfo += `(${col.character_maximum_length})`
          } else if (col.numeric_precision && col.numeric_scale) {
            typeInfo += `(${col.numeric_precision},${col.numeric_scale})`
          }
          const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
          const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : ''
          console.log(`  • ${col.column_name.padEnd(30)} ${typeInfo.padEnd(20)} ${nullable}${defaultVal}`)
        })
      }

      // Note: Les contraintes, index et politiques RLS nécessitent des requêtes SQL directes
      // qui ne sont pas accessibles via l'API Supabase standard
      // Consultez les migrations SQL dans supabase/migrations/ pour ces détails

      // Nombre de lignes
      const { count, error: countError } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })

      if (!countError) {
        console.log(`\n📊 NOMBRE DE LIGNES: ${count || 0}`)
      }

    } catch (error: any) {
      console.error(`❌ Erreur pour la table ${tableName}:`, error.message)
    }
  }

  console.log(`\n${'='.repeat(80)}`)
  console.log('\n✅ Exploration terminée!')
}

// Exécuter le script
exploreDatabase().catch(console.error)

