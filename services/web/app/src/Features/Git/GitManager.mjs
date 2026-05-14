import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import Settings from '@overleaf/settings'
import * as GitSshManager from './GitSshManager.mjs'
import * as GitIntegrationManager from './GitIntegrationManager.mjs'

// Lazy imports to avoid circular dependency issues at module init time
async function getProjectEntityHandler() {
  const m = await import('../Project/ProjectEntityHandler.mjs')
  return m.default
}
async function getProjectGetter() {
  const m = await import('../Project/ProjectGetter.mjs')
  return m.default
}
async function getDocumentUpdaterHandler() {
  const m = await import('../DocumentUpdater/DocumentUpdaterHandler.mjs')
  return m.default
}
async function getHistoryManager() {
  const m = await import('../History/HistoryManager.mjs')
  return m.default
}
async function getProjectEntityUpdateHandler() {
  const m = await import('../Project/ProjectEntityUpdateHandler.mjs')
  return m.default
}
async function getEditorController() {
  const m = await import('../Editor/EditorController.mjs')
  return m.default
}

const execFileAsync = promisify(execFile)

const GIT_ENV_BASE = {
  GIT_AUTHOR_NAME: 'Overleaf',
  GIT_AUTHOR_EMAIL: 'overleaf@localhost',
  GIT_COMMITTER_NAME: 'Overleaf',
  GIT_COMMITTER_EMAIL: 'overleaf@localhost',
}

async function git(dir, args, extraEnv = {}) {
  const sshCommand = extraEnv.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
  const { stdout } = await execFileAsync('git', args, {
    cwd: dir,
    env: { ...process.env, ...GIT_ENV_BASE, GIT_SSH_COMMAND: sshCommand, ...extraEnv },
    timeout: 60000,
  })
  return stdout.trim()
}

// Like git() but returns { stdout, stderr } and surfaces stderr in thrown errors.
async function gitVerbose(dir, args, extraEnv = {}) {
  const sshCommand = extraEnv.GIT_SSH_COMMAND || 'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null'
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: dir,
      env: { ...process.env, ...GIT_ENV_BASE, GIT_SSH_COMMAND: sshCommand, ...extraEnv },
      timeout: 60000,
    })
    return { stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (err) {
    const msg = err.stderr?.trim() || err.stdout?.trim() || err.message || 'git error'
    throw new Error(msg)
  }
}

async function getOwnerUserId(projectId) {
  const ProjectGetter = await getProjectGetter()
  const project = await ProjectGetter.promises.getProject(projectId, { owner_ref: 1 })
  return project?.owner_ref?.toString() || null
}

async function getSshEnvForProject(projectId) {
  const userId = await getOwnerUserId(projectId)
  if (userId && await GitSshManager.hasKey(userId)) {
    return GitSshManager.getSshEnv(userId)
  }
  return {}
}

// For HTTPS remotes, embed token credentials into the URL so git never
// prompts interactively (there is no TTY in the Node.js child process).
function buildAuthUrl(remoteUrl, integration) {
  if (!remoteUrl || !remoteUrl.startsWith('http')) return remoteUrl
  if (!integration?.token) return remoteUrl
  try {
    const u = new URL(remoteUrl)
    u.username = encodeURIComponent(integration.username || 'oauth2')
    u.password = encodeURIComponent(integration.token)
    return u.toString()
  } catch {
    return remoteUrl
  }
}

async function getRemoteEnvAndUrl(projectId, remoteUrl) {
  const noPrompt = { GIT_TERMINAL_PROMPT: '0' }
  if (remoteUrl && remoteUrl.startsWith('http')) {
    const userId = await getOwnerUserId(projectId)
    const integration = userId
      ? await GitIntegrationManager.getIntegration(userId)
      : null
    return { env: noPrompt, url: buildAuthUrl(remoteUrl, integration) }
  }
  // SSH remote — use uploaded key if available
  const sshEnv = await getSshEnvForProject(projectId)
  return { env: { ...noPrompt, ...sshEnv }, url: remoteUrl }
}

async function findProjectDir(projectId) {
  const reposPath = Settings.gitReposPath
  if (!reposPath) throw new Error('GIT_REPOS_PATH not configured')

  let entries
  try {
    entries = await fs.readdir(reposPath)
  } catch {
    throw new Error(`GIT_REPOS_PATH directory not found: ${reposPath}`)
  }

  for (const entry of entries) {
    const dirPath = path.join(reposPath, entry)
    try {
      const stat = await fs.stat(dirPath)
      if (!stat.isDirectory()) continue
      const idContent = await fs.readFile(
        path.join(dirPath, '.overleaf-id'),
        'utf-8'
      )
      if (idContent.trim() === projectId) return dirPath
    } catch {
      // not this one
    }
  }
  return null
}

async function initRepo(projectId) {
  const reposPath = Settings.gitReposPath
  if (!reposPath) throw new Error('GIT_REPOS_PATH not configured')

  const dir = path.join(reposPath, projectId)
  await fs.mkdir(dir, { recursive: true })
  await git(dir, ['init'])
  await git(dir, ['checkout', '-b', 'main'])
  await fs.writeFile(path.join(dir, '.overleaf-id'), projectId)
  return dir
}

async function streamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const out = createWriteStream(filePath)
    stream.pipe(out)
    out.on('finish', resolve)
    out.on('error', reject)
    stream.on('error', reject)
  })
}

async function clearDirExceptGit(dir) {
  const entries = await fs.readdir(dir)
  for (const entry of entries) {
    if (entry === '.git' || entry === '.overleaf-id') continue
    await fs.rm(path.join(dir, entry), { recursive: true, force: true })
  }
}

async function walkDir(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.overleaf-id') continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)))
    } else {
      files.push(fullPath)
    }
  }
  return files
}

// Export all Overleaf project files into the git working directory.
async function syncProjectToDir(projectId, dir) {
  const ProjectEntityHandler = await getProjectEntityHandler()
  const HistoryManager = await getHistoryManager()

  await clearDirExceptGit(dir)

  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  for (const [filePath, doc] of Object.entries(docs)) {
    const rel = filePath.startsWith('/') ? filePath.slice(1) : filePath
    const fullPath = path.join(dir, rel)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, doc.lines.join('\n'))
  }

  const files = await ProjectEntityHandler.promises.getAllFiles(projectId)
  for (const [filePath, file] of Object.entries(files)) {
    const rel = filePath.startsWith('/') ? filePath.slice(1) : filePath
    const fullPath = path.join(dir, rel)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    const { stream } = await HistoryManager.promises.requestBlobWithProjectId(
      projectId,
      file.hash
    )
    await streamToFile(stream, fullPath)
  }
}

// Import files from the git working directory back into Overleaf.
// - Existing text docs: updated via DocumentUpdater so open editors refresh in place.
// - New text docs: created via EditorController which emits reciveNewDoc for live file-tree update.
// - Binary files: uploaded via EditorController which emits reciveNewFile (and removeEntity for replacements).
async function syncDirToProject(projectId, dir) {
  const ProjectEntityHandler = await getProjectEntityHandler()
  const ProjectGetter = await getProjectGetter()
  const DocumentUpdaterHandler = await getDocumentUpdaterHandler()
  const EditorController = await getEditorController()

  const docs = await ProjectEntityHandler.promises.getAllDocs(projectId)
  const project = await ProjectGetter.promises.getProject(projectId, {
    owner_ref: 1,
  })
  const userId = project.owner_ref?.toString()

  const docsByPath = {}
  for (const [filePath, doc] of Object.entries(docs)) {
    const norm = filePath.startsWith('/') ? filePath.slice(1) : filePath
    docsByPath[norm] = doc
  }

  const gitFiles = await walkDir(dir)
  for (const fullPath of gitFiles) {
    const rel = path.relative(dir, fullPath)

    let buf
    try {
      buf = await fs.readFile(fullPath)
    } catch {
      continue
    }

    // Null bytes in the first 8 KB reliably indicate binary content
    const isBinary = buf.slice(0, 8192).includes(0)

    if (!isBinary) {
      const lines = buf.toString('utf-8').split('\n')
      const doc = docsByPath[rel]
      if (doc) {
        // Existing doc — go through document updater so open editors update in place
        await DocumentUpdaterHandler.promises.setDocument(
          projectId,
          doc._id.toString(),
          userId,
          lines,
          'git-pull'
        )
      } else {
        // New text file — use EditorController so it emits reciveNewDoc + reciveNewFolder
        try {
          await EditorController.promises.upsertDocWithPath(
            projectId,
            `/${rel}`,
            lines,
            'git-pull',
            userId
          )
        } catch {
          // skip files with paths Overleaf considers invalid
        }
      }
    } else {
      // Binary file (image, PDF, etc.) — EditorController emits reciveNewFile / removeEntity
      try {
        await EditorController.promises.upsertFileWithPath(
          projectId,
          `/${rel}`,
          fullPath, // fsPath: file on disk in the git working tree
          null,     // linkedFileData: not a linked file
          'git-pull',
          userId
        )
      } catch {
        // skip files with paths Overleaf considers invalid
      }
    }
  }
}

export async function getStatus(projectId) {
  const dir = await findProjectDir(projectId)
  if (!dir) return { configured: false, reposPathSet: !!Settings.gitReposPath }

  let remoteUrl = null
  try {
    remoteUrl = await git(dir, ['remote', 'get-url', 'origin'])
  } catch {
    // no remote configured
  }

  const statusOut = await git(dir, ['status', '--porcelain'])
  const branch = await git(dir, ['branch', '--show-current'])

  return {
    configured: true,
    remoteUrl,
    hasChanges: statusOut.length > 0,
    branch,
    reposPathSet: true,
  }
}

export async function configureRemote(projectId, remoteUrl) {
  let dir = await findProjectDir(projectId)
  if (!dir) {
    dir = await initRepo(projectId)
  }

  try {
    await git(dir, ['remote', 'remove', 'origin'])
  } catch {
    // no existing remote — that's fine
  }

  if (remoteUrl) {
    await git(dir, ['remote', 'add', 'origin', remoteUrl])
  }
}

export async function commitOnly(projectId, message) {
  let dir = await findProjectDir(projectId)
  if (!dir) {
    dir = await initRepo(projectId)
  }

  await syncProjectToDir(projectId, dir)
  await git(dir, ['add', '-A'])

  const statusOut = await git(dir, ['status', '--porcelain'])
  if (!statusOut) return { committed: false, message: 'Nothing to commit' }

  // Parse staged files: "XY filename" — X is index status after add -A
  const files = statusOut
    .split('\n')
    .filter(Boolean)
    .map(line => ({
      status: line.slice(0, 2).trim(),
      file: line.slice(3),
    }))

  const msg = message || `Overleaf commit ${new Date().toISOString()}`
  const { stdout: commitOutput } = await gitVerbose(dir, ['commit', '-m', msg])

  return { committed: true, files, commitOutput, message: msg }
}

export async function pushToRemote(projectId) {
  const dir = await findProjectDir(projectId)
  if (!dir) throw new Error('Project not configured for git. Set a remote first.')

  let remoteUrl = null
  try {
    remoteUrl = await git(dir, ['remote', 'get-url', 'origin'])
  } catch {
    // ignore
  }
  if (!remoteUrl) throw new Error('No remote configured for this project')

  const { env, url } = await getRemoteEnvAndUrl(projectId, remoteUrl)
  // Push to explicit authenticated URL so credentials are never stored in git config
  const { stdout, stderr } = await gitVerbose(dir, ['push', url, 'HEAD'], env)
  const output = [stdout, stderr].filter(Boolean).join('\n')

  return { pushed: true, remoteUrl, output }
}

export async function commitAndPush(projectId, message) {
  const commitResult = await commitOnly(projectId, message)
  if (!commitResult.committed) return { committed: false, pushed: false, message: commitResult.message }

  let pushed = false
  let pushError = null
  let pushResult = null
  try {
    pushResult = await pushToRemote(projectId)
    pushed = true
  } catch (err) {
    pushError = err.message || String(err)
  }

  return { committed: true, pushed, pushError, commitResult, pushResult }
}

// Link an existing project to the user's current git service integration by
// creating a remote repo (named from the project name) and configuring it.
export async function migrateProjectToIntegration(projectId, userId) {
  const integration = await GitIntegrationManager.getIntegration(userId)
  if (!integration) throw new Error('No git service integration configured')

  const ProjectGetter = await getProjectGetter()
  const project = await ProjectGetter.promises.getProject(projectId, { name: 1 })
  if (!project) throw new Error('Project not found')

  const remoteInfo = await GitIntegrationManager.createRemoteRepo(
    integration,
    project.name
  )
  await configureRemote(projectId, remoteInfo.remoteUrl)
  return remoteInfo
}

export async function pullFromRemote(projectId) {
  // Auto-commit current project state before pulling so no work is lost on merge
  const autoCommitResult = await commitOnly(
    projectId,
    `Auto-commit before pull ${new Date().toISOString()}`
  )

  const dir = await findProjectDir(projectId)
  if (!dir) throw new Error('Project not configured for git. Set a remote first.')

  let remoteUrl = null
  try {
    remoteUrl = await git(dir, ['remote', 'get-url', 'origin'])
  } catch {
    // ignore
  }
  if (!remoteUrl) throw new Error('No remote configured for this project')

  const { env, url: authUrl } = await getRemoteEnvAndUrl(projectId, remoteUrl)
  const { stderr: fetchStderr } = await gitVerbose(dir, ['fetch', authUrl], env)

  // git fetch marks FETCH_HEAD as "not-for-merge" when there is no tracking
  // relationship, causing `git merge FETCH_HEAD` to silently do nothing.
  // Read the SHA directly from the file to bypass that filtering.
  const fetchHeadContent = await fs.readFile(
    path.join(dir, '.git', 'FETCH_HEAD'),
    'utf-8'
  )
  const fetchSha = fetchHeadContent.trim().split('\n')[0].split('\t')[0].trim()
  if (!fetchSha) throw new Error('Nothing fetched from remote')

  // Check whether the local branch has any commits yet
  let hasLocalCommits = false
  try { await git(dir, ['rev-parse', 'HEAD']); hasLocalCommits = true } catch {}

  let mergeOut
  if (!hasLocalCommits) {
    // Empty local repo — just reset to remote state (no merge commit needed)
    const r = await gitVerbose(dir, ['reset', '--hard', fetchSha])
    mergeOut = r.stdout
  } else {
    // --allow-unrelated-histories handles repos initialised independently
    const r = await gitVerbose(dir, [
      'merge', '--allow-unrelated-histories', '--no-edit', fetchSha,
    ])
    mergeOut = r.stdout
  }

  const upToDate = /already up.to.date/i.test(mergeOut)
  await syncDirToProject(projectId, dir)

  const output = [mergeOut, fetchStderr].filter(Boolean).join('\n')
  return { ok: true, upToDate, remoteUrl, output, autoCommit: autoCommitResult }
}
