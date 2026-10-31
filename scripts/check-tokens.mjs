// Fails if any source file uses a colour, size or radius that is not a design token.
// Off-token Tailwind classes (p-5, bg-blue-500, shadow-md) already produce no CSS because
// tokens.css clears the defaults; this catches the escape hatches that bypass that.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const tokensFile = join(root, 'src/styles/tokens.css')

const rules = [
  [/#[0-9a-fA-F]{3,8}\b/, 'raw hex colour'],
  [/\b(rgba?|hsla?|oklch)\(/, 'raw colour function'],
  [/[\w:-]+-\[[^\]]+\]/, 'arbitrary Tailwind value'],
  [/style=\{\{/, 'inline style'],
]

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path)
    return /\.(tsx?|css)$/.test(entry.name) && path !== tokensFile ? [path] : []
  })
}

let failures = 0
for (const file of files(join(root, 'src'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [pattern, reason] of rules) {
        const match = line.match(pattern)
        if (match) {
          failures++
          console.error(`${relative(root, file)}:${i + 1}  ${reason}: ${match[0]}`)
        }
      }
    })
}

if (failures) {
  console.error(`\n${failures} off-token value(s). Use a token from src/styles/tokens.css.`)
  process.exit(1)
}
console.log('Tokens check passed.')
