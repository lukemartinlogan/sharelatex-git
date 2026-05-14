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

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function GitPanel() {
  const { projectId } = useProjectContext()
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [remoteInput, setRemoteInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

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
