import { RouteSuspense } from '@/shared/layout/route-suspense'
import { DomainErrorBoundary } from '@/shared/layout/domain-error-boundary'
import type { GallerySection } from '@/app/gallery/gallery-sections'
import { BoundaryDemoBomb, SlowDemoPage } from '@/app/gallery/demos/route-fixture-demos'

export const routeBoundaryGallerySections: GallerySection[] = [
  {
    id: 'route-suspense',
    titleAr: 'غلاف التحميل عند التنقل (RouteSuspense)',
    descriptionAr:
      'أثناء تحميل شريحة صفحة كسولة تظهر شاشة التحميل الكاملة ثم يظهر المحتوى بعد نحو 1.2 ثانية.',
    render: () => (
      <RouteSuspense label="جارٍ تحميل صفحة تجريبية...">
        <SlowDemoPage />
      </RouteSuspense>
    ),
  },
  {
    id: 'domain-error-boundary',
    titleAr: 'غلاف خطأ الصفحة (DomainErrorBoundary)',
    descriptionAr:
      'إطلاق الخطأ يعرض حالة الخطأ العربية داخل المنطقة فقط، وزر «إعادة المحاولة» يعيد العرض، كما يُفرغ الغلاف تلقائياً عند الانتقال لصفحة أخرى.',
    render: () => (
      <DomainErrorBoundary>
        <BoundaryDemoBomb />
      </DomainErrorBoundary>
    ),
  },
]
