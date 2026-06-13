/*
SQL — Execute no Supabase SQL Editor:

create table if not exists campaigns (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users not null, name text not null, message text, media_url text, message_type text default 'text', audience_type text default 'all', audience_filter jsonb default '{}', status text default 'draft', scheduled_at timestamptz, interval_seconds integer default 3, total integer default 0, sent integer default 0, delivered integer default 0, read integer default 0, replied integer default 0, created_at timestamptz default now());

create table if not exists campaign_messages (id uuid primary key default gen_random_uuid(), campaign_id uuid references campaigns on delete cascade, contact_id uuid, phone text not null, status text default 'pending', sent_at timestamptz, error text);

alter table campaigns enable row level security;
alter table campaign_messages enable row level security;
create policy "campaigns_own" on campaigns for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "campaign_messages_own" on campaign_messages for all using (campaign_id in (select id from campaigns where user_id=auth.uid()));
*/

import { usageService } from '@/services/usageService'
import { sendMessage as evoSend } from '@/services/evolutionApi'

const sub = (t, c) => (t ?? '')
  .replace(/\{+nome\}+/gi,      c.name    ?? 'Cliente')
  .replace(/\{+telefone\}+/gi,  c.phone   ?? '')
  .replace(/\{+empresa\}+/gi,   c.company ?? '')
  .replace(/\{+data_hoje\}+/gi, new Date().toLocaleDateString('pt-BR'))

export class CampaignService {
  constructor(db, evoUrl, evoKey) {
    this.db = db; this.url = evoUrl; this.key = evoKey
    this._iv = {}; this._paused = {}
  }

  async sendCampaign(campaignId) {
    const { data: camp } = await this.db.from('campaigns').select('*').eq('id', campaignId).single()
    if (!camp) return
    const { data: msgs } = await this.db.from('campaign_messages')
      .select('*').eq('campaign_id', campaignId).eq('status', 'pending')
    if (!msgs?.length) return

    await this.db.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
    let i = 0; this._paused[campaignId] = false

    this._iv[campaignId] = setInterval(async () => {
      if (i >= msgs.length || this._paused[campaignId]) {
        clearInterval(this._iv[campaignId])
        if (i >= msgs.length) await this.db.from('campaigns').update({ status: 'done' }).eq('id', campaignId)
        return
      }
      // Limite do plano atingido: pausa a campanha.
      try {
        if (camp.user_id && !(await usageService.canSend(camp.user_id))) {
          this._paused[campaignId] = true
          clearInterval(this._iv[campaignId])
          await this.db.from('campaigns').update({ status: 'paused_limit' }).eq('id', campaignId)
          console.log('[CAMPAIGN] Limite atingido, campanha pausada')
          return
        }
      } catch (e) { console.warn('[CAMPAIGN] checagem de limite falhou:', e?.message ?? e) }
      const m = msgs[i++]
      const text = sub(camp.message, { name: m.contact_name, phone: m.phone, company: m.contact_company })
      try {
        let ok = false
        try { await evoSend(m.phone, text); ok = true } catch { ok = false }
        await this.db.from('campaign_messages').update({ status: ok ? 'sent' : 'failed', sent_at: new Date().toISOString() }).eq('id', m.id)
        await this.db.from('campaigns').update({ sent: i }).eq('id', campaignId)
        if (ok && camp.user_id) {
          try { await usageService.increment(camp.user_id) }
          catch (e) { console.warn('[CAMPAIGN] increment falhou:', e?.message ?? e) }
        }
      } catch (e) {
        await this.db.from('campaign_messages').update({ status: 'failed', error: e.message }).eq('id', m.id)
      }
    }, (camp.interval_seconds ?? 3) * 1000)
  }

  async pauseCampaign(campaignId) {
    this._paused[campaignId] = true
    clearInterval(this._iv[campaignId])
    await this.db.from('campaigns').update({ status: 'paused' }).eq('id', campaignId)
  }

  async getStats(campaignId) {
    const { data } = await this.db.from('campaigns')
      .select('sent, delivered, read, replied, total').eq('id', campaignId).single()
    return data ?? {}
  }
}
