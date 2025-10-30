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
  // 1) Résolution par adresse complète (prioritaire)
  for (const addr of addresses) {
    const a = String(addr || '').toLowerCase()
    if (!a) continue
    const { data: full } = await (supabaseAdmin as any)
      .from('inbound_addresses')
      .select('organization_id')
      .eq('full_address', a)
      .single()
    if (full?.organization_id) return full.organization_id
  }

  // Aucun mapping trouvé
  return null
}

export async function POST(request: NextRequest) {
  try {
    const perfStart = Date.now()
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
    const tVerifyStart = Date.now()
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
    console.log('[inbound] timing.verifyAuth.ms', Date.now() - tVerifyStart)

    const parsed = event ?? JSON.parse(raw)
    const payload = provider === 'resend' ? parsed.data : parsed
    console.log('[inbound] event parsed', {
      type: event?.type || 'postmark',
      emailId: provider === 'resend' ? parsed?.data?.email_id : undefined
    })
    const addresses = collectAddressesFromPayload(payload)
    const tResolveStart = Date.now()
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
    // Valider l’expéditeur contre l’allowlist par organisation si org détectée
    let senderOk = true
    let senderEmail = ''
    try {
      // Resend: from est string genre "Name <email>", on extrait l'email
      const fromVal = provider === 'resend' ? parsed?.data?.from : payload?.From || payload?.from
      const match = typeof fromVal === 'string' ? fromVal.match(/<([^>]+)>/) : null
      senderEmail = (match?.[1] || fromVal || '').toString().trim().toLowerCase()
    } catch {}
    if (organizationId && senderEmail) {
      const { data: allow } = await (supabaseAdmin as any)
        .from('organization_sender_allowlist')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('sender_email', senderEmail)
        .maybeSingle?.() ?? { data: null }
      senderOk = !!allow
    }
    console.log('[inbound] recipients resolved', { addresses, organizationId, userId, senderEmail, senderOk })
    console.log('[inbound] timing.resolveRecipients.ms', Date.now() - tResolveStart)

    const enforceAllowlist = String(process.env.INBOUND_ENFORCE_SENDER_ALLOWLIST || '').toLowerCase() === 'true'
    if (organizationId && enforceAllowlist && !senderOk) {
      console.warn('[inbound] ignoring: sender not allowed for org (allowlist enforced)', { organizationId, senderEmail })
      return NextResponse.json({ success: true, ignored: 'expediteur-non-autorise', organizationId, provider })
    }

    if (!userId) {
      // Répondre 200 pour éviter les retries infinis côté Resend
      console.log('[inbound] ignoring: invalid recipient (no user)')
      return NextResponse.json({ success: true, ignored: 'destinataire-invalide', provider })
    }

    // Collecter les pièces jointes
    const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'])
    const minImageBytes = Number(process.env.INBOUND_MIN_IMAGE_BYTES || 30_000) // éviter logos/icônes
    const suspiciousNameRe = /(logo|icon|signature|footer|instagram|facebook|linkedin|twitter|tiktok|youtube|whatsapp|spacer|tracking|pixel)/i

    const shouldProcessAttachment = (args: {
      filename?: string
      contentType?: string
      size?: number
      disposition?: string
      contentId?: string
    }) => {
      const ct = (args.contentType || '').toLowerCase()
      const name = (args.filename || '').toLowerCase()
      const extOk = name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.tif') || name.endsWith('.tiff')

      // 1) type autorisé + extension cohérente
      if (!allowedTypes.has(ct)) return false
      if (!extOk) return ct === 'application/pdf' // PDF sans extension toléré

      // 2) ignorer les inline/embeds (logos)
      if (args.disposition && args.disposition.toLowerCase() === 'inline') return false
      if (args.contentId) return false

      // 3) ignorer petits fichiers image (logos, pixels)
      if (ct.startsWith('image/') && typeof args.size === 'number' && args.size < minImageBytes) return false

      // 4) ignorer noms suspects (logos réseaux sociaux, signatures, etc.)
      if (ct.startsWith('image/') && suspiciousNameRe.test(name)) return false

      return true
    }
    const storage = new StorageService()
    const created: { fileId: string; fileName: string }[] = []

    if (provider === 'resend') {
      const resendApiKey = process.env.RESEND_API_KEY || ''
      const resend = new Resend(resendApiKey)
      const emailId = parsed.data?.email_id
      const tListStart = Date.now()
      console.log('[inbound] fetching attachments (resend)', { emailId, hasApiKey: Boolean(resendApiKey) })

      // Retry simple pour gérer l'éventuelle latence d'indexation côté Resend
      async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
      let attachments: any[] = []
      const maxAttempts = 4
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const listResp = await (resend as any).attachments.receiving.list({ emailId })
          const d = listResp?.data
          attachments = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])
          if (attachments.length > 0) {
            break
          }
        } catch (err) {
          console.warn('[inbound] attachments.list error', { attempt, error: (err as Error)?.message })
        }
        if (attempt < maxAttempts) {
          await sleep(500 * attempt) // backoff
        }
      }

      if (!attachments.length) {
        console.log('[inbound] timing.attachments.list.ms', Date.now() - tListStart)
        try {
          const emailDetails = await (resend as any).emails.receiving.get(emailId)
          console.log('[inbound] email details (resend)', {
            emailId,
            hasHtml: Boolean(emailDetails?.data?.html),
            hasText: Boolean(emailDetails?.data?.text),
            headersCount: emailDetails?.data?.headers ? Object.keys(emailDetails.data.headers).length : 0,
          })
        } catch (e) {
          console.warn('[inbound] emails.receiving.get failed', { emailId, error: (e as Error)?.message })
        }
        console.log('[inbound] no attachments (resend) after retries', { emailId, attempts: maxAttempts })
        // Répondre 200 pour éviter les retries si aucun attachement
        return NextResponse.json({ success: true, ignored: 'aucune-piece-jointe', provider })
      }
      console.log('[inbound] timing.attachments.list.ms', Date.now() - tListStart)
      console.log('[inbound] attachments (resend)', {
        emailId,
        count: attachments.length,
        files: attachments.map((a: any) => a?.filename).filter(Boolean)
      })
      for (const att of attachments) {
        const tAttStart = Date.now()
        const contentType = att?.content_type || 'application/octet-stream'
        const filename = att?.filename || 'attachment'
        const size = typeof att?.size === 'number' ? Number(att.size) : undefined
        const disposition = att?.disposition || att?.content_disposition
        const contentId = att?.content_id || att?.cid

        if (!shouldProcessAttachment({ filename, contentType, size, disposition, contentId })) {
          console.log('[inbound] skip attachment (resend)', { filename, contentType, size, disposition, contentId })
          continue
        }
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
        console.log('[inbound] timing.attachments.single.ms', Date.now() - tAttStart)
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
        const tAttStart = Date.now()
        const contentType = att?.contentType || att?.ContentType || 'application/octet-stream'
        const filename = att?.filename || att?.name || att?.Name || 'attachment'
        const size = typeof att?.contentLength === 'number' ? Number(att.contentLength) : (typeof att?.ContentLength === 'number' ? Number(att.ContentLength) : undefined)
        const disposition = att?.contentDisposition || att?.ContentDisposition
        const contentId = att?.contentID || att?.ContentID
        if (!shouldProcessAttachment({ filename, contentType, size, disposition, contentId })) {
          console.log('[inbound] skip attachment (postmark-like)', { filename, contentType, size, disposition, contentId })
          continue
        }
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
        console.log('[inbound] timing.attachments.single.ms', Date.now() - tAttStart)
      }
    }

    const tTriggerStart = Date.now()
    try {
      const origin = (() => {
        try { return new URL(request.url).origin } catch { return process.env.NEXT_PUBLIC_APP_URL || '' }
      })()
      console.log('[inbound] trigger worker', { origin })
      fetch(`${origin}/api/queue/worker`, { cache: 'no-store' }).catch(() => {})
    } catch {}

    console.log('[inbound] timing.triggerWorker.ms', Date.now() - tTriggerStart)
    console.log('[inbound] done', { createdCount: created.length, provider, totalMs: Date.now() - perfStart })
    return NextResponse.json({ success: true, created, provider })
  } catch (e: any) {
    console.error('Inbound email error:', e)
    return NextResponse.json({ error: 'Erreur traitement email' }, { status: 500 })
  }
}
