import type { EngineInterface } from 'claude-code'

/**
 * Every variable this mod may write. `$.env.set` takes a string literal, so each
 * one is spelled out below; a key cc-switch adds later is reported, not applied.
 */
export const MANAGED_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'CLAUDE_CODE_SUBAGENT_MODEL',
  'CLAUDE_CODE_AUTO_COMPACT_WINDOW',
  'CLAUDE_CODE_MAX_CONTEXT_TOKENS',
  'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
  'API_TIMEOUT_MS',
] as const

export type ManagedKey = (typeof MANAGED_KEYS)[number]
export type EnvMap = Record<string, string>

export interface EnvChange {
  key: string
  value: string | undefined
}

export function mergeEnv(common: EnvMap, provider: EnvMap): EnvMap {
  return { ...common, ...provider }
}

/**
 * The writes that turn `next` into the live state: every managed key the target
 * omits is unset, so a leftover ANTHROPIC_API_KEY cannot fight the new
 * ANTHROPIC_AUTH_TOKEN.
 */
export function planChanges(next: EnvMap, keys: readonly string[] = MANAGED_KEYS): EnvChange[] {
  const plan: EnvChange[] = []
  for (const key of keys) {
    plan.push({ key, value: next[key] })
  }
  return plan
}

export function unsupportedKeys(next: EnvMap): string[] {
  const managed = new Set<string>(MANAGED_KEYS)
  return Object.keys(next).filter(key => !managed.has(key))
}

export async function applyEnv(
  $: EngineInterface,
  changes: EnvChange[],
): Promise<{ applied: number; denied: string[] }> {
  const denied: string[] = []
  let applied = 0

  for (const change of changes) {
    const result = await setOne($, change.key, change.value)
    const verdict = result as { deny?: string } | undefined
    if (verdict?.deny) denied.push(`${change.key}: ${verdict.deny}`)
    else applied += 1
  }

  return { applied, denied }
}

async function setOne(
  $: EngineInterface,
  key: string,
  value: string | undefined,
): Promise<unknown> {
  switch (key) {
    case 'ANTHROPIC_BASE_URL':
      return $.env.set('ANTHROPIC_BASE_URL', value)
    case 'ANTHROPIC_API_KEY':
      return $.env.set('ANTHROPIC_API_KEY', value)
    case 'ANTHROPIC_AUTH_TOKEN':
      return $.env.set('ANTHROPIC_AUTH_TOKEN', value)
    case 'ANTHROPIC_CUSTOM_HEADERS':
      return $.env.set('ANTHROPIC_CUSTOM_HEADERS', value)
    case 'ANTHROPIC_MODEL':
      return $.env.set('ANTHROPIC_MODEL', value)
    case 'ANTHROPIC_SMALL_FAST_MODEL':
      return $.env.set('ANTHROPIC_SMALL_FAST_MODEL', value)
    case 'ANTHROPIC_DEFAULT_FABLE_MODEL':
      return $.env.set('ANTHROPIC_DEFAULT_FABLE_MODEL', value)
    case 'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME':
      return $.env.set('ANTHROPIC_DEFAULT_FABLE_MODEL_NAME', value)
    case 'ANTHROPIC_DEFAULT_HAIKU_MODEL':
      return $.env.set('ANTHROPIC_DEFAULT_HAIKU_MODEL', value)
    case 'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME':
      return $.env.set('ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME', value)
    case 'ANTHROPIC_DEFAULT_OPUS_MODEL':
      return $.env.set('ANTHROPIC_DEFAULT_OPUS_MODEL', value)
    case 'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME':
      return $.env.set('ANTHROPIC_DEFAULT_OPUS_MODEL_NAME', value)
    case 'ANTHROPIC_DEFAULT_SONNET_MODEL':
      return $.env.set('ANTHROPIC_DEFAULT_SONNET_MODEL', value)
    case 'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME':
      return $.env.set('ANTHROPIC_DEFAULT_SONNET_MODEL_NAME', value)
    case 'CLAUDE_CODE_SUBAGENT_MODEL':
      return $.env.set('CLAUDE_CODE_SUBAGENT_MODEL', value)
    case 'CLAUDE_CODE_AUTO_COMPACT_WINDOW':
      return $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', value)
    case 'CLAUDE_CODE_MAX_CONTEXT_TOKENS':
      return $.env.set('CLAUDE_CODE_MAX_CONTEXT_TOKENS', value)
    case 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS':
      return $.env.set('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS', value)
    case 'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC':
      return $.env.set('CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', value)
    case 'API_TIMEOUT_MS':
      return $.env.set('API_TIMEOUT_MS', value)
    default:
      return { deny: 'not a key this mod knows how to set' }
  }
}
