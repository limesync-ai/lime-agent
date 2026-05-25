# Contributing

Thanks for contributing to `@eko24ive/pi-ask`.

## Development setup

Install dependencies:

```bash
pnpm install
```

Run the extension locally:

```bash
pi -e ./src/index.ts
```

## Validation

Before opening a pull request, run:

```bash
pnpm format
pnpm typecheck
pnpm test
```

You can also run the repo-wide check:

```bash
pnpm check
```

## Commit messages

This repo uses conventional commits and semantic-release.

Recommended flow:

```bash
pnpm commit
```

Examples:

- `feat: add preview question footer hint`
- `fix: preserve option notes when toggling selection`
- `docs: clarify npm install flow`

Conventional commit types matter because releases are generated automatically from commit history.

## Scope of changes

Please keep changes focused:

- state logic in plain TypeScript modules
- pi/TUI wiring thin
- tests updated when behavior changes materially
- docs updated when public behavior or usage changes materially

## Pull requests

A good pull request should include:

- a clear summary of the change
- tests for behavior changes
- docs updates when user-facing behavior changes
