# PROJECT_SUMMARY.md

مرجع سريع لأي حد جديد ينضم للمشروع — إيه اللي إحنا عملناه، إيه اللي شغال، وإيه اللي لسه مطلوب.

> هذا الملف يُحدَّث كل ما يتغير شيء جوهري في المشروع. للتفاصيل الكاملة، راجع `README.md`. لسجل التغييرات الزمني، راجع `CHANGELOG.md`. للمشاكل المعروفة، راجع `BUGS_AND_FIXES.md`. للمبادئ الهندسية الثابتة، راجع `ENGINEERING_PRINCIPLES.md`.

---

## إيه هو المشروع؟

**MKDD** = نظام تشغيل لشركة سوفتوير AI، مبني فوق **OpenHands Agent Canvas** (محرك تنفيذ الوكلاء). بدل محادثة واحدة عامة، MKDD بيقسم الشغل على **13 موظف افتراضي** بأدوار محددة، ضمن **4 بوابات عمل إجبارية** (Requirements → UI/UX → Architecture → Production)، مع قواعد حوكمة صارمة (مراجعات إجبارية، لا merge بدون موافقة، إلخ).

**المبدأ المعماري:** GitHub = مصدر الحقيقة للكود. OpenHands = محرك التنفيذ. MKDD = طبقة الشغل والحوكمة.

---

## بنية الريبو

```
openhands-mkdd/
├── setup.sh                     ← يشغّل كل حاجة من الصفر (docker compose build + up)
├── compose.yml                  ← تعريف الخدمات (agent-canvas + mkdd-ui)
├── mkdd-ui/                     ← منتج MKDD نفسه (الواجهة + الـ backend)
│   ├── src/                     ← React frontend
│   └── server/                  ← Node.js backend
│       ├── index.mjs            ← نقطة الدخول (رفيعة، تربط الـ routes)
│       ├── lib/                 ← منطق مشترك (auth, normalize, work-plan)
│       └── routes/              ← كل route في ملفه (branding, workflow, chat...)
├── openhands-agent-canvas/      ← نسخة معدّلة من OpenHands (fork)
├── company-agents-definitions/  ← تعريف كل موظف (اسم، دور، تعليمات)
├── company-skills/              ← مهارات كل دور (SKILL.md لكل موظف)
├── mkdd-data/branding/          ← أصول العلامة التجارية
├── README.md                    ← التوثيق الكامل والمرجعي للمشروع
├── BUGS_AND_FIXES.md            ← كل مشكلة عُرفت وحلها (أو حالتها)
├── CHANGELOG.md                 ← سجل زمني لكل تغيير
├── PROJECT_AUDIT_REPORT.md      ← تقرير فحص شامل بأرقام فعلية
└── REALTIME_CHAT_RESEARCH.md    ← بحث فني لحل الـ realtime chat
```

---

## إيه اللي شغال دلوقتي (Working)

- الواجهة (Projects → Project Home → Employee Chat) شغالة.
- الـ 13 موظف + الـ conversation isolation (project + employee) شغالين.
- بوابات الـ workflow + الموافقات + الـ blockers/findings شغالة ومحفوظة (persisted).
- استخراج Work Plan الحقيقي من `task_tracker` events (مفيش بيانات مُختلَقة).
- استخراج التكلفة الحقيقية من إحصائيات المحادثة.
- تطبيع آمن للأحداث (Activity) — بدون تسريب chain-of-thought.
- **جديد (2026-08-13):** المشروع أصبح قابلاً للبناء والتشغيل من الصفر على أي جهاز عبر `./setup.sh` — تم التحقق فعليًا ببناء ناجح.
- **جديد (2026-08-13):** `server/` منظّم في `lib/` + `routes/` بدل ملف واحد ضخم، مع 17 اختبار آلي.
- **جديد (2026-08-13):** نظام نشر تلقائي (`deploy/`) — أي commit يوصل لـ `main` على GitHub يتنزل ويتبني ويتشغّل تلقائيًا على الـ VM خلال 20 ثانية، مع rollback تلقائي عند الفشل. **معزول بالكامل عن الإنتاج** (بورتات/أسماء/صورة/volume منفصلة تمامًا). التركيب لمرة واحدة عبر `deploy/install.sh`.
- **جديد (2026-08-13):** نظام تفعيل الموظفين (`bootstrap-employees.mjs`) — تم اكتشاف إن الموظفين (Agent Profiles) بيانات runtime مش مولّدة من الكود، وتم بناء سكريبت يُنشئهم من ملفات `company-agents-definitions/` مع تعليماتهم الكاملة، مربوطين بـ LLM profile يحدده المستخدم. **تم التأكيد الفعلي: 13/13 موظف اتعملوا بنجاح على الـ staging.**
- **جديد (2026-08-13):** زر "+ مشروع جديد" — ينشئ مجلد مشروع فعلي ويسجّله كـ Workspace حقيقي عند OpenHands، مبني على الآلية الحقيقية المؤكَّدة من كود Agent Canvas نفسه (طبقًا لـ `ENGINEERING_PRINCIPLES.md` #1).

## إيه اللي لسه ناقص (Not Complete)

- **Realtime chat حقيقي (WebSocket):** لسه بيعتمد على REST polling. الخطة الكاملة موثقة في `REALTIME_CHAT_RESEARCH.md` (تتضمن الـ endpoint وبروتوكول الـ auth المُكتشفين من كود OpenHands نفسه).
- **اختفاء بيانات الموظفين أحيانًا:** مشكلة معروفة، تفاصيل التحقيق في `BUGS_AND_FIXES.md` #4.
- **آلية اكتشاف مفتاح الجلسة عبر `/proc`:** دين تقني (technical debt)، يحتاج آلية secret مدعومة رسميًا.
- **Authentication حقيقي متعدد المستخدمين:** لسه غير موجود؛ `employeeId`/`employeeName` قادمين من العميل (client) بدون تحقق هوية كامل.
- **PWA، CI/CD، تغطية اختبارات أشمل:** لسه مؤجلة لحد ما الأساسيات تستقر بالكامل.

---

## أول خطوة لأي حد جديد

```bash
git clone https://github.com/menokemo/openhands-mkdd.git
cd openhands-mkdd
./setup.sh
```

هذا يبني ويشغّل كل شيء (Agent Canvas + MKDD UI) بالإعدادات الافتراضية المؤكدة عمليًا. بعدها:
- MKDD UI: `http://localhost:5173`
- Agent Canvas: `http://localhost:3000`

للتطوير على الـ backend فقط:
```bash
cd mkdd-ui
npm ci
npm test      # يشغّل الاختبارات الآلية
npm run build # يتأكد من صحة الـ TypeScript والبناء
```

---

## أولويات التطوير القادمة (بالترتيب)

مأخوذة من `README.md` (قسم 52) و`PROJECT_AUDIT_REPORT.md`:

1. **P0:** إنهاء الـ WebSocket bridge الآمن (الخطة جاهزة في `REALTIME_CHAT_RESEARCH.md`)، حل مشكلة اختفاء بيانات الموظفين.
2. **P1:** إضافة هوية مستخدم حقيقية (authentication)، فرض الموافقات من طرف الـ backend حصريًا.
3. **P2:** آلية أسرار مستقرة (بدل `/proc`)، CI/CD، اختبارات أشمل.
4. **P3:** تحسينات UX نهائية.
5. **P4:** PWA (بعد استقرار كل ما سبق).
