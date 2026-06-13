/*
 * ─── SQL SCHEMA (Supabase SQL Editor) ────────────────────────────────────
 * CREATE TABLE niche_config (id uuid default gen_random_uuid() primary key, user_id uuid references auth.users unique,
 *   niche text, ideal_customer text, disqualify_criteria text, qualification_questions jsonb default '[]',
 *   min_score int default 70, created_at timestamp default now());
 * -- Upgrade (se a tabela já existir): ALTER TABLE niche_config ADD COLUMN IF NOT EXISTS min_score int DEFAULT 70;
 * CREATE TABLE lead_scores (id uuid default gen_random_uuid() primary key, contact_id uuid, user_id uuid, score int,
 *   qualified boolean, temperature text, reasons jsonb, missing_info jsonb, suggested_action text, summary text, scored_at timestamp default now());
 *
 * ALTER TABLE niche_config ENABLE ROW LEVEL SECURITY;
 * ALTER TABLE lead_scores  ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "niche_own" ON niche_config FOR ALL USING (auth.uid() = user_id);
 * CREATE POLICY "scores_own" ON lead_scores  FOR ALL USING (auth.uid() = user_id);
 * ─────────────────────────────────────────────────────────────────────────
 */
import { supabase } from '@/lib/supabase'
import { AIService } from '@/services/aiService'

const ai = new AIService(supabase)

// Extrai o objeto JSON da resposta da IA (tolera ```json e texto ao redor).
const parseJson = (txt) => {
  try {
    const s = txt.indexOf('{'), e = txt.lastIndexOf('}')
    return s >= 0 && e > s ? JSON.parse(txt.slice(s, e + 1)) : null
  } catch { return null }
}

export const leadQualification = {
  async getUserNiche(userId) {
    const { data } = await supabase.from('niche_config').select('*').eq('user_id', userId).maybeSingle()
    return data ?? null
  },

  async qualifyLead(userId, contactId) {
    const niche = await this.getUserNiche(userId)
    if (!niche) return { success: false, error: 'Configure seu nicho em niche_config primeiro.' }

    const { data: c } = await supabase.from('clients').select('*').eq('id', contactId).maybeSingle()
    if (!c) return { success: false, error: 'Contato não encontrado.' }

    // Histórico unificado de TODAS as plataformas (WhatsApp, Instagram, Facebook)
    const history = await ai.getContactHistory(c.phone, 20)
    const transcript = history.map(m => `[${m.channel ?? 'whatsapp'}] ${m.direction === 'outbound' ? 'Empresa' : 'Lead'}: ${m.content}`).join('\n') || '(sem histórico)'
    const channels = [...new Set(history.map(m => m.channel ?? 'whatsapp'))].join(', ') || (c.channel ?? 'whatsapp')
    const tags = Array.isArray(c.tags) ? c.tags.join(', ') : (c.tags ?? '')

    const systemPrompt = `Você é um analista de vendas especialista. Analise este lead e determine se é qualificado para o nicho: ${niche.niche}.

Cliente ideal: ${niche.ideal_customer}
Critérios de desqualificação: ${niche.disqualify_criteria}

Dados do lead:
Nome: ${c.name ?? '—'}, Empresa: ${c.company ?? '—'}, Tags: ${tags || '—'}, Canais: ${channels}

Histórico da conversa (prefixo [canal] indica a plataforma de cada mensagem):
${transcript}

Responda SOMENTE em JSON:
{
  "score": 0-100,
  "qualified": true/false,
  "temperature": "hot/warm/cold",
  "reasons": ["razão 1", "razão 2"],
  "missing_info": ["info que falta para qualificar melhor"],
  "suggested_action": "próxima ação recomendada",
  "summary": "resumo em 2 frases"
}`

    const provider = niche.provider ?? 'OpenAI GPT-4o-mini'
    const res = await ai.chat({ provider, systemPrompt, userMessage: 'Analise o lead e responda apenas com o JSON.', userId, temperature: 0.3, maxTokens: 700 })
    if (!res.success) return { success: false, error: res.error }

    const parsed = parseJson(res.response)
    if (!parsed) return { success: false, error: 'Resposta da IA não pôde ser interpretada.', raw: res.response }

    // Threshold configurável: o corte de qualificado/não é o min_score do nicho (default 70)
    const minScore = Number(niche.min_score ?? 70)
    const score = parsed.score ?? 0
    const row = {
      contact_id: contactId, user_id: userId, score, qualified: score >= minScore,
      temperature: parsed.temperature ?? 'cold', reasons: parsed.reasons ?? [], missing_info: parsed.missing_info ?? [],
      suggested_action: parsed.suggested_action ?? '', summary: parsed.summary ?? '',
    }
    await supabase.from('lead_scores').insert(row)
    return { success: true, ...row }
  },

  /* Auto-qualificação: qualifica e, se aprovado, avança o lead para "Qualificado" no CRM/Funil.
     Throttle de 10min por contato para não gastar IA a cada mensagem. */
  async autoQualify(userId, contactId, currentStage) {
    try {
      const last = await this.getLeadScore(contactId)
      if (last?.scored_at && Date.now() - new Date(last.scored_at).getTime() < 10 * 60000) return last
      const res = await this.qualifyLead(userId, contactId)
      if (res.success && res.qualified && (currentStage ?? 'lead') === 'lead') {
        await supabase.from('clients').update({ stage: 'qual' }).eq('id', contactId)
        console.log('[Qualify] Lead qualificado e movido para "Qualificado":', contactId)
      }
      return res
    } catch (e) { console.warn('[Qualify] autoQualify falhou:', e?.message ?? e) }
  },

  /* Atalho a partir do telefone/identificador (usado pelo Chat ao receber mensagem). */
  async autoQualifyByPhone(userId, phone) {
    if (!userId || !phone) return
    try {
      const { data: c } = await supabase.from('clients').select('id, stage').eq('user_id', userId).eq('phone', phone).maybeSingle()
      if (c) await this.autoQualify(userId, c.id, c.stage)
    } catch (e) { console.warn('[Qualify] autoQualifyByPhone falhou:', e?.message ?? e) }
  },

  async getLeadScore(contactId) {
    const { data } = await supabase.from('lead_scores').select('*').eq('contact_id', contactId)
      .order('scored_at', { ascending: false }).limit(1).maybeSingle()
    return data ?? null
  },

  async getAllScores(userId) {
    const { data } = await supabase.from('lead_scores').select('*').eq('user_id', userId).order('score', { ascending: false })
    return data ?? []
  },
}
