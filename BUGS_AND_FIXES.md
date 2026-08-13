# BUGS_AND_FIXES.md

سجل بالمشاكل (Bugs) التي واجهت المشروع، وكيف تم اكتشافها، وحلها (أو حالتها الحالية إذا لم تُحل بعد).

> **ملاحظة:** هذا الملف يجب تحديثه مع كل commit فيه إصلاح لمشكلة أو اكتشاف مشكلة جديدة.

---

## ✅ تم حلها (Fixed)

### 1. Events response status regression
**الوصف:** بعد إضافة الـ pagination الكامل للـ events، الـ route كان بيستخدم متغير response قديم بالغلط عند إرجاع البيانات النهائية، مما كان يتسبب أحيانًا في فشل الاستجابة رغم نجاح جلب البيانات من OpenHands.

**الأثر:** الرسائل كانت بتتأخر أو متظهرش صح في الشات.

**الحل:** تم تصحيح استخدام متغير الـ response الصحيح.

**النتيجة بعد الإصلاح:** تحسن ظهور الرسائل بشكل ملحوظ.

---

### 2. Health response status regression
**الوصف:** الـ health route كان بيرجع بالغلط status variable تبع الـ chat events بدل الـ status الخاص به هو.

**الحل:** تم إرجاعه لاستخدام response status الخاص بالـ health request نفسه.

---

## 🔴 معروفة ولسه مفتوحة (Known / Open)

### 3. Message content normalization mismatch
**الوصف:** الـ normalization الحالي في MKDD بيقبل محتوى الرسائل فقط لما تكون array من text-content objects. لكن كود OpenHands Agent Canvas بيدعم كمان استقبال المحتوى كـ string مباشر.

**الحالة:** تم تحديد المشكلة، لكن لم يتم إصلاحها بعد.

**محاولة سابقة:** تمت محاولة تعديل تلقائي (scripted edit) لكنها فشلت في إيجاد الـ source anchor بالضبط، فتم إيقاف المحاولة **بدون** تعديل الملف عشوائيًا. القاعدة المتبعة: لا يتم تطبيق أي تعديل جماعي (blind patch) إذا لم يتطابق الـ anchor المطلوب بدقة.

**الخطوة القادمة:** دعم الشكلين معًا:
```
string
أو
[{ type: "text", text: "..." }]
```

---

### 4. اختفاء بيانات الموظفين (Employee Information Disappearance)
**الوصف:** معلومات الموظف أحيانًا بتختفي من الواجهة، وممكن تفضل مختفية حتى بعد عمل refresh للمتصفح.

**الحالة:** لم يتم حلها بالكامل، مشكلة نشطة.

**مناطق مشتبه بها لسه تحت التحقيق:**
1. سلوك الـ background polling لحالة الفريق.
2. فشل مؤقت في lookup المحادثة.
3. استبدال الـ state ببيانات جزئية (partial response).
4. تبعيات الـ React hooks اللي ممكن تعمل إعادة تحميل عند تغيّر identity الكائن.
5. عدم التفريق بين "لا توجد قيمة" و"الطلب فشل" — القاعدة المهمة: `fetch failed ≠ employee has no current work plan`. لو الاتنين بيتحولوا لـ `null`، الواجهة مش هتعرف تفرّق بينهم.
6. توقيت بيانات المحادثة أثناء تشغيل OpenHands run فعليًا.
7. تحديثات execution-state بتوصل بشكل مستقل عن تاريخ المحادثة.

**الحل المقترح:** استخدام semantics واضحة (success / error / update) بدل الاعتماد على شروط إضافية في الواجهة.

---

### 5. معمارية الشات الحالية غير كافية (Polling بدل Realtime)
**الوصف:** الشات حاليًا بيعتمد على REST + polling متكرر، مش WebSocket حقيقي.

**الأعراض الملاحظة:**
- ردود الـ agent بتظهر متأخرة في MKDD مقارنة بواجهة OpenHands الأصلية.
- محتوى المحادثة ممكن يختفي أحيانًا.
- الـ refresh مش بيضمن استرجاع فوري للمعلومات الناقصة.

**الحالة:** الحل المستهدف موثق بالكامل في خطة "Realtime Architecture Target" (انظر README قسم 24-26)، وما زال قيد التنفيذ (WebSocket bridge لسه مش مكتمل).

---

### 6. آلية اكتشاف مفتاح الجلسة عبر `/proc` (Technical Debt)
**الوصف:** الـ backend حاليًا بيكتشف الـ OpenHands session API key عن طريق فحص `/proc` والبحث عن argument اسمه `--session-api-key`، وده معتمد على:
- Shared PID namespace بين الحاويتين.
- شكل معين لسطر أوامر العملية.
- اسم launcher/process محدد.

**الحالة:** يعمل حاليًا، لكنه **دين تقني (Technical Debt)** ومش معماري نهائي.

**الحل المستهدف:** استخدام آلية secret/config مدعومة رسميًا بدل فحص `/proc`.

---

## 🧪 اكتشافات تحقق (Verification Findings) — 2026-08-13

### 7. الـ compose.yml مش قادر يبني صورة agent-canvas من الكود مباشرة
**الوصف:** تم اختبار بناء صورة `openhands-agent-canvas` من الكود المصدري مباشرة (بدون الاعتماد على صورة جاهزة locally)، واكتُشف إن الـ Dockerfile يحتاج build arguments إجبارية غير موثقة في `compose.yml`:
```
ARG AGENT_SERVER_IMAGE   ← إجباري، بدون default
ARG AUTOMATION_VERSION   ← إجباري، بدون default
```

**الأثر:** أي محاولة لبناء الصورة من الصفر (على VM جديدة مثلاً) كانت هتفشل بالخطأ:
```
ERROR: failed to build: failed to solve: base name (${AGENT_SERVER_IMAGE}) should not be blank
```

**التحقيق:** تم العثور على القيم الصحيحة داخل `openhands-agent-canvas/config/defaults.json`:
```json
"versions": { "agentServer": "1.40.1", "automation": "1.6.0" },
"images": { "agentServer": "ghcr.io/openhands/agent-server" }
```

**القيم المؤكدة عمليًا (تم اختبار البناء بنجاح بها):**
```
AGENT_SERVER_IMAGE=ghcr.io/openhands/agent-server:1.40.1-python
AUTOMATION_VERSION=1.6.0
```

**نتيجة الاختبار:** تم بناء الصورة بنجاح (34/34 خطوة)، وتم تشغيلها فعليًا كـ container منفصل (اسم مؤقت `mkdd-agent-canvas-TEST`) على بورتات بديلة (`18000`, `13000`) بدون التأثير على الحاويات الأصلية الشغالة، وتم التأكد من عملها ثم حذفها بأمان بعد الاختبار.

**الحالة:** لسه لم يتم تعديل `compose.yml` ليدمج هذه القيم بشكل دائم (`build:` context). هذا الإصلاح لسه مطلوب (انظر القسم 8 أدناه).

**الحالة:** 🔴 مفتوحة — إصلاح مخطط له، لم يتم تنفيذه بعد.

---

### 8. `compose.yml` بدون `build:` context لصورة agent-canvas
**الوصف:** ملف `compose.yml` الحالي يستخدم:
```yaml
agent-canvas:
    image: mkdd/agent-canvas:1.12.0-mkdd2
```
بدون سطر `build:`، يعني الملف يفترض أن الصورة موجودة مسبقًا (locally أو على registry)، ولا يحتوي على تعليمات لبنائها من الكود المصدري (`openhands-agent-canvas/`).

**الأثر:** لا يمكن حاليًا إعادة بناء البيئة بالكامل على VM جديدة باستخدام `docker compose up` فقط.

**الحل المطلوب:** إضافة `build:` context في `compose.yml` مع تمرير القيم الصحيحة لـ `AGENT_SERVER_IMAGE` و`AUTOMATION_VERSION` (انظر مشكلة #7).

**الحالة:** 🔴 مفتوحة.

---

## قوالب للإضافة المستقبلية

عند إضافة مشكلة جديدة، استخدم هذا القالب:

```markdown
### N. عنوان المشكلة
**الوصف:** ...
**الأثر:** ...
**الحل:** ... (أو "لم يتم حلها بعد")
**الحالة:** ✅ تم الحل / 🔴 مفتوحة
```
