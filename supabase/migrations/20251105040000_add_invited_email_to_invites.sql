-- Ajouter le champ invited_email à organization_invites pour stocker l'email de l'invité
ALTER TABLE public.organization_invites 
ADD COLUMN IF NOT EXISTS invited_email TEXT;

-- Index pour faciliter les recherches par email
CREATE INDEX IF NOT EXISTS idx_org_invites_email 
ON public.organization_invites(invited_email) 
WHERE invited_email IS NOT NULL;

COMMENT ON COLUMN public.organization_invites.invited_email IS 'Email de la personne invitée à rejoindre l''organisation';

