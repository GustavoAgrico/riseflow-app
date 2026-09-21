import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Settings, Download, X } from 'lucide-react';

const VideoEditor = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timelineRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [scale, setScale] = useState(1);
  const [selectedTool, setSelectedTool] = useState('select');
  const [clips, setClips] = useState([]);
  const [subtitles, setSubtitles] = useState([]);
  const [effects, setEffects] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('properties'); // properties | adjustments | effects
  const [videoAdjustments, setVideoAdjustments] = useState({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    temperature: 0,
    blur: 0,
    scale: 1,
    rotation: 0,
    flipH: false,
    flipV: false,
    speed: 1,
  });

  const colors = {
    bg: '#0f172a',
    panel: '#1e293b',
    border: '#334155',
    text: '#f1f5f9',
    accent: '#FF6B35',
    purple: '#7C3AED',
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleLoadedMetadata = () => setDuration(video.duration);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideo({ file, url, name: file.name });
      if (videoRef.current) {
        videoRef.current.src = url;
      }
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleTimelineClick = (e) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || !videoRef.current) return;
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;
    videoRef.current.currentTime = Math.max(0, Math.min(newTime, duration));
  };

  const addSubtitle = () => {
    const newSubtitle = {
      id: Date.now(),
      text: 'Nova legenda',
      startTime: currentTime,
      endTime: currentTime + 3,
      position: 'bottom',
    };
    setSubtitles([...subtitles, newSubtitle]);
  };

  const addClip = () => {
    const newClip = {
      id: Date.now(),
      name: `Clipe ${clips.length + 1}`,
      startTime: Math.max(0, currentTime - 5),
      endTime: Math.min(duration, currentTime + 5),
    };
    setClips([...clips, newClip]);
  };

  const removeSubtitle = (id) => {
    setSubtitles(subtitles.filter(s => s.id !== id));
  };

  const removeClip = (id) => {
    setClips(clips.filter(c => c.id !== id));
  };

  const updateSubtitle = (id, updates) => {
    setSubtitles(subtitles.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const ToolButton = ({ icon: Icon, label, active, onClick }) => (
    <button
      onClick={onClick}
      title={label}
      style={{
        backgroundColor: active ? colors.accent : colors.panel,
        borderColor: active ? colors.accent : colors.border,
        color: active ? '#000' : colors.text,
        border: `1px solid ${active ? colors.accent : colors.border}`,
      }}
      className="p-2 rounded transition-all hover:border-current"
    >
      <Icon size={18} />
    </button>
  );

  return (
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="max-w-full mx-auto" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
        {/* Header */}
        <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '15px', borderBottom: `1px solid ${colors.border}` }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Editor de Vídeo</h1>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Timeline • Edite todo o vídeo</p>
          </div>
          <button
            style={{
              backgroundColor: colors.accent,
              color: '#000',
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            className="hover:opacity-90"
          >
            <Download size={18} />
            Exportar
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '15px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Main Editor */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Video Preview */}
            <div
              style={{
                backgroundColor: colors.panel,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                marginBottom: '15px',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {video ? (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                  <video
                    ref={videoRef}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      backgroundColor: '#000',
                    }}
                  />
                </div>
              ) : (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '300px',
                    backgroundColor: colors.panel,
                    cursor: 'pointer',
                    borderRadius: '8px',
                  }}
                >
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    style={{ display: 'none' }}
                  />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎬</div>
                    <div style={{ fontSize: '16px', marginBottom: '5px' }}>Clique para enviar vídeo</div>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>ou arraste um arquivo</div>
                  </div>
                </label>
              )}
            </div>

            {/* Controls */}
            {video && (
              <>
                {/* Playback Controls */}
                <div
                  style={{
                    backgroundColor: colors.panel,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    padding: '15px',
                    marginBottom: '20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                    <button
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentTime - 5);
                      }}
                      style={{
                        backgroundColor: colors.border,
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      className="hover:opacity-80"
                    >
                      <SkipBack size={18} color={colors.text} />
                    </button>

                    <button
                      onClick={togglePlayPause}
                      style={{
                        backgroundColor: colors.accent,
                        border: 'none',
                        borderRadius: '6px',
                        padding: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      className="hover:opacity-90"
                    >
                      {isPlaying ? (
                        <Pause size={20} color="#000" />
                      ) : (
                        <Play size={20} color="#000" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = Math.min(duration, currentTime + 5);
                      }}
                      style={{
                        backgroundColor: colors.border,
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      className="hover:opacity-80"
                    >
                      <SkipForward size={18} color={colors.text} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
                      <Volume2 size={18} />
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.1"
                        value={volume}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setVolume(v);
                          if (videoRef.current) videoRef.current.volume = v;
                        }}
                        style={{ width: '100px', cursor: 'pointer' }}
                      />
                    </div>

                    <div style={{ color: '#94a3b8', fontSize: '12px', minWidth: '80px', textAlign: 'right' }}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div
                    ref={timelineRef}
                    onClick={handleTimelineClick}
                    style={{
                      width: '100%',
                      height: '40px',
                      backgroundColor: colors.bg,
                      borderRadius: '4px',
                      position: 'relative',
                      cursor: 'pointer',
                      border: `1px solid ${colors.border}`,
                    }}
                  >
                    {/* Progress bar */}
                    <div
                      style={{
                        height: '100%',
                        width: `${(currentTime / duration) * 100}%`,
                        backgroundColor: colors.accent,
                        borderRadius: '4px 0 0 4px',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          right: '-8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: '16px',
                          height: '16px',
                          backgroundColor: colors.accent,
                          borderRadius: '50%',
                          border: `2px solid ${colors.text}`,
                        }}
                      />
                    </div>

                    {/* Markers */}
                    {clips.map(clip => (
                      <div
                        key={clip.id}
                        style={{
                          position: 'absolute',
                          height: '100%',
                          backgroundColor: colors.purple,
                          opacity: 0.3,
                          left: `${(clip.startTime / duration) * 100}%`,
                          width: `${((clip.endTime - clip.startTime) / duration) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Toolbar */}
                <div
                  style={{
                    backgroundColor: colors.panel,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    padding: '15px',
                    marginBottom: '15px',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <ToolButton
                      icon={Play}
                      label="Selecionar"
                      active={selectedTool === 'select'}
                      onClick={() => setSelectedTool('select')}
                    />
                    <button
                      onClick={addClip}
                      style={{
                        backgroundColor: colors.panel,
                        borderColor: colors.border,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                      className="hover:border-current"
                    >
                      + Cortar
                    </button>
                    <button
                      onClick={addSubtitle}
                      style={{
                        backgroundColor: colors.panel,
                        borderColor: colors.border,
                        color: colors.text,
                        border: `1px solid ${colors.border}`,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                      className="hover:border-current"
                    >
                      + Legenda
                    </button>
                  </div>
                </div>

                {/* Advanced Timeline with Tracks */}
                <div
                  style={{
                    backgroundColor: colors.panel,
                    borderRadius: '8px',
                    border: `1px solid ${colors.border}`,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: 0,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: '12px 15px', borderBottom: `1px solid ${colors.border}`, fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Timeline
                  </div>

                  {/* Tracks Container */}
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                    {/* Ruler/Timecode */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
                      <div style={{ width: '150px', borderRight: `1px solid ${colors.border}`, padding: '8px', fontSize: '11px', color: '#94a3b8' }}>
                        Tracks
                      </div>
                      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        {Array.from({ length: Math.ceil(duration / 5) }).map((_, i) => (
                          <div
                            key={i}
                            style={{
                              flex: 1,
                              minWidth: '80px',
                              borderRight: `1px solid ${colors.border}`,
                              padding: '8px 4px',
                              fontSize: '10px',
                              color: '#94a3b8',
                              textAlign: 'center',
                            }}
                          >
                            {formatTime(i * 5)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Video Track */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
                      <div style={{ width: '150px', borderRight: `1px solid ${colors.border}`, padding: '12px', fontSize: '11px', fontWeight: '500', color: colors.text }}>
                        🎬 Vídeo
                      </div>
                      <div
                        style={{
                          flex: 1,
                          position: 'relative',
                          height: '60px',
                          backgroundColor: colors.bg,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            height: '100%',
                            backgroundColor: '#7C3AED',
                            opacity: 0.3,
                            width: '100%',
                            left: 0,
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            height: '100%',
                            width: '2px',
                            backgroundColor: colors.accent,
                            left: `${(currentTime / duration) * 100}%`,
                            zIndex: 10,
                          }}
                        />
                      </div>
                    </div>

                    {/* Audio Track */}
                    <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
                      <div style={{ width: '150px', borderRight: `1px solid ${colors.border}`, padding: '12px', fontSize: '11px', fontWeight: '500', color: colors.text }}>
                        🔊 Áudio
                      </div>
                      <div
                        style={{
                          flex: 1,
                          position: 'relative',
                          height: '50px',
                          backgroundColor: colors.bg,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            height: '100%',
                            backgroundColor: '#10B981',
                            opacity: 0.2,
                            width: '100%',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            height: '100%',
                            width: '2px',
                            backgroundColor: colors.accent,
                            left: `${(currentTime / duration) * 100}%`,
                            zIndex: 10,
                          }}
                        />
                      </div>
                    </div>

                    {/* Subtitles Track */}
                    {subtitles.length > 0 && (
                      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
                        <div style={{ width: '150px', borderRight: `1px solid ${colors.border}`, padding: '12px', fontSize: '11px', fontWeight: '500', color: colors.text }}>
                          📝 Legendas
                        </div>
                        <div
                          style={{
                            flex: 1,
                            position: 'relative',
                            height: '50px',
                            backgroundColor: colors.bg,
                            overflow: 'hidden',
                          }}
                        >
                          {subtitles.map(sub => (
                            <div
                              key={sub.id}
                              style={{
                                position: 'absolute',
                                height: '100%',
                                backgroundColor: colors.accent,
                                opacity: 0.5,
                                left: `${(sub.startTime / duration) * 100}%`,
                                width: `${((sub.endTime - sub.startTime) / duration) * 100}%`,
                              }}
                            />
                          ))}
                          <div
                            style={{
                              position: 'absolute',
                              height: '100%',
                              width: '2px',
                              backgroundColor: colors.accent,
                              left: `${(currentTime / duration) * 100}%`,
                              zIndex: 10,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* B-Roll Track */}
                    {clips.length > 0 && (
                      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
                        <div style={{ width: '150px', borderRight: `1px solid ${colors.border}`, padding: '12px', fontSize: '11px', fontWeight: '500', color: colors.text }}>
                          🎞️ B-Roll
                        </div>
                        <div
                          style={{
                            flex: 1,
                            position: 'relative',
                            height: '50px',
                            backgroundColor: colors.bg,
                            overflow: 'hidden',
                          }}
                        >
                          {clips.map(clip => (
                            <div
                              key={clip.id}
                              style={{
                                position: 'absolute',
                                height: '100%',
                                backgroundColor: '#F59E0B',
                                opacity: 0.5,
                                left: `${(clip.startTime / duration) * 100}%`,
                                width: `${((clip.endTime - clip.startTime) / duration) * 100}%`,
                              }}
                            />
                          ))}
                          <div
                            style={{
                              position: 'absolute',
                              height: '100%',
                              width: '2px',
                              backgroundColor: colors.accent,
                              left: `${(currentTime / duration) * 100}%`,
                              zIndex: 10,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0', height: '100%', minHeight: 0, overflow: 'hidden', backgroundColor: colors.panel, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
            {/* Sidebar Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
              <button
                onClick={() => setSidebarTab('properties')}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: sidebarTab === 'properties' ? colors.accent : colors.panel,
                  color: sidebarTab === 'properties' ? '#000' : colors.text,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                }}
                className="hover:opacity-80"
              >
                📋 Propriedades
              </button>
              <button
                onClick={() => setSidebarTab('adjustments')}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: sidebarTab === 'adjustments' ? colors.accent : colors.panel,
                  color: sidebarTab === 'adjustments' ? '#000' : colors.text,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  borderLeft: `1px solid ${colors.border}`,
                }}
                className="hover:opacity-80"
              >
                🎨 Ajustar
              </button>
              <button
                onClick={() => setSidebarTab('effects')}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: sidebarTab === 'effects' ? colors.accent : colors.panel,
                  color: sidebarTab === 'effects' ? '#000' : colors.text,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  borderLeft: `1px solid ${colors.border}`,
                }}
                className="hover:opacity-80"
              >
                ✨ Efeitos
              </button>
            </div>

            {/* Sidebar Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                {/* Properties Tab */}
              {sidebarTab === 'properties' && (
                <>
                  {video && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>Arquivo</div>
                      <div style={{ fontSize: '13px', fontWeight: '500', wordBreak: 'break-all', marginBottom: '8px' }}>
                        {video.name}
                      </div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        Duração: {formatTime(duration)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Adjustments Tab */}
              {sidebarTab === 'adjustments' && (
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '15px', fontWeight: '600', textTransform: 'uppercase' }}>Editar Vídeo</div>

                  {/* Brightness */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      ☀️ Brilho ({videoAdjustments.brightness})
                    </label>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={videoAdjustments.brightness}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, brightness: parseInt(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Contrast */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      ◆ Contraste ({videoAdjustments.contrast})
                    </label>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={videoAdjustments.contrast}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, contrast: parseInt(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Saturation */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      🎨 Saturação ({videoAdjustments.saturation})
                    </label>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={videoAdjustments.saturation}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, saturation: parseInt(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Hue */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      🌈 Matiz ({videoAdjustments.hue})
                    </label>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={videoAdjustments.hue}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, hue: parseInt(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Temperature */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      🔥 Temperatura ({videoAdjustments.temperature})
                    </label>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={videoAdjustments.temperature}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, temperature: parseInt(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  <hr style={{ borderColor: colors.border, margin: '15px 0' }} />

                  {/* Scale */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      📏 Escala ({(videoAdjustments.scale * 100).toFixed(0)}%)
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={videoAdjustments.scale}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, scale: parseFloat(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Rotation */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      🔄 Rotação ({videoAdjustments.rotation}°)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setVideoAdjustments({...videoAdjustments, rotation: (videoAdjustments.rotation - 90) % 360})}
                        style={{
                          flex: 1,
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          padding: '6px',
                          color: colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        ↶ -90°
                      </button>
                      <button
                        onClick={() => setVideoAdjustments({...videoAdjustments, rotation: (videoAdjustments.rotation + 90) % 360})}
                        style={{
                          flex: 1,
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          padding: '6px',
                          color: colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                        }}
                      >
                        ↷ +90°
                      </button>
                    </div>
                  </div>

                  {/* Flip */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      🔀 Flip
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setVideoAdjustments({...videoAdjustments, flipH: !videoAdjustments.flipH})}
                        style={{
                          flex: 1,
                          backgroundColor: videoAdjustments.flipH ? colors.accent : colors.bg,
                          border: `1px solid ${videoAdjustments.flipH ? colors.accent : colors.border}`,
                          borderRadius: '4px',
                          padding: '6px',
                          color: videoAdjustments.flipH ? '#000' : colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: videoAdjustments.flipH ? '600' : '400',
                        }}
                      >
                        ↔️ Horizontal
                      </button>
                      <button
                        onClick={() => setVideoAdjustments({...videoAdjustments, flipV: !videoAdjustments.flipV})}
                        style={{
                          flex: 1,
                          backgroundColor: videoAdjustments.flipV ? colors.accent : colors.bg,
                          border: `1px solid ${videoAdjustments.flipV ? colors.accent : colors.border}`,
                          borderRadius: '4px',
                          padding: '6px',
                          color: videoAdjustments.flipV ? '#000' : colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: videoAdjustments.flipV ? '600' : '400',
                        }}
                      >
                        ↕️ Vertical
                      </button>
                    </div>
                  </div>

                  {/* Speed */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: colors.text, display: 'block', marginBottom: '6px' }}>
                      ⏱️ Velocidade ({videoAdjustments.speed.toFixed(1)}x)
                    </label>
                    <input
                      type="range"
                      min="0.25"
                      max="2"
                      step="0.25"
                      value={videoAdjustments.speed}
                      onChange={(e) => setVideoAdjustments({...videoAdjustments, speed: parseFloat(e.target.value)})}
                      style={{ width: '100%', cursor: 'pointer' }}
                    />
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                      0.25x Lento | 1x Normal | 2x Rápido
                    </div>
                  </div>

                  {/* Reset Button */}
                  <button
                    onClick={() => setVideoAdjustments({
                      brightness: 0,
                      contrast: 0,
                      saturation: 0,
                      hue: 0,
                      temperature: 0,
                      blur: 0,
                      scale: 1,
                      rotation: 0,
                      flipH: false,
                      flipV: false,
                      speed: 1,
                    })}
                    style={{
                      width: '100%',
                      backgroundColor: colors.border,
                      border: `1px solid ${colors.border}`,
                      borderRadius: '4px',
                      padding: '8px',
                      color: colors.text,
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '600',
                      marginTop: '10px',
                    }}
                    className="hover:opacity-80"
                  >
                    ↺ Resetar Ajustes
                  </button>
                </div>
              )}

              {/* Effects Tab */}
              {sidebarTab === 'effects' && (
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '15px', fontWeight: '600', textTransform: 'uppercase' }}>Efeitos Visuais</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {['Preto & Branco', 'Sépia', 'Negativo', 'Blur', 'Sharpen', 'Invert', 'Fade In', 'Fade Out'].map((effect, i) => (
                      <button
                        key={i}
                        style={{
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          padding: '10px 8px',
                          color: colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}
                        className="hover:border-current hover:bg-opacity-80"
                      >
                        {effect}
                      </button>
                    ))}
                  </div>

                  <hr style={{ borderColor: colors.border, margin: '15px 0' }} />

                  <div style={{ fontSize: '12px', fontWeight: '600', color: colors.text, marginBottom: '10px' }}>
                    Transições
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {['Fade', 'Slide', 'Zoom', 'Wipe', 'Push', 'Cover', 'Uncover', 'Cross'].map((trans, i) => (
                      <button
                        key={i}
                        style={{
                          backgroundColor: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: '4px',
                          padding: '10px 8px',
                          color: colors.text,
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}
                        className="hover:border-current hover:bg-opacity-80"
                      >
                        {trans}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

              {/* Show clips and subtitles in properties tab */}
              {sidebarTab === 'properties' && (
                <>
                  {/* Clips */}
                  {clips.length > 0 && (
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Clipes ({clips.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {clips.map(clip => (
                          <div
                            key={clip.id}
                            style={{
                              backgroundColor: colors.bg,
                              borderRadius: '6px',
                              padding: '10px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '12px',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: '500' }}>{clip.name}</div>
                              <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                                {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                              </div>
                            </div>
                            <button
                              onClick={() => removeClip(clip.id)}
                              style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#ef4444',
                                padding: '4px',
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subtitles */}
                  {subtitles.length > 0 && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Legendas ({subtitles.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {subtitles.map(sub => (
                          <div
                            key={sub.id}
                            style={{
                              backgroundColor: colors.bg,
                              borderRadius: '6px',
                              padding: '10px',
                              fontSize: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                              <input
                                type="text"
                                value={sub.text}
                                onChange={(e) => updateSubtitle(sub.id, { text: e.target.value })}
                                style={{
                                  backgroundColor: colors.panel,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  padding: '6px',
                                  color: colors.text,
                                  fontSize: '12px',
                                  flex: 1,
                                  marginRight: '8px',
                                }}
                              />
                              <button
                                onClick={() => removeSubtitle(sub.id)}
                                style={{
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: '#ef4444',
                                  padding: '4px',
                                }}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: '#94a3b8' }}>
                              <input
                                type="number"
                                value={sub.startTime.toFixed(2)}
                                onChange={(e) => updateSubtitle(sub.id, { startTime: parseFloat(e.target.value) })}
                                style={{
                                  backgroundColor: colors.bg,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  padding: '4px',
                                  color: colors.text,
                                  width: '50px',
                                }}
                                step="0.1"
                              />
                              <span style={{ color: '#64748b' }}>→</span>
                              <input
                                type="number"
                                value={sub.endTime.toFixed(2)}
                                onChange={(e) => updateSubtitle(sub.id, { endTime: parseFloat(e.target.value) })}
                                style={{
                                  backgroundColor: colors.bg,
                                  border: `1px solid ${colors.border}`,
                                  borderRadius: '4px',
                                  padding: '4px',
                                  color: colors.text,
                                  width: '50px',
                                }}
                                step="0.1"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEditor;
