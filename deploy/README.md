# نظام النشر التلقائي + المراقبة الاستباقية

نظام نشر تلقائي: أي commit يوصل لفرع `main` على GitHub، بيتنزل ويتبني ويتشغّل تلقائيًا على الـ VM خلال دقيقة تقريبًا، مع rollback تلقائي لو حصل فشل. بجانبه، نظام مراقبة استباقي بيفحص صحة المنظومة دوريًا ويبعت تنبيه فوري عند أي مشكلة.

## ⚠️ القرار المعماري الأساسي (لازم تفهمه قبل التفعيل)

هذا النظام بيستخدم `git reset --hard` عشان يضمن مطابقة الكود المحلي لآخر commit على GitHub تمامًا. هذا الأمر **يمسح أي تعديل يدوي غير محفوظ** في نفس المجلد.

لذلك، النظام مصمم على أساس: **مجلد النشر التلقائي (`/opt/mkdd-live` افتراضيًا) مخصص حصريًا لهذا الغرض — لا يُعدَّل فيه أي ملف يدويًا أبدًا.**

أي تطوير يدوي (تجربة، تعديل، إلخ) يجب أن يحصل في مكان منفصل تمامًا (مثل مجلد التطوير العادي على الـ VM، أو بيئة أخرى)، ثم يُرفع لـ GitHub عبر `git push` عادي عندما يكون جاهزًا. النظام التلقائي بعد كده هو اللي هيتولى نشره.

## 🔒 العزل الكامل عن النظام الشغال فعليًا (Production)

النشر التلقائي **لا يلمس الحاويات الإنتاجية أبدًا.** يشتغل بمعزل تام:

| العنصر | الإنتاج | النشر التلقائي (staging) |
|---|---|---|
| Agent Canvas port | 8000 / 3000 | **18000 / 13000** |
| MKDD UI port | 8787 | **18787** |
| اسم حاوية agent-canvas | `openhands-agent-canvas` | `openhands-agent-canvas-staging` |
| اسم حاوية mkdd-ui | `mkdd-ui` | `mkdd-ui-staging` |
| اسم صورة agent-canvas | `mkdd/agent-canvas:1.16.0-mkdd1` (تعريف الكود، مبنية من `openhands-agent-canvas/docker/Dockerfile` المُخصَّص) | `mkdd/agent-canvas:staging` |
| اسم الـ volume | `openhands_agent_canvas_state` | `openhands_agent_canvas_state_staging` |
| شبكة Docker | مشروع `openhands` (افتراضي) | مشروع `mkdd-staging` (`COMPOSE_PROJECT_NAME`) |

القيم دي معرّفة في `deploy/.env.staging`، و`install.sh` بينسخها لـ `$DEPLOY_DIR/.env` تلقائيًا — `docker compose` بيقرأها لوحده، ومفيش أي تعارض ممكن يحصل مع الإنتاج حتى لو الاتنين شغالين في نفس اللحظة على نفس الـ VM.

**لتجربة النشر التلقائي بعد التركيب:** `http://<VM-IP>:18787` (بدل 8787 للإنتاج).

---

## الجزء 1: النشر التلقائي (auto-deploy)

```
كل 20 ثانية (systemd timer: mkdd-auto-deploy.timer)
    ↓
auto-deploy.sh يشتغل
    ↓
git fetch → هل فيه commit جديد على origin/main؟
    ↓ (لو آه)
يسجّل الـ commit الحالي كـ "آخر نسخة شغالة معروفة" (لو أول مرة)
    ↓
git reset --hard origin/main
    ↓
./setup.sh (docker compose build + up)
    ↓
Health check (يحاول لمدة دقيقة تقريبًا)
    ↓                                    ↓
  ✅ نجح                              ❌ فشل (build أو health check)
    ↓                                    ↓
يحدّث "آخر نسخة شغالة معروفة"      git reset --hard لآخر نسخة شغالة
                                          ↓
                                     يعيد البناء والتشغيل بالنسخة القديمة
```

## الجزء 2: المراقبة الاستباقية (health monitoring)

بُني بعد جلسة تطوير طويلة اكتُشفت فيها مشاكل حقيقية متكررة كان لازم اكتشافها يدويًا كل مرة (Session container crashes، مشاكل ملكية Git، انقطاعات اشتراك LLM، إلخ). الهدف: اكتشاف المشاكل دي تلقائيًا **قبل** ما تؤثر على المالك، بدل اكتشافها بالصدفة.

```
كل 5 دقايق (systemd timer: mkdd-health-check.timer)
    ↓
deploy/health-check.sh يشتغل، يفحص 7 نقاط:
    1. حالة الحاويات (mkdd-ui + agent-canvas فعليًا شغالين)
    2. /api/health (الـ backend بيرد)
    3. /ready بتاع Agent Canvas
    4. سلامة ملكية Git داخل agent-canvas (safe.directory)
    5. جدولة auto-deploy.timer نفسها (مش عالقة على "n/a")
    6. فحص عميق اختياري: فتح محادثة حقيقية لموظف حقيقي (لو مُهيَّأ)
    7. صحة اشتراكات LLM (عام تمامًا — بدون تثبيت أي موديل/مزوّد في الكود)
    ↓
يكتب النتيجة لملف JSON مشترك (mkdd-data/health-status.json)
يسجّل أي "تحوّل" حالة (سليم→فاشل أو العكس) في سجل تاريخي محدود الحجم
    ↓
لو فيه فشل → تنبيه فوري (Push Notification) للمالك عبر /api/internal/alert
```

**الشاشة:** من سايدبار MKDD نفسها → "صحة النظام" — تبويبين: الحالة الحية (النتيجة الحالية لكل فحص)، والسجل (تاريخ كل مرة اتغيّرت فيها حالة أي فحص).

**تفعيل الفحص العميق (اختياري، لكن موصى به):** أضيفي هذه المتغيرات في `$DEPLOY_DIR/.env` الفعلي على الـ VM (بمشروع/موظف حقيقيين موجودين فعلاً):
```bash
MKDD_HEALTH_CHECK_PROJECT=/projects/your-project
MKDD_HEALTH_CHECK_EMPLOYEE_ID=implementation
MKDD_HEALTH_CHECK_EMPLOYEE_NAME=Kirollos
```

---

## التركيب (مرة واحدة فقط)

على الـ VM:
```bash
git clone https://github.com/menokemo/openhands-mkdd.git /tmp/mkdd-installer
cd /tmp/mkdd-installer/deploy
./install.sh
```

هذا هيعمل:
1. Clone نضيف في `/opt/mkdd-live` (منفصل تمامًا عن أي مجلد تطوير موجود).
2. تسجيل الـ commit الحالي كنقطة بداية آمنة (last known good).
3. البناء والتشغيل الأولي الكامل للحزمة.
4. تركيب وتفعيل `mkdd-auto-deploy.timer` (كل 20 ثانية) و`mkdd-health-check.timer` (كل 5 دقايق).
5. تشغيل كلا الخدمتين مرة واحدة فوريًا (لضمان جدولة صحيحة من أول لحظة، بدون الحاجة لأي تدخل يدوي — راجع #142/#143 في `BUGS_AND_FIXES.md` للسبب).

## المراقبة

```bash
systemctl status mkdd-auto-deploy.timer            # هل الـ timer شغال؟
systemctl status mkdd-health-check.timer           # هل فحوصات الصحة شغالة؟
./deploy/health-check.sh                           # فحص يدوي فوري (مفيد بعد أي ترقية)
sudo journalctl -u mkdd-auto-deploy.service -f      # لوج النشر التلقائي المباشر
sudo journalctl -u mkdd-health-check.service -f     # لوج فحوصات الصحة المباشر
tail -f /var/log/mkdd-auto-deploy.log               # لوج تفصيلي لكل عملية نشر
```

## الإيقاف / التعطيل

```bash
sudo systemctl stop mkdd-auto-deploy.timer          # إيقاف مؤقت للنشر التلقائي
sudo systemctl disable mkdd-auto-deploy.timer       # تعطيل دائم للنشر التلقائي
sudo systemctl stop mkdd-health-check.timer         # إيقاف مؤقت لفحوصات الصحة
sudo systemctl disable mkdd-health-check.timer      # تعطيل دائم لفحوصات الصحة
```

## تنبيهات مهمة

- **التكرار كل 20 ثانية يعني فحص متكرر:** لو الـ build بياخد وقت (خصوصًا صورة `agent-canvas` الكبيرة)، الـ Docker layer caching هيخلي معظم الدورات "لا شيء جديد" (fetch سريع، exit فوري). البناء الفعلي الكامل بيحصل فقط لما يكون فيه commit جديد فعليًا.
- **القفل (`flock`) بيحمينا من التداخل:** لو دورة استغرقت أكتر من 20 ثانية (زي أي build فعلي)، الدورة اللي بعدها هتتخطى نفسها بأمان لحد ما السابقة تخلص.
- **الـ rollback مش سحري 100%:** لو فشل الـ commit الجديد **و** فشلت محاولة الرجوع للنسخة القديمة كمان (نادر لكن ممكن)، السكريبت هيسجّل خطأ حرج (`CRITICAL`) في اللوج ويحتاج تدخل يدوي.
- **هذا النظام ينشر أي شيء يصل لـ `main` بدون مراجعة بشرية.** هذا قرار مقصود بناءً على طلب صريح، لكن يستحق إعادة تقييم إذا أصبح المشروع أقرب للإنتاج الفعلي — عندها يُفضَّل إضافة خطوة موافقة (مثل GitHub Environments / required reviewers) قبل النشر التلقائي.
- **فحوصات الصحة للقراءة فقط ومصمَّمة تبقى رخيصة:** لا شيء في `health-check.sh` ينشئ محادثات حقيقية أو يعدّل بيانات — كلها فحوصات حالة/بحث، حتى لو اتشغلت كل 5 دقايق لسنين.
- **مسار خطير محتمل بعد أي ترقية كبيرة لـ`openhands-agent-canvas`:** لو استبدلتِ الشجرة بالكامل بنسخة رسمية جديدة (زي ترقية إصدار)، لازم تراجعي **كل** التعديلات المخصصة يدويًا (مش بس الملف اللي فاكراه) — راجعي `BUGS_AND_FIXES.md #160` لمثال حقيقي حصل فيه فقدان إصلاح مخصص أثناء ترقية.
