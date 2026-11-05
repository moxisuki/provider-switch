#!/usr/bin/env node
// One process per call. Request JSON on stdin, response JSON on stdout.
// Reads cc-switch's database read-only; keeps this mod's own state in ~/.provider-switch/state.db.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const CC_DB = process.env.CC_SWITCH_DB || path.join(HOME, '.cc-switch', 'cc-switch.db')
const STATE_DB = process.env.PROVIDER_SWITCH_DB || path.join(HOME, '.provider-switch', 'state.db')

function out(value) {
  process.stdout.write(JSON.stringify(value) + '\n')
}

function readStdin() {
  return new Promise(resolve => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function openState() {
  fs.mkdirSync(path.dirname(STATE_DB), { recursive: true })
  const db = new DatabaseSync(STATE_DB)
  db.exec(`
    create table if not exists sessions (
      session_id    text primary key,
      provider_id   text not null,
      provider_name text not null,
      model         text,
      switched_at   integer not null
    );
    create table if not exists switches (
      id            integer primary key autoincrement,
      session_id    text not null,
      from_provider text,
      to_provider   text not null,
      model         text,
      at            integer not null
    );
  `)
  return db
}

function readProviders() {
  if (!fs.existsSync(CC_DB)) throw new Error(`cc-switch database not found: ${CC_DB}`)
  const db = new DatabaseSync(CC_DB, { readOnly: true })

  let common = {}
  try {
    const row = db.prepare("select value from settings where key = 'common_config_claude'").get()
    if (row) common = JSON.parse(row.value) || {}
  } catch {
    common = {}
  }

  const rows = db
    .prepare(
      "select id, name, settings_config, sort_index, is_current from providers where app_type = 'claude' order by coalesce(sort_index, 9999), name",
    )
    .all()

  const providers = rows.map(row => {
    let config = {}
    try {
      config = JSON.parse(row.settings_config) || {}
    } catch {
      config = {}
    }
    const env = { ...(common.env || {}), ...(config.env || {}) }
    const model = env.ANTHROPIC_MODEL || config.model || common.model || ''
    return {
      id: row.id,
      name: row.name,
      env,
      model,
      baseUrl: env.ANTHROPIC_BASE_URL || '',
      isCurrent: row.is_current === 1,
    }
  })

  db.close()
  return { providers, commonEnv: common.env || {} }
}

function getSelection(db, sessionId) {
  return (
    db
      .prepare('select session_id, provider_id, provider_name, model, switched_at from sessions where session_id = ?')
      .get(sessionId) ?? null
  )
}

function setSelection(db, { sessionId, providerId, providerName, model }) {
  const at = Date.now()
  const previous = getSelection(db, sessionId)
  db.prepare(
    `insert into sessions (session_id, provider_id, provider_name, model, switched_at)
     values (?, ?, ?, ?, ?)
     on conflict(session_id) do update set
       provider_id = excluded.provider_id,
       provider_name = excluded.provider_name,
       model = excluded.model,
       switched_at = excluded.switched_at`,
  ).run(sessionId, providerId, providerName, model, at)
  db.prepare(
    'insert into switches (session_id, from_provider, to_provider, model, at) values (?, ?, ?, ?, ?)',
  ).run(sessionId, previous?.provider_id ?? null, providerId, model, at)
  return getSelection(db, sessionId)
}

async function main() {
  const raw = await readStdin()
  let request = {}
  try {
    request = raw.trim() ? JSON.parse(raw) : {}
  } catch {
    out({ ok: false, message: 'bad request json' })
    process.exitCode = 2
    return
  }

  try {
    switch (request.op) {
      case 'providers': {
        out({ ok: true, ...readProviders() })
        return
      }
      case 'get': {
        const db = openState()
        const row = getSelection(db, String(request.sessionId ?? ''))
        db.close()
        out({ ok: true, selection: row })
        return
      }
      case 'set': {
        const db = openState()
        const row = setSelection(db, {
          sessionId: String(request.sessionId ?? ''),
          providerId: String(request.providerId ?? ''),
          providerName: String(request.providerName ?? ''),
          model: request.model ? String(request.model) : null,
        })
        db.close()
        out({ ok: true, selection: row })
        return
      }
      case 'history': {
        const db = openState()
        const rows = db
          .prepare('select session_id, from_provider, to_provider, model, at from switches order by id desc limit ?')
          .all(Number(request.limit ?? 20))
        db.close()
        out({ ok: true, history: rows })
        return
      }
      default:
        out({ ok: false, message: `unknown op "${request.op}"` })
        process.exitCode = 2
    }
  } catch (error) {
    out({ ok: false, message: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  }
}

main()
