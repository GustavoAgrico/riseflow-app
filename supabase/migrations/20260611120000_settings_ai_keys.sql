-- Adiciona as colunas de chaves de IA que o server/aiAttendant.js e a tela de
-- Configurações já leem/gravam (gemini_key / groq_key). Sem elas, o upsert da
-- tela salvava a chave Gemini no campo errado (openai_key).

alter table settings add column if not exists gemini_key text;
alter table settings add column if not exists groq_key text;

-- Corrige o dado existente: a chave Gemini (formato novo do Google, "AQ.…")
-- havia sido salva em openai_key antes desta migração.
update settings
set gemini_key = openai_key,
    openai_key = null
where openai_key like 'AQ.%';
