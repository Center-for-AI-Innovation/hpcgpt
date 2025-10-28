<p align="center">
  <img src="favicon.png" alt="hpcGPT" width="640" />
</p>

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Tech](https://img.shields.io/badge/AI-Opencode%20Agent%20%7C%20MCP%20Servers%20%7C%20Slurm%20%7C%20Illinois%20Chat-blueviolet)

hpcGPT is a single-command CLI that launches an Opencode-based TUI preconfigured for HPC centers, with local MCP servers for Slurm and Illinois Chat docs.

## Install

```bash
npm i -g hpcgpt
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

## Development (for maintainers)

Build MCP servers locally (optional):

```bash
(cd packages/hpcgpt && bun run build)
```

Releases and platform packaging are handled automatically by GitHub Actions when you push a tag (vX.Y.Z).

## Environment

- `NCSA_LLM_URL` – Base URL for NCSA Hosted provider
- `NCSA_OLLAMA_URL` – Base URL for NCSA Ollama provider
- `ILLINOIS_CHAT_API_KEY` – API key for Illinois Chat docs tools

## License

MIT – see `LICENSE`.

