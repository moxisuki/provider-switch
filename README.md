# provider-switch

![provider-switch](assets/hero.png)

**Switch the API provider of a running Claude Code session. No restart, no settings.json.**

```
/plugin install provider-switch --marketplace moxisuki/provider-switch
```

Requires Node 22.5+ (for `node:sqlite`), Claude Code 2.1.318+, and
[cc-switch](https://github.com/farion1231/cc-switch) as the provider list.

## Use

```
/provider            # TUI picker: arrows, Enter, Esc
/provider list       # plain table
/provider deepseek   # by name
```

The choice applies to the **next request**; history, tools and transcript stay. Under the prompt, the
hint line ends with what is active:

![prompt hint](assets/prompt-hint.png)

## How it works

Provider settings are environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY` /
`ANTHROPIC_AUTH_TOKEN`, the `ANTHROPIC_DEFAULT_*` aliases). The engine reads them per request, so the
mod rewrites them through `$.env.set` — including unsetting the keys the new provider does not name, so
a leftover `ANTHROPIC_API_KEY` cannot fight a new `ANTHROPIC_AUTH_TOKEN`.

| Where | What |
|---|---|
| cc-switch `cc-switch.db` | providers and the shared config, read **read-only** |
| `~/.provider-switch/state.db` | this mod's own store: the provider and model chosen per session id |
| `~/.claude/settings.json` | never written by this mod |

A resumed session restores its provider from the session id. Switching with `switchModel` on also runs
`/model <id>` — Claude Code records that as the default for new sessions, which is the engine's own
behaviour; turn `switchModel` off in `/config` to leave the model untouched.

## Limits

- Same protocol only: Anthropic Messages API. Bedrock, Vertex or a different API still needs a restart.
- Every key is spelled out in `hooks/lib/env.ts` — `$.env.set` accepts only string literals, so a
  variable cc-switch adds later is reported, not applied.
- In-flight requests finish on the old provider; prompt cache is lost once per switch.

## 中文

给运行中的 Claude Code 会话热切换 API 供应商：只读 cc-switch 的供应商列表，用 `$.env.set` 改进程环境，
下一条请求就换上游；不写 `settings.json`，选择按 session 记在自己的 SQLite 里。`/provider` 打开 TUI 选择器，
prompt 下方提示行末尾显示当前供应商和模型。

## License

MIT
