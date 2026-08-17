import type { MaterialKind, TrackingType } from '@/shared/types/generated/eiams-v1'

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  Consumable: 'مستهلكة',
  Durable: 'عهدة تشغيلية',
  Asset: 'أصل ثابت',
}

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  Quantity: 'بالكمية',
  Serial: 'بالرقم التسلسلي',
}
