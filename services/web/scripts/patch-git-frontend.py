"""
Patches stock Overleaf frontend source files to add git integration UI.
Run inside the Docker image before webpack build.
"""
import re
import sys

BASE = '/overleaf/services/web/frontend/js/features'

def patch(path, fn):
    with open(path) as f:
        content = f.read()
    new_content = fn(content)
    if new_content != content:
        with open(path, 'w') as f:
            f.write(new_content)
        print(f'Patched: {path}')
    else:
        print(f'No change (already patched or anchor not found): {path}')


def patch_toolbar(content):
    if 'GitButtons' in content:
        return content
    content = content.replace(
        "import ShowHistoryButton from './show-history-button'",
        "import ShowHistoryButton from './show-history-button'\nimport GitButtons from '@/features/git/components/git-buttons'"
    )
    # Handle both possible surrounding whitespace/JSX patterns
    content = content.replace(
        "{!isRestrictedTokenMember && <ShowHistoryButton />}",
        "<GitButtons />\n        {!isRestrictedTokenMember && <ShowHistoryButton />}"
    )
    return content


def patch_rail_context(content):
    if "'git'" in content and 'RailTabKey' in content:
        return content
    # Append | 'git' to the end of the RailTabKey union type
    content = re.sub(
        r"(export type RailTabKey\s*=(?:\s*\|[^\n]+)+)",
        lambda m: m.group(0) + "\n  | 'git'",
        content
    )
    return content


def patch_rail(content):
    if 'GitPanel' in content:
        return content
    content = content.replace(
        "import RailPanel from './rail-panel'",
        "import RailPanel from './rail-panel'\nimport GitPanel from '@/features/git/components/git-panel'"
    )
    content = content.replace(
        "      ...moduleRailEntries,",
        "      {\n        key: 'git',\n        icon: 'hub',\n        title: 'Git',\n        component: <GitPanel />,\n      },\n      ...moduleRailEntries,"
    )
    return content


def patch_settings_root(content):
    if 'GitSshSection' in content:
        return content
    content = content.replace(
        "import SecuritySection from '@/features/settings/components/security-section'",
        "import SecuritySection from '@/features/settings/components/security-section'\nimport GitSshSection from '@/features/settings/components/git-ssh-section'"
    )
    content = content.replace(
        "<SecuritySection />",
        "<GitSshSection />\n          <SecuritySection />"
    )
    return content


patch(f'{BASE}/ide-react/components/toolbar/toolbar.tsx', patch_toolbar)
patch(f'{BASE}/ide-react/context/rail-context.tsx', patch_rail_context)
patch(f'{BASE}/ide-react/components/rail/rail.tsx', patch_rail)
patch(f'{BASE}/settings/components/root.tsx', patch_settings_root)

print('Frontend patch complete.')
