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

async function findOrganizationForRecipients(addresses: string[]): Promise<string | null> {
  const local = addresses.map((a) => a.split('@')[0]).find(Boolean)
  if (!local) return null
  const { data } = await (supabaseAdmin as any)
    .from('inbound_aliases')
    .select('organization_id')
    .eq('alias', local.toLowerCase())
    .single()
  return data?.organization_id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text()
    const svixId = request.headers.get('svix-id') || ''
    const svixTimestamp = request.headers.get('svix-timestamp') || ''
    console.log('[inbound] request received', {
      svixId,
      svixTimestamp,
      contentType: request.headers.get('content-type') || '',
      length: raw.length
    })

    // Déterminer provider et vérifier auth via Resend (Svix) sinon Postmark
    let provider: 'resend' | 'postmark' | 'unknown' = 'unknown'
    let event: any | null = await verifyResendWebhook(raw, request)
    if (event && event?.type === 'email.received') {
      provider = 'resend'
      console.log('[inbound] provider detected: resend')
    } else {
      const postmarkOk = await verifyPostmarkAuth(request)
      if (!postmarkOk) {
        console.warn('[inbound] unauthorized request (failed svix and postmark auth)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      provider = 'postmark'
      console.log('[inbound] provider detected: postmark')
    }

    const parsed = event ?? JSON.parse(raw)
    const payload = provider === 'resend' ? parsed.data : parsed
    console.log('[inbound] event parsed', {
      type: event?.type || 'postmark',
      emailId: provider === 'resend' ? parsed?.data?.email_id : undefined
    })
    const addresses = collectAddressesFromPayload(payload)
    const organizationId = await findOrganizationForRecipients(addresses)
    let userId = await findUserIdForRecipients(addresses)
    // Si alias lié à une org, choisir un membre comme user par défaut
    if (!userId && organizationId) {
      const { data: member } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId)
        .limit(1)
        .single()
      userId = member?.user_id || null
    }
    console.log('[inbound] recipients resolved', { addresses, organizationId, userId })

    if (!userId) {
      // Répondre 200 pour éviter les retries infinis côté Resend
      console.log('[inbound] ignoring: invalid recipient (no user)')
      return NextResponse.json({ success: true, ignored: 'destinataire-invalide', provider })
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
        console.log('[inbound] no attachments (resend)', { emailId })
        // Répondre 200 pour éviter les retries si aucun attachement
        return NextResponse.json({ success: true, ignored: 'aucune-piece-jointe', provider })
      }
      console.log('[inbound] attachments (resend)', {
        emailId,
        count: attachments.length,
        files: attachments.map((a: any) => a?.filename).filter(Boolean)
      })
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
            organization_id: organizationId || null,
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
        console.log('[inbound] invoice created (resend)', { invoiceId: invoice.id, filename })

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
        console.log('[inbound] no attachments (postmark-like)')
        return NextResponse.json({ success: true, ignored: 'aucune-piece-jointe', provider })
      }
      console.log('[inbound] attachments (postmark-like)', {
        count: atts.length,
        files: atts.map((a: any) => a?.filename || a?.name || a?.Name).filter(Boolean)
      })
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
            organization_id: organizationId || null,
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
        console.log('[inbound] invoice created (postmark-like)', { invoiceId: invoice.id, filename })

        await (supabaseAdmin as any)
          .from('processing_queue')
          .insert({ invoice_id: invoice.id, user_id: userId, status: 'pending' } as any)
      }
    }

    try { fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/queue/worker`).catch(() => {}) } catch {}

    console.log('[inbound] done', { createdCount: created.length, provider })
    return NextResponse.json({ success: true, created, provider })
  } catch (e: any) {
    console.error('Inbound email error:', e)
    return NextResponse.json({ error: 'Erreur traitement email' }, { status: 500 })
  }
}
