import { PageHeader } from '@/shared/layout/page-header'
import { ROUTE_PATHS } from '@/config/routes'
import { gallerySections, type GallerySection } from '@/app/gallery/gallery-sections'

function GallerySectionBlock({ section }: { section: GallerySection }) {
  return (
    <section data-gallery-section={section.id} aria-label={section.titleAr}>
      <div className="mb-3 border-b border-border pb-2">
        <h2 className="text-lg font-semibold text-foreground">{section.titleAr}</h2>
        {section.descriptionAr ? (
          <p className="mt-1 text-sm text-muted-foreground">{section.descriptionAr}</p>
        ) : null}
      </div>
      <div className="grid gap-4 rounded-xl border border-border bg-popover p-4 shadow-card">
        {section.render()}
      </div>
    </section>
  )
}

function GalleryPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <PageHeader
        title="معرض المكونات المشتركة"
        subtitle={`صفحة تطوير فقط (${ROUTE_PATHS.devGallery}) — لا تظهر في بيئة الإنتاج. تعرض كل مكون عند اكتماله.`}
      />
      {gallerySections.map((section) => (
        <GallerySectionBlock key={section.id} section={section} />
      ))}
      {gallerySections.length === 0 ? (
        <p className="text-base text-muted-foreground">
          لا توجد عروض بعد — تُضاف عروض المكونات تلقائياً مع اكتمال مهام البنية المشتركة.
        </p>
      ) : null}
    </div>
  )
}

export default GalleryPage
