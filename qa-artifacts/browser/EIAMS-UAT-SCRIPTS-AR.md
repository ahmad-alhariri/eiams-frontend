# نصوص اختبار القبول للمستخدم (UAT) - الإصدار الأول

**الحالة:** جاهز للتنفيذ
**المهمة:** `eiams-frontend-e26-t04`
**التاريخ:** 2026-10-28
**واجهة التطبيق:** `http://127.0.0.1:5173` (أو `5174` إذا كان `5173` مشغولا)
**الأداة:** `node scripts/qa/devtools-mcp.mjs <command>` من مجلد المشروع
**اتجاه الواجهة:** من اليمين إلى اليسار، والنصوص بالعربية

## كيف ينفذ السيناريو

كل سيناريو في هذا الملف مستقل، وينفذ بالترتيب نفسه:

```bash
node scripts/qa/devtools-mcp.mjs ensure-browser --headed
node scripts/qa/devtools-mcp.mjs navigate "<المسار>"
node scripts/qa/devtools-mcp.mjs wait-for "<نص ظاهر>" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs click --uid <uid>
node scripts/qa/devtools-mcp.mjs fill --uid <uid> --value "<قيمة>"
node scripts/qa/devtools-mcp.mjs form --json '{"uid":"value"}'
node scripts/qa/devtools-mcp.mjs press --key Enter
node scripts/qa/devtools-mcp.mjs resize --width 390 --height 812
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "<اسم-الملف>"
```

ملاحظات مهمة:

- كل أمر يفتح اتصالا قصيرا بمتصفح واحد دائم، لذلك تبقى حالة الصفحة (تسجيل الدخول، اختيار النطاق، التنقل) بين الأوامر.
- الأمر `screenshot` قد يتوقف لأكثر من 120 ثانية. الاعتماد الأساسي على `wait-for` وليس على لقطة الشاشة.
- الأمر `console` يعرض أخطاء المتصفح. أي خطأ أحمر في هذا الأمر هو ملاحظة حرجة على السيناريو.
- الأدلة (الصور) تحفظ في `qa-artifacts/browser/` ويذكر مسارها المطلق في التقرير النهائي.

## بيانات الدخول المعتمدة

| الدور | اسم المستخدم | كلمة المرور | النطاق | ملاحظة |
| --- | --- | --- | --- | --- |
| أمين مستودع | `keeper` | `Password123!` | مستودع | يملك تكليف العهدة ولا يملك ترحيل المستند |
| مدير مستودع | `mgr-warehouse` | `Password123!` | مستودع | يملك ترحيل المستند |
| مدير على مستوى المؤسسة | `mgr` | `Password123!` | مؤسسة | يملك التسوية |
| مدقق | `auditor` | `Password123!` | مؤسسة | قراءة فقط، لا يملك أي إجراء |
| مسؤول النظام | `admin` | `Password123!` | مؤسسة | صلاحيات بنيوية فقط، لا يملك عرض الأصول |
| حساب موقوف | `probe.keeper` | `Password123!` | مستودع | الحساب موقوف ويجب أن يرفضه الخادم |

## معايير القبول العامة

كل سيناريو يجب أن يحقق البنود التالية قبل أن يعد ناجحا:

1. المسار يظهر دون شاشة بيضاء، وبدون أخطاء في لوحة التحكم.
2. حالة التحميل تظهر قبل البيانات.
3. البيانات المسجلة تظهر كما هي.
4. الإجراء الأساسي في السيناريو يعمل.
5. حالة الفراغ وحالة الخطأ مع زر `إعادة المحاولة` تعملان عند وجودهما.
6. تخطيط الواجهة من اليمين إلى اليسار صحيح، والعناوين العربية ظاهرة.
7. لا يوجد تجاوز أفقي عند المقاسات 390 و768 و1440.
8. التنقل بلوحة المفاتيح يعمل، ومؤشر التركيز ظاهر.
9. إخفاء الأفعال غير المسموح بها للمستخدم حسب الصلاحيات.

---

## السيناريو 1: تسجيل الدخول والخروج

- **المسار:** `/login`
- **العنوان:** تسجيل الدخول

**الدور:** `keeper` (ثم `probe.keeper` للتحقق من رفض الحساب الموقوف)

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/login"
node scripts/qa/devtools-mcp.mjs wait-for "تسجيل الدخول" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs fill --uid <حقل المستخدم> --value "keeper"
node scripts/qa/devtools-mcp.mjs fill --uid <حقل كلمة المرور> --value "Password123!"
node scripts/qa/devtools-mcp.mjs press --key Enter
node scripts/qa/devtools-mcp.mjs wait-for "لوحة المعلومات" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-01-login.png"
```

**معايير القبول:**

1. شاشة الدخول تعرض حقلي المستخدم وكلمة المرور بالعربية، مع زر دخول.
2. بعد الدخول ينتقل التطبيق إلى لوحة المعلومات دون شاشة بيضاء.
3. كلمة المرور لا تبقى ظاهرة في الحقل بعد الفشل.
4. محاولة الدخول باسم `probe.keeper` تفشل برسالة عربية واضحة، ولا تمنح جلسة.
5. زر الخروج يعيد إلى شاشة الدخول، وعودة الدخول بالضغط على زر الرجوع لا تعرض بيانات جلسة سابقة.

**الأدلة:** `qa-artifacts/browser/uat-01-login.png`

---

## السيناريو 2: لوحة المعلومات

- **المسار:** `/`
- **العنوان:** لوحة المعلومات

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/"
node scripts/qa/devtools-mcp.mjs wait-for "لوحة المعلومات" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs resize --width 390 --height 812
node scripts/qa/devtools-mcp.mjs resize --width 1440 --height 900
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-02-dashboard.png"
```

**معايير القبول:**

1. مؤشرات البطاقات تظهر بأرقام عربية (٠١٢٣) لا بالأرقام اللاتينية.
2. لا يوجد تجاوز أفقي عند عرض 390 أو 1440.
3. لوحة التحكم لا تعرض أي فعل خارج صلاحيات النطاق الحالي.
4. لا أخطاء في لوحة التحكم.

**الأدلة:** `qa-artifacts/browser/uat-02-dashboard.png`

---

## السيناريو 3: الاستلام

- **المسار:** `/documents/receiving`
- **العنوان:** سندات الاستلام
- **المسار:** `/documents/receiving/new`
- **العنوان:** سند استلام جديد
- **المسار:** `/documents/receiving/:documentId`
- **العنوان:** تفاصيل سند الاستلام

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/documents/receiving"
node scripts/qa/devtools-mcp.mjs wait-for "سندات الاستلام" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs click --uid <زر سند استلام جديد>
node scripts/qa/devtools-mcp.mjs wait-for "سند استلام جديد" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs form --json '{"<uid الكمية>":"2","<uid الصنف>":"<uuid الصنف>"}'
node scripts/qa/devtools-mcp.mjs press --key Enter
node scripts/qa/devtools-mcp.mjs wait-for "تم" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-03-receiving.png"
```

**معايير القبول:**

1. قائمة سندات الاستلام تعرض السندات المرقمة مع حالة كل سند.
2. نموذج السند الجديد يحفظ المسودة، ويظهر السند في الحالة `مسودة`.
3. المسودة قابلة للتعديل، والسند المرحّل غير قابل للتعديل.
4. أخطاء التحقق تظهر بجوار الحقل المعني، وبعربية، ولا تظهر كنص إنجليزي.
5. عند وجود مادة غير مسموح بها في المستودع تظهر رسالة خطأ واضحة مع زر `إعادة المحاولة`.

**الأدلة:** `qa-artifacts/browser/uat-03-receiving.png`

---

## السيناريو 4: الصرف

- **المسار:** `/documents/issue`
- **العنوان:** سندات الصرف
- **المسار:** `/documents/issue/new`
- **العنوان:** سند صرف جديد

**الدور:** `keeper` (التسليم) ثم `mgr-warehouse` (الترحيل)

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/documents/issue"
node scripts/qa/devtools-mcp.mjs wait-for "سندات الصرف" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs click --uid <زر سند صرف جديد>
node scripts/qa/devtools-mcp.mjs wait-for "سند صرف جديد" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-04-issue.png"
```

**معايير القبول:**

1. **`keeper` لا يرى زر الترحيل** (فصل المهام: الإعداد للجهاز الأول، والترحيل للمدير).
2. `mgr-warehouse` يرى زر الترحيل، والترحيل ينقل السند إلى الحالة `مرحّل`.
3. بعد الترحيل لا يظهر زر التعديل على السند.
4. الصرف من رصيد غير كافٍ يفشل برسالة عربية تذكر الرصيد المتاح.

**الأدلة:** `qa-artifacts/browser/uat-04-issue.png`

---

## السيناريو 5: الإرجاع

- **المسار:** `/documents/return`
- **العنوان:** سندات الإرجاع
- **المسار:** `/documents/return/new`
- **العنوان:** سند إرجاع جديد

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/documents/return"
node scripts/qa/devtools-mcp.mjs wait-for "سندات الإرجاع" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-05-return.png"
```

**معايير القبول:**

1. اختيار الأصل المراد إرجاعه يعرض حالته الحالية وموقعه.
2. لا يمكن اختيار أصل مرحّل بالفعل.
3. بعد الإرجاع يعود الكمية إلى رصيد المستودع، وينعكس ذلك في شاشة الأرصدة.
4. لا يمكن إرجاع مرشح غير مصرح به.

**الأدلة:** `qa-artifacts/browser/uat-05-return.png`

---

## السيناريو 6: التحويل

- **المسار:** `/documents/transfer`
- **العنوان:** سندات التحويل
- **المسار:** `/documents/transfer/new`
- **العنوان:** سند تحويل جديد

**الدور:** `mgr-warehouse`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/documents/transfer"
node scripts/qa/devtools-mcp.mjs wait-for "سندات التحويل" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-06-transfer.png"
```

**معايير القبول:**

1. التحويل يتطلب مستودع مصدر ومستودع وجهة مختلفين.
2. التحقق يمنع التحويل إلى المستودع نفسه برسالة عربية.
3. بعد الترحيل ينقص رصيد المصدر ويزيد رصيد الوجهة في عملية واحدة.
4. محاولة تعديل سند مرحّل تفشل برسالة تعارض، ومعها زر `إعادة المحاولة`.

**الأدلة:** `qa-artifacts/browser/uat-06-transfer.png`

---

## السيناريو 7: الفتح الافتتاحي

- **المسار:** `/documents/opening`
- **العنوان:** سندات الافتتاح
- **المسار:** `/documents/opening/new`
- **العنوان:** سند فتح افتتاحي جديد
- **المسار:** `/documents/opening/:documentId`
- **العنوان:** تفاصيل سند الفتح الافتتاحي

**الدور:** `mgr`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/documents/opening"
node scripts/qa/devtools-mcp.mjs wait-for "سندات الافتتاح" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-07-opening.png"
```

**معايير القبول:**

1. سند الافتتاح يعمل مرة واحدة لكل مستودع (رصيد الافتتاح صفر).
2. تاريخ السند قابل للتعديل قبل الترحيل فقط.
3. سند الافتتاح المرحّل يعرضه كمرجع دائم ولا يقبل التعديل.

**الأدلة:** `qa-artifacts/browser/uat-07-opening.png`

---

## السيناريو 8: التسوية وإعدام الأصل

- **المسار:** `/adjustments`
- **العنوان:** سندات التسوية
- **المسار:** `/adjustments/new`
- **العنوان:** سند تسوية جديد
- **المسار:** `/adjustments/disposal/new`
- **العنوان:** سند إعدام أصل

**الدور:** `mgr`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/adjustments"
node scripts/qa/devtools-mcp.mjs wait-for "سندات التسوية" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-08-adjustment.png"
```

**معايير القبول:**

1. التسوية تؤثر على الرصيد ولا تمس السجل الأصلي (السجل غير قابل للتعديل).
2. تسوية على أصل مرحّل تفشل برسالة عربية تذكر السبب.
3. إعدام الأصل يترك أثره في سجل عهدة الأصل.
4. **`keeper` لا يرى زر الإعدام ولا زر التسوية.**

**الأدلة:** `qa-artifacts/browser/uat-08-adjustment.png`

---

## السيناريو 9: الجرد

- **المسار:** `/counts`
- **العنوان:** جلسات الجرد
- **المسار:** `/counts/new`
- **العنوان:** جلسة جرد جديدة
- **المسار:** `/counts/:countId`
- **العنوان:** تفاصيل جلسة الجرد

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/counts"
node scripts/qa/devtools-mcp.mjs wait-for "جلسات الجرد" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-09-count.png"
```

**معايير القبول:**

1. أثناء الجرد تكون الأرصدة مجمدة، ولا تقبل التسوية أو الصرف.
2. إدخال الكمية الفعلية يحفظ مباشرة ولا يغير الرصيد.
3. الجرد غير المكتمل يظهر كغير مكتمل، ويظهر زر الإكمال.
4. إكمال الجرد يسرد الفروقات في سند تسوية.

**الأدلة:** `qa-artifacts/browser/uat-09-count.png`

---

## السيناريو 10: أرصدة المخزون وحركاته

- **المسار:** `/inventory/balances`
- **العنوان:** أرصدة المخزون
- **المسار:** `/inventory/movements`
- **العنوان:** حركات المخزون
- **المسار:** `/inventory/balances/:balanceId`
- **العنوان:** تفاصيل الرصيد

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/inventory/balances"
node scripts/qa/devtools-mcp.mjs wait-for "أرصدة المخزون" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-10-inventory.png"
```

**معايير القبول:**

1. quantities معروضة بالأرقام العربية.
2. التصفية بالمادة تعطي رصيدا واحدا لكل مادة في النطاق المحدد.
3. صفحة الثانية تختلف عن صفحة الأولى في السجلات.
4. الحركات مرتبة من الأحدث إلى الأقدم، وكل حركة قابلة للتفصيل.

**الأدلة:** `qa-artifacts/browser/uat-10-inventory.png`

---

## السيناريو 11: سجل العهد

- **المسار:** `/custody/register`
- **العنوان:** سجل العهد
- **المسار:** `/custody/pending`
- **العنوان:** الأصول بانتظار التكليف
- **المسار:** `/custody/:custodyId`
- **العنوان:** تفاصيل العهدة

**الدور:** `keeper`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/custody/register"
node scripts/qa/devtools-mcp.mjs wait-for "سجل العهد" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs click --uid <زر تخصيص>
node scripts/qa/devtools-mcp.mjs wait-for "تفاصيل" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-11-custody.png"
```

**معايير القبول:**

1. السجل يعرض كل العهد مع الحالة (مفتوحة، مغلقة) ومن هو الحامل.
2. أصل بانتظار التكليف يظهر في المسار المخصص لذلك.
3. التخصيص ينقل الأصل من حساب إلى آخر، ويكتب الحركة في سجل عهدة الأصل.
4. معرّف غير موجود يعطي رسالة خطأ عربية، وليس شاشة بيضاء.

**الأدلة:** `qa-artifacts/browser/uat-11-custody.png`

---

## السيناريو 12: سجل الأصول

- **المسار:** `/assets`
- **العنوان:** سجل الأصول
- **المسار:** `/assets/:assetId`
- **العنوان:** تفاصيل الأصل
- **المسار:** `/assets/:assetId/custody`
- **العنوان:** سجل عهدة الأصل

**الدور:** `keeper` (لا يملك `admin` عرض الأصول)

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/assets"
node scripts/qa/devtools-mcp.mjs wait-for "سجل الأصول" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-12-assets.png"
```

**معايير القبول:**

1. كل أصل يعرض رقم الأصل والمادة والحالة الحالية.
2. سجل عهدة الأصل يعرض التسلسل الزمني الكامل للحركات.
3. `admin` لا يستطيع فتح شاشة الأصول.

**الأدلة:** `qa-artifacts/browser/uat-12-assets.png`

---

## السيناريو 13: الكتالوج

- **المسار:** `/catalog/materials`
- **العنوان:** الأصناف
- **المسار:** `/catalog/materials/:materialId`
- **العنوان:** تفاصيل المادة
- **المسار:** `/catalog/units`
- **العنوان:** وحدات القياس
- **المسار:** `/catalog/domains`
- **العنوان:** مجالات التصنيف
- **المسار:** `/catalog/categories`
- **العنوان:** التصنيفات
- **المسار:** `/catalog/families`
- **العنوان:** العائلات

**الدور:** `admin`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/catalog/materials"
node scripts/qa/devtools-mcp.mjs wait-for "الأصناف" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-13-catalog.png"
```

**معايير القبول:**

1. المادة لا يمكن حفظها إلا بمجال ثم تصنيف ثم عائلة، وكل مستوى يتطلب اختيار الأب.
2. تعديل نوع التتبع (كمي، تسلسلي) أو نوع المادة (استهلاكي، دائم، أصل) يتوقف بعد أول حركة مرحلية.
3. الوحدات قابلة لإعادة الاستخدام ولا تظهر كمرتبة في هرمية المادة.
4. واجهة الكتالوج للأمين لا تعرض أزرار الإنشاء.

**الأدلة:** `qa-artifacts/browser/uat-13-catalog.png`

---

## السيناريو 14: التنظيم والإدارة

- **المسار:** `/organization/sites`
- **العنوان:** المواقع
- **المسار:** `/organization/employees`
- **العنوان:** الموظفون
- **المسار:** `/organization/org-units`
- **العنوان:** الوحدات التنظيمية
- **المسار:** `/organization/external-parties`
- **العنوان:** الجهات الخارجية
- **المسار:** `/organization/organizations`
- **العنوان:** المنظمات
- **المسار:** `/admin/users`
- **العنوان:** المستخدمون
- **المسار:** `/admin/roles`
- **العنوان:** الأدوار

**الدور:** `admin`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/organization/sites"
node scripts/qa/devtools-mcp.mjs wait-for "المواقع" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-14-admin.png"
```

**معايير القبول:**

1. إنشاء موقع يطلب منه اختيار المنظمة من قائمة، ولا يقبل لصق معرف UUID.
2. المستخدم يعين له دور واحد ونطاق واحد فقط.
3. دور `SYSTEM_ADMIN` يعرض البنية فقط ولا يعرض أزرار الإجراءات التشغيلية.
4. لا يظهر زر التعديل لمن لا يملك الصلاحية.

**الأدلة:** `qa-artifacts/browser/uat-14-admin.png`

---

## السيناريو 15: التدقيق والتقارير

- **المسار:** `/audit`
- **العنوان:** سجل التدقيق
- **المسار:** `/reports`
- **العنوان:** التقارير

**الدور:** `auditor`

```bash
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/audit"
node scripts/qa/devtools-mcp.mjs wait-for "سجل التدقيق" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs snapshot
node scripts/qa/devtools-mcp.mjs navigate "http://127.0.0.1:5173/reports"
node scripts/qa/devtools-mcp.mjs wait-for "التقارير" --timeout-ms 20000
node scripts/qa/devtools-mcp.mjs console
node scripts/qa/devtools-mcp.mjs screenshot "uat-15-audit-reports.png"
```

**معايير القبول:**

1. سجل التدقيق يعرض العملية والفاعل والوقت، ولا يعرض أي بيانات اعتماد سرية.
2. كل صف في السجل له اسم وصول عربي مميز، ولا يوجد نص لاتيني في أسماء العمليات.
3. التقارير تعرض أرقامها بالأرقام العربية، ولكل تقرير حالة تحميل وحالة فراغ.
4. `auditor` لا يرى أي زر تعديل أو ترحيل.

**الأدلة:** `qa-artifacts/browser/uat-15-audit-reports.png`

---

## صيغة التقرير النهائي

ينتهي كل تقرير سيناريو بهذه الصيغة:

```text
السيناريو: <الرقم> - <الاسم>
النتيجة: PASS | FAIL | PARTIAL
المسارات المثبتة: <مسارات مطلقة إلى صور الأدلة>
أخطاء لوحة التحكم: <لا يوجد | الوصف>
الملاحظات المرئية: <الوصف>
الحكم: جاهز للإغلاق | معطل: <السبب>
```

## حدود هذا الملف

- الملف يغطي مسارات الإصدار الأول الموجودة في سجل المسارات. أي مسار جديد يجب أن يضاف هنا مع سيناريو مقابل.
- الملف لا يعدل أي ملف في الشيفرة. التنفيذ يسجل الأدلة فقط.
- لقطة الشاشة اختيارية: اعتماد الأساس على `wait-for`، وتجاوز مهلة `screenshot` مقبول إذا أكد `wait-for` الحالة.
