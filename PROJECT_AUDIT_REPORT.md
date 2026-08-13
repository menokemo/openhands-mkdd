# PROJECT_AUDIT_REPORT.md

فحص شامل لبنية المشروع، جودة الكود، والتنظيم — بناءً على فحص فعلي للملفات (مش تخمين).

**تاريخ الفحص:** 2026-08-13
**نطاق الفحص:** `mkdd-ui/` (الكود الأساسي بتاع MKDD) + `compose.yml` + بنية الريبو ككل.
**ملاحظة:** `openhands-agent-canvas/` لم يُفحص من ناحية "جودة الكود" لأنه fork من مشروع مفتوح المصدر خارجي (upstream)، وتعديلاتنا عليه محدودة (ملف واحد فقط، موثق في README قسم 9).

---

## 1. ملخص تنفيذي

المشروع في حالة جيدة بشكل عام: لا يوجد كود ميت واضح، لا تكرار كبير بين الملفات، الـ types منظمة كويس، ومفيش أسرار مسربة. لكن فيه **3 مشاكل بنيوية حقيقية** تستحق الأولوية، بالإضافة لفجوات معروفة سابقًا (توثقت في `BUGS_AND_FIXES.md`).

| الأولوية | المشكلة | التأثير |
|---|---|---|
| 🔴 عالية | `server/index.mjs` ملف واحد ضخم (830 سطر) بمنطق موحّد لكل شيء | صعوبة صيانة، خطر تكرار أخطاء أمنية |
| 🔴 عالية (اكتشاف جديد) | `compose.yml` فيه مسارات مطلقة مربوطة بجهاز الـ VM الحالي | المشروع مش قابل للنقل لجهاز/مسار مختلف بدون تعديل يدوي |
| 🟡 متوسطة | منطق التحقق من ملكية المحادثة (project/employee) مكرر في 3 أماكن منفصلة | لو حصل تحديث أمني في مكان واحد، ممكن يُنسى في الباقي |
| 🟡 متوسطة | صفر اختبارات آلية (tests) في `mkdd-ui` | لا توجد شبكة أمان ضد الأخطاء عند التعديل |
| 🟢 منخفضة | لا يوجد formatter (Prettier)، فقط linter (`oxlint`) | تناسق شكل الكود يعتمد على تقدير المطور |

---

## 2. تفصيل الاكتشافات

### 2.1 🔴 `server/index.mjs`: ملف Backend واحد ضخم (830 سطر)

**الفحص الفعلي:**
```
$ grep -c "try {" server/index.mjs   → 2
$ grep -c "catch" server/index.mjs   → 2
```
830 سطر، **13 route** كلهم متعاملين معاهم بسلسلة `if (req.url === "...")` جوة `handler` واحد طويل، بدون أي framework routing (زي Express router) أو تقسيم لملفات منفصلة.

**أمثلة الـ routes الـ13 الموجودة كلها في نفس الملف:**
```
/api/branding/logo
/api/health
/api/workflow (GET + POST /approve-gate + /blockers + /reviews + /findings)
/api/projects
/api/employees
/api/conversation
/api/chat/send
/api/chat/events
```

**المشكلة الحقيقية:** مش بس "الملف طويل" — المشكلة إن فيه **دالتين مهمتين محشورتين جوه route واحد بالتحديد** (`textContent` و`normalizeEvent`، حوالي السطر 633-777)، وهو بالظبط ما وثّقه الـ README في القسم 26 (Phase A) كخطوة إصلاح مطلوبة، وأكّدناه في `REALTIME_CHAT_RESEARCH.md`. يعني هذا الاكتشاف **مش بحث جديد، لكنه تأكيد فعلي بالأرقام** على حجم المشكلة.

**التوصية:** تقسيم `server/index.mjs` إلى:
```
server/
├── index.mjs              ← نقطة الدخول فقط (يجمع كل حاجة)
├── routes/
│   ├── workflow.mjs        ← /api/workflow/*
│   ├── projects.mjs        ← /api/projects
│   ├── employees.mjs       ← /api/employees
│   ├── conversation.mjs    ← /api/conversation
│   └── chat.mjs            ← /api/chat/send + /api/chat/events
├── lib/
│   ├── openhands-client.mjs   ← دالة openhands() + sessionKey()
│   ├── normalize-event.mjs    ← normalizeEvent + textContent (Phase A من README)
│   └── authorize-conversation.mjs  ← دالة موحدة لمنطق find بالـ project/employee (انظر 2.3)
└── workflow-state.mjs      ← (موجود بالفعل، يبقى كما هو)
```

---

### 2.2 🔴 اكتشاف جديد: `compose.yml` مربوط بمسارات مطلقة (VM-specific)

**الفحص الفعلي لملف `compose.yml`:**
```yaml
volumes:
  - /opt/openhands/projects:/projects
  - /opt/openhands/company-skills:/home/openhands/.agents/skills:ro
  - /opt/openhands/company-agents-definitions:/home/openhands/.agents/agents
...
build:
  context: /opt/openhands/projects/mkdd-ui
```

**المشكلة:** كل المسارات دي **مطلقة (absolute)** ومربوطة بمكان تحديدًا على جهاز الـ VM الحالي (`/opt/openhands/...`)، رغم إن نفس الملفات دي **موجودة فعليًا جوه الريبو نفسه** (`./mkdd-ui`, `./company-skills`, `./company-agents-definitions`).

**التأثير العملي:** هذه مشكلة إضافية ومنفصلة عن مشكلة `AGENT_SERVER_IMAGE` الموثقة سابقًا في `BUGS_AND_FIXES.md` (مشكلة #7/#8). حتى لو حللنا مشكلة بناء صورة agent-canvas، الـ `docker compose up` على أي جهاز جديد (أو حتى لو الريبو انتقل لمسار مختلف على نفس الجهاز) **هيفشل فورًا** لأن Docker مش هيلاقي `/opt/openhands/projects/mkdd-ui`.

**الحل المطلوب:** استبدال كل المسارات المطلقة بمسارات نسبية (relative)، لأن بنية الريبو نفسها فعلاً بتحتوي على كل حاجة محتاجينها بجانب `compose.yml`:
```yaml
volumes:
  - ./mkdd-ui/../projects:/projects   # يحتاج قرار: أين تُخزَّن الـ projects؟ (انظر ملاحظة أدناه)
  - ./company-skills:/home/openhands/.agents/skills:ro
  - ./company-agents-definitions:/home/openhands/.agents/agents
...
build:
  context: ./mkdd-ui
```

**ملاحظة مهمة:** مسار `/opt/openhands/projects` (المشاريع الفعلية اللي الموظفين بيشتغلوا عليها) **ليس** جزءًا من الريبو أصلًا (وهذا صحيح ومقصود — دي بيانات المستخدم الفعلية، مش كود المنتج). الحل الأنسب هنا هو استخدام environment variable بدل مسار ثابت:
```yaml
volumes:
  - ${MKDD_PROJECTS_DIR:-./projects}:/projects
```

**هذا الاكتشاف يجب إضافته إلى `BUGS_AND_FIXES.md`** كمشكلة منفصلة (رقم 9) — سأقوم بذلك بعد هذا التقرير.

---

### 2.3 🟡 تكرار منطق "التحقق من ملكية المحادثة" في 3 أماكن

**الفحص الفعلي:**
```
سطر 421: data.items.find((conversation) => ... project/employee match ...)
سطر 466: data.items.find((candidate) => ... نفس المنطق تقريبًا ...)
سطر 565: searchData.items.find((conversation) => ... نفس المنطق تقريبًا ...)
```

**المشكلة:** هذا هو بالضبط النوع من التكرار اللي بيسبب ثغرات أمنية بمرور الوقت — لو حد عدّل قاعدة التحقق (project + employeeId + fallback إلى employeeName للمحادثات القديمة، كما هو موثق في README قسم 7) في مكان واحد بس، الأماكن التانية ممكن تفضل بالمنطق القديم من غير حد يلاحظ.

**التوصية:** استخراج دالة واحدة:
```javascript
function findAuthorizedConversation(items, { project, employeeId, employeeName }) {
  // منطق المطابقة الموحد (project + employeeId، مع fallback للاسم للمحادثات القديمة)
}
```
وتُستخدم في الأماكن الثلاثة دون استثناء.

---

### 2.4 🟡 صفر اختبارات آلية في `mkdd-ui`

**الفحص الفعلي:**
```
$ find . -iname "*.test.*" -o -iname "*.spec.*"   → (لا نتائج)
$ package.json → لا يوجد سكريبت "test"
```

هذا متسق مع ما هو موثق أصلًا في README (قسم 45، "Testing" ضمن Production Readiness Gaps)، لكن الفحص أكّد أن العدد الحالي هو **صفر بالضبط**، وليس "قليل".

**بالمقارنة:** `openhands-agent-canvas` (الكود الأصلي غير المعدَّل) يحتوي على مئات ملفات `__tests__/*.test.ts` و e2e specs — يعني البنية التحتية للاختبار (Vitest/Playwright) موجودة بالفعل في المشروع الأب، لكنها غير مُفعَّلة في `mkdd-ui` نفسه.

**التوصية:** البدء بأولوية عالية باختبارات لِـ:
1. `findAuthorizedConversation` (بعد استخراجها — بند 2.3) — لأنها منطق أمني حساس.
2. `normalizeEvent` / `textContent` (بعد استخراجها — بند 2.1) — لأنها منطق تطبيع بيانات حساس للأخطاء الصامتة.

---

### 2.5 🟢 لا يوجد Formatter موحّد

**الفحص الفعلي:** `package.json` يحتوي فقط على `oxlint` (linter) بدون Prettier أو أي أداة تنسيق تلقائي.

**الأثر:** منخفض حاليًا (لا توجد مشاكل تنسيق ظاهرة في الكود المفحوص)، لكن بدون أداة تنسيق موحدة، أي فريق يكبر لاحقًا سيواجه تضاربات تنسيق غير ضرورية في المراجعات (code review).

---

## 3. ما هو **جيد بالفعل** (لا يحتاج تغيير)

للأمانة والدقة، هذه النقاط فُحصت ووُجدت سليمة تمامًا:

- ✅ `src/types/index.ts` منظم بوضوح، بدون تكرار مع `src/api/client.ts`.
- ✅ لا توجد أسرار (`.env` حقيقية) أو مفاتيح مسربة في أي مكان بالكود.
- ✅ لا توجد مسارات IP أو `localhost` مكتوبة بشكل ثابت (hardcoded) داخل الكود المصدري لـ `mkdd-ui`.
- ✅ التطابق شبه الكامل بين `company-agents-definitions/` و`company-skills/` (الفرق الوحيد هو `company-orchestrator` الذي له تعريف بدون مجلد skill مطابق — وهذا **متعمد وموثق** في README قسم 3.2، وليس خطأ).
- ✅ لا توجد ملفات "شاردة" أو بقايا تطوير غير مرتبطة بالمشروع في جذر الريبو.
- ✅ فصل الشاشات (`screens/`) عن المكونات (`components/`) عن الـ hooks — البنية الحالية متسقة مع القاعدة الموثقة في README قسم 29 ("moved away from keeping every concern inside App.tsx").

---

## 4. خطة إعادة التنظيم المقترحة (خطوات عملية بالترتيب)

بناءً على الاكتشافات أعلاه، هذا ترتيب تنفيذ مقترح — كل خطوة مستقلة وقابلة للاختبار بمفردها قبل الانتقال للتي تليها:

### الخطوة 1 — إصلاح `compose.yml` (بند 2.2)
تحويل كل المسارات المطلقة إلى نسبية + متغيرات بيئة. **هذه أولوية قصوى** لأنها تمنع تشغيل المشروع من الأساس على أي جهاز غير الـ VM الحالي.

### الخطوة 2 — استخراج `findAuthorizedConversation` (بند 2.3)
أبسط خطوة من ناحية الحجم، وأعلى قيمة أمنية. تُنفَّذ قبل أي إعادة هيكلة أكبر لضمان استخدام نسخة واحدة موحدة أثناء تقسيم الملف.

### الخطوة 3 — تقسيم `server/index.mjs` (بند 2.1)
تنفيذ Phase A من `REALTIME_CHAT_RESEARCH.md` (استخراج `normalizeEvent`/`textContent`) ضمن نفس عملية التقسيم، بدل ما تُعمل مرتين.

### الخطوة 4 — إضافة اختبارات للمنطق المُستخرَج حديثًا (بند 2.4)
بعد استخراج الدوال في الخطوتين 2 و3، تصبح قابلة للاختبار بمعزل عن HTTP request/response — أضِف اختبارات Vitest لها مباشرة.

### الخطوة 5 (اختياري، منخفضة الأولوية) — إضافة Prettier
تهيئة بسيطة، تُنفَّذ في أي وقت مناسب دون اعتماديات على باقي الخطوات.

---

## 5. ملاحظة منهجية

هذا التقرير مبني بالكامل على **فحص فعلي للملفات والأسطر** (عدّ الأسطر، grep، مقارنة قوائم الملفات)، وليس على تخمين أو انطباع عام. كل رقم أو اقتباس مذكور أعلاه قابل لإعادة التحقق بنفس الأوامر المستخدمة في الفحص.
