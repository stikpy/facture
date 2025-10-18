# 🚀 Installation du système de queue

## Étape 1 : Appliquer la migration Supabase

### Option A : Via Supabase Dashboard (Recommandé)
1. Ouvre https://supabase.com/dashboard
2. Sélectionne ton projet `facture`
3. Va dans **SQL Editor**
4. Copie le contenu de `supabase/migrations/20250119000000_create_processing_queue.sql`
5. Colle et exécute le SQL
6. ✅ La table `processing_queue` est créée !

### Option B : Via Supabase CLI
```bash
# Si tu as Supabase CLI installé
supabase db push
```

## Étape 2 : Vérifier l'installation

### Test 1 : Vérifier que la table existe
Dans le SQL Editor de Supabase :
```sql
SELECT * FROM processing_queue LIMIT 1;
```
Résultat attendu : Table vide (0 rows)

### Test 2 : Tester l'upload
1. Redémarre ton serveur de dev : `npm run dev`
2. Va sur http://localhost:3000
3. Upload une facture
4. Observe les logs dans la console

Tu devrais voir :
```
📋 [CLIENT] Ajout à la queue pour [nom-fichier]
✅ [CLIENT] Ajouté à la queue
📊 [CLIENT] Statut queue: { status: 'pending', ... }
```

### Test 3 : Déclencher le worker manuellement
```bash
# Dans un nouveau terminal
curl http://localhost:3000/api/queue/worker
```

Tu devrais voir le traitement commencer !

## Étape 3 : Configuration Vercel (Production)

### Déployer sur Vercel
```bash
git add .
git commit -m "feat: add queue system for invoice processing"
git push
```

### Activer Vercel Cron
1. Va sur https://vercel.com/dashboard
2. Sélectionne ton projet
3. Va dans **Settings** → **Cron Jobs**
4. Vérifie que le cron est actif : `*/2 * * * *` → `/api/queue/worker`

## 🎉 C'est fait !

Maintenant :
- ✅ Tu peux fermer le navigateur pendant le traitement
- ✅ Le worker tourne automatiquement toutes les 2 minutes
- ✅ Retry automatique en cas d'échec
- ✅ Suivi du statut en temps réel

## 🐛 Dépannage

### Problème : "Table processing_queue does not exist"
→ La migration n'a pas été appliquée. Retourne à l'Étape 1.

### Problème : "Aucune tâche en attente" mais factures bloquées en "processing"
→ Exécute manuellement :
```bash
curl http://localhost:3000/api/queue/worker
```

### Problème : Worker ne se déclenche pas automatiquement
→ Vérifie que `vercel.json` existe et que le cron est configuré sur Vercel.

## 📊 Monitoring

### Voir les tâches en cours
```sql
SELECT 
  pq.id,
  pq.status,
  pq.attempts,
  i.file_name,
  pq.created_at,
  pq.started_at
FROM processing_queue pq
JOIN invoices i ON i.id = pq.invoice_id
WHERE pq.status IN ('pending', 'processing')
ORDER BY pq.created_at DESC;
```

### Nettoyer les tâches complétées (optionnel)
```sql
DELETE FROM processing_queue 
WHERE status = 'completed' 
AND completed_at < NOW() - INTERVAL '7 days';
```

