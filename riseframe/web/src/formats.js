// Passo 1 do "Criar vídeo": o que a pessoa quer criar → formato (e modo) do vídeo.
export const FORMATS = [
  { id: 'reels', label: 'Reels', sub: 'Instagram · 9:16', icon: 'instagram', aspect: '9:16', tint: '#E1306C' },
  { id: 'tiktok', label: 'TikTok', sub: '9:16', icon: 'tiktok', aspect: '9:16', tint: '#25F4EE' },
  { id: 'shorts', label: 'Shorts', sub: 'YouTube · 9:16', icon: 'youtube', aspect: '9:16', tint: '#FF3B3B' },
  { id: 'ad', label: 'Vídeo para anúncio', sub: 'Feed · 1:1', icon: 'megaphone', aspect: '1:1', tint: '#FFB020' },
  { id: 'youtube', label: 'Vídeo para YouTube', sub: 'Horizontal · 16:9', icon: 'play', aspect: '16:9', tint: '#FF6B35' },
  { id: 'cortes', label: 'Podcast / Cortes', sub: 'Vários clipes curtos', icon: 'podcast', aspect: '9:16', clips: true, tint: '#9F67FF' },
  { id: 'original', label: 'Manter o formato', sub: 'Como foi gravado', icon: 'film', aspect: 'original', tint: '#A6A6BC' },
];

export const formatById = (id) => FORMATS.find((f) => f.id === id) || null;
