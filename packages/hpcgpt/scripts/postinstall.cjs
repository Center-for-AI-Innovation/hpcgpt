#!/usr/bin/env node
const { spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

if (process.env.CI === "true" || process.env.HPCGPT_SKIP_POSTINSTALL === "1") process.exit(0)

function defaultOpencodePath() {
  if (process.platform === "win32") return null
  const home = process.env.HOME || "/tmp"
  return path.join(home, ".opencode", "bin", "opencode")
}

const existing = process.env.OPENCODE_BIN_PATH || defaultOpencodePath()
if (existing && fs.existsSync(existing)) process.exit(0)

if (process.platform === "win32") {
  console.log("[hpcgpt] Please install opencode manually for Windows: https://opencode.ai/install")
  process.exit(0)
}

console.log("[hpcgpt] Installing opencode (one-time)...")
const res = spawnSync("bash", ["-lc", "curl -fsSL https://opencode.ai/install | bash"], {
  stdio: "inherit",
})
if (res.status !== 0) {
  console.warn("[hpcgpt] opencode install failed; install later via curl -fsSL https://opencode.ai/install | bash")
  process.exit(0)
}
console.log("[hpcgpt] opencode installed.")


