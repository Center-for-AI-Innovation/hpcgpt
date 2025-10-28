#!/usr/bin/env bun
const dir = new URL("..", import.meta.url).pathname
process.chdir(dir)
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import pkg from "../package.json"

await $`rm -rf dist && mkdir -p dist`

// Build opencode binaries first
await $`bun run ../opencode/script/build.ts`

const opencodeDist = path.join(process.cwd(), "../opencode/dist")
const entries = await fs.readdir(opencodeDist)

const version = process.env["HPCGPT_VERSION"] ?? "dev"
for (const name of entries) {
  if (!name.startsWith("opencode-")) continue
  const target = name.replace(/^opencode-/, `${pkg.name}-`)
  const srcBin = path.join(opencodeDist, name, "bin", process.platform === "win32" ? "opencode.exe" : "opencode")
  const dstDir = path.join(process.cwd(), "dist", target, "bin")
  const dstBin = path.join(dstDir, process.platform === "win32" ? "hpcgpt.exe" : "hpcgpt")
  await fs.mkdir(dstDir, { recursive: true })
  await fs.copyFile(srcBin, dstBin)
  await fs.chmod(dstBin, 0o755)
  await fs.writeFile(
    path.join(process.cwd(), "dist", target, "package.json"),
    JSON.stringify(
      {
        name: target,
        version,
        os: [name.includes("windows") ? "win32" : name.includes("linux") ? "linux" : "darwin"],
        cpu: [name.includes("arm64") ? "arm64" : "x64"],
      },
      null,
      2,
    ),
  )
}


