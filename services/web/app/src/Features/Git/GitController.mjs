import * as GitManager from './GitManager.mjs'
import * as GitSshManager from './GitSshManager.mjs'
import * as GitIntegrationManager from './GitIntegrationManager.mjs'
import SessionManager from '../Authentication/SessionManager.mjs'
import logger from '@overleaf/logger'

// ── Project git operations ───────────────────────────────────────────────────

export async function getStatus(req, res) {
  const projectId = req.params.Project_id
  try {
    const status = await GitManager.getStatus(projectId)
    res.json(status)
  } catch (err) {
    logger.error({ err, projectId }, 'git status error')
    res.status(500).json({ error: err.message })
  }
}

export async function configureRemote(req, res) {
  const projectId = req.params.Project_id
  const { remoteUrl } = req.body
  try {
    await GitManager.configureRemote(projectId, remoteUrl)
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, projectId }, 'git configure error')
    res.status(500).json({ error: err.message })
  }
}

export async function commitOnly(req, res) {
  const projectId = req.params.Project_id
  const { message } = req.body
  try {
    const result = await GitManager.commitOnly(projectId, message)
    res.json(result)
  } catch (err) {
    logger.error({ err, projectId }, 'git commit error')
    res.status(500).json({ error: err.message })
  }
}

export async function pushOnly(req, res) {
  const projectId = req.params.Project_id
  try {
    const result = await GitManager.pushToRemote(projectId)
    res.json(result)
  } catch (err) {
    logger.error({ err, projectId }, 'git push error')
    res.status(500).json({ error: err.message })
  }
}

export async function commitAndPush(req, res) {
  const projectId = req.params.Project_id
  const { message } = req.body
  try {
    const result = await GitManager.commitAndPush(projectId, message)
    res.json(result)
  } catch (err) {
    logger.error({ err, projectId }, 'git commit error')
    res.status(500).json({ error: err.message })
  }
}

export async function pullFromRemote(req, res) {
  const projectId = req.params.Project_id
  try {
    const result = await GitManager.pullFromRemote(projectId)
    res.json(result)
  } catch (err) {
    logger.error({ err, projectId }, 'git pull error')
    res.status(500).json({ error: err.message })
  }
}

// Migrate an existing project to the user's current git integration.
export async function migrateProject(req, res) {
  const projectId = req.params.Project_id
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  try {
    const result = await GitManager.migrateProjectToIntegration(
      projectId,
      userId.toString()
    )
    res.json(result)
  } catch (err) {
    logger.error({ err, projectId }, 'git migrate error')
    res.status(422).json({ error: err.message })
  }
}

// ── SSH key management ───────────────────────────────────────────────────────

export async function getSshKeyStatus(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  try {
    const exists = await GitSshManager.hasKey(userId)
    res.json({ hasKey: exists })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function uploadSshKey(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  const { key } = req.body
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Missing key' })
  }
  try {
    await GitSshManager.saveKey(userId, key)
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, userId }, 'git ssh key upload error')
    res.status(500).json({ error: err.message })
  }
}

export async function deleteSshKey(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  try {
    await GitSshManager.deleteKey(userId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Git service integration settings ────────────────────────────────────────

export async function getIntegration(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  try {
    const integration = await GitIntegrationManager.getIntegration(userId.toString())
    if (!integration) return res.json({ configured: false })
    const { service, username, apiUrl } = integration
    res.json({ configured: true, service, username, apiUrl, hasToken: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

export async function saveIntegration(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  const { service, username, token, apiUrl } = req.body
  if (!service || !username || !token) {
    return res.status(400).json({ error: 'service, username, and token are required' })
  }
  const knownServices = { ...GitIntegrationManager.SERVICE_DEFAULTS, custom: true }
  if (!knownServices[service]) {
    return res.status(400).json({ error: `Unknown service: ${service}` })
  }
  try {
    await GitIntegrationManager.saveIntegration(userId.toString(), {
      service,
      username,
      token,
      apiUrl: apiUrl || GitIntegrationManager.SERVICE_DEFAULTS[service].apiUrl,
    })
    res.json({ ok: true })
  } catch (err) {
    logger.error({ err, userId }, 'git integration save error')
    res.status(500).json({ error: err.message })
  }
}

export async function deleteIntegration(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return res.status(401).json({ error: 'Not logged in' })
  try {
    await GitIntegrationManager.deleteIntegration(userId.toString())
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Project creation pre-hook (injected into /project/new by Dockerfile) ────

export async function preCreateProject(req, res, next) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  if (!userId) return next()

  let integration
  try {
    integration = await GitIntegrationManager.getIntegration(userId.toString())
  } catch {
    return next()
  }
  if (!integration) return next()

  const projectName = req.body?.projectName?.trim() || 'project'

  let remoteInfo
  try {
    remoteInfo = await GitIntegrationManager.createRemoteRepo(integration, projectName)
  } catch (err) {
    return res
      .status(422)
      .json({ message: `Could not create remote repository: ${err.message}` })
  }

  // Intercept res.json to configure the local git remote after the project is
  // created but before the response is sent to the client.
  const originalJson = res.json.bind(res)
  res.json = function (data) {
    const projectId = data?.project_id?.toString?.()
    if (projectId) {
      GitManager.configureRemote(projectId, remoteInfo.remoteUrl).catch(err => {
        logger.error(
          { err, projectId },
          'git: failed to configure remote after project creation'
        )
      })
    }
    return originalJson(data)
  }

  next()
}
