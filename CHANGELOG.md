# CHANGELOG.md

سجل زمني لكل تغيير مهم في المشروع. أحدث تغيير في الأعلى.

> **ملاحظة:** لكل commit فيه تغيير سلوك أو بنية، سطر هنا يوضح إيه اللي اتغير وليه.

---

## 2026-08-13 — إعادة هيكلة الـ backend + إصلاح قابلية إعادة البناء + تنظيم شامل

### إضافات
- `setup.sh`: سكريبت واحد يبني ويشغّل المشروع بالكامل من الصفر (clone → build → up)، يتضمن كل القيم المكتشفة (`AGENT_SERVER_IMAGE`, `AUTOMATION_VERSION`).
- `server/lib/`: 5 ملفات جديدة (openhands-client, normalize-conversation, normalize-event, work-plan, authorize-conversation) تحمل منطق مشترك كان مدفون داخل `server/index.mjs`.
- `server/routes/`: 5 ملفات جديدة (branding, workflow, directory, conversation, chat) تحمل كل route منطقه في ملف منفصل.
- 17 اختبار آلي جديد (`node:test`، بدون اعتمادية خارجية جديدة) تغطي منطق التحقق الأمني وتطبيع الأحداث وحساب خطة العمل.
- Prettier (`.prettierrc.json`, `.prettierignore`) لتنسيق موحد للكود.
- `PROJECT_AUDIT_REPORT.md`: تقرير فحص شامل للمشروع بأرقام وأدلة فعلية.
- `REALTIME_CHAT_RESEARCH.md`: بحث فني في كود OpenHands الفعلي لحل فجوة الـ realtime chat.
- `BUGS_AND_FIXES.md`: أول نسخة، ثم تحديثها لاحقًا بكل الإصلاحات المذكورة أدناه.

### إصلاحات
- **`compose.yml` — مسارات مطلقة:** تم استبدال كل المسارات المطلقة (`/opt/openhands/...`) بمسارات نسبية + متغير بيئة `MKDD_PROJECTS_DIR`. المشروع أصبح قابلاً للنقل لأي مسار/جهاز.
- **`compose.yml` — عدم القدرة على بناء صورة agent-canvas:** تمت إضافة `build.context` + `build.args` (`AGENT_SERVER_IMAGE`, `AUTOMATION_VERSION`) بالقيم المؤكدة عمليًا بعد اختبار بناء حقيقي ناجح.
- **Message content normalization (bug #3):** دالة `textContent` الموحدة الجديدة تدعم الآن الشكلين (`string` و array) معًا.
- **تكرار منطق التحقق من ملكية المحادثة:** تم توحيده في `matchesEmployee`/`findAuthorizedConversation`، مُستخدم الآن في كل الأماكن الثلاثة بدلاً من نسخ منفصلة قد تنحرف عن بعضها بمرور الوقت.

### إعادة هيكلة (بدون تغيير سلوك)
- `server/index.mjs` انتقل من 830 سطر بمنطق كل شيء مدمج، إلى نقطة دخول رفيعة (~45 سطر) تربط الـ routes ببعضها. تم التحقق من تطابق السلوك بالكامل: نفس رموز الأخطاء، نفس شكل الاستجابات، نفس ترتيب معالجة الـ routes، مع تشغيل فعلي للسيرفر بعد التعديل للتأكد.

### التحقق (Verification) الذي تم إجراؤه فعليًا قبل الرفع
- `node --check` على كل ملف `.mjs` جديد/معدّل — بدون أخطاء.
- تشغيل فعلي للسيرفر (`node server/index.mjs`) والتأكد من استجابته.
- `npm test` → 17/17 ناجح.
- `npx tsc -b` → بدون أخطاء.
- `npm run build` → بنجاح (dist تم إنشاؤه وحذفه بعد التأكد، لا يُرفع للريبو).
- `npx prettier --write .` ثم إعادة تشغيل الاختبارات والـ build للتأكد من عدم كسر أي شيء.

---

## 2026-08-13 — الرفع الأولي على GitHub

- تصدير كامل لكود `mkdd-ui` و`openhands-agent-canvas` (المعدّل) و`company-agents-definitions` و`company-skills` و`mkdd-data/branding` من الـ VM.
- التحقق من مطابقة كل التعديلات غير المحفوظة (uncommitted) للمصدر الأصلي قبل الرفع.
- التحقق من عدم وجود أسرار (`.env` حقيقي) أو `node_modules`/`dist` في التصدير.
- اختبار فعلي لبناء صورة `openhands-agent-canvas` من الكود المصدري (وليس من صورة جاهزة)، واكتشاف الحاجة لـ `AGENT_SERVER_IMAGE`/`AUTOMATION_VERSION` (موثق بالتفصيل في `BUGS_AND_FIXES.md` #7/#8).
- تشغيل تجريبي لـ `agent-canvas` و`mkdd-ui` كحاويات معزولة على بورتات بديلة للتأكد من نجاح البناء، ثم حذفهما بأمان دون التأثير على الحاويات الأصلية الشغالة.
- الرفع الفعلي إلى `https://github.com/menokemo/openhands-mkdd`.

---

## قالب للإضافة المستقبلية

```markdown
## YYYY-MM-DD — عنوان مختصر للتغيير

### إضافات
- ...

### إصلاحات
- ...

### إعادة هيكلة
- ...
```
