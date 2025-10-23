import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { StorageService } from '@/lib/storage'
import { Resend } from 'resend'

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

async function verifyResendWebhook(rawBody: string, req: NextRequest) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) return null
  const svixId = req.headers.get('svix-id') || ''
  const svixTimestamp = req.headers.get('svix-timestamp') || ''
  const svixSignature = req.headers.get('svix-signature') || ''
  try {
    const resend = new Resend(process.env.RESEND_API_KEY || '')
    const event = await (resend as any).webhooks.verify({
      payload: rawBody,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret
    })
    return event
  } catch {
    return null
  }
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

    // Déterminer provider et vérifier auth via Resend (Svix) sinon Postmark
    let provider: 'resend' | 'postmark' | 'unknown' = 'unknown'
    let event: any | null = await verifyResendWebhook(raw, request)
    if (event && event?.type === 'email.received') {
      provider = 'resend'
    } else {
      const postmarkOk = await verifyPostmarkAuth(request)
      if (!postmarkOk) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      provider = 'postmark'
    }

    const parsed = event ?? JSON.parse(raw)
    const payload = provider === 'resend' ? parsed.data : parsed
    const addresses = collectAddressesFromPayload(payload)
    const userId = await findUserIdForRecipients(addresses)

    if (!userId) {
      return NextResponse.json({ error: 'Destinataire invalide (alias ou plus-addressing requis)' }, { status: 400 })
    }

    // Collecter les pièces jointes
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'])
    const storage = new StorageService()
    const created: { fileId: string; fileName: string }[] = []

    if (provider === 'resend') {
      const resend = new Resend(process.env.RESEND_API_KEY || '')
      const emailId = parsed.data?.email_id
      const listResp = await (resend as any).attachments.receiving.list({ emailId })
      const attachments = listResp?.data || []
      if (!attachments.length) {
        return NextResponse.json({ error: 'Aucune pièce jointe' }, { status: 400 })
      }
      for (const att of attachments) {
        const contentType = att?.content_type || 'application/octet-stream'
        if (!allowedTypes.has(contentType)) continue
        const filename = att?.filename || 'attachment'
        const downloadUrl = att?.download_url
        if (!downloadUrl) continue
        const response = await fetch(downloadUrl)
        if (!response.ok) continue
        const buffer = Buffer.from(await response.arrayBuffer())

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
    } else {
      const atts: any[] = Array.isArray(payload?.attachments)
        ? payload.attachments
        : Array.isArray(payload?.Attachments)
        ? payload.Attachments
        : []
      if (!atts.length) {
        return NextResponse.json({ error: 'Aucune pièce jointe' }, { status: 400 })
      }
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
    }

    try { fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/queue/worker`).catch(() => {}) } catch {}

    return NextResponse.json({ success: true, created, provider })
  } catch (e: any) {
    console.error('Inbound email error:', e)
    return NextResponse.json({ error: 'Erreur traitement email' }, { status: 500 })
  }
}
