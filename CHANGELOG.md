# Changelog

## [0.1.4] - 2026-11-06

- the model is applied through `/model` first: the config row accepts a value but does not move the running session, so it is now only the fallback

## [0.1.3] - 2026-11-06

- a switch made from the pane now writes its result into the transcript and the toast, so a failed model change is visible instead of silent

## [0.1.2] - 2026-11-06

- `/provider model [<id>]` sets the model without opening the picker: config first, `/model` as fallback
- switching a provider uses the same path, so a stale picker can no longer hand over the wrong model

## [0.1.1] - 2026-11-06

- `/provider env` prints the variables the running process actually holds
- a failed model switch now says the `/model` picker still lists the previous provider

## [0.1.0] - 2026-11-05

- `/provider` menu, `list` and name switch for the current session
- Reads providers from cc-switch's SQLite database, read-only
- Applies env live through `$.env.set`; unset keys the new provider omits
- Per-session state in `~/.provider-switch/state.db`, restored on resume
- `/provider` pane and status line
