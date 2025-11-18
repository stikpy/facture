# Facture AI - Alternative à Yooz

Une solution moderne de traitement intelligent de factures utilisant l'IA pour la classification, l'archivage et l'extraction de données.

## 🚀 Fonctionnalités

- **Upload de factures** : Support PDF, JPG, PNG, TIFF
- **OCR intelligent** : Extraction de texte avec Tesseract.js
- **IA avancée** : Traitement avec LangChain et OpenAI GPT-5-mini
- **Classification automatique** : Catégorisation des factures
- **Recherche sémantique** : Trouvez vos factures facilement
- **Interface moderne** : Design responsive avec Next.js 15
- **Base de données sécurisée** : Supabase avec authentification

## 🛠️ Technologies

- **Frontend** : Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend** : Supabase (PostgreSQL, Auth, Storage)
- **IA** : LangChain, OpenAI GPT-5-mini, Tesseract.js
- **OCR** : Tesseract.js pour l'extraction de texte
- **UI** : Radix UI, Lucide React, shadcn/ui

## 📋 Prérequis

- Node.js 18+ 
- Compte Supabase
- Clé API OpenAI

## 🚀 Installation

1. **Cloner le projet**
```bash
git clone <votre-repo>
cd facture
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configuration Supabase**
   - Créer un projet Supabase
   - Exécuter les migrations dans `supabase/migrations/`
   - Configurer les politiques RLS

4. **Variables d'environnement**
```bash
cp env.example .env.local
```

Remplir les variables :
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
```

5. **Démarrer le serveur**
```bash
npm run dev
```

## 🗄️ Base de données

### Tables principales

- **users** : Profils utilisateurs
- **invoices** : Factures avec données extraites
- **invoice_items** : Articles de factures

### Migrations

```bash
# Appliquer les migrations
supabase db push
```

## 🔧 API Routes

- `POST /api/upload` : Upload de fichiers
- `POST /api/process` : Traitement IA des factures
- `GET /api/search` : Recherche sémantique

## 🎨 Interface utilisateur

### Pages principales

- **Authentification** : Connexion/Inscription
- **Dashboard** : Vue d'ensemble et statistiques
- **Upload** : Glisser-déposer de factures
- **Liste** : Gestion des factures
- **Recherche** : Recherche avancée

### Composants

- Upload de fichiers avec drag & drop
- Liste des factures avec filtres
- Recherche sémantique
- Statistiques en temps réel

## 🤖 Intelligence Artificielle

### Traitement des documents

1. **OCR** : Extraction de texte avec Tesseract.js
2. **LangChain** : Traitement avec GPT-5
3. **Classification** : Catégorisation automatique
4. **Extraction** : Données structurées (fournisseur, montant, etc.)

### Modèles utilisés

- **GPT-5** : Traitement et extraction de données
- **Tesseract.js** : OCR pour images et PDF
- **LangChain** : Orchestration des workflows IA

## 🔒 Sécurité

- **Authentification** : Supabase Auth
- **RLS** : Row Level Security sur toutes les tables
- **Validation** : Types de fichiers et tailles limités
- **Isolation** : Chaque utilisateur voit uniquement ses données

## 📊 Fonctionnalités avancées

### Classification automatique

- Dépenses vs Revenus
- Catégories métier
- Tags automatiques
- Score de confiance

### Recherche intelligente

- Recherche textuelle
- Recherche sémantique
- Filtres par date/montant
- Correspondances pertinentes

### Archivage

- Stockage sécurisé Supabase
- Métadonnées enrichies
- Historique des modifications
- Export des données

## 🚀 Déploiement

### Vercel (Recommandé)

```bash
# Build
npm run build

# Déployer
vercel --prod
```

### Variables d'environnement Vercel

Configurer les mêmes variables que `.env.local`

## 📈 Monitoring

- Logs Supabase
- Métriques de performance
- Erreurs de traitement
- Statistiques d'usage

## 🔄 Améliorations futures

- [ ] Export Excel/CSV
- [ ] Intégration comptable
- [ ] API publique
- [ ] Mobile app
- [ ] Workflow d'approbation
- [ ] Notifications temps réel

## 📝 Licence

MIT License - Voir LICENSE pour plus de détails

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
3. Commit vos changements
4. Push vers la branche
5. Ouvrir une Pull Request

## 📞 Support

Pour toute question ou problème :
- Ouvrir une issue GitHub
- Consulter la documentation Supabase
- Vérifier les logs d'erreur

---

**Développé avec ❤️ pour remplacer Yooz**
