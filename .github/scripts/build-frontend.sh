#!/usr/bin/env bash
# Build the Overleaf frontend bundle with git integration.
# Usage: build-frontend.sh <repo-root>
# Output: <repo-root>/services/web/public-built/
set -euo pipefail

REPO="${1:-$GITHUB_WORKSPACE}"
BUILD="${BUILD_DIR:-/tmp/overleaf-build}"
SCRIPTS="$REPO/services/web/scripts"
OVERLEAF="$REPO/services/web"

echo "=== Setting up build directory: $BUILD ==="
mkdir -p "$BUILD"

echo "=== Extracting stock image files ==="
CID=$(docker create sharelatex/sharelatex:latest)
docker cp "$CID:/overleaf/services/web/frontend/" "$BUILD/frontend/"
docker cp "$CID:/overleaf/services/web/webpack.config.js" "$BUILD/"
docker cp "$CID:/overleaf/services/web/webpack.config.prod.js" "$BUILD/"
docker cp "$CID:/overleaf/services/web/webpack-plugins/" "$BUILD/webpack-plugins/"
docker cp "$CID:/overleaf/services/web/babel.config.json" "$BUILD/"
docker cp "$CID:/overleaf/services/web/tsconfig.json" "$BUILD/"
docker cp "$CID:/overleaf/services/web/types/" "$BUILD/types/"
docker cp "$CID:/overleaf/services/web/modules/" "$BUILD/modules/"
docker cp "$CID:/overleaf/services/web/package.json" "$BUILD/"
docker cp "$CID:/overleaf/services/web/locales/" "$BUILD/locales/"
docker cp "$CID:/overleaf/services/web/app/src/infrastructure/PackageVersions.js" "$BUILD/"
mkdir -p "$BUILD/public"
docker cp "$CID:/overleaf/services/web/public/img/." "$BUILD/public/img/"
docker cp "$CID:/overleaf/node_modules/overleaf-editor-core/" "$BUILD/node_modules_stock_overleaf-editor-core/"
docker cp "$CID:/overleaf/node_modules/@overleaf/o-error/" "$BUILD/node_modules_stock_o-error/"
docker cp "$CID:/overleaf/node_modules/@overleaf/ranges-tracker/" "$BUILD/node_modules_stock_ranges-tracker/"
docker rm "$CID" > /dev/null
echo "Stock image files extracted."

echo "=== Overlaying custom git integration files ==="
cp "$OVERLEAF/frontend/js/shared/utils/write-and-cite-settings-migration.ts" \
  "$BUILD/frontend/js/shared/utils/write-and-cite-settings-migration.ts"
cp -r "$OVERLEAF/frontend/js/features/git/" "$BUILD/frontend/js/features/git/"
cp "$OVERLEAF/frontend/js/features/settings/components/git-ssh-section.tsx" \
  "$BUILD/frontend/js/features/settings/components/git-ssh-section.tsx"
cp "$OVERLEAF/frontend/js/features/settings/components/git-integration-section.tsx" \
  "$BUILD/frontend/js/features/settings/components/git-integration-section.tsx"

echo "=== Running patch script ==="
node "$SCRIPTS/patch-git-frontend.mjs" "$BUILD"

echo "=== Preparing PackageVersions.js ==="
mkdir -p "$BUILD/app/src/infrastructure"
cp "$BUILD/PackageVersions.js" "$BUILD/app/src/infrastructure/PackageVersions.js"

cd "$BUILD"

echo "=== Filtering package.json ==="
node "$SCRIPTS/filter-package-json.mjs"
node -e "
  const fs = require('fs')
  const pkg = JSON.parse(fs.readFileSync('package.json'))
  if (!pkg.dependencies) pkg.dependencies = {}
  pkg.dependencies['check-types'] = '^5.1.0'
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2))
  console.log('Added check-types to dependencies')
"

echo "=== Running npm install ==="
npm install --legacy-peer-deps --ignore-scripts

echo "=== Restoring private frontend packages ==="
cp -r node_modules_stock_overleaf-editor-core/ node_modules/overleaf-editor-core/
mkdir -p node_modules/@overleaf
cp -r node_modules_stock_o-error/ node_modules/@overleaf/o-error/
cp -r node_modules_stock_ranges-tracker/ node_modules/@overleaf/ranges-tracker/

ln -sf ../wasm/qcms_bg.wasm node_modules/pdfjs-dist/build/qcms_bg.wasm 2>/dev/null || true
ln -sf ../wasm/openjpeg.wasm node_modules/pdfjs-dist/build/openjpeg.wasm 2>/dev/null || true

echo "=== Creating @overleaf/settings stub ==="
mkdir -p node_modules/@overleaf/settings
cat > node_modules/@overleaf/settings/package.json << 'EOF'
{"name":"@overleaf/settings","version":"1.0.0","main":"index.js"}
EOF

cat > node_modules/@overleaf/settings/index.js << STUB
const path = require('path')
const BASE = '${BUILD}'
module.exports = {
  overleafModuleImports: {
    createFileModes: [], devToolbar: [], gitBridge: [], publishModal: [],
    tprFileViewInfo: [], tprFileViewRefreshError: [], tprFileViewRefreshButton: [],
    tprFileViewNotOriginalImporter: [], contactUsModal: [], sourceEditorExtensions: [],
    sourceEditorComponents: [], pdfLogEntryHeaderActionComponents: [],
    pdfLogEntryComponents: [], pdfLogEntriesComponents: [], pdfPreviewPromotions: [],
    diagnosticActions: [], sourceEditorCompletionSources: [], sourceEditorSymbolPalette: [],
    sourceEditorToolbarComponents: [], sourceEditorToolbarEndButtons: [],
    rootContextProviders: [], mainEditorLayoutModals: [], mainEditorLayoutPanels: [],
    langFeedbackLinkingWidgets: [], labsExperiments: [], integrationLinkingWidgets: [],
    referenceLinkingWidgets: [], importProjectFromGithubModalWrapper: [],
    importProjectFromGithubMenu: [], editorLeftMenuSync: [], editorLeftMenuManageTemplate: [],
    menubarExtraComponents: [], oauth2Server: [],
    managedGroupSubscriptionEnrollmentNotification: [],
    managedGroupEnrollmentInvite: [], ssoCertificateInfo: [], v1ImportDataScreen: [],
    snapshotUtils: [], visualEditorProviders: [], usGovBanner: [],
    rollingBuildsUpdatedAlert: [], offlineModeToolbarButtons: [], settingsEntries: [],
    autoCompleteExtensions: [], sectionTitleGenerators: [],
    toastGenerators: [path.join(BASE, 'frontend/js/features/pdf-preview/components/synctex-toasts')],
    editorSidebarComponents: [path.join(BASE, 'modules/full-project-search/frontend/js/components/full-project-search.tsx')],
    fileTreeToolbarComponents: [path.join(BASE, 'modules/full-project-search/frontend/js/components/full-project-search-button.tsx')],
    fullProjectSearchPanel: [path.join(BASE, 'modules/full-project-search/frontend/js/components/full-project-search.tsx')],
    integrationPanelComponents: [], referenceSearchSetting: [], errorLogsComponents: [],
    referenceIndices: [], railEntries: [], railPopovers: [],
  },
}
STUB

echo "=== Running webpack build ==="
npm run webpack:production

echo "=== Copying built bundle to repo ==="
mkdir -p "$REPO/services/web/public-built"
cp -r "$BUILD/public/." "$REPO/services/web/public-built/"

echo "=== Build complete ==="
