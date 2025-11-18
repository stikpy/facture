/**
 * Initialisation MCP Supabase
 * - Garantit que le token d'accès MCP est disponible depuis .env.local
 * - Le serveur MCP attend SUPABASE_ACCESS_TOKEN (Personal Access Token)
 * - On fait un fallback automatique sur SUPABASE_MCP_TOKEN si présent
 */
(() => {
  // Si la variable attendue par le serveur MCP n'est pas définie,
  // on tente de la peupler depuis SUPABASE_MCP_TOKEN (présent dans .env.local).
  if (!process.env.SUPABASE_ACCESS_TOKEN && process.env.SUPABASE_MCP_TOKEN) {
    process.env.SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_MCP_TOKEN
  }
})()

export {}




