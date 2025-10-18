# Système de Queue pour le traitement des factures

## 📋 Vue d'ensemble

Ce système permet de traiter les factures en arrière-plan de manière asynchrone, évitant les problèmes de timeout et permettant de fermer le navigateur pendant le traitement.

## 🏗️ Architecture

### 1. Table `processing_queue`
Stocke toutes les tâches de traitement avec leur statut :
- `pending` : En attente de traitement
- `processing` : En cours de traitement
- `completed` : Traitement terminé
- `failed` : Échec après 3 tentatives

### 2. API Endpoints

#### `/api/queue/add` (POST)
Ajoute une facture à la queue de traitement.
```json
{
  "invoiceId": "uuid",
  "priority": 0
}
```

#### `/api/queue/worker` (GET)
Worker qui traite la prochaine tâche en attente.
- Appelé automatiquement toutes les 2 minutes par Vercel Cron
- Peut aussi être appelé manuellement

#### `/api/queue/status` (GET)
Récupère le statut d'une tâche.
```
GET /api/queue/status?invoiceId=uuid
```

### 3. Flux de traitement

```
1. Upload fichier → /api/upload
   ↓
2. Ajout à la queue → /api/queue/add
   ↓
3. Worker traite → /api/queue/worker (auto toutes les 2min)
   ↓
4. Client poll statut → /api/queue/status (toutes les 5s)
   ↓
5. Facture complétée ✅
```

## 🚀 Avantages

✅ **Résilience** : Si tu fermes le navigateur, le traitement continue
✅ **Retry automatique** : 3 tentatives en cas d'échec
✅ **Scalabilité** : Peut traiter plusieurs factures en parallèle
✅ **Monitoring** : Suivi du statut en temps réel
✅ **Priorités** : Possibilité de prioriser certaines factures

## 🔧 Configuration

### Vercel Cron
Le worker est exécuté automatiquement toutes les 2 minutes via `vercel.json` :
```json
{
  "crons": [
    {
      "path": "/api/queue/worker",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

### Variables d'environnement
Aucune variable supplémentaire requise, utilise les mêmes que l'app.

## 📊 Monitoring

### Vérifier les tâches en attente
```sql
SELECT * FROM processing_queue 
WHERE status = 'pending' 
ORDER BY priority DESC, created_at ASC;
```

### Vérifier les échecs
```sql
SELECT * FROM processing_queue 
WHERE status = 'failed' 
ORDER BY created_at DESC;
```

### Statistiques
```sql
SELECT 
  status, 
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM processing_queue
GROUP BY status;
```

## 🛠️ Développement local

Pour tester le worker localement :
```bash
# Appeler manuellement le worker
curl http://localhost:3000/api/queue/worker

# Vérifier le statut d'une facture
curl http://localhost:3000/api/queue/status?invoiceId=<uuid>
```

## 🔄 Migration

Pour appliquer la migration :
```bash
# Via Supabase CLI
supabase db push

# Ou via le dashboard Supabase
# Copier le contenu de supabase/migrations/20250119000000_create_processing_queue.sql
```

## 📝 Notes

- Le worker traite une tâche à la fois pour éviter les conflits
- Timeout max : 5 minutes par tâche (limite Vercel)
- Polling client : toutes les 5 secondes pendant max 5 minutes
- Retry : 3 tentatives avec backoff

