import { useEffect } from 'react'
import { useRepoStore } from './store/useRepoStore'
import { isRemoteAction, runningLabel } from './lib/format'
import Toolbar from './components/Toolbar/Toolbar'
import Sidebar from './components/Sidebar/Sidebar'
import CommitGraph from './components/Graph/CommitGraph'
import DiffViewer from './components/DiffViewer/DiffViewer'
import CommitPanel from './components/CommitPanel/CommitPanel'
import CommitDetail from './components/CommitDetail/CommitDetail'
import Welcome from './components/Welcome/Welcome'
import TabBar from './components/TabBar/TabBar'
import Toasts from './components/Toasts/Toasts'
import PromptDialog from './components/PromptDialog/PromptDialog'
import RebaseDialog from './components/RebaseDialog/RebaseDialog'
import FileHistoryDialog from './components/FileHistoryDialog/FileHistoryDialog'
import BlameDialog from './components/BlameDialog/BlameDialog'
import MergeToolDialog from './components/MergeToolDialog/MergeToolDialog'
import SettingsDialog from './components/SettingsDialog/SettingsDialog'
import RemoteDiagnosticsDialog from './components/RemoteDiagnosticsDialog/RemoteDiagnosticsDialog'
import ComposerDialog from './components/ComposerDialog/ComposerDialog'
import PullRequestDialog from './components/PullRequestDialog/PullRequestDialog'
import LoadingOverlay from './components/LoadingOverlay/LoadingOverlay'

export default function App(): JSX.Element {
  const ref = useRepoStore((s) => s.ref)
  const mode = useRepoStore((s) => s.mode)
  const booted = useRepoStore((s) => s.booted)
  const loading = useRepoStore((s) => s.loading)
  const loadingMsg = useRepoStore((s) => s.loadingMsg)
  const busy = useRepoStore((s) => s.busy)
  const busyAction = useRepoStore((s) => s.busyAction)
  const pickerOpen = useRepoStore((s) => s.pickerOpen)
  const init = useRepoStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="flex flex-col h-full bg-base-900 text-txt">
      {/* Tabs live above everything: they survive the Repositories screen. */}
      <TabBar />
      {!ref || pickerOpen ? (
        <Welcome />
      ) : (
        <>
          <Toolbar />
          <div className="flex flex-1 min-h-0">
            {/* Left: branches / remotes / tags / stashes */}
            <aside className="w-72 shrink-0 border-r border-edge bg-base-800">
              <Sidebar />
            </aside>

            {/* Center: commit graph (top) + diff (bottom) */}
            <main className="flex flex-col flex-1 min-w-0">
              <div className="flex-1 min-h-0 border-b border-edge">
                <CommitGraph />
              </div>
              <div className="flex-1 min-h-0 bg-base-900">
                <DiffViewer />
              </div>
            </main>

            {/* Right: staging (working) or commit detail */}
            <aside className="w-[30rem] shrink-0 border-l border-edge bg-base-800">
              {mode === 'working' ? <CommitPanel /> : <CommitDetail />}
            </aside>
          </div>
        </>
      )}
      {/* Transient center-top indicator for slow ops (checkout/merge over WSL/UNC,
          and every remote round-trip — those have no percentage to report). */}
      {ref && busy && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[65] flex flex-col gap-1.5 rounded-lg bg-base-800/95 border border-edge px-3 py-2 shadow-lg min-w-[180px]">
          <div className="flex items-center gap-2">
            <svg className="animate-spin" width="14" height="14" viewBox="0 0 50 50" aria-hidden>
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                strokeWidth="5"
                className="stroke-base-600"
                opacity="0.3"
              />
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray="80 200"
                className="stroke-accent"
              />
            </svg>
            <span className="text-[12px] text-txt">{runningLabel(busyAction, busy)}</span>
          </div>
          {isRemoteAction(busyAction) && (
            <div className="h-[3px] rounded-full overflow-hidden bg-accent/15">
              <div className="h-full w-full bg-accent kc-indeterminate" />
            </div>
          )}
        </div>
      )}
      <Toasts />
      <PromptDialog />
      <RebaseDialog />
      <FileHistoryDialog />
      <BlameDialog />
      <MergeToolDialog />
      <SettingsDialog />
      <RemoteDiagnosticsDialog />
      <ComposerDialog />
      <PullRequestDialog />
      {!booted ? (
        <LoadingOverlay message="Initializing…" />
      ) : (
        loading && <LoadingOverlay message={loadingMsg ?? 'Loading…'} />
      )}
    </div>
  )
}
