# Auto-Deploy System

نظام نشر تلقائي: أي commit يوصل لفرع `main` على GitHub، بيتنزل ويتبني ويتشغّل تلقائيًا على الـ VM خلال دقيقة تقريبًا، مع rollback تلقائي لو حصل فشل.

## ⚠️ القرار المعماري الأساسي (لازم تفهمه قبل التفعيل)

هذا النظام بيستخدم `git reset --hard` عشان يضمن مطابقة الكود المحلي لآخر commit على GitHub تمامًا. هذا الأمر **يمسح أي تعديل يدوي غير محفوظ** في نفس المجلد.

لذلك، النظام مصمم على أساس: **مجلد النشر التلقائي (`/opt/mkdd-live` افتراضيًا) مخصص حصريًا لهذا الغرض — لا يُعدَّل فيه أي ملف يدويًا أبدًا.**

أي تطوير يدوي (تجربة، تعديل، إلخ) يجب أن يحصل في مكان منفصل تمامًا (مثل مجلد التطوير العادي على الـ VM، أو بيئة أخرى)، ثم يُرفع لـ GitHub عبر `git push` عادي عندما يكون جاهزًا. النظام التلقائي بعد كده هو اللي هيتولى نشره.

## 🔒 العزل الكامل عن النظام الشغال فعليًا (Production)

النشر التلقائي **لا يلمس الحاويات الإنتاجية الشغالة حاليًا (`openhands-agent-canvas`, `mkdd-ui` على البورتات 8000/3000/5173/8787) أبدًا.** يشتغل بمعزل تام، بنفس مبدأ التجربة اليدوية اللي اتعملت على الـ VM في 2026-08-13 (`mkdd-agent-canvas-TEST` على بورتات بديلة):

| العنصر | الإنتاج (الشغال حاليًا) | النشر التلقائي (staging) |
|---|---|---|
| Agent Canvas port | 8000 / 3000 | **18000 / 13000** |
| MKDD UI port | 5173 / 8787 | **15173 / 18787** |
| اسم حاوية agent-canvas | `openhands-agent-canvas` | `openhands-agent-canvas-staging` |
| اسم حاوية mkdd-ui | `mkdd-ui` | `mkdd-ui-staging` |
| اسم صورة agent-canvas | `mkdd/agent-canvas:1.13.0-mkdd1` (تعريف الكود) — **لكن الإنتاج الفعلي الشغال على الـ VM لسه معملوش تحديث خالص، لسه على نسخته القديمة** | `mkdd/agent-canvas:staging` (فعليًا شغال على 1.13.0 ومُتحقَّق منه حيًا) |
| اسم الـ volume | `openhands_agent_canvas_state` | `openhands_agent_canvas_state_staging` |
| شبكة Docker | مشروع `openhands` (افتراضي) | مشروع `mkdd-staging` (`COMPOSE_PROJECT_NAME`) |

القيم دي معرّفة في `deploy/.env.staging`، و`install.sh` بينسخها لـ `$DEPLOY_DIR/.env` تلقائيًا — `docker compose` بيقرأها لوحده، ومفيش أي تعارض ممكن يحصل مع الإنتاج حتى لو الاتنين شغالين في نفس اللحظة على نفس الـ VM.

**لتجربة النشر التلقائي بعد التركيب:** `http://<VM-IP>:15173` (بدل 5173 للإنتاج).

## طريقة العمل

```
كل 20 ثانية (systemd timer)
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
3. تركيب وتفعيل `mkdd-auto-deploy.timer` (systemd) يعمل كل 20 ثانية.

## المراقبة

```bash
systemctl status mkdd-auto-deploy.timer       # هل الـ timer شغال؟
sudo journalctl -u mkdd-auto-deploy.service -f    # لوج systemd مباشر
tail -f /var/log/mkdd-auto-deploy.log             # لوج تفصيلي لكل عملية نشر
```

## الإيقاف / التعطيل

```bash
sudo systemctl stop mkdd-auto-deploy.timer        # إيقاف مؤقت
sudo systemctl disable mkdd-auto-deploy.timer     # تعطيل دائم
```

## تنبيهات مهمة

- **التكرار كل 20 ثانية يعني فحص متكرر:** لو الـ build بياخد وقت (خصوصًا صورة `agent-canvas` الكبيرة)، الـ Docker layer caching هيخلي معظم الدورات "لا شيء جديد" (fetch سريع، exit فوري). البناء الفعلي الكامل بيحصل فقط لما يكون فيه commit جديد فعليًا.
- **القفل (`flock`) بيحمينا من التداخل:** لو دورة استغرقت أكتر من 20 ثانية (زي أي build فعلي)، الدورة اللي بعدها هتتخطى نفسها بأمان لحد ما السابقة تخلص.
- **القفل (locking):** السكريبت بيستخدم `flock` لمنع تشغيل نسختين في نفس الوقت — لو البناء لسه شغال من الدورة اللي فاتت، الدورة الجديدة هتتخطى نفسها بأمان.
- **الـ rollback مش سحري 100%:** لو فشل الـ commit الجديد **و** فشلت محاولة الرجوع للنسخة القديمة كمان (نادر لكن ممكن)، السكريبت هيسجّل خطأ حرج (`CRITICAL`) في اللوج ويحتاج تدخل يدوي.
- **هذا النظام ينشر أي شيء يصل لـ `main` بدون مراجعة بشرية.** هذا قرار مقصود بناءً على طلب صريح، لكن يستحق إعادة تقييم إذا أصبح المشروع أقرب للإنتاج الفعلي — عندها يُفضَّل إضافة خطوة موافقة (مثل GitHub Environments / required reviewers) قبل النشر التلقائي.
