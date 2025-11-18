-- Mise à jour de la valeur par défaut du model_name de 'gpt-5' à 'gpt-5-mini'
ALTER TABLE token_usage 
  ALTER COLUMN model_name SET DEFAULT 'gpt-5-mini';

-- Mettre à jour les enregistrements existants qui utilisent encore 'gpt-5'
UPDATE token_usage 
  SET model_name = 'gpt-5-mini' 
  WHERE model_name = 'gpt-5';

COMMENT ON COLUMN token_usage.model_name IS 'Modèle OpenAI utilisé (par défaut: gpt-5-mini)';

