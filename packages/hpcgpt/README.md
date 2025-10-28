<p align="center">
  <img src="favicon.png" alt="hpcGPT" width="640" />
</p>

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Tech](https://img.shields.io/badge/AI-Opencode%20Agent%20%7C%20MCP%20Servers%20%7C%20Slurm%20%7C%20Illinois%20Chat-blueviolet)

hpcGPT is a single-command CLI that launches an Opencode-based TUI preconfigured for HPC centers, with local MCP servers for Slurm and Illinois Chat docs.

## Install

```bash
npm i -g hpcgpt@0.1.0
```

## Configure

Set environment variables for your providers and tools:

```bash
export NCSA_LLM_URL="https://<your-hosted-llm>"
export NCSA_OLLAMA_URL="http://<your-ollama>"
export ILLINOIS_CHAT_API_KEY="<your-key>"
```

Optional (Atlassian MCP in the future): see `example.env.atlassian` for reference.

## Run

```bash
hpcgpt
```

- The launcher injects this package's `opencode.jsonc` and an MCP overlay.
- Local MCPs started:
  - `slurm-mcp-server` (sinfo, squeue, scontrol, accounts)
  - `illinois-chat-server` (delta-docs, delta-ai-docs)

## Commands

- Report: use the `report` command in the TUI to guide the agent to create a support report.

## What’s included

- `opencode.jsonc`: providers (`ncsahosted`, `ncsaollama`), models, MCP wiring, and `command.report`.
- `mcp_servers/*`: local MCP servers compiled at install/build time.
- `prompts/`: prompt content for the support agent.

## Development

Build MCP servers:

```bash
bun run -C packages/hpcgpt build
```

Build platform packages (CI recommended):

```bash
HPCGPT_VERSION=0.1.0 bun run -C packages/hpcgpt build:dist
```

Publish (order matters):

```bash
# 1) per-platform packages under packages/hpcgpt/dist/hpcgpt-*
for d in packages/hpcgpt/dist/hpcgpt-*; do (cd "$d" && npm publish --access public); done
# 2) meta package
(cd packages/hpcgpt && npm publish --access public)
```

## Environment

- `NCSA_LLM_URL` – Base URL for NCSA Hosted provider
- `NCSA_OLLAMA_URL` – Base URL for NCSA Ollama provider
- `ILLINOIS_CHAT_API_KEY` – API key for Illinois Chat docs tools

## License

MIT – see `LICENSE`.

