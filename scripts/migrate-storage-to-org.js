#!/usr/bin/env node

// Migrate storage object paths from {userId}/... to {organization_id}/...
// and update invoices.file_path accordingly.

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, serviceKey)

async function main() {
  console.log('🔧 Migration storage vers organisation...')

  // 1) Récupérer toutes les factures avec file_path et org
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('id, file_path, organization_id')
  if (error) throw error

  const bucket = 'invoices'
  let moved = 0, skipped = 0

  for (const inv of invoices || []) {
    const oldPath = inv.file_path
    if (!oldPath) { skipped++; continue }
    const parts = oldPath.split('/')
    if (parts.length < 2) { skipped++; continue }

    const currentRoot = parts[0]
    const filename = parts.slice(1).join('/')
    const desiredRoot = inv.organization_id || currentRoot
    if (currentRoot === desiredRoot) { skipped++; continue }

    const newPath = `${desiredRoot}/${filename}`

    // Copier (download -> upload) puis supprimer ancien
    const { data: dl, error: dlErr } = await supabase.storage.from(bucket).download(oldPath)
    if (dlErr) { console.warn('Skip (download error):', oldPath, dlErr.message); skipped++; continue }
    const { error: upErr } = await supabase.storage.from(bucket).upload(newPath, dl, { upsert: false })
    if (upErr) { console.warn('Skip (upload error):', newPath, upErr.message); skipped++; continue }
    const { error: rmErr } = await supabase.storage.from(bucket).remove([oldPath])
    if (rmErr) { console.warn('Warn: could not remove', oldPath, rmErr.message) }

    const { error: updErr } = await supabase
      .from('invoices')
      .update({ file_path: newPath })
      .eq('id', inv.id)
    if (updErr) { console.warn('Warn: could not update path for', inv.id, updErr.message) }

    moved++
  }

  console.log(`✅ Terminé. Déplacés: ${moved}, ignorés: ${skipped}`)
}

main().catch((e) => { console.error(e); process.exit(1) })


