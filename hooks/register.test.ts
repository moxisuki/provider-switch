import { expect, test } from 'claude-code/testing'

import { MANAGED_KEYS, mergeEnv, planChanges, unsupportedKeys } from './lib/env'

test('the plan unsets every managed key the next provider leaves out', () => {
  const next = { ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic', ANTHROPIC_AUTH_TOKEN: 't' }
  const plan = planChanges(next)
  const byKey = new Map(plan.map(change => [change.key, change.value]))

  expect(byKey.get('ANTHROPIC_BASE_URL')).toBe('https://api.deepseek.com/anthropic')
  expect(byKey.get('ANTHROPIC_AUTH_TOKEN')).toBe('t')
  // the previous provider's key must be cleared, not left behind
  expect(byKey.has('ANTHROPIC_API_KEY')).toBe(true)
  expect(byKey.get('ANTHROPIC_API_KEY')).toBe(undefined)
  expect(plan.length).toBe(MANAGED_KEYS.length)
})

test('the common config is the floor and the provider wins', () => {
  const merged = mergeEnv(
    { API_TIMEOUT_MS: '3000000', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    { API_TIMEOUT_MS: '600000', ANTHROPIC_MODEL: 'x' },
  )
  expect(merged.API_TIMEOUT_MS).toBe('600000')
  expect(merged.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1')
  expect(merged.ANTHROPIC_MODEL).toBe('x')
})

test('a key this mod cannot spell is reported, not silently dropped', () => {
  expect(unsupportedKeys({ ANTHROPIC_BASE_URL: 'x', SOME_FUTURE_KEY: 'y' })).toContain('SOME_FUTURE_KEY')
  expect(unsupportedKeys({ ANTHROPIC_BASE_URL: 'x' })).toEqual([])
})
