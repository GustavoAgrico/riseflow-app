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
    <div style={{ backgroundColor: colors.bg, color: colors.text, minHeight: '100vh', padding: '20px' }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>Editor de Vídeo</h1>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              style={{
                backgroundColor: colors.accent,
                color: '#000',
                padding: '8px 16px',
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
          {/* Main Editor */}
          <div>
            {/* Video Preview */}
            <div
              style={{
                backgroundColor: colors.panel,
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                marginBottom: '20px',
                overflow: 'hidden',
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
                    marginBottom: '20px',
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
              </>
            )}
          </div>

          {/* Right Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'fit-content' }}>
            {/* Video Info */}
            {video && (
              <div
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  padding: '15px',
                }}
              >
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '5px' }}>ARQUIVO</div>
                <div style={{ fontSize: '13px', fontWeight: '500', wordBreak: 'break-all', marginBottom: '10px' }}>
                  {video.name}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Duração: {formatTime(duration)}
                </div>
              </div>
            )}

            {/* Clips */}
            {clips.length > 0 && (
              <div
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  padding: '15px',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>
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
              <div
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: '8px',
                  border: `1px solid ${colors.border}`,
                  padding: '15px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase' }}>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEditor;
