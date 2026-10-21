// Buzina de estádio sintetizada (Web Audio) — sem arquivo de som.
// Navegadores só tocam áudio após um gesto do usuário; se o contexto estiver
// suspenso, tenta de novo no próximo clique/toque.
let ctx = null

function distortionCurve(amount = 40) {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

function blast(start, duration) {
  const out = ctx.createGain()
  out.gain.setValueAtTime(0, start)
  out.gain.linearRampToValueAtTime(0.9, start + 0.03)
  out.gain.setValueAtTime(0.9, start + duration - 0.06)
  out.gain.linearRampToValueAtTime(0, start + duration)

  const shaper = ctx.createWaveShaper()
  shaper.curve = distortionCurve()
  shaper.connect(out)
  out.connect(ctx.destination)

  for (const [freq, detune] of [[233, 0], [293, 6], [349, -5], [466, 3]]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq * 0.97, start)
    osc.frequency.linearRampToValueAtTime(freq, start + 0.08)
    osc.detune.value = detune
    osc.connect(shaper)
    osc.start(start)
    osc.stop(start + duration)
  }
}

function play() {
  const t = ctx.currentTime + 0.05
  blast(t, 0.32)
  blast(t + 0.42, 0.32)
  blast(t + 0.84, 1.3)
}

export function playAirHorn() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'running') return play()
    ctx.resume().then(play).catch(() => {
      const retry = () => { ctx.resume().then(play).catch(() => {}) }
      window.addEventListener('pointerdown', retry, { once: true })
    })
  } catch { /* sem Web Audio: segue só com a animação */ }
}
