#!/usr/bin/env node

/**
 * Script simple pour créer les tables via l'API REST
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function createTables() {
  console.log('🚀 Création des tables...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // Créer les tables une par une avec des requêtes SQL simples
    const queries = [
      // Extension UUID
      `create extension if not exists "uuid-ossp";`,
      
      // Table users
      `create table if not exists public.users (
        id uuid references auth.users on delete cascade primary key,
        email text not null,
        full_name text not null,
        company_name text,
        created_at timestamp with time zone default timezone('utc'::text, now()) not null,
        updated_at timestamp with time zone default timezone('utc'::text, now()) not null
      );`,
      
      // Table invoices
      `create table if not exists public.invoices (
        id uuid default uuid_generate_v4() primary key,
        user_id uuid references public.users(id) on delete cascade not null,
        file_name text not null,
        file_path text not null,
        file_size bigint not null,
        mime_type text not null,
        extracted_data jsonb,
        classification text,
        status text default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
        created_at timestamp with time zone default timezone('utc'::text, now()) not null,
        updated_at timestamp with time zone default timezone('utc'::text, now()) not null
      );`,
      
      // Table invoice_items
      `create table if not exists public.invoice_items (
        id uuid default uuid_generate_v4() primary key,
        invoice_id uuid references public.invoices(id) on delete cascade not null,
        description text not null,
        quantity numeric(10,2) not null,
        unit_price numeric(10,2) not null,
        total_price numeric(10,2) not null,
        created_at timestamp with time zone default timezone('utc'::text, now()) not null
      );`
    ]
    
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      console.log(`⏳ Exécution de la requête ${i + 1}/${queries.length}...`)
      
      try {
        // Utiliser l'API REST pour exécuter du SQL
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey
          },
          body: JSON.stringify({ sql: query })
        })
        
        if (response.ok) {
          console.log(`✅ Requête ${i + 1} exécutée avec succès`)
        } else {
          const errorData = await response.text()
          console.log(`⚠️  Avertissement pour la requête ${i + 1}:`, errorData)
        }
      } catch (err) {
        console.log(`⚠️  Erreur pour la requête ${i + 1}:`, err.message)
      }
    }
    
    console.log('🎉 Création des tables terminée!')
    
    // Test final
    console.log('🧪 Test de connexion...')
    const { data, error } = await supabase.from('users').select('count').limit(1)
    
    if (error) {
      console.log('⚠️  Erreur lors du test final:', error.message)
    } else {
      console.log('✅ Test final réussi!')
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la création des tables:', error)
    process.exit(1)
  }
}

// Exécuter le script
createTables()
