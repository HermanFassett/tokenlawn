# tokenlawn

```bash
npx tokenlawn
```

Scans local AI coding tool histories and renders a contribution lawn. This default local command makes no network requests. Use `npx tokenlawn publish` to explicitly sign in and publish normalized totals.

Supported histories are detected through the pinned, MIT-licensed `ccusage` collector. TokenLawn uploads no prompts, responses, code, repository names, file paths, commands, or raw sessions.

Commands: `scan`, `login`, `publish`, `status`, `providers`, and `logout`. Publishing sends only new local usage by default; use `tokenlawn publish --full` to reconcile all local history. `logout` revokes the server-side device when reachable and rotates the local device identity. Run `tokenlawn --help` for options.
