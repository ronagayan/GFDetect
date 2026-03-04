/**
 * Generate PWA icon PNGs from the source SVG.
 * Run once: node scripts/generate-icons.js
 * Then commit the generated files to git.
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svg = readFileSync(resolve(root, 'public/icon.svg'))

const icons = [
  { size: 192,  file: 'icon-192.png'        },
  { size: 512,  file: 'icon-512.png'        },
  { size: 180,  file: 'apple-touch-icon.png'},
]

await Promise.all(
  icons.map(({ size, file }) =>
    sharp(svg, { density: 300 })
      .resize(size, size)
      .png({ quality: 100 })
      .toFile(resolve(root, 'public', file))
      .then(() => console.log(`✓ public/${file}`))
  )
)

console.log('\nAll PWA icons generated.')
