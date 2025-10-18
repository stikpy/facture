#!/usr/bin/env node

/**
 * Script pour créer les tables via l'API REST Supabase
 */

// Charger les variables d'environnement
require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

async function createTables() {
  console.log('🚀 Création des tables via API REST...')
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Variables d\'environnement Supabase manquantes')
    process.exit(1)
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  try {
    // 1. Créer la table users
    console.log('📝 Création de la table users...')
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id')
      .limit(1)
    
    if (usersError && usersError.code === 'PGRST116') {
      console.log('✅ Table users n\'existe pas encore, création en cours...')
      // La table n'existe pas, on va la créer via une requête SQL brute
      const { error: createUsersError } = await supabase.rpc('exec_sql', {
        sql: `
          create table public.users (
            id uuid references auth.users on delete cascade primary key,
            email text not null,
            full_name text not null,
            company_name text,
            created_at timestamp with time zone default timezone('utc'::text, now()) not null,
            updated_at timestamp with time zone default timezone('utc'::text, now()) not null
          );
        `
      })
      
      if (createUsersError) {
        console.log('⚠️  Erreur lors de la création de users:', createUsersError.message)
      } else {
        console.log('✅ Table users créée avec succès')
      }
    } else {
      console.log('✅ Table users existe déjà')
    }
    
    // 2. Créer la table invoices
    console.log('📝 Création de la table invoices...')
    const { data: invoicesData, error: invoicesError } = await supabase
      .from('invoices')
      .select('id')
      .limit(1)
    
    if (invoicesError && invoicesError.code === 'PGRST116') {
      console.log('✅ Table invoices n\'existe pas encore, création en cours...')
      const { error: createInvoicesError } = await supabase.rpc('exec_sql', {
        sql: `
          create table public.invoices (
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
          );
        `
      })
      
      if (createInvoicesError) {
        console.log('⚠️  Erreur lors de la création de invoices:', createInvoicesError.message)
      } else {
        console.log('✅ Table invoices créée avec succès')
      }
    } else {
      console.log('✅ Table invoices existe déjà')
    }
    
    // 3. Créer la table invoice_items
    console.log('📝 Création de la table invoice_items...')
    const { data: itemsData, error: itemsError } = await supabase
      .from('invoice_items')
      .select('id')
      .limit(1)
    
    if (itemsError && itemsError.code === 'PGRST116') {
      console.log('✅ Table invoice_items n\'existe pas encore, création en cours...')
      const { error: createItemsError } = await supabase.rpc('exec_sql', {
        sql: `
          create table public.invoice_items (
            id uuid default uuid_generate_v4() primary key,
            invoice_id uuid references public.invoices(id) on delete cascade not null,
            description text not null,
            quantity numeric(10,2) not null,
            unit_price numeric(10,2) not null,
            total_price numeric(10,2) not null,
            created_at timestamp with time zone default timezone('utc'::text, now()) not null
          );
        `
      })
      
      if (createItemsError) {
        console.log('⚠️  Erreur lors de la création de invoice_items:', createItemsError.message)
      } else {
        console.log('✅ Table invoice_items créée avec succès')
      }
    } else {
      console.log('✅ Table invoice_items existe déjà')
    }
    
    console.log('🎉 Configuration des tables terminée!')
    
  } catch (error) {
    console.error('❌ Erreur lors de la création des tables:', error)
    process.exit(1)
  }
}

// Exécuter le script
createTables()
