import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openApiGenerationConfig } from './openapi-generation.config.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const openApiTypescriptCliPath = join(root, 'node_modules/openapi-typescript/bin/cli.js')

const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')
const dryRun = args.has('--dry-run')

if (checkOnly && dryRun) {
  throw new Error('Use either --check or --dry-run, not both.')
}

const resolveFromRoot = (path) => join(root, path)

const readJson = async (path) => JSON.parse(await readFile(resolveFromRoot(path), 'utf8'))

const sha256 = (content) => createHash('sha256').update(content).digest('hex')
const canonicalizeSnapshotBytes = (bytes) =>
  Buffer.from(bytes.toString('utf8').replace(/\r\n/gu, '\n'), 'utf8')

const countOperations = (paths) => {
  let operationCount = 0
  const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']

  for (const item of Object.values(paths ?? {})) {
    for (const method of methods) {
      if (item?.[method]) operationCount += 1
    }
  }

  return operationCount
}

const validateContractProvenance = async () => {
  const snapshotBytes = await readFile(resolveFromRoot(openApiGenerationConfig.snapshotPath))
  const snapshot = JSON.parse(snapshotBytes.toString('utf8'))
  const provenance = await readJson(openApiGenerationConfig.provenancePath)
  const installedGenerator = await readJson('node_modules/openapi-typescript/package.json')

  const actualHash = sha256(canonicalizeSnapshotBytes(snapshotBytes))
  if (actualHash !== provenance.sha256) {
    throw new Error(
      `OpenAPI snapshot hash mismatch. Expected ${provenance.sha256}, received ${actualHash}.`,
    )
  }

  if (snapshot.openapi !== provenance.openapiVersion) {
    throw new Error(
      `OpenAPI version mismatch. Snapshot is ${snapshot.openapi}, provenance is ${provenance.openapiVersion}.`,
    )
  }

  if (snapshot.info?.version !== provenance.contractVersion) {
    throw new Error(
      `Contract version mismatch. Snapshot is ${snapshot.info?.version}, provenance is ${provenance.contractVersion}.`,
    )
  }

  if (provenance.contractId !== openApiGenerationConfig.contractId) {
    throw new Error(
      `Contract id mismatch. Config is ${openApiGenerationConfig.contractId}, provenance is ${provenance.contractId}.`,
    )
  }

  if (provenance.snapshotPath !== openApiGenerationConfig.snapshotPath) {
    throw new Error(
      `Snapshot path mismatch. Config is ${openApiGenerationConfig.snapshotPath}, provenance is ${provenance.snapshotPath}.`,
    )
  }

  if (installedGenerator.version !== openApiGenerationConfig.openapiTypescriptVersion) {
    throw new Error(
      `openapi-typescript version mismatch. Config is ${openApiGenerationConfig.openapiTypescriptVersion}, installed is ${installedGenerator.version}.`,
    )
  }

  const actualCoverage = {
    paths: Object.keys(snapshot.paths ?? {}).length,
    operations: countOperations(snapshot.paths),
    schemas: Object.keys(snapshot.components?.schemas ?? {}).length,
  }

  const expectedCoverage = provenance.coverage
  if (
    actualCoverage.paths !== expectedCoverage.paths ||
    actualCoverage.operations !== expectedCoverage.operations ||
    actualCoverage.schemas !== expectedCoverage.schemas
  ) {
    throw new Error(
      `OpenAPI coverage mismatch. Expected ${JSON.stringify(
        expectedCoverage,
      )}, received ${JSON.stringify(actualCoverage)}.`,
    )
  }

  return {
    contractVersion: provenance.contractVersion,
    snapshotHash: actualHash,
    coverage: actualCoverage,
    generatorVersion: installedGenerator.version,
  }
}

const generateToStdout = () => {
  const result = spawnSync(
    process.execPath,
    [
      openApiTypescriptCliPath,
      openApiGenerationConfig.snapshotPath,
      ...openApiGenerationConfig.generatorOptions,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || `openapi-typescript exited with ${result.status}`)
  }

  return result.stdout
}

const contract = await validateContractProvenance()
const firstOutput = generateToStdout()
const secondOutput = generateToStdout()
const firstHash = sha256(firstOutput)
const secondHash = sha256(secondOutput)

if (firstHash !== secondHash) {
  throw new Error(`OpenAPI generation is not deterministic: ${firstHash} !== ${secondHash}.`)
}

const outputPath = resolveFromRoot(openApiGenerationConfig.outputPath)

if (dryRun) {
  console.log(
    `OpenAPI deterministic generation verified for ${contract.contractVersion}: ${firstOutput.split('\n').length} lines, ${firstHash}.`,
  )
  process.exit(0)
}

if (checkOnly) {
  const committedOutput = await readFile(outputPath, 'utf8')

  if (committedOutput !== firstOutput) {
    throw new Error(
      `${openApiGenerationConfig.outputPath} is stale. Run pnpm run api:types:generate and review the generated diff.`,
    )
  }

  console.log(`${openApiGenerationConfig.outputPath} is current for ${contract.contractVersion}.`)
  process.exit(0)
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, firstOutput)
console.log(
  `Generated ${openApiGenerationConfig.outputPath} from ${openApiGenerationConfig.snapshotPath} (${firstOutput.split('\n').length} lines, ${firstHash}).`,
)
