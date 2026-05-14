import { useCallback, useEffect, useState } from 'react'
import OLButton from '@/shared/components/ol/ol-button'
import { getJSON, postJSON, deleteJSON } from '@/infrastructure/fetch-json'

type Status = 'idle' | 'saving' | 'deleting' | 'error'

export default function GitSshSection() {
  const [hasKey, setHasKey] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg] = useState('')

  const fetchStatus = useCallback(() => {
    getJSON<{ hasKey: boolean }>('/user/git/ssh-key')
      .then(r => setHasKey(r.hasKey))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleSave = useCallback(async () => {
    if (!keyInput.trim()) return
    setStatus('saving')
    setMsg('')
    try {
      await postJSON('/user/git/ssh-key', { body: { key: keyInput.trim() } })
      setHasKey(true)
      setKeyInput('')
      setStatus('idle')
      setMsg('SSH key saved.')
    } catch (err: any) {
      setStatus('error')
      setMsg(err?.data?.error || err?.message || 'Failed to save key')
    }
  }, [keyInput])

  const handleDelete = useCallback(async () => {
    setStatus('deleting')
    setMsg('')
    try {
      await deleteJSON('/user/git/ssh-key')
      setHasKey(false)
      setStatus('idle')
      setMsg('SSH key removed.')
    } catch (err: any) {
      setStatus('error')
      setMsg(err?.data?.error || err?.message || 'Failed to remove key')
    }
  }, [])

  return (
    <>
      <h3>Git SSH Key</h3>
      <p style={{ fontSize: 14 }}>
        Upload a private SSH key to authenticate git operations (push/pull) using
        SSH remotes.
      </p>
      {hasKey && (
        <p style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>Status:</strong> SSH key is configured.{' '}
          <OLButton
            variant="danger"
            size="sm"
            onClick={handleDelete}
            disabled={status === 'deleting'}
          >
            {status === 'deleting' ? 'Removing…' : 'Remove key'}
          </OLButton>
        </p>
      )}
      {!hasKey && (
        <>
          <label
            htmlFor="git-ssh-key-input"
            style={{ fontSize: 13, fontWeight: 600 }}
          >
            Paste private key (PEM format)
          </label>
          <textarea
            id="git-ssh-key-input"
            className="form-control"
            rows={6}
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4, marginBottom: 8 }}
          />
          <OLButton
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={status === 'saving' || !keyInput.trim()}
          >
            {status === 'saving' ? 'Saving…' : 'Save SSH key'}
          </OLButton>
        </>
      )}
      {msg && (
        <p
          style={{
            fontSize: 13,
            marginTop: 8,
            color: status === 'error' ? '#c0392b' : '#27ae60',
          }}
        >
          {msg}
        </p>
      )}
      <hr />
    </>
  )
}
