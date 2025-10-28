#!/usr/bin/env node

import { fileURLToPath } from "url"
import path from "path"
import { spawn } from "child_process"
import fs from "fs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(cliRoot, "..")

function resolveMcp(name) {
  return path.join(cliRoot, "mcp_servers", name, "dist", "index.js")
}

const slurmPath = resolveMcp("slurm_mcp_server")
const illinoisPath = resolveMcp("illinois_chat_server")

const cfg = path.join(cliRoot, "opencode.jsonc")

const overlay = {
  mcp: {
    "slurm-mcp-server": {
      type: "local",
      command: [process.execPath, slurmPath],
      enabled: true,
    },
    "illinois-chat-server": {
      type: "local",
      command: [process.execPath, illinoisPath],
      enabled: true,
    },
    // Disable MCP entries that are not shipped in this package
    "report-server": {
      enabled: false,
    },
    "atlassian-mcp-server": {
      enabled: false,
    },
  },
}

if (!fs.existsSync(slurmPath)) {
  console.error(`[hpcgpt] Missing MCP server: ${slurmPath}`)
}
if (!fs.existsSync(illinoisPath)) {
  console.error(`[hpcgpt] Missing MCP server: ${illinoisPath}`)
}

process.env.OPENCODE_CONFIG = cfg
process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(overlay)
process.env.OPENCODE_DISABLE_AUTOUPDATE = "1"

function detect(os, arch) {
  const mapOS = os === "win32" ? "windows" : os
  const mapArch = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch
  return `opencode-${mapOS}-${mapArch}`
}

function localBin() {
  const name = detect(process.platform, process.arch)
  const p = path.join(repoRoot, "packages", "opencode", "dist", name, "bin", process.platform === "win32" ? "opencode.exe" : "opencode")
  return fs.existsSync(p) ? p : null
}

function bunPath() {
  const b = process.env.BUN || "bun"
  return b
}

function run(cmd, args) {
  const child = spawn(cmd, args, { stdio: "inherit" })
  child.on("exit", (code, sig) => {
    if (sig) process.kill(process.pid, sig)
    process.exit(code ?? 0)
  })
  child.on("error", (e) => {
    console.error("[hpcgpt] failed:", e?.message || String(e))
    process.exit(1)
  })
}

function main() {
  const args = process.argv.slice(2)
  const bin = localBin()
  if (bin) {
    run(bin, args)
    return
  }

  const bun = bunPath()
  const opencodeEntry = path.join(repoRoot, "packages", "opencode", "src", "index.ts")
  if (fs.existsSync(opencodeEntry)) {
    run(bun, ["run", opencodeEntry, ...args])
    return
  }

  const fallback = process.env.OPENCODE_BIN_PATH || "opencode"
  run(fallback, args)
}

main()


