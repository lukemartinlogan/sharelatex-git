import { useCallback, useEffect, useState } from 'react'
import { useProjectContext } from '@/shared/context/project-context'
import OLButton from '@/shared/components/ol/ol-button'
import { getJSON, postJSON } from '@/infrastructure/fetch-json'

type GitStatus = {
  configured: boolean
  remoteUrl?: string | null
  hasChanges?: boolean
  branch?: string
  reposPathSet?: boolean
}

type Integration = {
  configured: boolean
  service?: string
  username?: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type MigrateState = 'idle' | 'migrating' | 'done' | 'error'

const SERVICE_LABELS: Record<string, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  bitbucket: 'Bitbucket',
}

export default function GitPanel() {
  const { projectId } = useProjectContext()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [integration, setIntegration] = useState<Integration | null>(null)
  const [remoteInput, setRemoteInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [migrateState, setMigrateState] = useState<MigrateState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [migrateError, setMigrateError] = useState('')
  const [migratedRemote, setMigratedRemote] = useState('')

  const fetchStatus = useCallback(() => {
    getJSON<GitStatus>(`/project/${projectId}/git/status`)
      .then(s => {
        setStatus(s)
        setRemoteInput(s.remoteUrl || '')
      })
      .catch(() => setStatus(null))
  }, [projectId])

  useEffect(() => {
    fetchStatus()
    getJSON<Integration>('/user/git/integration')
      .then(i => setIntegration(i))
      .catch(() => setIntegration(null))
  }, [fetchStatus])

  const handleSave = useCallback(async () => {
    setSaveState('saving')
    setErrorMsg('')
    try {
      await postJSON(`/project/${projectId}/git/configure`, {
        body: { remoteUrl: remoteInput },
      })
      setSaveState('saved')
      fetchStatus()
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err: any) {
      setSaveState('error')
      setErrorMsg(err?.data?.error || err?.message || 'Failed to save')
    }
  }, [projectId, remoteInput, fetchStatus])

  const handleMigrate = useCallback(async () => {
    setMigrateState('migrating')
    setMigrateError('')
    try {
      const result = await postJSON<{ repoName: string; remoteUrl: string }>(
        `/project/${projectId}/git/migrate`,
        { body: {} }
      )
      setMigrateState('done')
      setMigratedRemote(result.remoteUrl)
      fetchStatus()
    } catch (err: any) {
      setMigrateState('error')
      setMigrateError(err?.data?.error || err?.message || 'Migration failed')
    }
  }, [projectId, fetchStatus])

  const serviceLabel = integration?.service
    ? (SERVICE_LABELS[integration.service] ?? integration.service)
    : null

  const alreadyLinked = status !== null && !!status.remoteUrl
  const showMigrate = status !== null && !alreadyLinked && migrateState !== 'done'

  return (
    <div className="git-panel" style={{ padding: '12px 16px' }}>
      <h4 style={{ marginBottom: 12 }}>Git</h4>

      {status?.branch && (
        <p style={{ fontSize: 13, marginBottom: 8 }}>
          Branch: <code>{status.branch}</code>
        </p>
      )}
      {status && !status.reposPathSet && (
        <p style={{ fontSize: 13, color: '#c0392b', marginBottom: 8 }}>
          GIT_REPOS_PATH is not configured on the server.
        </p>
      )}

      {showMigrate && (
        <div
          style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: '#f0f4ff',
            borderRadius: 6,
            border: '1px solid #c5d3f5',
          }}
        >
          {integration?.configured ? (
            <p style={{ fontSize: 13, marginBottom: 8 }}>
              You have a <strong>{serviceLabel}</strong> integration configured.
              Link this project to create a remote repo automatically.
            </p>
          ) : (
            <p style={{ fontSize: 13, marginBottom: 8 }}>
              Configure a git service integration in{' '}
              <a href="/user/settings" target="_blank" rel="noreferrer">Account Settings</a>{' '}
              to auto-create a remote repo, or set a remote URL manually below.
            </p>
          )}
          {migrateState === 'error' && (
            <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 6 }}>
              {migrateError}
            </p>
          )}
          {integration?.configured && (
            <OLButton
              variant="primary"
              size="sm"
              onClick={handleMigrate}
              disabled={migrateState === 'migrating'}
            >
              {migrateState === 'migrating' ? 'Creating repo…' : `Link to ${serviceLabel}`}
            </OLButton>
          )}
        </div>
      )}

      {migrateState === 'done' && (
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            background: '#eafbea',
            borderRadius: 6,
            border: '1px solid #a3d9a5',
            fontSize: 13,
          }}
        >
          Linked to <code>{migratedRemote}</code>
        </div>
      )}

      <label
        htmlFor="git-panel-remote"
        style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}
      >
        Remote URL
      </label>
      <input
        id="git-panel-remote"
        type="text"
        className="form-control"
        value={remoteInput}
        onChange={e => setRemoteInput(e.target.value)}
        placeholder="git@github.com:user/repo.git"
        style={{ marginBottom: 8 }}
      />
      {saveState === 'error' && (
        <p style={{ fontSize: 12, color: '#c0392b', marginBottom: 6 }}>{errorMsg}</p>
      )}
      <OLButton
        variant="primary"
        size="sm"
        onClick={handleSave}
        disabled={saveState === 'saving'}
      >
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved!' : 'Save'}
      </OLButton>
    </div>
  )
}
