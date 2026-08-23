#!/usr/bin/env node
/**
 * DevTools-MCP CLI harness for browser QA (EIAMS).
 *
 * Wraps the chrome-devtools-mcp server (a devDependency) behind simple one-shot
 * CLI commands so QA agents can drive a real Chrome instance without managing
 * MCP sessions by hand.
 *
 * Architecture:
 *   1. `ensure-browser` launches Chrome once with a dedicated profile dir and a
 *      CDP endpoint (--remote-debugging-port), recorded in qa-artifacts/browser/cdp-port.json.
 *   2. Every other command spawns a short-lived MCP server process
 *      (`--serve-stdio`) bound to that live endpoint via `browserUrl`, speaks
 *      newline-delimited JSON-RPC over its stdio (initialize handshake +
 *      tools/call), prints the tool's text content, and exits.
 *
 * This keeps page state alive across invocations (persistent Chrome) while each
 * command stays stateless and deterministic.
 *
 * Usage:
 *   node scripts/qa/devtools-mcp.mjs ensure-browser [--port 9223] [--headed] [--force]
 *   node scripts/qa/devtools-mcp.mjs navigate <url>
 *   node scripts/qa/devtools-mcp.mjs snapshot
 *   node scripts/qa/devtools-mcp.mjs screenshot <name> [--full] [--uid <uid>]
 *   node scripts/qa/devtools-mcp.mjs click --uid <uid>
 *   node scripts/qa/devtools-mcp.mjs fill --uid <uid> --value <text>
 *   node scripts/qa/devtools-mcp.mjs form --json '<{"uid":"value",...}>'
 *   node scripts/qa/devtools-mcp.mjs press --key Enter
 *   node scripts/qa/devtools-mcp.mjs hover --uid <uid>
 *   node scripts/qa/devtools-mcp.mjs wait-for "<text>" [--timeout-ms 10000]
 *   node scripts/qa/devtools-mcp.mjs eval "<js function expression>"
 *   node scripts/qa/devtools-mcp.mjs console | requests [--filter substring]
 *   node scripts/qa/devtools-mcp.mjs resize --width 1440 --height 900
 *   node scripts/qa/devtools-mcp.mjs pages | select-page N | new-page <url> | close-page
 *
 * Artifacts: qa-artifacts/browser/ (gitignored).
 */

import { spawn } from 'node:child_process'
import { accessSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), '..', '..')
/**
 * Screenshots (review evidence) live under the gitignored qa-artifacts/ tree;
 * browser RUNTIME state (profile, CDP endpoint record) must stay OUTSIDE the
 * repository — a live Chrome profile churns locked cache files that crash the
 * Vite watcher on Windows (EBUSY) when they sit inside the watched root.
 */
const ART_DIR = path.join(repoRoot, 'qa-artifacts', 'browser')
const RUN_DIR = path.join(os.tmpdir(), 'eiams-qa-browser')
const PORT_FILE = path.join(RUN_DIR, 'cdp-port.json')
const DEFAULT_PORT = 9223
const PROTOCOL_VERSION = '2024-11-05'

function parseArgs(argv) {
  const args = {}
  const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        args[key] = true
      } else {
        args[key] = next
        i += 1
      }
    } else {
      positional.push(arg)
    }
  }
  return { args, positional }
}

function findChromeExecutable() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : null,
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      accessSync(candidate)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

async function isEndpointAlive(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`)
    return response.ok
  } catch {
    return false
  }
}

async function waitForEndpoint(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (await isEndpointAlive(port)) return
    await new Promise((resolve) => setTimeout(resolve, 400))
    lastError = new Error('endpoint not ready yet')
  }
  throw new Error(`Chrome DevTools endpoint did not become ready on port ${port}: ${lastError.message}`)
}

async function ensureBrowser(args) {
  mkdirSync(ART_DIR, { recursive: true })
  let port = args.port ? Number(args.port) : DEFAULT_PORT

  if (!args.force && existsSync(PORT_FILE)) {
    try {
      const previous = JSON.parse(readFileSync(PORT_FILE, 'utf8'))
      if (previous.port && (await isEndpointAlive(previous.port))) {
        console.log(JSON.stringify({ ok: true, reused: true, port: previous.port }))
        return
      }
    } catch {
      // unreadable state file — relaunch below
    }
  }

  const executablePath = findChromeExecutable()
  mkdirSync(RUN_DIR, { recursive: true })
  const userDataDir = path.join(RUN_DIR, 'chrome-profile')
  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    ...(args.headed ? [] : ['--headless=new']),
    'about:blank',
  ]
  if (!executablePath) {
    throw new Error('Chrome executable not found; pass one via CHROME_PATH or install Google Chrome.')
  }

  const child = spawn(executablePath, chromeArgs, { detached: true, stdio: 'ignore' })
  child.unref()
  try {
    await waitForEndpoint(port)
  } catch (error) {
    throw new Error(`Failed to launch Chrome (${executablePath}): ${error.message}`)
  }
  writeFileSync(PORT_FILE, JSON.stringify({ port, pid: child.pid ?? null }, null, 2))
  console.log(JSON.stringify({ ok: true, launched: true, port, executablePath }))
}

/** Runs one MCP tool call against a fresh stdio server bound to the live endpoint. */
function callToolOnce(port, toolName, toolArgs, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, '--serve-stdio', String(port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let buffer = ''
    let settled = false
    const pending = new Map()
    let nextId = 1

    const timer = setTimeout(() => finish(new Error(`MCP tool "${toolName}" timed out after ${timeoutMs}ms`)), timeoutMs)

    function finish(error, content) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // already gone
      }
      if (error) reject(error)
      else resolve(content ?? [])
    }

    function send(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    function request(method, params) {
      const id = nextId
      nextId += 1
      return new Promise((res, rej) => {
        pending.set(id, { res, rej })
        send({ jsonrpc: '2.0', id, method, params })
      })
    }

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) {
          handleMessage(line)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })

    child.stderr.on('data', (chunk) => {
      // Surface server-side errors only when we are still waiting.
      if (!settled) {
        const text = chunk.toString('utf8').trim()
        if (text.length > 0) {
          stderrTail.push(text)
          if (stderrTail.length > 20) stderrTail.shift()
        }
      }
    })
    const stderrTail = []

    function handleMessage(line) {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return // non-JSON noise on stdout
      }
      if (message.id === undefined || message.id === null) return // notification
      const pendingCall = pending.get(message.id)
      if (!pendingCall) return
      pending.delete(message.id)
      if (message.error) {
        pendingCall.rej(new Error(message.error.message ?? JSON.stringify(message.error)))
      } else {
        pendingCall.res(message.result)
      }
    }

    child.on('error', (error) => finish(new Error(`MCP server process failed: ${error.message}`)))
    child.on('exit', (code) => {
      if (!settled) {
        const stderrText = stderrTail.join('\n')
        finish(new Error(`MCP server exited early (code ${code}).${stderrText ? `\nstderr:\n${stderrText.slice(-2000)}` : ''}`))
      }
    })

    ;(async () => {
      const initialized = await request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'eiams-devtools-mcp-harness', version: '1.0.0' },
      })
      const serverInfo = initialized?.serverInfo?.name ?? 'chrome-devtools-mcp'
      send({ jsonrpc: '2.0', method: 'notifications/initialized' })

      const result = await request('tools/call', { name: toolName, arguments: toolArgs })
      if (result?.isError) {
        const text = (result.content ?? [])
          .map((part) => part.text ?? '')
          .join('\n')
        finish(new Error(`Tool "${toolName}" failed:\n${text}`))
        return
      }
      console.error(`[mcp:${serverInfo}]`)
      finish(null, result?.content ?? [])
    })().catch((error) => finish(error))
  })
}

async function readRecordedPort() {
  if (!existsSync(PORT_FILE)) {
    throw new Error('No Chrome endpoint recorded. Run first: node scripts/qa/devtools-mcp.mjs ensure-browser')
  }
  const state = JSON.parse(readFileSync(PORT_FILE, 'utf8'))
  if (!state.port || !(await isEndpointAlive(state.port))) {
    throw new Error('Recorded Chrome endpoint is dead. Re-run: node scripts/qa/devtools-mcp.mjs ensure-browser')
  }
  return state.port
}

/** Resolves the MCP SDK's stdio transport from chrome-devtools-mcp's dependency tree. */
async function loadStdioTransport() {
  const { createRequire } = await import('node:module')
  const nodeRequire = createRequire(scriptPath)
  const candidates = []
  try {
    const pkgDir = path.dirname(nodeRequire.resolve('chrome-devtools-mcp/package.json'))
    candidates.push(
      path.join(pkgDir, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'server', 'stdio.js'),
    )
    const pnpmRoot = path.join(repoRoot, 'node_modules', '.pnpm')
    if (existsSync(pnpmRoot)) {
      const { readdirSync } = await import('node:fs')
      for (const entry of readdirSync(pnpmRoot)) {
        if (entry.startsWith('@modelcontextprotocol+sdk@')) {
          candidates.push(
            path.join(pnpmRoot, entry, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'server', 'stdio.js'),
          )
        }
      }
    }
  } catch {
    // fall through to candidate probing
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const mod = await import(`file://${candidate.replace(/\\/g, '/')}`)
      if (mod.StdioServerTransport) return mod.StdioServerTransport
    }
  }
  throw new Error('MCP SDK stdio transport not found in pnpm store.')
}

/** Serves the MCP server over stdio for exactly one parent-driven session. */
async function serveStdio(port) {
  const mod = await import('chrome-devtools-mcp')
  const { server } = await mod.createMcpServer(
    {
      browserUrl: `http://127.0.0.1:${port}`,
      headless: false,
      isolated: false,
      channel: 'stable',
      // Declares the repo as the writable root so take_screenshot(filePath=…)
      // passes the server's workspace-root guard.
      workspaceRoot: repoRoot,
    },
    {},
  )
  const StdioServerTransport = await loadStdioTransport()
  await server.connect(new StdioServerTransport())
  // Parent kills this process when the tool call completes.
}

function printContent(content, max = 24000) {
  for (const part of content) {
    if (part.type === 'text') {
      const text = part.text
      console.log(text.length <= max ? text : `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`)
    } else if (part.type === 'image') {
      console.log('[inline image omitted]')
    } else {
      console.log(JSON.stringify(part).slice(0, max))
    }
  }
}

async function main() {
  const argv = process.argv.slice(2)

  // Internal mode: act as the one-shot MCP stdio server for the parent harness.
  if (argv[0] === '--serve-stdio') {
    await serveStdio(Number(argv[1]))
    return
  }

  const { args, positional } = parseArgs(argv)
  const command = positional[0]

  if (!command || command === 'help') {
    console.log(
      [
        'Commands:',
        '  ensure-browser [--port N] [--headed] [--force]',
        '  navigate <url>',
        '  snapshot',
        '  screenshot <name> [--full] [--uid <uid>]',
        '  click --uid <uid> | fill --uid <uid> --value <text> | hover --uid <uid>',
        "  form --json '<{\"uid\":\"value\",...}>'",
        '  press --key Enter',
        '  wait-for "<text>" [--timeout-ms 10000]',
        '  eval "<js arrow function>"',
        '  console | requests [--filter substring]',
        '  resize --width W --height H',
        '  pages | select-page N | new-page <url> | close-page',
      ].join('\n'),
    )
    return
  }

  if (command === 'ensure-browser') {
    await ensureBrowser(args)
    return
  }

  const port = await readRecordedPort()

  switch (command) {
    case 'navigate': {
      if (!positional[1]) throw new Error('navigate requires a URL')
      printContent(await callToolOnce(port, 'navigate_page', { url: positional[1] }))
      break
    }
    case 'snapshot': {
      printContent(await callToolOnce(port, 'take_snapshot', {}))
      break
    }
    case 'screenshot': {
      const name = (positional[1] ?? `shot-${Date.now()}`).replace(/[^\w.-]+/g, '-')
      // The MCP server's path guard only allows its own workspace roots
      // (always including os.tmpdir()), so stage the capture in a temp file
      // and move it into the gitignored qa-artifacts tree afterwards.
      const stagedPath = path.join(RUN_DIR, `${name}.png`)
      const content = await callToolOnce(port, 'take_screenshot', {
        filePath: stagedPath,
        format: 'png',
        fullPage: args.full === true,
        ...(args.uid ? { uid: args.uid } : {}),
      })
      mkdirSync(ART_DIR, { recursive: true })
      const { copyFileSync } = await import('node:fs')
      const finalPath = path.join(ART_DIR, `${name}.png`)
      copyFileSync(stagedPath, finalPath)
      console.log(`saved: ${finalPath}`)
      printContent(content.filter((part) => part.type === 'text'), 2000)
      break
    }
    case 'click': {
      if (!args.uid) throw new Error('click requires --uid')
      printContent(await callToolOnce(port, 'click', { uid: args.uid }))
      break
    }
    case 'fill': {
      if (!args.uid) throw new Error('fill requires --uid')
      printContent(await callToolOnce(port, 'fill', { uid: args.uid, value: String(args.value ?? '') }))
      break
    }
    case 'form': {
      if (!args.json) throw new Error("form requires --json '<{uid:value,...}>'")
      const fields = JSON.parse(String(args.json))
      printContent(await callToolOnce(port, 'fill_form', { fields }))
      break
    }
    case 'press': {
      printContent(await callToolOnce(port, 'press_key', { key: String(args.key ?? 'Enter') }))
      break
    }
    case 'hover': {
      if (!args.uid) throw new Error('hover requires --uid')
      printContent(await callToolOnce(port, 'hover', { uid: args.uid }))
      break
    }
    case 'wait-for': {
      const text = positional[1] ?? ''
      if (!text) throw new Error('wait-for requires text')
      const timeoutMs = Number(args['timeout-ms'] ?? 10000)
      const deadline = Date.now() + timeoutMs
      let found = false
      while (Date.now() < deadline) {
        // evaluate_script wraps results in a markdown fence — strip it.
        const content = await callToolOnce(port, 'evaluate_script', {
          function: `() => document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`,
        })
        const raw = content.map((part) => part.text ?? '').join('\n')
        found = /"?(true)"?/.test(raw.replace(/```[a-z]*\n?/g, '').trim())
        if (found) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      console.log(found ? `found: ${text}` : `NOT FOUND within ${timeoutMs}ms: ${text}`)
      if (!found) process.exitCode = 2
      break
    }
    case 'eval': {
      const expression = positional[1]
      if (!expression) throw new Error('eval requires a JS function string')
      printContent(await callToolOnce(port, 'evaluate_script', { function: expression }))
      break
    }
    case 'console': {
      printContent(await callToolOnce(port, 'list_console_messages', {}), 16000)
      break
    }
    case 'requests': {
      printContent(
        await callToolOnce(port, 'list_network_requests', {
          ...(args.filter ? { urlSubstring: String(args.filter) } : {}),
        }),
        16000,
      )
      break
    }
    case 'resize': {
      printContent(await callToolOnce(port, 'resize_page', { width: Number(args.width ?? 1440), height: Number(args.height ?? 900) }))
      break
    }
    case 'pages': {
      printContent(await callToolOnce(port, 'list_pages', {}))
      break
    }
    case 'select-page': {
      printContent(await callToolOnce(port, 'select_page', { pageIdx: Number(positional[1] ?? 0) }))
      break
    }
    case 'new-page': {
      if (!positional[1]) throw new Error('new-page requires a URL')
      printContent(await callToolOnce(port, 'new_page', { url: positional[1] }))
      break
    }
    case 'close-page': {
      printContent(await callToolOnce(port, 'close_page', {}))
      break
    }
    default:
      throw new Error(`Unknown command: ${command}`)
  }
}

main().catch((error) => {
  console.error(`[devtools-mcp] ${error.message}`)
  process.exit(1)
})
