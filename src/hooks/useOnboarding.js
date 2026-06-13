/*
 * Rodar no Supabase Dashboard > SQL Editor:
 *
 * CREATE TABLE IF NOT EXISTS user_preferences (
 *   id uuid default gen_random_uuid() primary key,
 *   user_id uuid references auth.users unique not null,
 *   onboarding_completed boolean default false,
 *   onboarded_at timestamp,
 *   created_at timestamp default now()
 * );
 * ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "users_own_prefs" ON user_preferences FOR ALL USING (auth.uid() = user_id);
 */
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data, error } = await supabase.from('user_preferences').select('onboarding_completed').eq('user_id', user.id).maybeSingle()
        if (error) return // falha no check → NÃO mostrar (evita loop)
        if (on && (!data || !data.onboarding_completed)) setShowOnboarding(true)
      } catch (e) {
        console.warn('[Onboarding] check falhou:', e?.message ?? e)
      } finally {
        if (on) setLoading(false)
      }
    })()
    return () => { on = false }
  }, [])

  const completeOnboarding = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('user_preferences').upsert({ user_id: user.id, onboarding_completed: true, onboarded_at: new Date().toISOString() }, { onConflict: 'user_id' })
    } catch (e) {
      console.warn('[Onboarding] erro ao concluir:', e?.message ?? e)
    }
    setShowOnboarding(false)
  }

  return { showOnboarding, loading, completeOnboarding }
}
