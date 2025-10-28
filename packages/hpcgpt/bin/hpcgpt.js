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

// We no longer distribute platform packages on npm. Prefer a previously installed binary in cache.
function cacheBinaryPath() {
  const dir = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || __dirname, "AppData", "Local"), "hpcgpt", "bin")
    : path.join(process.env.XDG_DATA_HOME || path.join(process.env.HOME || "/tmp", ".local", "share"), "hpcgpt", "bin")
  return path.join(dir, process.platform === "win32" ? "hpcgpt.exe" : "hpcgpt")
}

async function ensureCachedBinary() {
  const bin = cacheBinaryPath()
  try {
    await fs.promises.mkdir(path.dirname(bin), { recursive: true })
  } catch {}
  if (fs.existsSync(bin)) return bin
  const { os, arch } = mapPlatform()
  const version = getPackageVersion()
  const fileName = `hpcgpt-${os}-${arch}` + (os === "windows" ? ".exe" : ".bin")
  const url = `https://github.com/Center-for-AI-Innovation/hpcgpt/releases/download/v${version}/${fileName}`
  await download(url, bin)
  if (process.platform !== "win32") await fs.promises.chmod(bin, 0o755)
  return bin
}

function getPackageVersion() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pj = JSON.parse(fs.readFileSync(path.join(cliRoot, "package.json"), "utf8"))
    return pj.version || "latest"
  } catch {
    return "latest"
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const https = require("https")
    const file = fs.createWriteStream(dest)
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // redirect
          return download(res.headers.location, dest).then(resolve, reject)
        }
        if (res.statusCode !== 200) {
          file.close(() => fs.unlink(dest, () => {}))
          return reject(new Error(`download failed ${res.statusCode}: ${url}`))
        }
        res.pipe(file)
        file.on("finish", () => file.close(resolve))
      })
      .on("error", (err) => {
        file.close(() => fs.unlink(dest, () => {}))
        reject(err)
      })
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

  // Prefer cached installed binary from releases
  const cached = cacheBinaryPath()
  if (fs.existsSync(cached)) {
    run(cached, args)
    return
  }

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

  // Attempt to download and cache our platform binary from GitHub Releases
  ensureCachedBinary()
    .then((bin) => run(bin, args))
    .catch(() => {
      // As last resort, fall back to opencode if present
      const fallback = process.env.OPENCODE_BIN_PATH || "opencode"
      run(fallback, args)
    })
}

main()


