import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = join(root, 'contracts/openapi/eiams-v1.openapi.json')
const provenancePath = join(root, 'contracts/openapi/eiams-v1.provenance.json')
const evidencePath = join(root, 'contracts/openapi/eiams-v1.validation-evidence.json')
const tmpA = join(root, 'node_modules/.tmp/contract-gen-a.ts')
const tmpB = join(root, 'node_modules/.tmp/contract-gen-b.ts')

const results = {}
const canonicalizeSnapshotBytes = (bytes) =>
  Buffer.from(bytes.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8')
const run = async (name, fn) => {
  try {
    results[name] = { status: 'pass', ...(await fn()) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results[name] = { status: 'fail', message }
  }
  console.log(`[${results[name].status === 'pass' ? 'PASS' : 'FAIL'}] ${name}`)
  if (results[name].status === 'fail') console.log(`       ${results[name].message}`)
}

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'))

await run('checksum matches provenance', async () => {
  const bytes = await readFile(snapshotPath)
  const actual = createHash('sha256').update(canonicalizeSnapshotBytes(bytes)).digest('hex')
  if (actual !== provenance.sha256) {
    throw new Error(`Expected ${provenance.sha256}, received ${actual}.`)
  }
  return { expected: provenance.sha256, actual }
})

await run('reference audit', async () => {
  const refs = []
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.$ref === 'string') {
      if (!node.$ref.startsWith('#/')) {
        throw new Error(`non-local $ref '#/...' expected but found "${node.$ref}" at ${path}`)
      }
      refs.push({ ref: node.$ref, at: path })
      return
    }
    for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`)
  }
  walk(snapshot, 'root')

  const missing = refs
    .map(({ ref, at }) => {
      const segments = ref.slice(2).split('/').map(decodeURIComponent)
      let node = snapshot
      for (const segment of segments) {
        node = node?.[segment]
        if (node === undefined) break
      }
      return node === undefined ? { ref, at } : null
    })
    .filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`missing references: ${missing.map((m) => m.ref).join(', ')}`)
  }
  return { refCount: refs.length, missing: 0 }
})

await run('duplicate operationIds', async () => {
  const seen = new Map()
  for (const [path, item] of Object.entries(snapshot.paths)) {
    for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']) {
      const operation = item?.[method]
      if (!operation) continue
      const operationId = operation.operationId
      if (!operationId) {
        throw new Error(`missing operationId on ${method.toUpperCase()} ${path}`)
      }
      if (seen.has(operationId)) {
        throw new Error(
          `duplicate operationId "${operationId}" (${seen.get(operationId)} and ${method.toUpperCase()} ${path})`,
        )
      }
      seen.set(operationId, `${method.toUpperCase()} ${path}`)
    }
  }
  return { operationCount: seen.size, duplicates: 0 }
})

await run('coverage matches provenance', async () => {
  const pathCount = Object.keys(snapshot.paths).length
  let operationCount = 0
  for (const item of Object.values(snapshot.paths)) {
    for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']) {
      if (item?.[method]) operationCount += 1
    }
  }
  const schemaCount = Object.keys(snapshot.components?.schemas ?? {}).length
  const expected = provenance.coverage
  return { pathCount, operationCount, schemaCount, expected }
})

await run('redocly lint (zero warnings)', async () => {
  const { status, stdout, stderr } = spawnSync(
    'pnpm exec redocly lint contracts/openapi/eiams-v1.openapi.json',
    { cwd: root, encoding: 'utf8', shell: true },
  )
  const output = `${stdout ?? ''}\n${stderr ?? ''}`.replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (status !== 0 || /warnings?/i.test(output)) {
    throw new Error(output || `redocly exited with ${status}`)
  }
  return { output: output.split('\n').slice(-1).join(' ').trim() }
})

await run('deterministic type generation', async () => {
  const generate = () =>
    spawnSync('pnpm exec openapi-typescript contracts/openapi/eiams-v1.openapi.json', {
      cwd: root,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    })
  const first = generate()
  if (first.status !== 0) throw new Error(first.stderr || 'generation failed')
  const second = generate()
  if (second.status !== 0) throw new Error(second.stderr || 'generation failed')

  await writeFile(tmpA, first.stdout)
  await writeFile(tmpB, second.stdout)
  const hashA = createHash('sha256').update(first.stdout).digest('hex')
  const hashB = createHash('sha256').update(second.stdout).digest('hex')
  if (hashA !== hashB) throw new Error('two consecutive generations differ')
  return { lines: first.stdout.split('\n').length, byteHash: hashA }
})

const redoclyVersion = JSON.parse(
  await readFile(join(root, 'node_modules/@redocly/cli/package.json'), 'utf8'),
).version
const openapiTypescriptVersion = JSON.parse(
  await readFile(join(root, 'node_modules/openapi-typescript/package.json'), 'utf8'),
).version
await writeFile(
  evidencePath,
  JSON.stringify(
    {
      contractId: provenance.contractId,
      contractVersion: snapshot.info?.version ?? provenance.contractVersion,
      snapshotSha256: provenance.sha256,
      reportedAt: new Date().toISOString(),
      tooling: {
        redoclyCli: redoclyVersion,
        openapiTypescript: openapiTypescriptVersion,
      },
      results,
      note: 'Pre-ratification validation battery. Ratification itself requires the backend/API owner review recorded by Beads eiams-frontend-e01.7.',
    },
    null,
    2,
  ),
)

console.log(`\nevidence written to contracts/openapi/eiams-v1.validation-evidence.json`)
await rm(tmpA, { force: true })
await rm(tmpB, { force: true })

const failures = Object.values(results).filter((r) => r.status === 'fail').length
if (failures > 0) process.exitCode = 1
