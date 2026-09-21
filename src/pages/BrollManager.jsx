import React, { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Download, X, Settings } from 'lucide-react';

const BrollManager = ({ videoElement, videoTitle = 'Video' }) => {
  const [brollMoments, setBrollMoments] = useState([]);
  const [selectedMoment, setSelectedMoment] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [loadingSource, setLoadingSource] = useState(null);
  const [currentSource, setCurrentSource] = useState('pexels');
  const [activeTab, setActiveTab] = useState('auto');
  const [customQuery, setCustomQuery] = useState('');
  const [apiKeys, setApiKeys] = useState({
    pexels: localStorage.getItem('pexels_key') || '',
    googleKey: localStorage.getItem('google_key') || '',
    googleCx: localStorage.getItem('google_cx') || '',
  });

  const colors = {
    bg: '#0f172a',
    panel: '#1e293b',
    border: '#334155',
    text: '#f1f5f9',
    accent: '#FF6B35',
    purple: '#7C3AED',
  };

  const sources = [
    { id: 'pexels', name: 'Pexels', icon: '🎬', color: '#02B87E' },
    { id: 'google', name: 'Google Imagens', icon: '🔍', color: '#4285F4' },
    { id: 'openverse', name: 'Openverse', icon: '🎨', color: '#009CDE' },
  ];

  // Analisar vídeo para detectar momentos de b-roll
  const analyzeBrollMoments = useCallback(() => {
    if (!videoElement) return;

    // Simular análise (em produção, isto viria do servidor)
    const mockMoments = [
      {
        id: 1,
        start: 5,
        end: 12,
        keyword: 'business meeting',
        context: 'talking about professional environment',
        confidence: 0.95,
      },
      {
        id: 2,
        start: 15,
        end: 22,
        keyword: 'technology',
        context: 'discussing digital solutions',
        confidence: 0.88,
      },
      {
        id: 3,
        start: 25,
        end: 32,
        keyword: 'teamwork',
        context: 'collaborating with team',
        confidence: 0.92,
      },
      {
        id: 4,
        start: 35,
        end: 42,
        keyword: 'growth chart',
        context: 'showing business growth',
        confidence: 0.85,
      },
    ];

    setBrollMoments(mockMoments);
    if (mockMoments.length > 0) {
      setSelectedMoment(mockMoments[0]);
      searchBrollSuggestions(mockMoments[0], 'pexels');
    }
  }, [videoElement]);

  useEffect(() => {
    const timer = setTimeout(analyzeBrollMoments, 500);
    return () => clearTimeout(timer);
  }, [analyzeBrollMoments]);

  // Buscar sugestões de b-roll
  const searchBrollSuggestions = async (moment, source) => {
    if (!moment) return;

    setLoadingSource(source);
    try {
      const query = customQuery || moment.keyword;
      let results = [];

      if (source === 'pexels') {
        results = await fetchPexelsResults(query);
      } else if (source === 'google') {
        results = await fetchGoogleResults(query);
      } else if (source === 'openverse') {
        results = await fetchOpenverseResults(query);
      }

      setSuggestions(prev => ({
        ...prev,
        [moment.id]: { ...prev[moment.id], [source]: results }
      }));
    } catch (error) {
      console.error(`Erro ao buscar ${source}:`, error);
      setSuggestions(prev => ({
        ...prev,
        [moment.id]: { ...prev[moment.id], [source]: [] }
      }));
    } finally {
      setLoadingSource(null);
    }
  };

  const fetchPexelsResults = async (query) => {
    const key = apiKeys.pexels;
    if (!key) {
      console.warn('Pexels API key not configured');
      return generateMockResults(query, 'pexels');
    }

    try {
      // Tentar buscar vídeos primeiro
      const videoRes = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=6&orientation=landscape`,
        { headers: { Authorization: key } }
      );

      let videos = [];
      if (videoRes.ok) {
        const data = await videoRes.json();
        videos = (data.videos || []).map(v => ({
          id: v.id,
          type: 'video',
          title: v.alt,
          url: v.video_files?.[0]?.link || '',
          thumbnail: v.image,
          source: 'pexels',
        }));
      }

      // Se não encontrou vídeos, buscar fotos
      if (videos.length < 3) {
        const photoRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${6 - videos.length}`,
          { headers: { Authorization: key } }
        );

        if (photoRes.ok) {
          const data = await photoRes.json();
          const photos = (data.photos || []).map(p => ({
            id: p.id,
            type: 'photo',
            title: p.alt,
            url: p.src.original,
            thumbnail: p.src.medium,
            source: 'pexels',
          }));
          videos = [...videos, ...photos];
        }
      }

      return videos;
    } catch (error) {
      console.error('Pexels error:', error);
      return generateMockResults(query, 'pexels');
    }
  };

  const fetchGoogleResults = async (query) => {
    const { googleKey, googleCx } = apiKeys;
    if (!googleKey || !googleCx) {
      console.warn('Google API credentials not configured');
      return generateMockResults(query, 'google');
    }

    try {
      const params = new URLSearchParams({
        key: googleKey,
        cx: googleCx,
        q: query,
        searchType: 'image',
        num: '6',
        safe: 'active',
        imgType: 'photo',
        imgSize: 'xlarge',
      });

      const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`);
      if (!res.ok) throw new Error(`Google API ${res.status}`);

      const data = await res.json();
      return (data.items || []).map((item, i) => ({
        id: `g${i}`,
        type: 'photo',
        title: item.title,
        url: item.link,
        thumbnail: item.image.thumbnailLink,
        source: 'google',
      }));
    } catch (error) {
      console.error('Google error:', error);
      return generateMockResults(query, 'google');
    }
  };

  const fetchOpenverseResults = async (query) => {
    try {
      const params = new URLSearchParams({
        q: query,
        page_size: '6',
        mature: 'false',
        license_type: 'commercial',
      });

      const res = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'VideoEditor/1.0' }
      });

      if (!res.ok) throw new Error(`Openverse ${res.status}`);

      const data = await res.json();
      return (data.results || []).map(item => ({
        id: item.id,
        type: 'photo',
        title: item.title,
        url: item.url,
        thumbnail: item.thumbnail,
        source: 'openverse',
        license: item.license,
      }));
    } catch (error) {
      console.error('Openverse error:', error);
      return generateMockResults(query, 'openverse');
    }
  };

  const generateMockResults = (query, source) => {
    const colors = ['FF6B35', '7C3AED', '3B82F6', '10B981', 'F59E0B', 'EF4444'];
    return Array.from({ length: 6 }, (_, i) => ({
      id: `mock_${source}_${i}`,
      type: Math.random() > 0.5 ? 'photo' : 'video',
      title: `${query} - Resultado ${i + 1}`,
      url: `https://via.placeholder.com/400x300/${colors[i]}?text=${encodeURIComponent(query)}`,
      thumbnail: `https://via.placeholder.com/200x150/${colors[i]}?text=${query.slice(0, 10)}`,
      source,
    }));
  };

  const handleSaveBroll = (brollItem, momentId) => {
    console.log('Guardando b-roll:', { brollItem, momentId });
    // Implementar salvar b-roll (callback ou API)
  };

  const handleApiKeyChange = (key, value) => {
    setApiKeys(prev => ({ ...prev, [key]: value }));
    localStorage.setItem(`${key}`, value);
  };

  const getMomentSuggestions = () => {
    if (!selectedMoment) return [];
    return suggestions[selectedMoment.id]?.[currentSource] || [];
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: '100vh', padding: '20px' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            Gerenciador de B-Roll
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            {videoTitle} • {brollMoments.length} momentos detectados
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left: Moments List */}
          <div
            style={{
              backgroundColor: colors.panel,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              padding: '15px',
              maxHeight: '600px',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '15px', textTransform: 'uppercase' }}>
              Momentos de B-Roll
            </div>

            {brollMoments.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#64748b', padding: '20px' }}>
                <RefreshCw style={{ margin: '0 auto 10px', opacity: 0.5 }} size={32} />
                <div style={{ fontSize: '13px' }}>Analisando vídeo...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {brollMoments.map(moment => (
                  <button
                    key={moment.id}
                    onClick={() => {
                      setSelectedMoment(moment);
                      setCustomQuery('');
                      if (!suggestions[moment.id]?.[currentSource]) {
                        searchBrollSuggestions(moment, currentSource);
                      }
                    }}
                    style={{
                      backgroundColor: selectedMoment?.id === moment.id ? colors.accent : colors.bg,
                      borderColor: selectedMoment?.id === moment.id ? colors.accent : colors.border,
                      color: selectedMoment?.id === moment.id ? '#000' : colors.text,
                      border: `1px solid ${selectedMoment?.id === moment.id ? colors.accent : colors.border}`,
                      borderRadius: '6px',
                      padding: '12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    className="hover:border-current"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                      <div style={{ fontWeight: '500', fontSize: '13px' }}>
                        {moment.keyword}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {moment.confidence && `${(moment.confidence * 100).toFixed(0)}%`}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: selectedMoment?.id === moment.id ? 'rgba(0,0,0,0.8)' : '#94a3b8', marginBottom: '4px' }}>
                      {formatTime(moment.start)} - {formatTime(moment.end)}
                    </div>
                    <div style={{ fontSize: '11px', color: selectedMoment?.id === moment.id ? 'rgba(0,0,0,0.7)' : '#64748b' }}>
                      {moment.context}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: B-Roll Gallery */}
          <div
            style={{
              backgroundColor: colors.panel,
              borderRadius: '8px',
              border: `1px solid ${colors.border}`,
              padding: '15px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {selectedMoment && (
              <>
                {/* Search & Source Tabs */}
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>
                    Busca Personalizada
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                    <input
                      type="text"
                      value={customQuery}
                      onChange={(e) => setCustomQuery(e.target.value)}
                      placeholder="Digite sua busca..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          searchBrollSuggestions(selectedMoment, currentSource);
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: '4px',
                        padding: '8px 12px',
                        color: colors.text,
                        fontSize: '12px',
                      }}
                    />
                    <button
                      onClick={() => searchBrollSuggestions(selectedMoment, currentSource)}
                      disabled={loadingSource === currentSource}
                      style={{
                        backgroundColor: colors.accent,
                        border: 'none',
                        borderRadius: '4px',
                        padding: '8px 12px',
                        color: '#000',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '12px',
                      }}
                      className="hover:opacity-90"
                    >
                      {loadingSource === currentSource ? 'Carregando...' : 'Buscar'}
                    </button>
                  </div>

                  {/* Source Tabs */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {sources.map(source => (
                      <button
                        key={source.id}
                        onClick={() => {
                          setCurrentSource(source.id);
                          if (!suggestions[selectedMoment.id]?.[source.id]) {
                            searchBrollSuggestions(selectedMoment, source.id);
                          }
                        }}
                        style={{
                          backgroundColor: currentSource === source.id ? source.color : colors.bg,
                          border: `1px solid ${currentSource === source.id ? source.color : colors.border}`,
                          borderRadius: '4px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: currentSource === source.id ? '600' : '400',
                          color: currentSource === source.id ? '#fff' : colors.text,
                        }}
                        className="hover:opacity-80"
                      >
                        {source.icon} {source.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sugestões */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>
                    Sugestões ({getMomentSuggestions().length})
                  </div>

                  {loadingSource === currentSource ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                      <RefreshCw size={20} style={{ margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                      Carregando...
                    </div>
                  ) : getMomentSuggestions().length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '12px' }}>
                      Nenhuma sugestão encontrada
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                      {getMomentSuggestions().map(item => (
                        <div
                          key={item.id}
                          style={{
                            borderRadius: '6px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            position: 'relative',
                          }}
                          className="hover:scale-105"
                        >
                          <img
                            src={item.thumbnail || item.url}
                            alt={item.title}
                            style={{
                              width: '100%',
                              height: '100px',
                              objectFit: 'cover',
                              display: 'block',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: 'rgba(0,0,0,0.6)',
                              opacity: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              transition: 'opacity 0.2s',
                            }}
                            className="hover:opacity-100"
                          >
                            <button
                              onClick={() => handleSaveBroll(item, selectedMoment.id)}
                              style={{
                                backgroundColor: colors.accent,
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                color: '#000',
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: '600',
                              }}
                              title="Usar este b-roll"
                            >
                              ✓ Usar
                            </button>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                backgroundColor: colors.border,
                                border: 'none',
                                borderRadius: '4px',
                                padding: '6px 10px',
                                color: colors.text,
                                cursor: 'pointer',
                                fontSize: '11px',
                                textDecoration: 'none',
                              }}
                              title="Abrir no navegador"
                            >
                              ↗
                            </a>
                          </div>
                          <div style={{ fontSize: '10px', color: '#94a3b8', padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.type === 'video' ? '🎬 Vídeo' : '🖼️ Foto'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* API Keys Settings */}
        <details
          style={{
            marginTop: '20px',
            backgroundColor: colors.panel,
            borderRadius: '8px',
            border: `1px solid ${colors.border}`,
            padding: '15px',
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: '600', fontSize: '12px', textTransform: 'uppercase' }}>
            <Settings size={14} style={{ display: 'inline', marginRight: '8px' }} />
            Configurar Chaves de API
          </summary>
          <div style={{ marginTop: '15px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '5px' }}>
                Pexels API Key
              </label>
              <input
                type="password"
                value={apiKeys.pexels}
                onChange={(e) => handleApiKeyChange('pexels', e.target.value)}
                placeholder="Sua chave Pexels..."
                style={{
                  width: '100%',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  padding: '8px',
                  color: colors.text,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
              <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#7C3AED' }}>
                Obter chave →
              </a>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '5px' }}>
                Google Custom Search Key
              </label>
              <input
                type="password"
                value={apiKeys.googleKey}
                onChange={(e) => handleApiKeyChange('googleKey', e.target.value)}
                placeholder="Sua chave Google..."
                style={{
                  width: '100%',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  padding: '8px',
                  color: colors.text,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '500', display: 'block', marginBottom: '5px' }}>
                Google Search Engine ID (CX)
              </label>
              <input
                type="password"
                value={apiKeys.googleCx}
                onChange={(e) => handleApiKeyChange('googleCx', e.target.value)}
                placeholder="Seu Google CX..."
                style={{
                  width: '100%',
                  backgroundColor: colors.bg,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '4px',
                  padding: '8px',
                  color: colors.text,
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

export default BrollManager;
