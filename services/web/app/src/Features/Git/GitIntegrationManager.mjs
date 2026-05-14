import fs from 'node:fs/promises'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import Settings from '@overleaf/settings'

export const SERVICE_DEFAULTS = {
  github:    { name: 'GitHub',    apiUrl: 'https://api.github.com' },
  gitlab:    { name: 'GitLab',    apiUrl: 'https://gitlab.com' },
  gitea:     { name: 'Gitea',     apiUrl: '' },
  bitbucket: { name: 'Bitbucket', apiUrl: 'https://api.bitbucket.org' },
}

function integrationsDir() {
  const reposPath = Settings.gitReposPath
  if (!reposPath) throw new Error('GIT_REPOS_PATH not configured')
  return path.join(reposPath, '.integrations')
}

function integrationPath(userId) {
  return path.join(integrationsDir(), `${userId}.json`)
}

export async function getIntegration(userId) {
  try {
    const content = await fs.readFile(integrationPath(userId), 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function saveIntegration(userId, { service, username, token, apiUrl, org }) {
  const dir = integrationsDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700)
  const p = integrationPath(userId)
  const data = { service, apiUrl }
  if (service !== 'custom') {
    data.username = username
    data.token = token
  }
  if (org) data.org = org
  await fs.writeFile(p, JSON.stringify(data), { mode: 0o600 })
  await fs.chmod(p, 0o600)
}

export async function deleteIntegration(userId) {
  try { await fs.rm(integrationPath(userId)) } catch {}
}

export function toSnakeCase(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .trim()
      .replace(/[\s-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'project'
  )
}

function apiRequest(url, { method = 'GET', headers = {} } = {}, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const data = body ? JSON.stringify(body) : undefined
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Overleaf-Git-Integration/1.0',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      res => {
        let raw = ''
        res.on('data', c => { raw += c })
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(raw) })
          } catch { resolve({ status: res.statusCode, body: raw }) }
        })
      }
    )
    req.on('error', reject)
    if (data) req.write(data)
    req.end()
  })
}

function throwRepoError(service, status, body) {
  // Auth failures
  if (status === 401) {
    throw new Error(`Authentication failed — check your ${service} access token`)
  }
  if (status === 403) {
    throw new Error(`Access denied — your ${service} token may lack required permissions`)
  }
  if (status === 404) {
    if (service === 'github') {
      throw new Error(
        "GitHub returned 404 — ensure your personal access token has the 'repo' scope (classic token) or 'Contents: Read and Write' (fine-grained token)"
      )
    }
    throw new Error(
      `API endpoint not found (HTTP 404) — check that the API URL is correct for service '${service}'`
    )
  }
  // Repo already exists
  if (service === 'github' && status === 422) {
    const errors = body?.errors
    if (errors?.some(e => e.message?.toLowerCase().includes('already exists'))) {
      throw new Error('Repository already exists on GitHub')
    }
    throw new Error(body?.message || `HTTP ${status}`)
  }
  if (service === 'gitlab' && status === 400) {
    const msg = body?.message
    const fields = [...(msg?.name || []), ...(msg?.path || [])]
    if (fields.some(e => e.includes('already been taken'))) {
      throw new Error('Repository already exists on GitLab')
    }
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg) || `HTTP ${status}`)
  }
  if (status === 409) {
    throw new Error('Repository already exists')
  }
  const msg = body?.message || body?.error?.message
  throw new Error(msg || `HTTP ${status}`)
}

// Creates a remote repo on the configured service.
// Returns { repoName, remoteUrl }
export async function createRemoteRepo(integration, projectName) {
  const repoName = toSnakeCase(projectName)
  const { service, username, token, apiUrl, org } = integration

  if (service === 'github') {
    const base = (apiUrl || 'https://api.github.com').replace(/\/$/, '')
    const endpoint = org ? `${base}/orgs/${org}/repos` : `${base}/user/repos`
    const res = await apiRequest(
      endpoint,
      { method: 'POST', headers: { Authorization: `token ${token}` } },
      { name: repoName, private: true, auto_init: false }
    )
    if (res.status !== 201) throwRepoError(service, res.status, res.body)
    const owner = org || username
    return { repoName, remoteUrl: `git@github.com:${owner}/${repoName}.git` }
  }

  if (service === 'gitlab') {
    const base = (apiUrl || 'https://gitlab.com').replace(/\/$/, '')
    const body = { name: repoName, visibility: 'private' }
    if (org) body.namespace_path = org
    const res = await apiRequest(
      `${base}/api/v4/projects`,
      { method: 'POST', headers: { 'PRIVATE-TOKEN': token } },
      body
    )
    if (res.status !== 201) throwRepoError(service, res.status, res.body)
    const host = new URL(base).hostname
    const owner = org || username
    return { repoName, remoteUrl: `git@${host}:${owner}/${repoName}.git` }
  }

  if (service === 'gitea') {
    if (!apiUrl) throw new Error('Gitea requires an API URL')
    const base = apiUrl.replace(/\/$/, '')
    const endpoint = org
      ? `${base}/api/v1/orgs/${org}/repos`
      : `${base}/api/v1/user/repos`
    const res = await apiRequest(
      endpoint,
      { method: 'POST', headers: { Authorization: `token ${token}` } },
      { name: repoName, private: true, auto_init: false }
    )
    if (res.status !== 201) throwRepoError(service, res.status, res.body)
    const host = new URL(base).hostname
    const owner = org || username
    return { repoName, remoteUrl: `git@${host}:${owner}/${repoName}.git` }
  }

  // Custom: user supplies the full API endpoint URL; we POST to it directly.
  // Auth should be embedded in the URL or handled server-side.
  if (service === 'custom') {
    if (!apiUrl) throw new Error('Custom service requires an API URL')
    const res = await apiRequest(
      apiUrl,
      { method: 'POST' },
      { name: repoName, private: true, auto_init: false }
    )
    if (res.status !== 201) throwRepoError(service, res.status, res.body)
    const cloneBase = res.body?.ssh_url || res.body?.clone_url || res.body?.html_url
    return { repoName, remoteUrl: cloneBase || apiUrl }
  }

  if (service === 'bitbucket') {
    const base = (apiUrl || 'https://api.bitbucket.org').replace(/\/$/, '')
    const owner = org || username
    const creds = Buffer.from(`${username}:${token}`).toString('base64')
    const res = await apiRequest(
      `${base}/2.0/repositories/${owner}/${repoName}`,
      { method: 'POST', headers: { Authorization: `Basic ${creds}` } },
      { scm: 'git', is_private: true }
    )
    if (res.status !== 200 && res.status !== 201) throwRepoError(service, res.status, res.body)
    return { repoName, remoteUrl: `git@bitbucket.org:${owner}/${repoName}.git` }
  }

  throw new Error(`Unsupported service: ${service}`)
}
