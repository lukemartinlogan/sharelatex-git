import { useCallback, useEffect, useState } from 'react'
import { getJSON, postJSON, deleteJSON } from '@/infrastructure/fetch-json'

const SERVICES = [
  { value: 'github',    label: 'GitHub',    defaultApiUrl: 'https://api.github.com',      locked: true  },
  { value: 'gitlab',   label: 'GitLab',    defaultApiUrl: 'https://gitlab.com',           locked: true  },
  { value: 'bitbucket', label: 'Bitbucket', defaultApiUrl: 'https://api.bitbucket.org',  locked: true  },
  { value: 'gitea',    label: 'Gitea',     defaultApiUrl: 'https://api.github.com',       locked: false },
  { value: 'custom',   label: 'Custom',    defaultApiUrl: '',                             locked: false },
]

type IntegrationStatus = {
  configured: boolean
  service?: string
  username?: string
  apiUrl?: string
  hasToken?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'deleting' | 'deleted'

export default function GitIntegrationSection() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [service, setService] = useState('github')
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [apiUrl, setApiUrl] = useState('https://api.github.com')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const fetchStatus = useCallback(() => {
    getJSON<IntegrationStatus>('/user/git/integration')
      .then(s => {
        setStatus(s)
        if (s.configured) {
          setService(s.service || 'github')
          setUsername(s.username || '')
          setApiUrl(s.apiUrl || '')
        }
      })
      .catch(() => setStatus({ configured: false }))
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleServiceChange = useCallback((svc: string) => {
    setService(svc)
    const def = SERVICES.find(s => s.value === svc)
    if (def) setApiUrl(def.defaultApiUrl)
  }, [])

  const handleSave = useCallback(async () => {
    if (!token && !status?.configured) {
      setErrorMsg('Access token is required')
      return
    }
    setSaveState('saving')
    setErrorMsg('')
    try {
      await postJSON('/user/git/integration', {
        body: { service, username, token, apiUrl },
      })
      setSaveState('saved')
      setToken('')
      fetchStatus()
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (err: any) {
      setSaveState('error')
      setErrorMsg(err?.data?.error || err?.message || 'Failed to save')
    }
  }, [service, username, token, apiUrl, status, fetchStatus])

  const handleDelete = useCallback(async () => {
    setSaveState('deleting')
    try {
      await deleteJSON('/user/git/integration')
      setSaveState('deleted')
      setUsername('')
      setToken('')
      fetchStatus()
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err: any) {
      setSaveState('error')
      setErrorMsg(err?.data?.error || err?.message || 'Failed to delete')
    }
  }, [fetchStatus])

  const busy = saveState === 'saving' || saveState === 'deleting'
  const currentService = SERVICES.find(s => s.value === service)
  const apiUrlLocked = currentService?.locked ?? true
  const serviceLabel = SERVICES.find(s => s.value === status?.service)?.label ?? status?.service

  return (
    <div>
      <h3>Git Service Integration</h3>
      <p className="small text-muted" style={{ marginBottom: 12 }}>
        When configured, new projects will automatically get a private repository
        created on your chosen git service. Existing projects can be linked via
        the Git panel inside the editor.
      </p>

      {status?.configured && (
        <div className="alert alert-info" style={{ padding: '6px 10px', marginBottom: 12, fontSize: 13 }}>
          Currently connected: <strong>{serviceLabel}</strong>{' '}
          as <strong>{status.username}</strong>
        </div>
      )}

      <div className="form-group">
        <label htmlFor="git-int-service">Service</label>
        <select
          id="git-int-service"
          className="form-control"
          value={service}
          onChange={e => handleServiceChange(e.target.value)}
          disabled={busy}
        >
          {SERVICES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="git-int-username">Username</label>
        <input
          id="git-int-username"
          type="text"
          className="form-control"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="your-username"
          disabled={busy}
        />
      </div>

      <div className="form-group">
        <label htmlFor="git-int-token">
          Access Token{status?.configured && ' (leave blank to keep existing)'}
        </label>
        <input
          id="git-int-token"
          type="password"
          className="form-control"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder={status?.configured ? '••••••••' : 'paste token here'}
          disabled={busy}
        />
        <p className="help-block" style={{ fontSize: 12 }}>
          GitHub / GitLab / Gitea: personal access token &nbsp;·&nbsp; Bitbucket: app password
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="git-int-apiurl">API URL</label>
        <input
          id="git-int-apiurl"
          type="text"
          className="form-control"
          value={apiUrl}
          onChange={e => setApiUrl(e.target.value)}
          placeholder="https://your-instance.example.com"
          readOnly={apiUrlLocked}
          disabled={busy}
          style={apiUrlLocked ? { background: '#f5f5f5', cursor: 'not-allowed' } : undefined}
        />
        <p className="help-block" style={{ fontSize: 12 }}>
          {apiUrlLocked
            ? 'Set automatically for this service.'
            : 'Enter the base URL of your self-hosted instance.'}
        </p>
      </div>

      {saveState === 'error' && (
        <p style={{ color: '#c0392b', fontSize: 13, marginBottom: 8 }}>{errorMsg}</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={busy}
        >
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved!' : 'Save Integration'}
        </button>
        {status?.configured && (
          <button
            className="btn btn-danger-ghost"
            onClick={handleDelete}
            disabled={busy}
          >
            {saveState === 'deleting' ? 'Removing…' : 'Remove Integration'}
          </button>
        )}
      </div>
    </div>
  )
}
