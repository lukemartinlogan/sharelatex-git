import { useCallback, useEffect, useRef, useState } from 'react'
import { useProjectContext } from '@/shared/context/project-context'
import OLIconButton from '@/shared/components/ol/ol-icon-button'
import OLTooltip from '@/shared/components/ol/ol-tooltip'
import { postJSON } from '@/infrastructure/fetch-json'

type OpState = 'idle' | 'loading' | 'success' | 'error'

type FileEntry = { status: string; file: string }

type CommitResult = {
  committed: boolean
  message?: string
  files?: FileEntry[]
  commitOutput?: string
}

type PushResult = {
  pushed: boolean
  remoteUrl?: string
  output?: string
}

type PullResult = {
  ok: boolean
  upToDate?: boolean
  remoteUrl?: string
  output?: string
  autoCommit?: { committed: boolean; message?: string }
}

type LogEntry =
  | { type: 'commit'; success: true; result: CommitResult }
  | { type: 'commit'; success: false; error: string }
  | { type: 'push'; success: true; result: PushResult }
  | { type: 'push'; success: false; error: string }
  | { type: 'pull'; success: true; result: PullResult }
  | { type: 'pull'; success: false; error: string }

const FILE_STATUS: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: '#e67e22' },
  A: { label: 'A', color: '#27ae60' },
  D: { label: 'D', color: '#e74c3c' },
  R: { label: 'R', color: '#8e44ad' },
  C: { label: 'C', color: '#2980b9' },
}

function statusCode(xy: string): string {
  return xy.charAt(0) !== ' ' ? xy.charAt(0) : xy.charAt(1)
}

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 52,
  right: 16,
  zIndex: 10000,
  width: 400,
  maxWidth: 'calc(100vw - 32px)',
  background: '#1e1e2e',
  color: '#cdd6f4',
  borderRadius: 8,
  boxShadow: '0 6px 24px rgba(0,0,0,0.55)',
  fontFamily: 'monospace',
  fontSize: 13,
  overflow: 'hidden',
}

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  background: '#313244',
  borderBottom: '1px solid #45475a',
}

const PRE_STYLE: React.CSSProperties = {
  marginTop: 8,
  padding: '6px 8px',
  background: '#181825',
  borderRadius: 4,
  color: '#a6adc8',
  fontSize: 11,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}

function GitOutputPanel({
  entry,
  onClose,
}: {
  entry: LogEntry
  onClose: () => void
}) {
  const titles = { commit: 'Git Commit', push: 'Git Push', pull: 'Git Pull & Merge' }

  return (
    <div style={PANEL_STYLE}>
      <div style={HEADER_STYLE}>
        <span style={{ fontWeight: 600, fontFamily: 'sans-serif', fontSize: 13 }}>
          {titles[entry.type]}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#cdd6f4',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 2px',
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div style={{ padding: '10px 12px' }}>
        {entry.type === 'commit' ? (
          entry.success ? (
            <CommitSuccess result={entry.result} />
          ) : (
            <ErrorLine msg={entry.error} />
          )
        ) : entry.type === 'push' ? (
          entry.success ? (
            <PushSuccess result={entry.result} />
          ) : (
            <ErrorLine msg={entry.error} />
          )
        ) : entry.success ? (
          <PullSuccess result={entry.result} />
        ) : (
          <ErrorLine msg={entry.error} />
        )}
      </div>
    </div>
  )
}

function CommitSuccess({ result }: { result: CommitResult }) {
  if (!result.committed) {
    return (
      <div style={{ color: '#89b4fa' }}>
        ℹ {result.message ?? 'Nothing to commit'}
      </div>
    )
  }

  return (
    <>
      <div style={{ color: '#a6e3a1', marginBottom: 8 }}>
        ✓ Committed {result.files?.length ?? 0} file(s)
      </div>

      {result.files && result.files.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ color: '#6c7086', fontSize: 11, marginBottom: 4 }}>
            TRACKED FILES
          </div>
          {result.files.map((f, i) => {
            const code = statusCode(f.status)
            const info = FILE_STATUS[code] ?? { label: code || '?', color: '#89b4fa' }
            return (
              <div
                key={i}
                style={{ display: 'flex', gap: 10, padding: '1px 0', lineHeight: '1.7' }}
              >
                <span style={{ color: info.color, fontWeight: 700, minWidth: 12, textAlign: 'center' }}>
                  {info.label}
                </span>
                <span style={{ color: '#cdd6f4' }}>{f.file}</span>
              </div>
            )
          })}
        </div>
      )}

      {result.commitOutput && (
        <pre style={PRE_STYLE}>{result.commitOutput}</pre>
      )}
    </>
  )
}

function PushSuccess({ result }: { result: PushResult }) {
  return (
    <>
      <div style={{ color: '#a6e3a1', marginBottom: 6 }}>✓ Pushed to origin</div>
      {result.remoteUrl && (
        <div style={{ color: '#a6adc8', fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: '#6c7086' }}>remote: </span>
          {result.remoteUrl}
        </div>
      )}
      {result.output && <pre style={PRE_STYLE}>{result.output}</pre>}
    </>
  )
}

function PullSuccess({ result }: { result: PullResult }) {
  return (
    <>
      {result.autoCommit?.committed && (
        <div style={{ color: '#89b4fa', fontSize: 12, marginBottom: 6 }}>
          ↑ Auto-committed local changes before pull
        </div>
      )}
      <div style={{ color: '#a6e3a1', marginBottom: 6 }}>
        {result.upToDate ? 'ℹ Already up to date' : '✓ Pulled and merged'}
      </div>
      {result.remoteUrl && (
        <div style={{ color: '#a6adc8', fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: '#6c7086' }}>remote: </span>
          {result.remoteUrl}
        </div>
      )}
      {result.output && <pre style={PRE_STYLE}>{result.output}</pre>}
    </>
  )
}

function ErrorLine({ msg }: { msg: string }) {
  return <div style={{ color: '#f38ba8' }}>✗ {msg}</div>
}

export default function GitButtons() {
  const { projectId } = useProjectContext()
  const [commitState, setCommitState] = useState<OpState>('idle')
  const [pushState, setPushState] = useState<OpState>('idle')
  const [pullState, setPullState] = useState<OpState>('idle')
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current)
      if (pushTimer.current) clearTimeout(pushTimer.current)
      if (pullTimer.current) clearTimeout(pullTimer.current)
      if (logTimer.current) clearTimeout(logTimer.current)
    }
  }, [])

  const resetAfter = (
    setter: (s: OpState) => void,
    timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  ) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setter('idle'), 3000)
  }

  const showLog = useCallback((entry: LogEntry) => {
    setLogEntry(entry)
    if (logTimer.current) clearTimeout(logTimer.current)
    logTimer.current = setTimeout(() => setLogEntry(null), 15000)
  }, [])

  const handleCommit = useCallback(async () => {
    setCommitState('loading')
    try {
      const result = await postJSON<CommitResult>(
        `/project/${projectId}/git/commit`,
        { body: {} }
      )
      setCommitState('success')
      showLog({ type: 'commit', success: true, result })
    } catch (err: any) {
      setCommitState('error')
      showLog({
        type: 'commit',
        success: false,
        error: err?.data?.error || err?.message || 'Commit failed',
      })
    }
    resetAfter(setCommitState, commitTimer)
  }, [projectId, showLog])

  const handlePush = useCallback(async () => {
    setPushState('loading')
    try {
      const result = await postJSON<PushResult>(
        `/project/${projectId}/git/push`,
        { body: {} }
      )
      setPushState('success')
      showLog({ type: 'push', success: true, result })
    } catch (err: any) {
      setPushState('error')
      showLog({
        type: 'push',
        success: false,
        error: err?.data?.error || err?.message || 'Push failed',
      })
    }
    resetAfter(setPushState, pushTimer)
  }, [projectId, showLog])

  const handlePull = useCallback(async () => {
    setPullState('loading')
    try {
      const result = await postJSON<PullResult>(
        `/project/${projectId}/git/pull`,
        { body: {} }
      )
      setPullState('success')
      showLog({ type: 'pull', success: true, result })
    } catch (err: any) {
      setPullState('error')
      showLog({
        type: 'pull',
        success: false,
        error: err?.data?.error || err?.message || 'Pull failed',
      })
    }
    resetAfter(setPullState, pullTimer)
  }, [projectId, showLog])

  const commitIcon =
    commitState === 'loading' ? 'hourglass_empty'
    : commitState === 'success' ? 'check'
    : commitState === 'error' ? 'error'
    : 'save'

  const pushIcon =
    pushState === 'loading' ? 'hourglass_empty'
    : pushState === 'success' ? 'check'
    : pushState === 'error' ? 'error'
    : 'upload'

  const pullIcon =
    pullState === 'loading' ? 'hourglass_empty'
    : pullState === 'success' ? 'check'
    : pullState === 'error' ? 'error'
    : 'download'

  return (
    <>
      <div className="ide-redesign-toolbar-button-container">
        <OLTooltip
          id="tooltip-git-commit"
          description="Git: commit"
          overlayProps={{ delay: 0, placement: 'bottom' }}
        >
          <OLIconButton
            icon={commitIcon}
            className="ide-redesign-toolbar-button-subdued ide-redesign-toolbar-button-icon"
            onClick={handleCommit}
            disabled={commitState === 'loading'}
            accessibilityLabel="Git commit"
          />
        </OLTooltip>
      </div>

      <div className="ide-redesign-toolbar-button-container">
        <OLTooltip
          id="tooltip-git-push"
          description="Git: push"
          overlayProps={{ delay: 0, placement: 'bottom' }}
        >
          <OLIconButton
            icon={pushIcon}
            className="ide-redesign-toolbar-button-subdued ide-redesign-toolbar-button-icon"
            onClick={handlePush}
            disabled={pushState === 'loading'}
            accessibilityLabel="Git push"
          />
        </OLTooltip>
      </div>

      <div className="ide-redesign-toolbar-button-container">
        <OLTooltip
          id="tooltip-git-pull"
          description="Git: pull and merge"
          overlayProps={{ delay: 0, placement: 'bottom' }}
        >
          <OLIconButton
            icon={pullIcon}
            className="ide-redesign-toolbar-button-subdued ide-redesign-toolbar-button-icon"
            onClick={handlePull}
            disabled={pullState === 'loading'}
            accessibilityLabel="Git pull and merge"
          />
        </OLTooltip>
      </div>

      {logEntry && (
        <GitOutputPanel entry={logEntry} onClose={() => setLogEntry(null)} />
      )}
    </>
  )
}
