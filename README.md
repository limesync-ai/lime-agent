<p align="center">
  <a href="https://pi.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://pi.dev/logo.svg">
      <source media="(prefers-color-scheme: light)" srcset="https://huggingface.co/buckets/julien-c/my-training-bucket/resolve/pi-logo-dark.svg">
      <img alt="pi logo" src="https://pi.dev/logo.svg" width="128">
    </picture>
  </a>
</p>
<p align="center">
  <a href="https://discord.com/invite/3cU7Bz4UPx"><img alt="Discord" src="https://img.shields.io/badge/discord-community-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://github.com/badlogic/pi-mono/actions/workflows/ci.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/badlogic/pi-mono/ci.yml?style=flat-square&branch=main" /></a>
</p>
<p align="center">
  <a href="https://pi.dev">pi.dev</a> domain graciously donated by
  <br /><br />
  <a href="https://exe.dev"><img src="packages/coding-agent/docs/images/exy.png" alt="Exy mascot" width="48" /><br />exe.dev</a>
</p>

> New issues and PRs from new contributors are auto-closed by default. Maintainers review auto-closed issues daily. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

# Pi Monorepo

> **Looking for the pi coding agent?** See **[packages/coding-agent](packages/coding-agent)** for installation and usage.

Tools for building AI agents. Requires **Node.js >= 20**.

All packages use **lockstep versioning** — every package always shares the same version number. A patch bumps all packages; a minor bumps all packages.

## Share your OSS coding agent sessions

If you use pi or other coding agents for open source work, please share your sessions.

Public OSS session data helps improve coding agents with real-world tasks, tool use, failures, and fixes instead of toy benchmarks.

For the full explanation, see [this post on X](https://x.com/badlogicgames/status/2037811643774652911).

To publish sessions, use [`badlogic/pi-share-hf`](https://github.com/badlogic/pi-share-hf). Read its README.md for setup instructions. All you need is a Hugging Face account, the Hugging Face CLI, and `pi-share-hf`.

You can also watch [this video](https://x.com/badlogicgames/status/2041151967695634619), where I show how I publish my `pi-mono` sessions.

I regularly publish my own `pi-mono` work sessions here:

- [badlogicgames/pi-mono on Hugging Face](https://huggingface.co/datasets/badlogicgames/pi-mono)

## Architecture overview

```
tui ──> ai ──> agent ──> coding-agent
web-ui (standalone)
```

- **[@mariozechner/pi-tui](packages/tui)** — Terminal UI library with differential rendering. No runtime dependencies on other pi packages.
- **[@mariozechner/pi-ai](packages/ai)** — Unified multi-provider LLM API. Depends on `pi-tui` for its interactive model selection prompt.
- **[@mariozechner/pi-agent-core](packages/agent)** — Stateful agent runtime with tool calling, event streaming, and steering/follow-up. Built on `pi-ai`.
- **[@mariozechner/pi-coding-agent](packages/coding-agent)** — Interactive coding agent CLI. Built on `pi-agent-core`.
- **[@mariozechner/pi-web-ui](packages/web-ui)** — Standalone web components for AI chat interfaces. Does not depend on any other pi package.

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| **[@mariozechner/pi-tui](packages/tui)** | [![npm version](https://img.shields.io/npm/v/@mariozechner/pi-tui?style=flat-square)](https://www.npmjs.com/package/@mariozechner/pi-tui) | Terminal UI library with differential rendering, virtualized lists, and keybindings |
| **[@mariozechner/pi-ai](packages/ai)** | [![npm version](https://img.shields.io/npm/v/@mariozechner/pi-ai?style=flat-square)](https://www.npmjs.com/package/@mariozechner/pi-ai) | Unified multi-provider LLM API (OpenAI, Anthropic, Google, Bedrock, GitHub Copilot, and more) |
| **[@mariozechner/pi-agent-core](packages/agent)** | [![npm version](https://img.shields.io/npm/v/@mariozechner/pi-agent-core?style=flat-square)](https://www.npmjs.com/package/@mariozechner/pi-agent-core) | Agent runtime with tool calling, event streaming, steering, and follow-up |
| **[@mariozechner/pi-coding-agent](packages/coding-agent)** | [![npm version](https://img.shields.io/npm/v/@mariozechner/pi-coding-agent?style=flat-square)](https://www.npmjs.com/package/@mariozechner/pi-coding-agent) | Interactive coding agent CLI with file editing, bash, and project-aware tooling |
| **[@mariozechner/pi-web-ui](packages/web-ui)** | [![npm version](https://img.shields.io/npm/v/@mariozechner/pi-web-ui?style=flat-square)](https://www.npmjs.com/package/@mariozechner/pi-web-ui) | Standalone web components for building AI chat interfaces |

## Extensions

| Package | Version | Description |
|---------|---------|-------------|
| **[@eko24ive/pi-ask](pi-ask)** | [![npm version](https://img.shields.io/npm/v/@eko24ive/pi-ask?style=flat-square)](https://www.npmjs.com/package/@eko24ive/pi-ask) | Ask tool that lets the agent pause, ask structured questions in the terminal UI, and continue with normalized answers instead of guessing |

Install with `pi install npm:@eko24ive/pi-ask`.

## Chat bot workflows

For Slack/chat automation, see [earendil-works/pi-chat](https://github.com/earendil-works/pi-chat).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./pi-test.sh         # Run pi from sources (can be run from any directory)
```

> **Note:** `npm run check` requires `npm run build` to be run first. The web-ui package uses `tsc` which needs compiled `.d.ts` files from dependencies.

## License

MIT
