import {
  createAsset,
  createDocumentAttachment,
  createDocumentPolicy,
  createEmployee,
  createExternalParty,
  createMaterial,
  createMaterialCategory,
  createMaterialDomain,
  createMaterialFamily,
  createMaterialUnitConversion,
  createOrganizationalUnit,
  createSite,
  createUnitOfMeasure,
  createWarehouse,
  createWarehouseCapability,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  createWarehouseMaterialSetting,
  createInventoryBalance,
  createStockMovement,
  deriveLifecycleEvents,
  fixtureUuid,
} from '@/test/msw/factories'
import type {
  Asset,
  DocumentLifecycleEvent,
  Employee,
  InventoryBalance,
  ExternalParty,
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  MaterialUnitConversion,
  OrganizationalUnit,
  Site,
  StockMovement,
  UnitOfMeasure,
  Warehouse,
  WarehouseCapability,
  WarehouseDocument,
  WarehouseMaterialSetting,
} from '@/shared/types/generated/eiams-v1'

/**
 * Contract-shaped in-memory seed for the development mock API.
 *
 * The seed intentionally mirrors the OpenAPI snapshot through the shared
 * factories so a mock response can never drift from the generated types.
 * Collections are mutable: create/update handlers append or replace records so
 * the UI's optimistic flows and cache invalidation behave like a real backend.
 */
export interface MockDatabase {
  domains: MaterialDomain[]
  categories: MaterialCategory[]
  families: MaterialFamily[]
  materials: Material[]
  units: UnitOfMeasure[]
  unitConversions: MaterialUnitConversion[]
  sites: Site[]
  organizationalUnits: OrganizationalUnit[]
  employees: Employee[]
  externalParties: ExternalParty[]
  warehouses: Warehouse[]
  warehouseCapabilities: WarehouseCapability[]
  warehouseMaterialSettings: WarehouseMaterialSetting[]
  /**
   * Static, contract-shaped read projections for development UI verification.
   * They are not derived from document mutations or material settings.
   */
  inventoryBalances: InventoryBalance[]
  stockMovements: StockMovement[]
  /** D-AST-02 registry rows backing GET /assets (t05 issued-asset selector). */
  assets: Asset[]
  warehouseDocuments: WarehouseDocument[]
  documentLifecycleEvents: Record<string, DocumentLifecycleEvent[]>
}

const SEQUENCE = { next: 700 }

export function nextFixtureUuid(): string {
  const sequence = SEQUENCE.next
  SEQUENCE.next += 1
  return fixtureUuid(sequence)
}

function buildSeed(): MockDatabase {
  const itDomain = createMaterialDomain({
    domainId: fixtureUuid(20),
    code: 'IT',
    nameAr: 'تقنية المعلومات',
    rowVersion: 1,
    status: 'Active',
  })
  const financeDomain = createMaterialDomain({
    domainId: fixtureUuid(21),
    code: 'FIN',
    nameAr: 'الوثائق والمالية',
    rowVersion: 1,
    status: 'Active',
  })
  const medicalDomain = createMaterialDomain({
    domainId: fixtureUuid(22),
    code: 'MED',
    nameAr: 'اللوازم الطبية',
    rowVersion: 1,
    status: 'Inactive',
  })

  const hardwareCategory = createMaterialCategory({
    categoryId: fixtureUuid(30),
    code: 'IT-HW',
    domain: {
      id: itDomain.domainId,
      displayName: itDomain.nameAr,
      code: itDomain.code,
      status: 'Active',
    },
    nameAr: 'الأجهزة',
    pathDisplay: 'تقنية المعلومات / الأجهزة',
    rowVersion: 1,
    status: 'Active',
  })
  const consumablesCategory = createMaterialCategory({
    categoryId: fixtureUuid(31),
    code: 'IT-CNS',
    domain: {
      id: itDomain.domainId,
      displayName: itDomain.nameAr,
      code: itDomain.code,
      status: 'Active',
    },
    nameAr: 'المواد الاستهلاكية',
    pathDisplay: 'تقنية المعلومات / المواد الاستهلاكية',
    rowVersion: 1,
    status: 'Active',
  })
  const stationeryCategory = createMaterialCategory({
    categoryId: fixtureUuid(32),
    code: 'FIN-STN',
    domain: {
      id: financeDomain.domainId,
      displayName: financeDomain.nameAr,
      code: financeDomain.code,
      status: 'Active',
    },
    nameAr: 'لوازم مكتبية',
    pathDisplay: 'الوثائق والمالية / لوازم مكتبية',
    rowVersion: 1,
    status: 'Active',
  })

  const computersFamily = createMaterialFamily({
    familyId: fixtureUuid(40),
    code: 'IT-HW-PC',
    domain: { id: itDomain.domainId, displayName: itDomain.nameAr },
    category: { id: hardwareCategory.categoryId, displayName: hardwareCategory.nameAr },
    nameAr: 'الحواسيب',
    rowVersion: 1,
    status: 'Active',
  })
  const printersFamily = createMaterialFamily({
    familyId: fixtureUuid(41),
    code: 'IT-HW-PRT',
    domain: { id: itDomain.domainId, displayName: itDomain.nameAr },
    category: { id: hardwareCategory.categoryId, displayName: hardwareCategory.nameAr },
    nameAr: 'الطابعات',
    rowVersion: 1,
    status: 'Active',
  })
  const tonerFamily = createMaterialFamily({
    familyId: fixtureUuid(42),
    code: 'IT-CNS-TNR',
    domain: { id: itDomain.domainId, displayName: itDomain.nameAr },
    category: { id: consumablesCategory.categoryId, displayName: consumablesCategory.nameAr },
    nameAr: 'الحبر والمستهلكات',
    rowVersion: 1,
    status: 'Active',
  })
  const stationeryFamily = createMaterialFamily({
    familyId: fixtureUuid(43),
    code: 'FIN-STN-PPR',
    domain: { id: financeDomain.domainId, displayName: financeDomain.nameAr },
    category: { id: stationeryCategory.categoryId, displayName: stationeryCategory.nameAr },
    nameAr: 'الورق والقرطاسية',
    rowVersion: 1,
    status: 'Active',
  })

  const pieceUnit = createUnitOfMeasure({
    unitId: fixtureUuid(50),
    code: 'EA',
    nameAr: 'قطعة',
    symbolAr: 'قطعة',
    rowVersion: 1,
    status: 'Active',
  })
  const boxUnit = createUnitOfMeasure({
    unitId: fixtureUuid(51),
    code: 'BOX',
    nameAr: 'صندوق',
    symbolAr: 'صندوق',
    rowVersion: 1,
    status: 'Active',
  })
  const cartonUnit = createUnitOfMeasure({
    unitId: fixtureUuid(52),
    code: 'CTN',
    nameAr: 'كرتونة',
    symbolAr: 'كرتونة',
    rowVersion: 1,
    status: 'Active',
  })
  const literUnit = createUnitOfMeasure({
    unitId: fixtureUuid(53),
    code: 'LT',
    nameAr: 'لتر',
    symbolAr: 'لتر',
    rowVersion: 1,
    status: 'Active',
  })

  const materialDefaults = {
    domain: { id: itDomain.domainId, displayName: itDomain.nameAr },
    category: { id: hardwareCategory.categoryId, displayName: hardwareCategory.nameAr },
  }

  const materials: Material[] = [
    createMaterial({
      materialId: fixtureUuid(60),
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      descriptionAr: 'حاسوب مكتبي معتمد للموظفين',
      ...materialDefaults,
      family: { id: computersFamily.familyId, displayName: computersFamily.nameAr },
      baseUnit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
      materialKind: 'Durable',
      requiresAssetNumber: false,
      trackingType: 'Serial',
      rowVersion: 1,
      status: 'Active',
    }),
    createMaterial({
      materialId: fixtureUuid(61),
      code: 'IT-HW-PRT-001',
      nameAr: 'طابعة ليزر',
      descriptionAr: 'طابعة ليزر مفرد واجهة',
      ...materialDefaults,
      family: { id: printersFamily.familyId, displayName: printersFamily.nameAr },
      baseUnit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
      materialKind: 'Asset',
      requiresAssetNumber: true,
      trackingType: 'Serial',
      rowVersion: 1,
      status: 'Active',
    }),
    createMaterial({
      materialId: fixtureUuid(62),
      code: 'IT-CNS-TNR-001',
      nameAr: 'حبر أسود',
      descriptionAr: 'عاج استهلاكي للطابعات',
      ...materialDefaults,
      category: { id: consumablesCategory.categoryId, displayName: consumablesCategory.nameAr },
      family: { id: tonerFamily.familyId, displayName: tonerFamily.nameAr },
      baseUnit: { id: cartonUnit.unitId, displayName: cartonUnit.nameAr, code: cartonUnit.code },
      materialKind: 'Consumable',
      requiresAssetNumber: false,
      trackingType: 'Quantity',
      rowVersion: 1,
      status: 'Active',
    }),
    createMaterial({
      materialId: fixtureUuid(63),
      code: 'FIN-STN-001',
      nameAr: 'ورق تصوير A4',
      descriptionAr: 'ورق تصوير أبيض مقاس A4',
      domain: { id: financeDomain.domainId, displayName: financeDomain.nameAr },
      category: { id: stationeryCategory.categoryId, displayName: stationeryCategory.nameAr },
      family: { id: stationeryFamily.familyId, displayName: stationeryFamily.nameAr },
      baseUnit: { id: boxUnit.unitId, displayName: boxUnit.nameAr, code: boxUnit.code },
      materialKind: 'Consumable',
      requiresAssetNumber: false,
      trackingType: 'Quantity',
      rowVersion: 1,
      status: 'Active',
    }),
  ]

  const headquarters = createSite({
    siteId: fixtureUuid(70),
    organizationId: fixtureUuid(71),
    code: 'DAM-HQ',
    nameAr: 'المقر الرئيسي',
    address: 'دمشق - الساحة الأموية',
    governorate: 'دمشق',
    rowVersion: 1,
    status: 'Active',
  })
  const branchSite = createSite({
    siteId: fixtureUuid(72),
    organizationId: fixtureUuid(71),
    code: 'HLB-BR',
    nameAr: 'فرع حلب',
    address: 'حلب - الجديدة',
    governorate: 'حلب',
    rowVersion: 1,
    status: 'Active',
  })

  const adminUnit = createOrganizationalUnit({
    orgUnitId: fixtureUuid(80),
    siteId: headquarters.siteId,
    code: 'ADMIN',
    nameAr: 'الإدارة العامة',
    pathDisplay: 'المقر الرئيسي / الإدارة العامة',
    rowVersion: 1,
    status: 'Active',
  })
  const itUnit = createOrganizationalUnit({
    orgUnitId: fixtureUuid(81),
    siteId: headquarters.siteId,
    parentOrgUnitId: adminUnit.orgUnitId,
    code: 'IT-DEPT',
    nameAr: 'مديرية المعلوماتية',
    pathDisplay: 'الإدارة العامة / مديرية المعلوماتية',
    rowVersion: 1,
    status: 'Active',
  })
  const hrUnit = createOrganizationalUnit({
    orgUnitId: fixtureUuid(82),
    siteId: headquarters.siteId,
    parentOrgUnitId: adminUnit.orgUnitId,
    code: 'HR-DEPT',
    nameAr: 'مديرية الشؤون الإدارية',
    pathDisplay: 'الإدارة العامة / مديرية الشؤون الإدارية',
    rowVersion: 1,
    status: 'Active',
  })

  const employees: Employee[] = [
    createEmployee({
      employeeId: fixtureUuid(90),
      employeeNumber: 'EMP-001',
      fullNameAr: 'أحمد حسن',
      jobTitleAr: 'مدير المعلوماتية',
      orgUnit: { id: itUnit.orgUnitId, displayName: itUnit.nameAr },
      site: { id: headquarters.siteId, displayName: headquarters.nameAr },
      rowVersion: 1,
      status: 'Active',
    }),
    createEmployee({
      employeeId: fixtureUuid(91),
      employeeNumber: 'EMP-002',
      fullNameAr: 'مريم خالد',
      jobTitleAr: 'أمين مستودع',
      orgUnit: { id: hrUnit.orgUnitId, displayName: hrUnit.nameAr },
      site: { id: headquarters.siteId, displayName: headquarters.nameAr },
      rowVersion: 1,
      status: 'Active',
    }),
    createEmployee({
      employeeId: fixtureUuid(92),
      employeeNumber: 'EMP-003',
      fullNameAr: 'سامر عبود',
      jobTitleAr: 'فني حاسوب',
      orgUnit: { id: itUnit.orgUnitId, displayName: itUnit.nameAr },
      site: { id: headquarters.siteId, displayName: headquarters.nameAr },
      rowVersion: 1,
      status: 'Inactive',
    }),
  ]

  const externalParties: ExternalParty[] = [
    createExternalParty({
      externalPartyId: fixtureUuid(100),
      code: 'EXT-SUP-001',
      nameAr: 'شركة التجهيزات التقنية',
      contactInfo: '011-2233445',
      notes: null,
      rowVersion: 1,
      status: 'Active',
    }),
    createExternalParty({
      externalPartyId: fixtureUuid(101),
      code: 'EXT-MNT-001',
      nameAr: 'مؤسسة الصيانة المكلفة',
      contactInfo: '033-5566771',
      notes: 'عقد صيانة دوري',
      rowVersion: 1,
      status: 'Active',
    }),
  ]

  const centralWarehouse = createWarehouse({
    warehouseId: fixtureUuid(110),
    code: 'WH-CENTRAL',
    nameAr: 'المستودع المركزي',
    locationAr: 'المقر الرئيسي - الطابق الأرضي',
    site: { id: headquarters.siteId, displayName: headquarters.nameAr },
    rowVersion: 1,
    status: 'Active',
  })
  const branchWarehouse = createWarehouse({
    warehouseId: fixtureUuid(111),
    code: 'WH-HLB',
    nameAr: 'مستودع الفرع الشمالي',
    locationAr: 'فرع حلب',
    site: { id: branchSite.siteId, displayName: branchSite.nameAr },
    rowVersion: 1,
    status: 'Active',
  })

  const tonerMaterial = materials[2]!
  const tonerUnit = cartonUnit
  const computersMaterial = materials[0]!
  const printerMaterial = materials[1]!
  const paperMaterial = materials[3]!
  const centralRef = { id: centralWarehouse.warehouseId, displayName: centralWarehouse.nameAr }
  const branchRef = { id: branchWarehouse.warehouseId, displayName: branchWarehouse.nameAr }
  const headquarterRef = { id: headquarters.siteId, displayName: headquarters.nameAr }
  const ahmedRef = { id: employees[0]!.employeeId, displayName: employees[0]!.fullNameAr }
  const mariamRef = { id: employees[1]!.employeeId, displayName: employees[1]!.fullNameAr }

  const documentNumbers = {
    receiving: '2024/101',
    issueSubmitted: '2024/102',
    transferPosted: '2024/103',
    receivingReversed: '2024/104',
    receivingCancelled: '2024/105',
    issueRejected: '2024/106',
  }
  const systemReferences = {
    receiving: 'EIAMS-RCV-2024-0001',
    issueSubmitted: 'EIAMS-ISS-2024-0001',
    transferPosted: 'EIAMS-TRF-2024-0001',
    receivingReversed: 'EIAMS-RCV-2024-0002',
    receivingCancelled: 'EIAMS-RCV-2024-0003',
    issueRejected: 'EIAMS-ISS-2024-0002',
  }

  // These are explicit server-read projections for the dev worker only. Do
  // not calculate low-stock state here and do not replay document effects into
  // balances or the immutable ledger.
  const inventoryBalances: InventoryBalance[] = [
    createInventoryBalance({
      balanceId: fixtureUuid(200),
      warehouse: centralRef,
      material: { id: computersMaterial.materialId, displayName: computersMaterial.nameAr },
      quantity: 0,
      lastUpdated: '2026-08-21T08:00:00.000Z',
      lowStock: { state: 'Low', thresholdQuantity: 0 },
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(201),
      warehouse: centralRef,
      material: { id: tonerMaterial.materialId, displayName: tonerMaterial.nameAr },
      quantity: 2,
      lastUpdated: '2026-08-20T08:00:00.000Z',
      lowStock: { state: 'Low', thresholdQuantity: 2 },
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(202),
      warehouse: branchRef,
      material: { id: printerMaterial.materialId, displayName: printerMaterial.nameAr },
      quantity: 7,
      lastUpdated: '2026-08-19T08:00:00.000Z',
      lowStock: { state: 'Sufficient', thresholdQuantity: 5 },
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(203),
      warehouse: centralRef,
      material: { id: paperMaterial.materialId, displayName: paperMaterial.nameAr },
      quantity: 12,
      lastUpdated: '2026-08-18T08:00:00.000Z',
      lowStock: { state: 'NotConfigured', thresholdQuantity: null },
    }),
    createInventoryBalance({
      balanceId: fixtureUuid(204),
      warehouse: branchRef,
      material: { id: paperMaterial.materialId, displayName: paperMaterial.nameAr },
      quantity: 4,
      lastUpdated: '2026-08-17T08:00:00.000Z',
      lowStock: { state: 'Disabled', thresholdQuantity: null },
    }),
  ]

  const stockMovements: StockMovement[] = [
    createStockMovement({
      movementId: fixtureUuid(220),
      warehouse: centralRef,
      material: { id: computersMaterial.materialId, displayName: computersMaterial.nameAr },
      documentId: fixtureUuid(150),
      documentLineId: fixtureUuid(160),
      documentReference: systemReferences.receiving,
      movementType: 'Receipt',
      quantityDelta: 10,
      postedAt: '2026-08-21T10:00:00.000Z',
    }),
    createStockMovement({
      movementId: fixtureUuid(221),
      warehouse: centralRef,
      material: { id: tonerMaterial.materialId, displayName: tonerMaterial.nameAr },
      documentId: fixtureUuid(151),
      documentLineId: fixtureUuid(161),
      documentReference: systemReferences.issueSubmitted,
      movementType: 'Issue',
      quantityDelta: -2,
      postedAt: '2026-08-20T10:00:00.000Z',
    }),
    createStockMovement({
      movementId: fixtureUuid(222),
      warehouse: centralRef,
      material: { id: paperMaterial.materialId, displayName: paperMaterial.nameAr },
      documentId: fixtureUuid(152),
      documentLineId: fixtureUuid(163),
      documentReference: systemReferences.transferPosted,
      movementType: 'TransferOut',
      quantityDelta: -5,
      postedAt: '2026-08-19T10:00:00.000Z',
    }),
    createStockMovement({
      movementId: fixtureUuid(223),
      warehouse: branchRef,
      material: { id: paperMaterial.materialId, displayName: paperMaterial.nameAr },
      documentId: fixtureUuid(152),
      documentLineId: fixtureUuid(163),
      documentReference: systemReferences.transferPosted,
      movementType: 'TransferIn',
      quantityDelta: 5,
      postedAt: '2026-08-19T10:00:00.000Z',
    }),
    createStockMovement({
      movementId: fixtureUuid(224),
      warehouse: centralRef,
      material: { id: printerMaterial.materialId, displayName: printerMaterial.nameAr },
      documentId: fixtureUuid(153),
      documentLineId: fixtureUuid(164),
      documentReference: undefined,
      movementType: 'AdjustmentOut',
      quantityDelta: -1,
      postedAt: '2026-08-18T10:00:00.000Z',
    }),
  ]

  // D-AST-02 registry: InStock asset units at المستودع المركزي backing the
  // t05 issued-asset selector (GET /assets?status=InStock&materialId=…).
  const computersAssetIds = [fixtureUuid(230), fixtureUuid(231), fixtureUuid(232)]
  const printersAssetIds = [fixtureUuid(233), fixtureUuid(234)]
  const assets: Asset[] = [
    ...computersAssetIds.map((assetId, index) =>
      createAsset({
        assetId,
        assetNumber: `AST-2024-C0${index + 1}`,
        serialNumber: `SN-PC-2024-${String(index + 1).padStart(4, '0')}`,
        derivedStatus: 'InStock',
        material: { id: computersMaterial.materialId, displayName: computersMaterial.nameAr },
        currentWarehouse: centralRef,
        acquisitionDate: `2024-0${index + 1}-15`,
      }),
    ),
    ...printersAssetIds.map((assetId, index) =>
      createAsset({
        assetId,
        assetNumber: `AST-2024-P0${index + 1}`,
        serialNumber: `SN-PRT-2024-${String(index + 1).padStart(4, '0')}`,
        derivedStatus: 'InStock',
        material: { id: printerMaterial.materialId, displayName: printerMaterial.nameAr },
        currentWarehouse: centralRef,
        acquisitionDate: `2024-0${index + 1}-20`,
      }),
    ),
    // One issued unit at the branch warehouse — exercises the status/warehouse filters.
    createAsset({
      assetId: fixtureUuid(235),
      assetNumber: 'AST-2023-C099',
      serialNumber: 'SN-PC-2023-0099',
      derivedStatus: 'Issued',
      material: { id: computersMaterial.materialId, displayName: computersMaterial.nameAr },
      currentWarehouse: branchRef,
      acquisitionDate: '2023-11-05',
    }),
  ]

  const documents: WarehouseDocument[] = [
    createWarehouseDocument({
      documentId: fixtureUuid(150),
      documentStatus: 'Draft',
      documentType: 'Receiving',
      paperDocumentNumber: documentNumbers.receiving,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.receiving,
      warehouse: centralRef,
      site: headquarterRef,
      createdBy: mariamRef,
      receivingInfo: {
        receivingType: 'Purchase',
        supplierRef: 'EXT-SUP-001',
        supplierInvoiceRef: 'INV-2024-001',
      },
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(160),
          material: tonerMaterial,
          quantity: 10,
          baseQuantity: 10,
          unit: { id: tonerUnit.unitId, displayName: tonerUnit.nameAr, code: tonerUnit.code },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: 25,
          availableBalance: null,
        }),
      ],
    }),
    createWarehouseDocument({
      documentId: fixtureUuid(151),
      documentStatus: 'Submitted',
      documentType: 'Issue',
      paperDocumentNumber: documentNumbers.issueSubmitted,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.issueSubmitted,
      warehouse: centralRef,
      site: headquarterRef,
      createdBy: ahmedRef,
      receivingInfo: undefined,
      issueTo: {
        recipientType: 'OrganizationalUnit',
        recipientId: itUnit.orgUnitId,
        recipientDisplayName: itUnit.nameAr,
        issueReason: 'تجهيز مديرية المعلوماتية بأجهزة جديدة',
      },
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(161),
          material: computersMaterial,
          quantity: 3,
          baseQuantity: 3,
          unit: {
            id: pieceUnit.unitId,
            displayName: pieceUnit.nameAr,
            code: pieceUnit.code,
          },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: null,
          availableBalance: 15,
        }),
      ],
    }),
    createWarehouseDocument({
      documentId: fixtureUuid(152),
      documentStatus: 'Posted',
      documentType: 'Transfer',
      paperDocumentNumber: documentNumbers.transferPosted,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.transferPosted,
      warehouse: centralRef,
      site: headquarterRef,
      createdBy: ahmedRef,
      postedAt: '2026-01-02T08:00:00.000Z',
      postedBy: mariamRef,
      receivingInfo: undefined,
      policy: createDocumentPolicy({
        documentId: fixtureUuid(152),
        documentStatus: 'Posted',
        rowVersion: 1,
        signedOriginalSatisfied: true,
      }),
      transferInfo: {
        destinationWarehouseId: branchWarehouse.warehouseId,
        destinationWarehouseName: branchWarehouse.nameAr,
        transferReason: 'نقل كمية مخزنية إلى الفرع الشمالي',
      },
      attachments: [
        createDocumentAttachment({
          attachmentId: fixtureUuid(170),
          documentId: fixtureUuid(152),
          attachmentType: 'SignedOriginal',
          originalFilename: 'transfer-2024-103-signed.pdf',
          uploadedBy: mariamRef,
        }),
        createDocumentAttachment({
          attachmentId: fixtureUuid(171),
          documentId: fixtureUuid(152),
          attachmentType: 'Supporting',
          originalFilename: 'transfer-2024-103-notes.pdf',
          uploadedBy: mariamRef,
        }),
      ],
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(162),
          material: tonerMaterial,
          quantity: 2,
          baseQuantity: 24,
          unit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
          conversionFactor: '12.000000',
          conversionId: fixtureUuid(120),
          unitPrice: null,
          availableBalance: 8,
        }),
        createWarehouseDocumentLine({
          lineId: fixtureUuid(163),
          material: paperMaterial,
          quantity: 5,
          baseQuantity: 5,
          unit: { id: boxUnit.unitId, displayName: boxUnit.nameAr, code: boxUnit.code },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: null,
          availableBalance: 20,
        }),
      ],
    }),
    createWarehouseDocument({
      documentId: fixtureUuid(153),
      documentStatus: 'Reversed',
      documentType: 'Receiving',
      paperDocumentNumber: documentNumbers.receivingReversed,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.receivingReversed,
      warehouse: centralRef,
      site: headquarterRef,
      createdBy: ahmedRef,
      postedAt: '2026-01-03T09:30:00.000Z',
      postedBy: mariamRef,
      policy: createDocumentPolicy({
        documentId: fixtureUuid(153),
        documentStatus: 'Reversed',
        rowVersion: 1,
        signedOriginalSatisfied: true,
      }),
      receivingInfo: {
        receivingType: 'Purchase',
        supplierRef: 'EXT-MNT-001',
        supplierInvoiceRef: 'INV-2024-002',
      },
      attachments: [
        createDocumentAttachment({
          attachmentId: fixtureUuid(172),
          documentId: fixtureUuid(153),
          attachmentType: 'SignedOriginal',
          originalFilename: 'receiving-2024-104-signed.pdf',
          uploadedBy: mariamRef,
        }),
      ],
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(164),
          material: printerMaterial,
          quantity: 1,
          baseQuantity: 1,
          lineType: 'Asset',
          unit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: 550,
          availableBalance: null,
          assetInputs: [
            {
              assetNumber: 'AST-2024-0001',
              serialNumber: 'SN-PRT-0001',
              acquisitionDate: '2026-01-03',
            },
          ],
        }),
      ],
    }),
    createWarehouseDocument({
      documentId: fixtureUuid(154),
      documentStatus: 'Cancelled',
      documentType: 'Receiving',
      paperDocumentNumber: documentNumbers.receivingCancelled,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.receivingCancelled,
      warehouse: centralRef,
      site: headquarterRef,
      createdBy: mariamRef,
      receivingInfo: {
        receivingType: 'Purchase',
        supplierRef: 'EXT-SUP-001',
        supplierInvoiceRef: 'INV-2024-003',
      },
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(165),
          material: paperMaterial,
          quantity: 20,
          baseQuantity: 20,
          unit: { id: boxUnit.unitId, displayName: boxUnit.nameAr, code: boxUnit.code },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: 3,
          availableBalance: null,
        }),
      ],
    }),
    createWarehouseDocument({
      documentId: fixtureUuid(155),
      documentStatus: 'Rejected',
      documentType: 'Issue',
      paperDocumentNumber: documentNumbers.issueRejected,
      paperDocumentYear: 2024,
      systemReferenceNumber: systemReferences.issueRejected,
      warehouse: branchRef,
      site: { id: branchSite.siteId, displayName: branchSite.nameAr },
      createdBy: ahmedRef,
      receivingInfo: undefined,
      issueTo: {
        recipientType: 'OrganizationalUnit',
        recipientId: hrUnit.orgUnitId,
        recipientDisplayName: hrUnit.nameAr,
        issueReason: 'استبدال أجهزة متقادمة',
      },
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(166),
          material: computersMaterial,
          quantity: 2,
          baseQuantity: 2,
          unit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
          conversionFactor: '1.000000',
          conversionId: null,
          unitPrice: null,
          availableBalance: 5,
        }),
      ],
    }),
  ]

  const documentLifecycleEvents = Object.fromEntries(
    documents.map((document) => [document.documentId, deriveLifecycleEvents(document)]),
  )

  return {
    domains: [itDomain, financeDomain, medicalDomain],
    categories: [hardwareCategory, consumablesCategory, stationeryCategory],
    families: [computersFamily, printersFamily, tonerFamily, stationeryFamily],
    materials,
    units: [pieceUnit, boxUnit, cartonUnit, literUnit],
    unitConversions: [
      createMaterialUnitConversion({
        conversionId: fixtureUuid(120),
        material: { id: fixtureUuid(62), displayName: 'حبر أسود' },
        fromUnit: { id: cartonUnit.unitId, displayName: cartonUnit.nameAr, code: cartonUnit.code },
        baseUnit: { id: pieceUnit.unitId, displayName: pieceUnit.nameAr, code: pieceUnit.code },
        factor: '12',
        rowVersion: 1,
        status: 'Active',
        usedInPostedDocuments: false,
      }),
    ],
    sites: [headquarters, branchSite],
    organizationalUnits: [adminUnit, itUnit, hrUnit],
    employees,
    externalParties,
    warehouses: [centralWarehouse, branchWarehouse],
    warehouseCapabilities: [
      createWarehouseCapability({
        capabilityId: fixtureUuid(130),
        warehouseId: centralWarehouse.warehouseId,
        domain: { id: itDomain.domainId, displayName: itDomain.nameAr },
        operations: ['Receiving', 'Issue', 'Transfer', 'Return'],
        rowVersion: 1,
      }),
      createWarehouseCapability({
        capabilityId: fixtureUuid(131),
        warehouseId: centralWarehouse.warehouseId,
        domain: { id: financeDomain.domainId, displayName: financeDomain.nameAr },
        operations: ['Receiving'],
        rowVersion: 1,
      }),
    ],
    warehouseMaterialSettings: [
      createWarehouseMaterialSetting({
        settingId: fixtureUuid(140),
        warehouseId: centralWarehouse.warehouseId,
        material: { id: fixtureUuid(62), displayName: 'حبر أسود' },
        minQuantity: 2,
        maxQuantity: 10,
        rowVersion: 1,
        status: 'Active',
      }),
    ],
    inventoryBalances,
    stockMovements,
    assets,
    warehouseDocuments: documents,
    documentLifecycleEvents,
  }
}

let currentDb = buildSeed()

/** Returns the live seed; handlers mutate the returned collections directly. */
export function getDb(): MockDatabase {
  return currentDb
}

/** Rebuilds the seed; used by the mock suite between tests. */
export function resetMockDatabase(): MockDatabase {
  currentDb = buildSeed()
  return currentDb
}
