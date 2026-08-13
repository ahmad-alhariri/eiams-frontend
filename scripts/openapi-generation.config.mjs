export const openApiGenerationConfig = Object.freeze({
  contractId: 'eiams-v1',
  snapshotPath: 'contracts/openapi/eiams-v1.openapi.json',
  provenancePath: 'contracts/openapi/eiams-v1.provenance.json',
  outputPath: 'src/shared/types/generated/eiams-v1.ts',
  openapiTypescriptVersion: '7.13.0',
  generatorOptions: Object.freeze([
    '--export-type',
    '--immutable',
    '--alphabetize',
    '--root-types',
    '--root-types-no-schema-prefix',
  ]),
})
