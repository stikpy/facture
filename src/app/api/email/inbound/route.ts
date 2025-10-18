import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

async function verifyResendSignature(req: NextRequest, rawBody: string) {
  const secret = process.env.RESEND_INBOUND_SECRET
  if (!secret) return false
  const header = req.headers.get('x-resend-signature') || req.headers.get('resend-signature')
  if (!header) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody))
  const expected = Buffer.from(signature).toString('hex')
  return timingSafeEqual(expected, header)
}

async function findUserIdForRecipients(to: any[]): Promise<string | null> {
  const all = (to || []).map((t) => (typeof t === 'string' ? t : t?.address || '') as string)
  // 1) plus addressing factures+<userId>@
  for (const addr of all) {
    const m = addr.match(/factures\+([0-9a-f\-]{36})@/i)
    if (m) return m[1]
  }
  // 2) alias direct local-part → inbound_aliases
  const local = all.map((a) => a.split('@')[0]).find(Boolean)
  if (local) {
    const { data } = await (supabaseAdmin as any)
      .from('inbound_aliases')
      .select('user_id')
      .eq('alias', local.toLowerCase())
      .single()
    if (data?.user_id) return data.user_id
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    const ok = await verifyResendSignature(request, raw)
    if (!ok) {
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
    }

    const payload = JSON.parse(raw)
    const to = payload?.to || payload?.recipients || []
    const userId = await findUserIdForRecipients(to)

    if (!userId) {
      return NextResponse.json({ error: 'Destinataire invalide (utiliser factures+<userId>@gk-dev.tech)' }, { status: 400 })
    }

    const attachments: any[] = payload?.attachments || []
    if (!attachments.length) {
      return NextResponse.json({ error: 'Aucune pièce jointe' }, { status: 400 })
    }

    const allowed = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'])

    const storage = new StorageService()
    const created: { fileId: string; fileName: string }[] = []

    for (const att of attachments) {
      const contentType = att?.contentType || att?.content_type || 'application/octet-stream'
      if (!allowed.has(contentType)) continue
      const filename = att?.filename || att?.name || 'attachment'

      let buffer: Buffer | null = null
      if (att?.content) {
        buffer = Buffer.from(att.content, 'base64')
      } else if (att?.downloadUrl || att?.url) {
        const url = att.downloadUrl || att.url
        const res = await fetch(url)
        const arr = Buffer.from(await res.arrayBuffer())
        buffer = arr
      }
      if (!buffer) continue

      // 1) upload storage
      const { path } = await storage.uploadFile(buffer, filename, contentType, userId)

      // 2) insert invoice
      const { data: invoice, error: insErr } = await (supabaseAdmin as any)
        .from('invoices')
        .insert({
          user_id: userId,
          file_name: filename,
          file_path: path,
          file_size: buffer.length,
          mime_type: contentType,
          status: 'pending'
        } as any)
        .select()
        .single()
      if (insErr) throw insErr

      created.push({ fileId: invoice.id, fileName: filename })

      // 3) enqueue processing
      await (supabaseAdmin as any)
        .from('processing_queue')
        .insert({ invoice_id: invoice.id, user_id: userId, status: 'pending' } as any)
    }

    // Optionnel: déclencher le worker immédiatement
    try {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/queue/worker`).catch(() => {})
    } catch {}

    return NextResponse.json({ success: true, created })
  } catch (e: any) {
    console.error('Inbound email error:', e)
    return NextResponse.json({ error: 'Erreur traitement email' }, { status: 500 })
  }
}
