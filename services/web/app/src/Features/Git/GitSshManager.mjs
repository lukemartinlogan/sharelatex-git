import fs from 'node:fs/promises'
import path from 'node:path'
import Settings from '@overleaf/settings'

function sshDir() {
  const reposPath = Settings.gitReposPath
  if (!reposPath) throw new Error('GIT_REPOS_PATH not configured')
  return path.join(reposPath, '.ssh')
}

function keyPath(userId) {
  return path.join(sshDir(), userId, 'id_rsa')
}

export async function saveKey(userId, keyContent) {
  // Ensure the base .ssh dir exists and is private
  const base = sshDir()
  await fs.mkdir(base, { recursive: true, mode: 0o700 })
  await fs.chmod(base, 0o700)

  const dir = path.join(base, userId)
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  await fs.chmod(dir, 0o700)

  const kp = keyPath(userId)
  // PEM keys must end with a newline; normalize to be safe
  const normalized = keyContent.trimEnd() + '\n'
  await fs.writeFile(kp, normalized, { mode: 0o600 })
  // Explicitly chmod in case umask narrowed the mode
  await fs.chmod(kp, 0o600)
}

export async function deleteKey(userId) {
  try {
    await fs.rm(path.join(sshDir(), userId), { recursive: true, force: true })
  } catch {
    // nothing to delete
  }
}

export async function hasKey(userId) {
  try {
    await fs.access(keyPath(userId))
    return true
  } catch {
    return false
  }
}

export function getSshEnv(userId) {
  const kp = keyPath(userId)
  return {
    // UserKnownHostsFile=/dev/null: never write known_hosts (www-data has no home dir writable)
    // IdentitiesOnly=yes: use only our explicit key, ignore ssh-agent
    GIT_SSH_COMMAND: `ssh -i ${kp} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes`,
  }
}
