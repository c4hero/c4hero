import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore } from '@/store/workspace'
import {
  createBigBankSample,
  createBlankWorkspace,
  createMicroservicesTemplate,
  createMonolithTemplate,
  createEventDrivenTemplate,
} from '@/lib/templates'
import { openDSLFile, getRecentFiles, hasFileSystemAccess, isWorkspaceShape, saveDSLFile } from '@/lib/fileIO'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { parseSidecar, applySidecar } from '@/lib/sidecar'
import { getAIConfig } from '@/lib/ai'
import { FileText, Play, LayoutTemplate, Sparkles, Settings, Upload, Server, Box, Radio, Clock, AlertTriangle } from 'lucide-react'
import AISettingsDialog from '@/components/ai/AISettingsDialog'
import DescribeSystemDialog from '@/components/ai/DescribeSystemDialog'

export default function WelcomeScreen() {
  const loadWorkspace = useWorkspaceStore((s) => s.loadWorkspace)
  useEffect(() => { document.title = 'c4hero' }, [])
  const [showAISettings, setShowAISettings] = useState(false)
  const [showDescribe, setShowDescribe] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const jsonInputRef = useRef<HTMLInputElement>(null)
  const dslInputRef = useRef<HTMLInputElement>(null)

  function handleImportJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string)
        if (!isWorkspaceShape(parsed)) {
          setErrorMsg('Invalid workspace file. The JSON does not have the expected workspace structure.')
          return
        }
        loadWorkspace(parsed)
      } catch {
        setErrorMsg('Failed to parse JSON file. Please check the file format.')
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-selected
    e.target.value = ''
  }

  async function handleDSLInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const content = await file.text()
    const { workspace, errors } = parseDSL(content)
    if (errors.length > 0) console.warn('DSL parse warnings:', errors)
    if (workspace) {
      if (!workspace.name) workspace.name = file.name.replace(/\.dsl$/, '')
      loadWorkspace(workspace)
    } else {
      setErrorMsg('Failed to parse DSL file. Please check the file format.')
    }
  }

  async function handleOpenFile() {
    // Android Chrome blocks programmatic input.click() from async context —
    // use a DOM-resident input ref so the click happens synchronously in the gesture.
    if (!hasFileSystemAccess()) {
      dslInputRef.current?.click()
      return
    }
    const file = await openDSLFile()
    if (!file) return
    const { workspace, errors } = parseDSL(file.content)
    if (errors.length > 0) console.warn('DSL parse warnings:', errors)
    if (workspace) {
      if (!workspace.name) workspace.name = file.name.replace(/\.dsl$/, '')
      // Apply sidecar metadata if present
      if (file.sidecarJson) {
        const sidecar = parseSidecar(file.sidecarJson)
        if (sidecar) applySidecar(workspace, sidecar)
      }
      loadWorkspace(workspace)
    } else {
      alert('Failed to parse DSL file. Check console for errors.')
    }
  }

  function handleDescribeClick() {
    const config = getAIConfig()
    if (!config) {
      setShowAISettings(true)
    } else {
      setShowDescribe(true)
    }
  }

  return (
    <div
      className="flex h-full w-full items-start justify-center overflow-y-auto px-5"
      style={{ background: 'var(--color-bg-primary)', paddingTop: 'max(3rem, calc(env(safe-area-inset-top, 0px) + 1.5rem))', paddingBottom: 'max(3rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))' }}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-10 sm:max-w-lg my-auto">
        {/* Error banner */}
        {errorMsg && (
          <div
            role="alert"
            className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              background: 'color-mix(in srgb, var(--color-error) 8%, transparent)',
              borderColor: 'color-mix(in srgb, var(--color-error) 30%, transparent)',
              color: 'var(--color-error)',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs underline"
              style={{ color: 'var(--color-error)', flexShrink: 0 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Logo + tagline */}
        <div className="flex flex-col items-center gap-4">
          <h1 className="flex flex-col items-center gap-2">
            <img src="/c4-logo.svg" alt="c4hero — visual architecture modelling tool" className="h-10 sm:h-12" />
          </h1>
          <p className="text-center text-sm leading-relaxed sm:text-base" style={{ color: 'var(--color-text-muted)' }}>
            Visual architecture modelling with Structurizr DSL
          </p>
        </div>

        {/* Primary actions */}
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard icon={<FileText size={22} />} label="Open .dsl file" onClick={handleOpenFile} />
          <ActionCard icon={<LayoutTemplate size={22} />} label="New workspace (.dsl)" onClick={async () => {
            const ws = createBlankWorkspace()
            loadWorkspace(ws)
            // Prompt to pick a save location immediately so auto-save works from the start
            if (hasFileSystemAccess()) {
              await saveDSLFile(serializeDSL(ws), 'workspace.dsl')
            }
          }} />
          <ActionCard icon={<Play size={22} />} label="Explore sample" onClick={() => loadWorkspace(createBigBankSample())} />
        </div>

        {/* Hidden file inputs — must live in DOM for Android Chrome gesture handling */}
        <input
          ref={dslInputRef}
          type="file"
          accept=".dsl,.txt"
          className="hidden"
          onChange={handleDSLInputChange}
        />
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleImportJSON}
        />
        <button
          className="flex items-center gap-1.5 text-xs hover:underline"
          style={{ color: 'var(--color-text-muted)' }}
          onClick={() => jsonInputRef.current?.click()}
        >
          <Upload size={14} />
          <span>Import JSON</span>
        </button>

        {/* Recent files */}
        <RecentFilesList />

        {/* Templates */}
        <div className="w-full">
          <h2
            className="mb-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Templates
          </h2>
          <div className="flex flex-col gap-1">
            <TemplateItem
              icon={<Server size={16} />}
              name="Microservices"
              description="API gateway, services, RabbitMQ, PostgreSQL, and Redis"
              onClick={() => loadWorkspace(createMicroservicesTemplate())}
            />
            <TemplateItem
              icon={<Box size={16} />}
              name="Monolith"
              description="Web frontend, backend application, and database"
              onClick={() => loadWorkspace(createMonolithTemplate())}
            />
            <TemplateItem
              icon={<Radio size={16} />}
              name="Event-Driven"
              description="Producers, Kafka, consumers, and a data lake"
              onClick={() => loadWorkspace(createEventDrivenTemplate())}
            />
          </div>
        </div>

        {/* Divider */}
        <div className="flex w-full items-center gap-4">
          <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>or</span>
          <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border)' }} />
        </div>

        {/* AI action */}
        <div className="flex w-full gap-2">
          <button
            className="btn-surface flex-1 justify-center py-3.5"
            onClick={handleDescribeClick}
          >
            <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
            <span>Describe your system with AI</span>
          </button>
          <button
            className="btn-surface !px-3"
            onClick={() => setShowAISettings(true)}
            title="AI Settings"
          >
            <Settings size={16} />
          </button>
        </div>

        {/* Footer */}
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Open-source &middot; MIT License &middot; No account required
        </p>
      </div>

      {showAISettings && <AISettingsDialog onClose={() => setShowAISettings(false)} />}
      {showDescribe && <DescribeSystemDialog onClose={() => setShowDescribe(false)} />}
      <div className="commit-hash">{__COMMIT_HASH__}</div>
    </div>
  )
}

function ActionCard({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="btn-surface flex-col items-center gap-3 rounded-xl px-5 py-6" onClick={onClick}>
      <span style={{ color: 'var(--color-accent)' }}>{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

function RecentFilesList() {
  const recent = getRecentFiles()
  if (recent.length === 0) return null

  return (
    <div className="w-full">
      <h3
        className="mb-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Recent Files
      </h3>
      <div className="flex flex-col gap-0.5">
        {recent.slice(0, 5).map((file) => (
          <div
            key={file.name}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <Clock size={12} style={{ flexShrink: 0 }} />
            <span className="truncate">{file.name}</span>
            <span className="ml-auto shrink-0 text-[10px]">
              {new Date(file.openedAt).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TemplateItem({ icon, name, description, onClick }: { icon: React.ReactNode; name: string; description: string; onClick: () => void }) {
  return (
    <button
      className="btn-surface w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
      onClick={onClick}
    >
      <span className="shrink-0" style={{ color: 'var(--color-accent)' }}>{icon}</span>
      <div className="flex flex-col">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{description}</span>
      </div>
    </button>
  )
}
