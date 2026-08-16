import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived filters for catalog reference lists and material search. */
export type ListMaterialDomainsQuery = NonNullable<
  operations['listMaterialDomains']['parameters']['query']
>
export type ListMaterialCategoriesQuery = NonNullable<
  operations['listMaterialCategories']['parameters']['query']
>
export type ListMaterialFamiliesQuery = NonNullable<
  operations['listMaterialFamilies']['parameters']['query']
>
export type ListMaterialsQuery = NonNullable<operations['listMaterials']['parameters']['query']>
