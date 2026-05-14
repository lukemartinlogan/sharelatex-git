import { readFileSync, writeFileSync } from 'fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
// Remove only workspace references (version "*") — these are monorepo-internal
// packages not published to npm or any public git URL.
// Git-URL dependencies (@overleaf/codemirror-* etc.) are kept; npm installs them.
const isPrivate = (key, ver) => ver === '*'
for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
  if (pkg[section]) {
    for (const [key, ver] of Object.entries(pkg[section])) {
      if (isPrivate(key, ver)) delete pkg[section][key]
    }
  }
}
writeFileSync('package.json', JSON.stringify(pkg, null, 2))
console.log('Filtered private/workspace dependencies from package.json')
