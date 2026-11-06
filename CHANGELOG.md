# Changelog

## [0.1.1] - 2026-11-06

- `/provider env` prints the variables the running process actually holds
- a failed model switch now says the `/model` picker still lists the previous provider

## [0.1.0] - 2026-11-05

- `/provider` menu, `list` and name switch for the current session
- Reads providers from cc-switch's SQLite database, read-only
- Applies env live through `$.env.set`; unset keys the new provider omits
- Per-session state in `~/.provider-switch/state.db`, restored on resume
- `/provider` pane and status line
