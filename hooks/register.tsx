import type { EngineInterface, Register } from 'claude-code'

import { applyEnv, mergeEnv, planChanges, unsupportedKeys } from './lib/env'
import type { EnvMap } from './lib/env'

const PANE = 'provider-switch'

interface Provider {
  id: string
  name: string
  env: EnvMap
  model: string
  baseUrl: string
  isCurrent: boolean
}

interface Selection {
  session_id: string
  provider_id: string
  provider_name: string
  model: string | null
  switched_at: number
}

interface PanelState {
  providers: Provider[]
  commonEnv: EnvMap
  activeName: string | null
  activeModel: string | null
  sessionId: string
  error: string | null
}

let switchModelEnabled = true

const PANEL: PanelState = {
  providers: [],
  commonEnv: {},
  activeName: null,
  activeModel: null,
  sessionId: '',
  error: null,
}

declare function setTimeout(handler: () => void, ms: number): unknown

function helperPath($: EngineInterface): string {
  return `${$.plugin.root.replace(/\\/g, '/')}/helper/state.mjs`
}

let cachedNode: string | null | undefined

async function resolveNode($: EngineInterface, configured?: unknown): Promise<string | null> {
  if (cachedNode !== undefined) return cachedNode
  const candidates: string[] = []
  if (typeof configured === 'string' && configured.trim()) candidates.push(configured.trim())
  candidates.push('node')
  for (const bin of candidates) {
    const probe = await $.process.run([bin, '--version'], { timeoutMs: 5_000 }).catch(() => null)
    if (probe && probe.exitCode === 0) {
      cachedNode = bin
      return bin
    }
  }
  cachedNode = null
  return null
}

async function helper(
  $: EngineInterface,
  node: string,
  request: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  const result = await $.process
    .run([node, helperPath($)], { stdin: JSON.stringify(request), timeoutMs })
    .catch(error => ({
      exitCode: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    }))

  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop()
  if (line) {
    try {
      return JSON.parse(line) as Record<string, unknown>
    } catch {
      // fall through
    }
  }
  return {
    ok: false,
    message: result.stderr.trim() || `helper exited with code ${result.exitCode}`,
  }
}

function invalidate($: EngineInterface): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // nothing drawn
  }
}

function findProvider(list: Provider[], query: string): Provider | undefined {
  const lower = query.toLowerCase()
  return (
    list.find(provider => provider.name.toLowerCase() === lower) ??
    list.find(provider => provider.id.toLowerCase() === lower) ??
    list.find(provider => provider.name.toLowerCase().startsWith(lower)) ??
    list.find(provider => provider.name.toLowerCase().includes(lower))
  )
}

async function switchTo(
  $: EngineInterface,
  node: string,
  provider: Provider,
  record: boolean,
): Promise<string> {
  const next = mergeEnv(PANEL.commonEnv, provider.env)
  const unknown = unsupportedKeys(next)
  const { applied, denied } = await applyEnv($, planChanges(next))

  const previousModel = PANEL.activeModel
  let modelNote = ''
  if (!switchModelEnabled) {
    modelNote = provider.model ? `model left as is (switchModel off; would be ${provider.model})` : ''
  } else if (provider.model && provider.model !== previousModel) {
    modelNote = await setModel($, provider.model)
  }

  PANEL.activeName = provider.name
  PANEL.activeModel = provider.model || null

  if (record) {
    await helper($, node, {
      op: 'set',
      sessionId: PANEL.sessionId,
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
    })
  }
  invalidate($)

  const lines = [`${provider.name}  ${provider.model || ''}`.trim()]
  lines.push(`  ${provider.baseUrl || '(official login)'}`)
  lines.push(`  ${applied} env var${applied === 1 ? '' : 's'} · next request`)
  if (modelNote) lines.push(`  ${modelNote}`)
  if (denied.length) lines.push(`  refused: ${denied.join('; ')}`)
  if (unknown.length) lines.push(`  unhandled: ${unknown.join(', ')}`)
  return lines.join('\n')
}

function table(): string {
  if (!PANEL.providers.length) {
    return PANEL.error ? `no providers: ${PANEL.error}` : 'no providers found in cc-switch'
  }
  const width = Math.max(...PANEL.providers.map(provider => provider.name.length))
  const rows = PANEL.providers.map(provider => {
    const mark = provider.name === PANEL.activeName ? '*' : ' '
    const base = provider.baseUrl || '(official login)'
    return `${mark} ${provider.name.padEnd(width)}  ${provider.model || '-'}  ${base}`
  })
  const head = `session ${PANEL.sessionId || '?'}  active: ${PANEL.activeName ?? 'from settings.json'}`
  return [head, '', ...rows, '', 'switch with /provider <name>'].join('\n')
}

function mask(value: string | undefined): string {
  if (!value) return '(unset)'
  if (value.length <= 8) return value
  return `${value.slice(0, 6)}…`
}

async function envReport($: EngineInterface): Promise<string> {
  const rows: Array<[string, string | undefined]> = [
    ['ANTHROPIC_BASE_URL', await $.env.get('ANTHROPIC_BASE_URL').catch(() => undefined)],
    ['ANTHROPIC_MODEL', await $.env.get('ANTHROPIC_MODEL').catch(() => undefined)],
    ['ANTHROPIC_DEFAULT_OPUS_MODEL', await $.env.get('ANTHROPIC_DEFAULT_OPUS_MODEL').catch(() => undefined)],
    ['ANTHROPIC_DEFAULT_SONNET_MODEL', await $.env.get('ANTHROPIC_DEFAULT_SONNET_MODEL').catch(() => undefined)],
    ['ANTHROPIC_DEFAULT_HAIKU_MODEL', await $.env.get('ANTHROPIC_DEFAULT_HAIKU_MODEL').catch(() => undefined)],
    ['ANTHROPIC_API_KEY', await $.env.get('ANTHROPIC_API_KEY').catch(() => undefined)],
    ['ANTHROPIC_AUTH_TOKEN', await $.env.get('ANTHROPIC_AUTH_TOKEN').catch(() => undefined)],
  ]
  const width = Math.max(...rows.map(([key]) => key.length))
  return rows
    .map(([key, value]) => `${key.padEnd(width)}  ${key.endsWith('KEY') || key.endsWith('TOKEN') ? mask(value) : value ?? '(unset)'}`)
    .join('\n')
}

async function setModel($: EngineInterface, model: string): Promise<string> {
  // Only /model moves the running session's model. The config row writes the setting
  // but the engine keeps the model it resolved at start, so config is the fallback.
  try {
    await $.command.run({ command: 'model', args: model })
    return `model → ${model} (via /model)`
  } catch (error) {
    const first = error instanceof Error ? error.message : String(error)
    try {
      await $.config.set({ key: 'model', value: model })
      return `model → ${model} (config row only; /model said: ${first} — restart for it to take effect)`
    } catch (second) {
      const why = second instanceof Error ? second.message : String(second)
      return `model NOT changed: ${why} (/model said: ${first})`
    }
  }
}

async function loadProviders(
  $: EngineInterface,
  node: string,
): Promise<void> {
  const providers = await helper($, node, { op: 'providers' })
  if (providers.ok === false) {
    PANEL.error = String(providers.message ?? 'cc-switch database unreadable')
    PANEL.providers = []
    return
  }
  PANEL.providers = (providers.providers as Provider[]) ?? []
  PANEL.commonEnv = (providers.commonEnv as EnvMap) ?? {}
  PANEL.error = null
}

async function detectActive($: EngineInterface): Promise<void> {
  if (PANEL.activeName) return
  const base = await $.env.get('ANTHROPIC_BASE_URL').catch(() => undefined)
  if (!base) return
  const match = PANEL.providers.find(provider => provider.baseUrl === base)
  if (match) {
    PANEL.activeName = match.name
    PANEL.activeModel = match.model || null
  }
}

export const register: Register = (on, options) => {
  const config = options as Record<string, unknown>
  const nodeBin = config.nodeBin
  switchModelEnabled = config.switchModel !== false

  on('session.start', async ($, e, next) => {
    // a previous build pinned a status line; clear it so only the band shows
    $.ui.status(undefined)

    await $.command.register({
      name: 'provider',
      description: 'Switch the API provider for this session (no restart, no file writes)',
      argumentHint: '[list | <name>]',
    })

    try {
      PANEL.sessionId = await $.session.id()
      const node = await resolveNode($, nodeBin)
      if (!node) {
        PANEL.error = 'node 18+ was not found on PATH'
      } else {
        await loadProviders($, node)
        await detectActive($)

        const saved = await helper($, node, { op: 'get', sessionId: PANEL.sessionId })
        const selection = saved.selection as Selection | null
        if (selection) {
          const provider = PANEL.providers.find(item => item.id === selection.provider_id)
          if (provider) {
            await switchTo($, node, provider, false)
            $.ui.log(
              `provider: restored ${provider.name} for session ${PANEL.sessionId}`,
              { to: 'debug' },
            )
          }
        }
      }
    } catch (error) {
      PANEL.error = error instanceof Error ? error.message : String(error)
    }

    return next(e)
  })

  on('command.run', { command: 'provider' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    const node = await resolveNode($, nodeBin)
    if (!node) return { text: 'provider-switch needs node 18+ on PATH' }

    if (!PANEL.providers.length) await loadProviders($, node)

    if (!args) {
      const opened = await $.ui.open({
        id: PANE,
        title: 'provider',
        focus: true,
        closeOnEscape: true,
      })
      return {
        text: opened.isPlaced
          ? 'picker open — arrows to move, Enter to switch, Esc to close'
          : 'the pane cannot be placed at this width; use /provider <name> or /provider list',
      }
    }
    if (args === 'list') return { text: table() }
    if (args === 'env') return { text: await envReport($) }

    if (args === 'model' || args.startsWith('model ')) {
      const wanted = args.slice(5).trim()
      if (!wanted) {
        const active = PANEL.providers.find(provider => provider.name === PANEL.activeName)
        return {
          text: active?.model
            ? `${active.name} → ${active.model}
set it with /provider model <id>`
            : 'the active provider names no model',
        }
      }
      return { text: await setModel($, wanted) }
    }

    if (args === 'reload') {
      await loadProviders($, node)
      await detectActive($)
      return { text: table() }
    }

    const provider = findProvider(PANEL.providers, args)
    if (!provider) return { text: `unknown provider "${args}"\n\n${table()}` }
    return { text: await switchTo($, node, provider, true) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Select } = $.ui.resolve(e)
    const active = PANEL.activeName ?? 'settings.json'
    const options = PANEL.providers.map(provider => ({
      value: provider.id,
      label: provider.name,
    }))
    const current = PANEL.providers.find(provider => provider.name === PANEL.activeName)?.id
    const activeProvider = PANEL.providers.find(provider => provider.name === PANEL.activeName)

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>provider</Text>
          <Text dimColor>{active}</Text>
        </Box>
        <Text dimColor>
          {`${activeProvider?.model || 'no model pinned'}  ·  session ${PANEL.sessionId.slice(0, 8) || '?'}`}
        </Text>
        {PANEL.error && <Text>{PANEL.error}</Text>}
        {options.length > 0 && (
          <Box marginTop={1}>
            <Select
              key="providers"
              options={options}
              value={current}
              autoFocus
              onSelect={(value: string) => {
                const chosen = PANEL.providers.find(provider => provider.id === value)
                const node = cachedNode
                if (!chosen) return
                if (!node) {
                  PANEL.error = 'node 18+ was not found on PATH'
                  return
                }
                void (async () => {
                  const report = await switchTo($, node, chosen, true)
                  const modelLine = report.split('\n').find(line => line.includes('model'))
                  $.ui.log(report)
                  $.ui.toast(modelLine?.trim() || chosen.name, { timeoutMs: 5_000 })
                  await $.ui.close({ id: PANE }).catch(() => undefined)
                })()
              }}
            />
          </Box>
        )}
        {options.length === 0 && !PANEL.error && <Text dimColor>no providers in cc-switch</Text>}
        <Box marginTop={1}>
          <Text dimColor>↑↓ move · enter switch · esc close</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (!PANEL.activeName) return next(e)
    const tail = PANEL.activeModel ? `${PANEL.activeName} · ${PANEL.activeModel}` : PANEL.activeName
    return next({ ...e, props: { ...e.props, tail } })
  })
}
