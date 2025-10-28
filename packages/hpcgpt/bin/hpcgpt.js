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

function mapPlatform() {
  const os = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch
  return { os, arch }
}

function defaultOpencodePath() {
  if (process.platform === "win32") return null
  const home = process.env.HOME || "/tmp"
  return path.join(home, ".opencode", "bin", "opencode")
}

function findOpencode() {
  const candidates = [
    process.env.OPENCODE_BIN_PATH,
    defaultOpencodePath(),
    "opencode",
  ].filter(Boolean)
  for (const c of candidates) {
    if (!c) continue
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c
      continue
    }
    // try PATH resolution by spawning
    try {
      const which = require("child_process").spawnSync(process.platform === "win32" ? "where" : "which", [c], { stdio: "pipe" })
      if (which.status === 0) return c
    } catch {}
  }
  return null
}

function installOpencode() {
  if (process.platform === "win32") return Promise.reject(new Error("Windows curl installer not supported"))
  return new Promise((resolve, reject) => {
    const { spawn } = require("child_process")
    const sh = spawn("bash", ["-lc", "curl -fsSL https://opencode.ai/install | bash"], { stdio: "inherit" })
    sh.on("exit", (code) => (code === 0 ? resolve(null) : reject(new Error("install failed"))))
    sh.on("error", reject)
  })
}

function localOpencodeBin() {
  const os = process.platform === "win32" ? "windows" : process.platform
  const arch = process.arch
  const mappedArch = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch
  const name = `opencode-${os}-${mappedArch}`
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

  // Prefer existing opencode binary (curl installer or PATH)
  const oc = findOpencode()
  if (oc) return run(oc, args)

  const bin = localOpencodeBin()
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

  // Install opencode via curl then run
  installOpencode()
    .then(() => {
      const next = findOpencode() || "opencode"
      run(next, args)
    })
    .catch(() => run("opencode", args))
}

main()


