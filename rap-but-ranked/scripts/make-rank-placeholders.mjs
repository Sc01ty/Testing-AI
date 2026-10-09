// Placeholder rank emblems → public/ranks/<tier>.svg
// One shared badge silhouette; each tier adds one thing so higher ranks read heavier at a glance.
// These are stand-ins: drop Illustrator exports with the same file names over them (see public/ranks/README.md).
// Run: node scripts/make-rank-placeholders.mjs
import { mkdirSync, writeFileSync } from 'node:fs'

const tiers = [
  ['open-mic', '#77748a', '#24222c', '#a9a6ba'],
  ['cypher', '#d29462', '#5e3418', '#f0bf96'],
  ['underground', '#48b0a6', '#173a40', '#8fe3d9'],
  ['breakout', '#d3dcef', '#3d64a3', '#7cc0ff'],
  ['mainstage', '#ffd870', '#a46f0c', '#fff2c2'],
  ['headliner', '#c8f6ff', '#2f97b8', '#f0feff'],
  ['icon', '#cf96ff', '#5b18c4', '#f6c7ff'],
  ['hall-of-fame', '#fff7dc', '#c99a33', '#ffffff'],
]

const SHIELD = 'M100 14 L168 40 V98 C168 142 138 172 100 188 C62 172 32 142 32 98 V40 Z'
const INNER = 'M100 28 L156 49 V99 C156 134 132 159 100 173 C68 159 44 134 44 99 V49 Z'
const MIC = `
  <rect x="87" y="56" width="26" height="46" rx="13" fill="#f6f2ff"/>
  <path d="M90 70h20M90 78h20M90 86h20" stroke="#1a1428" stroke-width="2.4" stroke-linecap="round" opacity=".55"/>
  <path d="M77 92c0 26 46 26 46 0" fill="none" stroke="#f6f2ff" stroke-width="5" stroke-linecap="round"/>
  <path d="M100 115v20M86 137h28" stroke="#f6f2ff" stroke-width="5" stroke-linecap="round"/>`

const wings = (size) => {
  const w = (s) => `<path transform="${s}" d="M34 70 C14 66 4 80 2 96 C14 88 22 90 30 92 C16 98 10 108 10 120 C20 110 28 108 34 108 Z" fill="url(#g)" stroke="url(#e)" stroke-width="2"/>`
  const k = size
  return `<g transform="translate(100 0) scale(${k} 1) translate(-100 0)">${w('')}${w('translate(200 0) scale(-1 1)')}</g>`
}

// drawn behind the badge
const behind = {
  headliner: () => wings(0.85),
  icon: () => wings(1) + `<path d="M76 20 L84 4 L93 15 L100 0 L107 15 L116 4 L124 20 Z" fill="url(#e)"/>`,
  'hall-of-fame': () => wings(1.05),
}

const extras = {
  'open-mic': () => `<path d="M100 18 L64 150 H136 Z" fill="#fff" opacity=".07"/>`,
  cypher: () =>
    Array.from({ length: 5 }, (_, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + Math.PI / 5
      return `<circle cx="${(100 + Math.cos(a) * 50).toFixed(1)}" cy="${(100 + Math.sin(a) * 50).toFixed(1)}" r="6" fill="url(#e)"/>`
    }).join(''),
  underground: () =>
    `<path d="M58 160 V96 C58 62 142 62 142 96 V160" fill="none" stroke="url(#e)" stroke-width="5" opacity=".9"/>
     <path d="M58 112h14M128 112h14M58 132h8M134 132h8M66 122h10M124 122h10M58 148h12M130 148h12" stroke="url(#e)" stroke-width="3" opacity=".55"/>`,
  breakout: () =>
    `<path d="M100 100 L52 70 M100 100 L150 64 M100 100 L58 146 M100 100 L146 150 M100 100 L100 40" stroke="url(#e)" stroke-width="3" opacity=".65"/>
     <path d="M18 60 l10 4 -6 8z M178 52 l8 8 -10 2z M14 132 l12 -2 -4 10z M184 140 l-10 -4 8 -6z" fill="url(#e)"/>`,
  mainstage: () =>
    `<path d="M40 30 L96 150 L78 150 Z M160 30 L104 150 L122 150 Z" fill="#fff" opacity=".12"/>
     <path d="M56 156 H144" stroke="url(#e)" stroke-width="5" stroke-linecap="round"/>`,
  headliner: () =>
    Array.from({ length: 14 }, (_, i) => {
      const a = (i / 14) * Math.PI * 2
      return `<circle cx="${(100 + Math.cos(a) * 60).toFixed(1)}" cy="${(98 + Math.sin(a) * 60).toFixed(1)}" r="3.4" fill="#fffbe8"/>`
    }).join(''),
  icon: () =>
    `<circle cx="100" cy="98" r="54" fill="#0b0712" opacity=".75"/>
     <circle cx="100" cy="98" r="46" fill="none" stroke="url(#e)" stroke-width="1.2" opacity=".6"/>
     <circle cx="100" cy="98" r="38" fill="none" stroke="url(#e)" stroke-width="1.2" opacity=".45"/>
`,
  'hall-of-fame': () =>
    Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      const x1 = 100 + Math.cos(a) * 74, y1 = 98 + Math.sin(a) * 74, x2 = 100 + Math.cos(a) * 92, y2 = 98 + Math.sin(a) * 92
      return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#fff3c4" stroke-width="3" stroke-linecap="round" opacity=".7"/>`
    }).join('') +
    Array.from({ length: 6 }, (_, i) => {
      const y = 150 - i * 15
      return `<ellipse cx="${58 + i * 2}" cy="${y}" rx="5" ry="10" transform="rotate(${-40 + i * 6} ${58 + i * 2} ${y})" fill="#e9c35c"/><ellipse cx="${142 - i * 2}" cy="${y}" rx="5" ry="10" transform="rotate(${40 - i * 6} ${142 - i * 2} ${y})" fill="#e9c35c"/>`
    }).join('') +
    `<path d="M100 4 l5 10 11 1 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -1z" fill="#fff"/>`,
}

mkdirSync('public/ranks', { recursive: true })
for (const [id, top, bottom, edge] of tiers) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
  <linearGradient id="e" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${edge}"/><stop offset="1" stop-color="${top}"/></linearGradient>
</defs>
${behind[id]?.() ?? ''}
<path d="${SHIELD}" fill="url(#g)" stroke="url(#e)" stroke-width="4" stroke-linejoin="round"/>
<path d="${INNER}" fill="#0c0915" opacity=".62"/>
${extras[id]()}
${MIC}
</svg>
`
  writeFileSync(`public/ranks/${id}.svg`, svg)
}
console.log('wrote', tiers.length, 'emblems')
