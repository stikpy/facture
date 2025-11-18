import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { randomUUID } from 'crypto'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ members: [] })

    const { data } = await (supabaseAdmin as any)
      .from('organization_members')
      .select('user_id, role, users:public.users(id, email, full_name)')
      .eq('organization_id', orgId)

    const members = (data as any[] || []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      email: m.users?.email,
      full_name: m.users?.full_name,
    }))

    return NextResponse.json({ members })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { email, role = 'member' } = await request.json()
    if (!email) return NextResponse.json({ error: 'email requis' }, { status: 400 })
    
    // Récupérer l'organisation active
    let orgId: string | null = (user as any)?.user_metadata?.organization_id || null
    if (!orgId) {
      const { data: m } = await (supabaseAdmin as any)
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()
      orgId = (m as any)?.organization_id || null
    }
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    // Récupérer le nom de l'organisation
    const { data: org, error: orgError } = await (supabaseAdmin as any)
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()
    
    if (orgError || !org) {
      console.error('Erreur récupération organisation:', orgError)
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 })
    }

    const orgName = org.name || 'l\'organisation'

    // Vérifier si l'utilisateur existe déjà et est déjà membre
    let targetUser: any = null
    try {
      const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
      if (!listError && users) {
        targetUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase())
        
        if (targetUser) {
          // Vérifier si l'utilisateur n'est pas déjà membre
          const { data: existing } = await (supabaseAdmin as any)
            .from('organization_members')
            .select('user_id')
            .eq('organization_id', orgId)
            .eq('user_id', targetUser.id)
            .limit(1)
          
          if (existing && existing.length > 0) {
            return NextResponse.json({ error: 'Cet utilisateur est déjà membre de l\'organisation' }, { status: 400 })
          }
        }
      }
    } catch (err: any) {
      console.warn('Erreur lors de la vérification utilisateur existant:', err)
      // On continue même si la vérification échoue
    }

    // Créer un code d'invitation unique (UUID)
    const inviteCode = randomUUID().toUpperCase()
    
    // Date d'expiration : 7 jours par défaut
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    // Créer l'invitation dans la base de données
    const { data: invite, error: inviteError } = await (supabaseAdmin as any)
      .from('organization_invites')
      .insert({
        organization_id: orgId,
        created_by: user.id,
        code: inviteCode,
        invited_email: email.toLowerCase().trim(),
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        is_active: true,
      } as any)
      .select('*')
      .single()

    if (inviteError) {
      console.error('Erreur création invitation:', inviteError)
      return NextResponse.json({ error: 'Erreur lors de la création de l\'invitation' }, { status: 500 })
    }

    // Envoyer l'email avec le code d'invitation
    try {
      const resendApiKey = process.env.RESEND_API_KEY
      if (!resendApiKey) {
        console.warn('RESEND_API_KEY non configuré, email non envoyé')
        return NextResponse.json({ 
          success: true, 
          invite_code: inviteCode,
          warning: 'Email non envoyé (RESEND_API_KEY manquant)' 
        })
      }

      const resend = new Resend(resendApiKey)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      
      // Utiliser le domaine vérifié dans Resend (gk-dev.tech) ou depuis la variable d'environnement
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@gk-dev.tech'
      const fromName = process.env.RESEND_FROM_NAME || 'Facture AI'
      
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .code-box { background: white; border: 2px dashed #4F46E5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .code { font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #4F46E5; font-family: monospace; }
            .button { display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Invitation à rejoindre ${orgName}</h1>
            </div>
            <div class="content">
              <p>Bonjour,</p>
              <p>Vous avez été invité(e) à rejoindre <strong>${orgName}</strong> sur Facture AI.</p>
              <p>Pour accepter cette invitation, utilisez le code suivant lors de votre connexion :</p>
              <div class="code-box">
                <div class="code">${inviteCode}</div>
              </div>
              <p style="text-align: center;">
                <a href="${appUrl}/auth" class="button">Rejoindre l'organisation</a>
              </p>
              <p style="font-size: 14px; color: #6b7280;">
                Ce code est valable jusqu'au ${expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
              <p style="font-size: 14px; color: #6b7280;">
                Si vous n'avez pas de compte, vous pourrez en créer un et utiliser ce code pour rejoindre directement l'organisation.
              </p>
            </div>
            <div class="footer">
              <p>Cet email a été envoyé automatiquement par Facture AI.</p>
            </div>
          </div>
        </body>
        </html>
      `

      const emailText = `
Bonjour,

Vous avez été invité(e) à rejoindre ${orgName} sur Facture AI.

Code d'invitation : ${inviteCode}

Pour accepter cette invitation :
1. Connectez-vous ou créez un compte sur ${appUrl}/auth
2. Utilisez le code d'invitation ci-dessus

Ce code est valable jusqu'au ${expiresAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.

Cet email a été envoyé automatiquement par Facture AI.
      `.trim()

      const { error: emailError, data: emailData } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: email.trim(),
        subject: `Invitation à rejoindre ${orgName}`,
        html: emailHtml,
        text: emailText,
      })

      if (emailError) {
        console.error('Erreur envoi email Resend:', emailError)
        // On retourne quand même le succès car l'invitation est créée
        return NextResponse.json({ 
          success: true, 
          invite_code: inviteCode,
          warning: `Invitation créée mais email non envoyé: ${emailError.message || 'Erreur inconnue'}`,
          email_error: emailError
        })
      }

      console.log('✅ Email envoyé via Resend:', { emailId: emailData?.id, to: email.trim() })

      console.log(`✅ Invitation envoyée à ${email} avec le code ${inviteCode}`)
    } catch (emailErr: any) {
      console.error('Exception lors de l\'envoi de l\'email:', emailErr)
      // On retourne quand même le succès car l'invitation est créée
      return NextResponse.json({ 
        success: true, 
        invite_code: inviteCode,
        warning: 'Invitation créée mais email non envoyé' 
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Invitation créée et email envoyé',
      invite_code: inviteCode 
    })
  } catch (e: any) {
    console.error('Erreur POST /api/orgs/members:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id requis' }, { status: 400 })
    const orgId = (user as any)?.user_metadata?.organization_id
    if (!orgId) return NextResponse.json({ error: 'Aucune organisation active' }, { status: 400 })

    await (supabaseAdmin as any)
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', userId)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}


