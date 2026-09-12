# tokenlawn

```bash
npx tokenlawn
```

Scans local AI coding tool histories and renders a contribution lawn. This default local command makes no network requests. Use `npx tokenlawn publish` to explicitly sign in and publish normalized totals.

Supported histories are detected through the pinned, MIT-licensed `ccusage` collector. TokenLawn uploads no prompts, responses, code, repository names, file paths, commands, or raw sessions.

## Hermes (experimental)

TokenLawn uses ccusage 20.0.20's Hermes daily report because its session report omits dates. It reads the local `$HERMES_HOME/state.db` (default `~/.hermes/state.db`); for a remote gateway, run TokenLawn on that server with the same Hermes profile environment. There is no gateway API import.

**Dates are session start dates.** A session started September 10 and continued September 11–12 has all its usage assigned to September 10. Continued usage updates that day's total on the next publish. Total token counts are usable, but daily distribution, active days, streaks, and biggest-day statistics may be inaccurate. The CLI prints this limitation whenever Hermes records are present, including when exporting JSON or SVG. These remain self-reported, unverified totals.

Hermes publishing sends daily model snapshots each time; the server replaces changed totals and ignores unchanged ones. Publish a given history from one machine with a consistent `HERMES_HOME` and timezone. Snapshot identities include a hash of the machine and configured roots: separate machines do not overwrite one another, but publishing copies of the same history from different machines or root configurations can count it twice. Removing a whole day or model from the local database does not delete previously published records. Self-reported daily publishing limits still apply, including when long sessions concentrate usage on one day.

Deploy the server's Hermes snapshot-update support before releasing this CLI change. Older servers only accept the first version of each snapshot and cannot update its totals.

Commands: `scan`, `login`, `publish`, `status`, `providers`, and `logout`. Publishing sends only new local usage by default; use `tokenlawn publish --full` to reconcile all local history. `logout` revokes the server-side device when reachable and rotates the local device identity. Run `tokenlawn --help` for options.
