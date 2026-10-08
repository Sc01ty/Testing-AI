import { readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
// Use the app's existing detector rather than inventing tempos for the supplied files.
import { readFileSync } from 'node:fs'
const tempo = stripTypeScriptTypes(readFileSync('src/audio/analysis/tempo.ts', 'utf8'))
mkdirSync('scripts/generated', { recursive: true })
writeFileSync('scripts/generated/tempo.mjs', tempo)
const { detectTempo } = await import(pathToFileURL(resolve('scripts/generated/tempo.mjs')))
mkdirSync('public/beats', { recursive: true })
const catalogue = []
for (const file of readdirSync('D:/Video Projects/BEATS').filter(
  (f) => /\.mp3$/i.test(f) && !/bank\s*fees/i.test(f),
)) {
  const slug = file
    .replace(/\.mp3$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  const data = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      `D:/Video Projects/BEATS/${file}`,
      '-f',
      'f32le',
      '-ar',
      '22050',
      '-ac',
      '1',
      'pipe:1',
    ],
    { maxBuffer: 80 * 1024 * 1024 },
  )
  const samples = new Float32Array(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  )
  const result = detectTempo(samples, 22050),
    peaks = []
  for (let i = 0; i < 800; i++) {
    let peak = 0
    for (
      let j = Math.floor((i * samples.length) / 800);
      j < Math.floor(((i + 1) * samples.length) / 800);
      j++
    )
      peak = Math.max(peak, Math.abs(samples[j]))
    peaks.push(Math.round(peak * 1000) / 1000)
  }
  copyFileSync(`D:/Video Projects/BEATS/${file}`, `public/beats/${slug}.mp3`)
  catalogue.push({
    id: `included:${slug}`,
    name: file.replace(/\.mp3$/i, ''),
    fileName: file,
    mimeType: 'audio/mpeg',
    sizeBytes: readFileSync(`public/beats/${slug}.mp3`).length,
    durationSec: samples.length / 22050,
    bpm: result.bpm,
    bpmSource: 'auto',
    bpmConfidence: result.confidence,
    introOffset: result.downbeat,
    introOffsetSource: 'auto',
    beatsPerBar: 4,
    peaks,
    createdAt: 1,
    updatedAt: 1,
    url: `beats/${slug}.mp3`,
  })
  console.log(file, result.bpm, 'BPM', Math.round(samples.length / 22050), 'seconds')
}
writeFileSync('public/beats/catalogue.json', JSON.stringify(catalogue))
