import type { ReactNode } from 'react'

import { FormBridgeDemo } from '@/app/gallery/demos/form-bridge-demo'
import { routeBoundaryGallerySections } from '@/app/gallery/gallery-route-fixtures'
import { DataTableDemo } from '@/app/gallery/demos/data-table-demo'
import { AsyncSelectDemo } from '@/app/gallery/demos/async-select-demo'
import { FileDropzoneDemo } from '@/app/gallery/demos/file-dropzone-demo'
import { confirmDialogGallerySections } from '@/app/gallery/demos/confirm-dialog-demo'
import { statusBadgeGallerySections } from '@/app/gallery/demos/status-badge-demo'
import { dataTableServerGallerySections } from '@/app/gallery/demos/data-table-server-demo'
import { selectorAdaptersGallerySections } from '@/app/gallery/demos/selector-adapters-demo'
import { scopedWarehouseSelectorGallerySections } from '@/app/gallery/demos/scoped-warehouse-selector-demo'
import { attachmentPanelGallerySections } from '@/app/gallery/demos/attachment-panel-demo'
import { documentTimelineGallerySections } from '@/app/gallery/demos/document-timeline-demo'
import { lifecycleActionBarGallerySections } from '@/app/gallery/demos/lifecycle-action-bar-demo'
import { documentHeaderGallerySections } from '@/app/gallery/demos/document-header-section-demo'

export interface GallerySection {
  /** Stable key used by BDD/doc slots, e.g. "data-gallery-section". */
  id: string
  titleAr: string
  descriptionAr?: string
  render: () => ReactNode
}

/**
 * Shared-layer component gallery registry — DEV ONLY. Rendered at
 * /dev/gallery in dev builds; each shared component task appends its demos
 * here, giving QA a single visual surface for the whole design system.
 * Production builds never import this file (registry skips devOnly routes
 * outside DEV).
 */
export const gallerySections: GallerySection[] = [
  ...routeBoundaryGallerySections,
  ...confirmDialogGallerySections,
  ...statusBadgeGallerySections,
  ...dataTableServerGallerySections,
  ...selectorAdaptersGallerySections,
  ...scopedWarehouseSelectorGallerySections,
  ...attachmentPanelGallerySections,
  ...documentTimelineGallerySections,
  ...lifecycleActionBarGallerySections,
  ...documentHeaderGallerySections,
  {
    id: 'file-dropzone',
    titleAr: 'رفع الملفات (FileDropzone)',
    descriptionAr:
      'منطقة سحب وإفلات للملفات المدعومة (JPG و PNG و PDF) مع معاينة الملفات المختارة وإزالتها وأخطاء الرفض بالعربية.',
    render: () => <FileDropzoneDemo />,
  },
  {
    id: 'form-bridge',
    titleAr: 'جسر النماذج (React Hook Form + Zod)',
    descriptionAr:
      'نموذج بتحقق فوري ورسائل عربية مضمّنة، مع زر يحاكي أخطاء الخادم المتعلقة بالحقول.',
    render: () => <FormBridgeDemo />,
  },
  {
    id: 'async-select',
    titleAr: 'البحث المتزامن عند الكتابة (AsyncSelect)',
    descriptionAr:
      'اختيار عنصر بالبحث عن بعد: يبدأ بعد حرفين، مهلة ٣٠٠ مللي ثانية، حتى ١٠ نتائج مع تمييز المطابقة وتنقل كامل بلوحة المفاتيح وزر «إضافة جديد».',
    render: () => <AsyncSelectDemo />,
  },
  {
    id: 'data-table',
    titleAr: 'الجدول التفاعلي (DataTable)',
    descriptionAr:
      'جدول عام للبيانات من الخادم مع فرز حسب العمود، تحديد الصفوف، حالات التحميل/الخطأ/الفارغة، والنقر على الصفوف.',
    render: () => <DataTableDemo />,
  },
]

export const gallerySectionMap = new Map(gallerySections.map((section) => [section.id, section]))

export function getGallerySectionIds(): string[] {
  return gallerySections.map((section) => section.id)
}
