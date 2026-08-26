import decisionRaw from '../../docs/inventory-read-contract-decision.md?raw'
import openApiRaw from '../../contracts/openapi/eiams-v1.openapi.json?raw'
import generatedApiRaw from '@/shared/types/generated/eiams-v1.ts?raw'
import { describe, expect, it } from 'vitest'

type Reference = { $ref: string }
type Parameter = Reference | { name: string; schema?: Reference }
type Operation = {
  operationId: string
  parameters: Parameter[]
  responses: Record<string, Reference | object>
  description?: string
}
type Schema = {
  enum?: string[]
  required?: string[]
  properties?: Record<string, Reference | object>
  description?: string
}
type ParameterComponent = {
  name: string
  schema: { allOf?: Reference[]; default?: string }
}
type InventoryContract = {
  info: { version: string }
  paths: Record<string, { get: Operation }>
  components: {
    parameters: Record<string, ParameterComponent>
    schemas: Record<string, Schema>
  }
}

const contract = JSON.parse(openApiRaw) as InventoryContract

function parameterRefs(operation: Operation) {
  return operation.parameters
    .filter((parameter): parameter is Reference => '$ref' in parameter)
    .map((parameter) => parameter.$ref)
}

describe('D-INV-READ-01 inventory read contract', () => {
  it('pins typed stable sorting for balances and movements', () => {
    // D-IAR-01 bumped the provisional snapshot to .9; D-INV-READ-01 semantics unchanged.
    expect(contract.info.version).toBe('1.0.0-provisional.9')
    expect(contract.components.schemas['InventoryBalanceSortField']?.enum).toEqual([
      'WarehouseDisplayName',
      'MaterialDisplayName',
      'Quantity',
      'LastUpdated',
    ])
    expect(contract.components.schemas['StockMovementSortField']?.enum).toEqual([
      'PostedAt',
      'WarehouseDisplayName',
      'MaterialDisplayName',
      'MovementType',
      'QuantityDelta',
    ])
    expect(contract.components.schemas['SortDirection']?.enum).toEqual(['Ascending', 'Descending'])

    const balances = contract.paths['/inventory/balances']!.get
    const movements = contract.paths['/inventory/movements']!.get
    expect(parameterRefs(balances)).toEqual(
      expect.arrayContaining([
        '#/components/parameters/InventoryBalanceSortBy',
        '#/components/parameters/SortDirectionAscending',
      ]),
    )
    expect(parameterRefs(movements)).toEqual(
      expect.arrayContaining([
        '#/components/parameters/StockMovementSortBy',
        '#/components/parameters/SortDirectionDescending',
      ]),
    )
    expect(contract.components.parameters['InventoryBalanceSortBy']?.schema.default).toBe(
      'WarehouseDisplayName',
    )
    expect(contract.components.parameters['StockMovementSortBy']?.schema.default).toBe('PostedAt')
    expect(contract.components.parameters['SortDirectionAscending']?.schema.default).toBe(
      'Ascending',
    )
    expect(contract.components.parameters['SortDirectionDescending']?.schema.default).toBe(
      'Descending',
    )
    expect(balances.responses).toHaveProperty('400')
    expect(movements.responses).toHaveProperty('400')
    expect(decisionRaw).toContain('balanceId` ascending')
    expect(decisionRaw).toContain('movementId` descending')
    expect(decisionRaw).toContain('Arabic `ar-SY` collation')
  })

  it('defines balanceId detail identity with permission and scope concealment', () => {
    const detail = contract.paths['/inventory/balances/{balanceId}']!.get
    expect(detail.operationId).toBe('getInventoryBalance')
    expect(detail.parameters).toContainEqual(
      expect.objectContaining({ name: 'balanceId', required: true }),
    )
    expect(Object.keys(detail.responses).sort()).toEqual(['200', '400', '401', '403', '404'])
    expect(detail.description).toContain('outside the effective session scope')
    expect(decisionRaw).toContain('/inventory/balances/:balanceId')
    expect(decisionRaw).toContain('also returns the same `404`')
  })

  it('defines the server-computed inclusive low-stock projection and filter', () => {
    const balance = contract.components.schemas['InventoryBalance']!
    const lowStock = contract.components.schemas['InventoryLowStockProjection']!
    expect(balance.required).toContain('lowStock')
    expect(balance.properties?.['lowStock']).toEqual({
      $ref: '#/components/schemas/InventoryLowStockProjection',
    })
    expect(contract.components.schemas['InventoryLowStockState']?.enum).toEqual([
      'Low',
      'Sufficient',
      'NotConfigured',
      'Disabled',
    ])
    expect(lowStock.required).toEqual(['state', 'thresholdQuantity'])
    expect(lowStock.description).toContain('less than or equal')

    const balances = contract.paths['/inventory/balances']!.get
    expect(balances.parameters).toContainEqual(
      expect.objectContaining({
        name: 'lowStockState',
        schema: { $ref: '#/components/schemas/InventoryLowStockState' },
      }),
    )
    expect(decisionRaw).toContain('`quantity <= minQuantity`')
    expect(decisionRaw).toContain('| Missing setting | not evaluated | `NotConfigured` | `null` |')
    expect(decisionRaw).toContain('| Inactive setting | not evaluated | `Disabled` | `null` |')
    expect(decisionRaw).toContain('quantity zero is Low')
    expect(decisionRaw).toContain('before sorting/pagination')
  })

  it('regenerates the TypeScript surface instead of adding handwritten DTOs', () => {
    expect(generatedApiRaw).toContain('readonly getInventoryBalance:')
    expect(generatedApiRaw).toContain(
      'readonly InventoryBalanceSortField: "WarehouseDisplayName" | "MaterialDisplayName" | "Quantity" | "LastUpdated";',
    )
    expect(generatedApiRaw).toContain(
      'readonly InventoryLowStockState: "Low" | "Sufficient" | "NotConfigured" | "Disabled";',
    )
    expect(generatedApiRaw).toContain(
      'readonly lowStock: components["schemas"]["InventoryLowStockProjection"];',
    )
    expect(generatedApiRaw).toContain(
      'readonly sortDirection?: components["parameters"]["SortDirectionAscending"];',
    )
  })
})
