// Som de comemoração sintetizado (Web Audio), sem arquivos: buzina de estádio,
// fanfarra de metais e torcida com estouros de confete.
// Navegadores só liberam áudio após um gesto do usuário; se o contexto estiver
// suspenso, toca assim que houver o próximo clique/toque.
let ctx = null
let master = null

function setup() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
  if (!master) {
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 8
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.2
    master = ctx.createGain()
    master.gain.value = 1
    master.connect(comp)
    comp.connect(ctx.destination)
  }
}

function noiseBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0
  for (let i = 0; i < len; i++) { // ruído rosa (mais natural que o branco)
    const w = Math.random() * 2 - 1
    b0 = 0.99765 * b0 + w * 0.099046
    b1 = 0.963 * b1 + w * 0.2965164
    b2 = 0.57 * b2 + w * 1.0526913
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
  }
  return buf
}

// Buzina a ar: duas palhetas levemente desafinadas, ressonância nasal e a
// "tremulação" rápida característica da corneta.
function hornBlast(t, dur, freq = 415) {
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(0.55, t + 0.025)
  out.gain.setValueAtTime(0.55, t + dur - 0.08)
  out.gain.exponentialRampToValueAtTime(0.001, t + dur)

  const flutter = ctx.createOscillator()
  const flutterDepth = ctx.createGain()
  flutter.frequency.value = 31
  flutterDepth.gain.value = 0.12
  flutter.connect(flutterDepth).connect(out.gain)

  const body = ctx.createBiquadFilter()
  body.type = 'peaking'; body.frequency.value = 1800; body.Q.value = 1.4; body.gain.value = 9
  const nasal = ctx.createBiquadFilter()
  nasal.type = 'peaking'; nasal.frequency.value = 3200; nasal.Q.value = 2; nasal.gain.value = 6
  const top = ctx.createBiquadFilter()
  top.type = 'lowpass'; top.frequency.value = 6500
  body.connect(nasal).connect(top).connect(out).connect(master)

  for (const [type, mult, detune, level] of [['sawtooth', 1, 0, 0.5], ['square', 1, 9, 0.28], ['sawtooth', 2, -7, 0.22]]) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.detune.value = detune
    o.frequency.setValueAtTime(freq * mult * 0.92, t)                 // ataque um pouco abaixo...
    o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.07)    // ...e sobe até a nota
    g.gain.value = level
    o.connect(g).connect(body)
    o.start(t); o.stop(t + dur)
  }
  flutter.start(t); flutter.stop(t + dur)
}

// Metal sintetizado: dente de serra com filtro que "abre" no ataque.
function brassNote(t, freq, dur, level = 0.22) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level, t + 0.03)
  g.gain.setValueAtTime(level, t + dur - 0.05)
  g.gain.linearRampToValueAtTime(0, t + dur)
  const f = ctx.createBiquadFilter()
  f.type = 'lowpass'; f.Q.value = 3
  f.frequency.setValueAtTime(500, t)
  f.frequency.linearRampToValueAtTime(4200, t + 0.06)
  f.frequency.exponentialRampToValueAtTime(1800, t + Math.min(dur, 0.35))
  f.connect(g).connect(master)
  for (const det of [-6, 0, 7]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det
    const vib = ctx.createOscillator(); const vibG = ctx.createGain()
    vib.frequency.value = 5.5; vibG.gain.value = dur > 0.4 ? 6 : 0
    vib.connect(vibG).connect(o.detune)
    o.connect(f)
    o.start(t); o.stop(t + dur); vib.start(t); vib.stop(t + dur)
  }
}

// "Tã-tã-tã-tããã" em dó maior, com acorde final.
function fanfare(t) {
  const N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99 }
  const notes = [['G4', 0, 0.14], ['C5', 0.16, 0.14], ['E5', 0.32, 0.14], ['G5', 0.48, 0.32], ['E5', 0.84, 0.14], ['G5', 1.0, 1.1]]
  for (const [n, at, d] of notes) brassNote(t + at, N[n], d)
  for (const f of [N.C5, N.E5]) brassNote(t + 1.0, f, 1.1, 0.12)
}

function crowd(t, dur) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(dur)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.6
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.5, t + 0.5)
  g.gain.setValueAtTime(0.5, t + dur - 1.2)
  g.gain.linearRampToValueAtTime(0, t + dur)
  const wobble = ctx.createOscillator(); const wobbleG = ctx.createGain()
  wobble.frequency.value = 3.3; wobbleG.gain.value = 0.12
  wobble.connect(wobbleG).connect(g.gain)
  src.connect(bp).connect(g).connect(master)
  src.start(t); wobble.start(t); wobble.stop(t + dur)
}

function popper(t) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(0.12)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'; hp.frequency.value = 1500
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.8, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
  src.connect(hp).connect(g).connect(master)
  src.start(t)
}

function play() {
  const t = ctx.currentTime + 0.05
  hornBlast(t, 0.22)
  hornBlast(t + 0.3, 0.22)
  hornBlast(t + 0.6, 0.22)
  hornBlast(t + 0.9, 1.15, 392)
  popper(t + 0.9); popper(t + 1.05); popper(t + 1.3)
  crowd(t + 0.9, 4.2)
  fanfare(t + 2.15)
  popper(t + 3.2); popper(t + 3.35)
}

function playSynth() {
  try {
    setup()
    if (ctx.state === 'running') return play()
    ctx.resume().then(play).catch(() => {
      window.addEventListener('pointerdown', () => ctx.resume().then(play).catch(() => {}), { once: true })
    })
  } catch { /* sem Web Audio: segue só com a animação */ }
}

// Se existir public/sounds/meta-batida.mp3, toca o arquivo; senão, o som sintetizado.
const SOUND_FILE = '/sounds/meta-batida.mp3'

export function playCelebrationSound() {
  const audio = new Audio(SOUND_FILE)
  audio.volume = 1
  audio.addEventListener('error', playSynth, { once: true })
  audio.play().catch((e) => {
    if (e?.name === 'NotAllowedError') {
      window.addEventListener('pointerdown', () => audio.play().catch(() => {}), { once: true })
    }
  })
}
