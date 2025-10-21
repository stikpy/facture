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

function parseBasicAuth(authHeader: string | null) {
  if (!authHeader?.startsWith('Basic ')) return null
  try {
    const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString('utf8')
    const [user, pass] = decoded.split(':')
    return { user, pass }
  } catch {
    return null
  }
}

async function verifyPostmarkAuth(req: NextRequest) {
  const u = process.env.POSTMARK_INBOUND_BASIC_USER
  const p = process.env.POSTMARK_INBOUND_BASIC_PASS
  const t = process.env.POSTMARK_INBOUND_TOKEN
  if (!u && !p && !t) return false
  const auth = parseBasicAuth(req.headers.get('authorization'))
  if (u && p && auth && auth.user === u && auth.pass === p) return true
  const url = new URL(req.url)
  if (t && url.searchParams.get('token') === t) return true
  return false
}

function collectAddressesFromPayload(payload: any): string[] {
  // Resend: payload.to (array)
  if (Array.isArray(payload?.to)) {
    return payload.to.map((t: any) => (typeof t === 'string' ? t : t?.address || '')).filter(Boolean)
  }
  // Postmark: payload.ToFull (array of { Email })
  if (Array.isArray(payload?.ToFull)) {
    return payload.ToFull.map((t: any) => t?.Email || '').filter(Boolean)
  }
  // Fallback: payload.To (comma-separated)
  if (typeof payload?.To === 'string') {
    return payload.To.split(',').map((s: string) => s.trim()).filter(Boolean)
  }
  return []
}

async function findUserIdForRecipients(addresses: string[]): Promise<string | null> {
  // 1) plus addressing factures+<userId>@
  for (const addr of addresses) {
    const m = addr.match(/factures\+([0-9a-f\-]{36})@/i)
    if (m) return m[1]
  }
  // 2) alias direct local-part → inbound_aliases
  const local = addresses.map((a) => a.split('@')[0]).find(Boolean)
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

    // Déterminer provider et vérifier auth
    let provider: 'resend' | 'postmark' = 'resend'
    let allowed = await verifyResendSignature(request, raw)
    if (!allowed) {
      provider = 'postmark'
      allowed = await verifyPostmarkAuth(request)
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = JSON.parse(raw)
    const addresses = collectAddressesFromPayload(payload)
    const userId = await findUserIdForRecipients(addresses)

    if (!userId) {
      return NextResponse.json({ error: 'Destinataire invalide (alias ou plus-addressing requis)' }, { status: 400 })
    }

    // Collecter les pièces jointes
    const atts: any[] = Array.isArray(payload?.attachments)
      ? payload.attachments
      : Array.isArray(payload?.Attachments)
      ? payload.Attachments
      : []

    if (!atts.length) {
      return NextResponse.json({ error: 'Aucune pièce jointe' }, { status: 400 })
    }

    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'])

    const storage = new StorageService()
    const created: { fileId: string; fileName: string }[] = []

    for (const att of atts) {
      const contentType = att?.contentType || att?.ContentType || 'application/octet-stream'
      if (!allowedTypes.has(contentType)) continue
      const filename = att?.filename || att?.name || att?.Name || 'attachment'

      let buffer: Buffer | null = null
      const b64 = att?.content || att?.Content
      const url = att?.downloadUrl || att?.url
      if (b64) buffer = Buffer.from(b64, 'base64')
      else if (url) {
        const res = await fetch(url)
        buffer = Buffer.from(await res.arrayBuffer())
      }
      if (!buffer) continue

      const { path } = await storage.uploadFile(buffer, filename, contentType, userId)

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

      await (supabaseAdmin as any)
        .from('processing_queue')
        .insert({ invoice_id: invoice.id, user_id: userId, status: 'pending' } as any)
    }

    try { fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/queue/worker`).catch(() => {}) } catch {}

    return NextResponse.json({ success: true, created, provider })
  } catch (e: any) {
    console.error('Inbound email error:', e)
    return NextResponse.json({ error: 'Erreur traitement email' }, { status: 500 })
  }
}
