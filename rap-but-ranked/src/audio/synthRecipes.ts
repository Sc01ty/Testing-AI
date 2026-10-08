/**
 * Procedural UI sounds (Web Audio). These are the Stage 1 stand-ins until
 * the Game Audio Vault is linked: each one is tiny, quiet and short so the
 * interface feels tactile rather than noisy. Swapping any of them for a
 * file is a one-line change in `sounds.ts`.
 */
export type SynthRecipe = (ctx: BaseAudioContext, out: AudioNode, t: number) => void

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx)
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    noiseCache.set(ctx, buf)
  }
  return buf
}

/** gain envelope: 0 -> peak (attack) -> silence (decay), exponential tail */
function envelope(ctx: BaseAudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  opts: { type?: OscillatorType; from: number; to?: number; glide?: number; peak: number; attack?: number; decay: number; lowpass?: number },
) {
  const osc = ctx.createOscillator()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.from, t)
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + (opts.glide ?? opts.decay))
  const env = envelope(ctx, t, opts.peak, opts.attack ?? 0.003, opts.decay)
  let node: AudioNode = osc
  if (opts.lowpass) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = opts.lowpass
    osc.connect(lp)
    node = lp
  }
  node.connect(env).connect(out)
  osc.start(t)
  osc.stop(t + (opts.attack ?? 0.003) + opts.decay + 0.05)
}

function noiseBurst(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  opts: { type: BiquadFilterType; from: number; to?: number; q?: number; peak: number; attack: number; decay: number },
) {
  const src = ctx.createBufferSource()
  src.buffer = noise(ctx)
  const f = ctx.createBiquadFilter()
  f.type = opts.type
  f.Q.value = opts.q ?? 0.8
  f.frequency.setValueAtTime(opts.from, t)
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + opts.attack + opts.decay)
  const env = envelope(ctx, t, opts.peak, opts.attack, opts.decay)
  src.connect(f).connect(env).connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + opts.attack + opts.decay + 0.05)
}

/** Barely-there tick for hovering menu items. */
export const hover: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 2300, to: 1700, glide: 0.03, peak: 0.03, attack: 0.002, decay: 0.045 })
  noiseBurst(ctx, out, t, { type: 'highpass', from: 5000, peak: 0.012, attack: 0.001, decay: 0.018 })
}

/** Keyboard selection move — a touch lower than hover. */
export const move: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 1800, to: 1400, glide: 0.03, peak: 0.032, attack: 0.002, decay: 0.05 })
}

/** Firm, warm two-step confirm with a small low thump. */
export const confirm: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 120, to: 52, glide: 0.09, peak: 0.22, attack: 0.003, decay: 0.12 })
  tone(ctx, out, t, { type: 'triangle', from: 587, peak: 0.07, decay: 0.16, lowpass: 2200 })
  tone(ctx, out, t + 0.055, { type: 'triangle', from: 880, peak: 0.06, decay: 0.24, lowpass: 2600 })
  noiseBurst(ctx, out, t, { type: 'bandpass', from: 3200, q: 1.5, peak: 0.02, attack: 0.001, decay: 0.03 })
}

/** Soft downward step. */
export const back: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { type: 'triangle', from: 700, to: 410, glide: 0.11, peak: 0.06, decay: 0.15, lowpass: 1800 })
  tone(ctx, out, t, { from: 90, to: 55, glide: 0.08, peak: 0.1, decay: 0.09 })
}

/** Restrained air sweep used for page changes. */
export const transition: SynthRecipe = (ctx, out, t) => {
  noiseBurst(ctx, out, t, { type: 'bandpass', from: 500, to: 2600, q: 1.1, peak: 0.065, attack: 0.12, decay: 0.22 })
}

export const toggle: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 1500, peak: 0.04, decay: 0.03 })
  tone(ctx, out, t + 0.035, { from: 2100, peak: 0.03, decay: 0.035 })
}

export const error: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { type: 'triangle', from: 220, to: 196, peak: 0.09, decay: 0.09, lowpass: 900 })
  tone(ctx, out, t + 0.1, { type: 'triangle', from: 196, to: 165, peak: 0.09, decay: 0.14, lowpass: 900 })
}

/** The "you're in" moment after the brand reveal: low bloom + soft shimmer. */
export const enter: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 82, to: 41, glide: 0.9, peak: 0.32, attack: 0.012, decay: 1.1 })
  noiseBurst(ctx, out, t, { type: 'bandpass', from: 300, to: 4200, q: 0.9, peak: 0.05, attack: 0.06, decay: 0.7 })
  ;[1046.5, 1568, 2093].forEach((f, i) =>
    tone(ctx, out, t + 0.04 + i * 0.05, { from: f, peak: 0.016, attack: 0.08, decay: 1.2 }),
  )
}

/** "RAP" lands: short, round low thump with a little grit on top. */
export const impact: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 140, to: 46, glide: 0.22, peak: 0.3, attack: 0.004, decay: 0.32 })
  noiseBurst(ctx, out, t, { type: 'lowpass', from: 1400, to: 300, peak: 0.05, attack: 0.002, decay: 0.12 })
  noiseBurst(ctx, out, t, { type: 'bandpass', from: 2600, q: 2, peak: 0.018, attack: 0.001, decay: 0.025 })
}

/** "BUT" slides in: quick airy sweep, upward. */
export const swish: SynthRecipe = (ctx, out, t) => {
  noiseBurst(ctx, out, t, { type: 'bandpass', from: 900, to: 5200, q: 1.4, peak: 0.04, attack: 0.08, decay: 0.12 })
}

/** "RANKED" slams: deeper and wider than `impact`, with a soft tail. */
export const impactBig: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 110, to: 36, glide: 0.45, peak: 0.34, attack: 0.005, decay: 0.7 })
  tone(ctx, out, t, { type: 'triangle', from: 220, to: 110, glide: 0.2, peak: 0.05, decay: 0.3, lowpass: 900 })
  noiseBurst(ctx, out, t, { type: 'lowpass', from: 2400, to: 200, peak: 0.07, attack: 0.002, decay: 0.45 })
  ;[784, 1175].forEach((f, i) => tone(ctx, out, t + 0.03 + i * 0.04, { from: f, peak: 0.01, attack: 0.05, decay: 0.9 }))
}

/** Beat saved: bright, rising two-step with a soft body. */
export const save: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { from: 110, to: 60, glide: 0.1, peak: 0.16, decay: 0.14 })
  tone(ctx, out, t, { type: 'triangle', from: 659, peak: 0.06, decay: 0.14, lowpass: 2600 })
  tone(ctx, out, t + 0.07, { type: 'triangle', from: 988, peak: 0.06, decay: 0.18, lowpass: 3000 })
  tone(ctx, out, t + 0.14, { type: 'triangle', from: 1319, peak: 0.045, decay: 0.32, lowpass: 3600 })
}

/** Beat deleted: soft downward thud, not alarming. */
export const remove: SynthRecipe = (ctx, out, t) => {
  tone(ctx, out, t, { type: 'triangle', from: 330, to: 140, glide: 0.18, peak: 0.07, decay: 0.2, lowpass: 1200 })
  noiseBurst(ctx, out, t, { type: 'lowpass', from: 1800, to: 300, peak: 0.03, attack: 0.005, decay: 0.2 })
}
