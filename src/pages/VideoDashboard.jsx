import React, { useState, useEffect } from 'react';
import { Play, Plus, FileText, Zap, TrendingUp, Clock, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const VideoDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    videosEdited: 9,
    last30Days: 9,
    timeSaved: '4m23s',
    subtitlesGenerated: 73,
    avgEditTime: '12m',
    brollInserted: 42,
    qualityScore: 8.7,
  });

  const [recentVideos, setRecentVideos] = useState([
    {
      id: 1,
      title: '3 passos para alinhar problemas antes que o prazo estoure.MOV',
      date: '21 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
    {
      id: 2,
      title: '3 passos para alinhar problemas antes que o prazo estoure.MOV',
      date: '21 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
    {
      id: 3,
      title: '3 passos para alinhar problemas antes que o prazo estoure.MOV',
      date: '21 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
    {
      id: 4,
      title: 'R13 - O que aconteceu com a Sadia.MOV',
      date: '10 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
    {
      id: 5,
      title: 'TrÃªs coisas que diferenciam cobraÃ±a de desempenho de assÃ©dio moral...',
      date: '07 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
    {
      id: 6,
      title: 'Meu Legado Extrair o Melhor de Cada Pessoa.mp4',
      date: '07 de set. de 2026',
      status: 'Finalizado',
      type: 'Edição automática',
      views: 0,
    },
  ]);

  const colors = {
    bg: '#0f172a',
    panel: '#1e293b',
    border: '#334155',
    text: '#f1f5f9',
    accent: '#FF6B35',
    purple: '#7C3AED',
    green: '#10B981',
  };

  const StatCard = ({ icon: Icon, label, value, unit, color }) => (
    <div
      style={{
        backgroundColor: colors.panel,
        borderRadius: '12px',
        border: `1px solid ${colors.border}`,
        padding: '20px',
        flex: 1,
        minWidth: '200px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '8px',
            backgroundColor: color,
            opacity: 0.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={20} color={color} />
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 'bold', color: colors.text, marginBottom: '4px' }}>
        {value}
      </div>
      {unit && <div style={{ fontSize: '12px', color: '#64748b' }}>{unit}</div>}
    </div>
  );

  const VideoRow = ({ video }) => (
    <div
      onClick={() => navigate('/video-editor')}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px',
        backgroundColor: colors.bg,
        borderRadius: '8px',
        marginBottom: '12px',
        cursor: 'pointer',
        border: `1px solid ${colors.border}`,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = colors.panel;
        e.currentTarget.style.borderColor = colors.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = colors.bg;
        e.currentTarget.style.borderColor = colors.border;
      }}
    >
      <div style={{ width: '40px', height: '40px', marginRight: '12px' }}>
        <FileText size={40} color={colors.accent} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '14px', fontWeight: '500', color: colors.text, marginBottom: '4px' }}>
          {video.title}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            ✓ {video.status}
          </span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>•</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {video.type}
          </span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>•</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {video.date}
          </span>
        </div>
      </div>
      <button
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: colors.accent,
          padding: '8px',
        }}
        title="Download"
      >
        ↓
      </button>
    </div>
  );

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: '100vh', padding: '30px' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div style={{ fontSize: '16px', color: '#94a3b8', marginBottom: '8px' }}>
            Olá, Gustavo 👋
          </div>
          <h1 style={{ fontSize: '44px', fontWeight: 'bold', margin: 0, marginBottom: '8px' }}>
            Sua <span style={{ color: colors.accent }}>produtividade</span>
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Estatísticas de edição e otimização
          </p>
        </div>

        {/* Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '40px',
          }}
        >
          <StatCard
            icon={FileText}
            label="Vídeos Editados"
            value={stats.videosEdited}
            color={colors.accent}
          />
          <StatCard
            icon={TrendingUp}
            label="Nos últimos 30 dias"
            value={stats.last30Days}
            color={colors.purple}
          />
          <StatCard
            icon={Clock}
            label="Tempo Economizado"
            value={stats.timeSaved}
            color={colors.green}
          />
          <StatCard
            icon={Sparkles}
            label="Legendas Geradas"
            value={stats.subtitlesGenerated}
            color={'#3B82F6'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
          {/* Main Content */}
          <div>
            {/* Section Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0, marginBottom: '4px' }}>
                  Vídeos recentes
                </h2>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  Seus últimos 6 projetos
                </p>
              </div>
              <button
                onClick={() => navigate('/video-editor')}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: colors.accent,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                className="hover:opacity-80"
              >
                Ver todos <ChevronRight size={16} />
              </button>
            </div>

            {/* Videos List */}
            <div>
              {recentVideos.map(video => (
                <VideoRow key={video.id} video={video} />
              ))}
            </div>
          </div>

          {/* Right Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Quick Actions */}
            <div
              style={{
                backgroundColor: colors.panel,
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
                padding: '20px',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: '600', margin: '0 0 16px 0', textTransform: 'uppercase', color: '#94a3b8' }}>
                Ações rápidas
              </h3>

              <button
                onClick={() => navigate('/video-editor')}
                style={{
                  width: '100%',
                  backgroundColor: colors.accent,
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}
                className="hover:opacity-90"
              >
                <Plus size={18} />
                Novo vídeo
              </button>

              <button
                style={{
                  width: '100%',
                  backgroundColor: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  marginBottom: '12px',
                }}
                className="hover:border-current"
              >
                📚 Ver biblioteca
              </button>

              <button
                style={{
                  width: '100%',
                  backgroundColor: colors.bg,
                  color: colors.text,
                  border: `1px solid ${colors.border}`,
                  borderRadius: '8px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                }}
                className="hover:border-current"
              >
                ⚡ Turbine com IA
              </button>
            </div>

            {/* Stats Cards */}
            <div
              style={{
                backgroundColor: colors.panel,
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
                padding: '16px',
              }}
            >
              <h3 style={{ fontSize: '12px', fontWeight: '600', margin: '0 0 12px 0', textTransform: 'uppercase', color: '#94a3b8' }}>
                Mais informações
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Tempo médio de edição
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: colors.text }}>
                    {stats.avgEditTime}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    B-rolls inseridos
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: colors.text }}>
                    {stats.brollInserted}
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Qualidade média
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: colors.green }}>
                    {stats.qualityScore}/10 ⭐
                  </div>
                </div>
              </div>
            </div>

            {/* AI Feature */}
            <div
              style={{
                backgroundColor: `linear-gradient(135deg, ${colors.purple}20 0%, ${colors.accent}20 100%)`,
                borderRadius: '12px',
                border: `1px solid ${colors.border}`,
                padding: '16px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <Zap size={16} color={colors.accent} />
                <span style={{ fontSize: '12px', fontWeight: '600', color: colors.accent }}>
                  Turbine com IA
                </span>
              </div>
              <p style={{ fontSize: '12px', color: colors.text, margin: '0 0 12px 0' }}>
                Conecte a chave do Pexels (B-roll grátis) e da Anthropic (correção por IA) nas Configurações.
              </p>
              <button
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  border: `1px solid ${colors.accent}`,
                  borderRadius: '6px',
                  padding: '8px',
                  color: colors.accent,
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                }}
                className="hover:bg-opacity-10"
              >
                Abrir Configurações →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoDashboard;
