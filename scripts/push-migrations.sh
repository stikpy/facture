#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/push-migrations.sh <PROJECT_REF>
# Requires: SUPABASE_ACCESS_TOKEN exported in env, supabase CLI installed

PROJECT_REF="${1:-}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "❌ SUPABASE_ACCESS_TOKEN manquant. Exporte-le avant de lancer ce script."
  echo "Ex: export SUPABASE_ACCESS_TOKEN=..."
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ Supabase CLI introuvable. Installe-le: https://supabase.com/docs/guides/cli"
  exit 1
fi

if [[ -z "$PROJECT_REF" ]]; then
  echo "❌ Project ref manquant."
  echo "Ex: ./scripts/push-migrations.sh mdjtbzutahoxvfjbeqal"
  exit 1
fi

echo "🔗 Linking project $PROJECT_REF ..."
supabase link --project-ref "$PROJECT_REF"

echo "🚀 Pushing migrations ..."
supabase db push

echo "✅ Migrations appliquées avec succès."

