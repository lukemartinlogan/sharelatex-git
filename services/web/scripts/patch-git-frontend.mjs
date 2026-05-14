import { readFileSync, writeFileSync } from 'fs'

// Accept base path as argument (default for running inside stock image)
const BASE = process.argv[2] || '/overleaf/services/web'

// Stock image paths (ide-redesign, not ide-react)
const IDE = `${BASE}/frontend/js/features/ide-redesign`
const SETTINGS = `${BASE}/frontend/js/features/settings/components`

function patch(path, fn) {
  let content
  try {
    content = readFileSync(path, 'utf-8')
  } catch (e) {
    console.error(`Cannot read ${path}:`, e.message)
    process.exit(1)
  }
  const newContent = fn(content)
  if (newContent !== content) {
    writeFileSync(path, newContent)
    console.log(`Patched: ${path}`)
  } else {
    console.log(`No change (already patched or anchor not found): ${path}`)
  }
}

// toolbar.tsx: add GitButtons import and usage
patch(`${IDE}/components/toolbar/toolbar.tsx`, content => {
  if (content.includes('GitButtons')) return content
  content = content.replace(
    "import ShowHistoryButton from './show-history-button'",
    "import ShowHistoryButton from './show-history-button'\nimport GitButtons from '@/features/git/components/git-buttons'"
  )
  content = content.replace(
    '{!isRestrictedTokenMember && <ShowHistoryButton />}',
    '<GitButtons />\n        {!isRestrictedTokenMember && <ShowHistoryButton />}'
  )
  return content
})

// rail-context.tsx: add 'git' to RailTabKey union
patch(`${IDE}/contexts/rail-context.tsx`, content => {
  if (content.includes("'git'")) return content
  // Insert | 'git' at end of the type union
  content = content.replace(
    /( *\| 'workbench')/,
    "$1\n  | 'git'"
  )
  return content
})

// rail.tsx: add GitPanel import and tab entry
patch(`${IDE}/components/rail/rail.tsx`, content => {
  // Skip only if already fully and correctly patched
  if (content.includes('GitPanel') && content.includes("icon: 'call_split'")) return content
  // If previously patched with a different icon, fix just the icon line
  if (content.includes('GitPanel')) {
    return content.replace(/icon: '[^']+',(\s*title: 'Git')/, "icon: 'call_split',$1")
  }
  // Fresh stock file — full patch
  content = content.replace(
    "import RailPanel from './rail-panel'",
    "import RailPanel from './rail-panel'\nimport GitPanel from '@/features/git/components/git-panel'"
  )
  content = content.replace(
    '      ...moduleRailEntries,',
    "      {\n        key: 'git',\n        icon: 'call_split',\n        title: 'Git',\n        component: <GitPanel />,\n      },\n      ...moduleRailEntries,"
  )
  return content
})

// settings/root.tsx: add GitSshSection and GitIntegrationSection imports and usage
patch(`${SETTINGS}/root.tsx`, content => {
  if (content.includes('GitIntegrationSection')) return content
  if (!content.includes('GitSshSection')) {
    content = content.replace(
      "import SecuritySection from '@/features/settings/components/security-section'",
      "import SecuritySection from '@/features/settings/components/security-section'\nimport GitSshSection from '@/features/settings/components/git-ssh-section'"
    )
    content = content.replace(
      '<SecuritySection />',
      '<GitSshSection />\n          <SecuritySection />'
    )
  }
  content = content.replace(
    "import SecuritySection from '@/features/settings/components/security-section'",
    "import SecuritySection from '@/features/settings/components/security-section'\nimport GitIntegrationSection from '@/features/settings/components/git-integration-section'"
  )
  content = content.replace(
    '<GitSshSection />',
    '<GitIntegrationSection />\n          <GitSshSection />'
  )
  return content
})

// webpack.config.js: remove @overleaf/dictionaries (private package); relax mathjax version check.
// Dictionaries are restored from the stock image in the final Docker stage.
patch(`${BASE}/webpack.config.js`, content => {
  if (content.includes('// GIT-PATCH:')) return content

  // Remove dictionariesDir line (requires private @overleaf/dictionaries)
  content = content.replace(
    `const dictionariesDir = getModuleDirectory('@overleaf/dictionaries')\n`,
    `// GIT-PATCH: dictionariesDir removed (restored from stock image)\n`
  )

  // Remove DICTIONARIES_VERSION require + version check block
  content = content.replace(
    `const DICTIONARIES_VERSION =\n  require('@overleaf/dictionaries/package.json').version\nif (DICTIONARIES_VERSION !== PackageVersions.version.dictionaries) {\n  throw new Error(\n    '"@overleaf/dictionaries" version de-synced, update services/web/app/src/infrastructure/PackageVersions.js'\n  )\n}\n`,
    ``
  )

  // Remove dictionaries CopyPlugin entry
  content = content.replace(
    `        {\n          from: '*',\n          to: \`js/dictionaries/\${PackageVersions.version.dictionaries}\`,\n          toType: 'dir',\n          context: \`\${dictionariesDir}/dictionaries\`,\n        },\n`,
    ``
  )

  // Fix mathjax version check (version varies when npm installs it fresh)
  content = content.replace(
    `if (MATHJAX_VERSION !== PackageVersions.version.mathjax) {\n  throw new Error(\n    '"mathjax" version de-synced, update services/web/app/src/infrastructure/PackageVersions.js'\n  )\n}`,
    `PackageVersions.version.mathjax = MATHJAX_VERSION`
  )

  return content
})

console.log('Frontend patch complete.')
