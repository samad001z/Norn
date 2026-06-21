# Contributing to Norn

Thanks for your interest in improving Norn. This is an early project, so issues,
ideas, and pull requests are all welcome.

## Development setup

Requires Node 20+.

```bash
git clone https://github.com/samad001z/Norn.git
cd Norn
npm install
npm run build
```

## Layout

Norn is an npm-workspaces monorepo:

- `core/` (`@samad001z/norn-core`) — the storage engine: SQLite + sqlite-vec behind a `Storage`
  interface, with a swappable `Embedder`. Has unit tests.
- `server/` (`@samad001z/norn-server`) — the MCP server (`remember`, `recall`, `forget`, `list`).
- `web/` (`@samad001z/norn-web`) — the Next.js dashboard and marketing landing.

## Workflow

```bash
npm run build              # builds core, then server, then web
npm test -w @samad001z/norn-core     # unit tests (node:test via tsx)
npm run typecheck          # type-check every package
```

- Keep pull requests focused: one concern per PR.
- Match the surrounding code style (TypeScript, the existing formatting and naming).
- Write clear, descriptive commit messages.
- If you change behavior in `core`, add or update a test.

## Before opening a pull request

- `npm run build` passes.
- `npm test -w @samad001z/norn-core` passes.
- Describe what changed and why.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
