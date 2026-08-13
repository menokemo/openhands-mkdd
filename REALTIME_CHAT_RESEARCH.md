# REALTIME_CHAT_RESEARCH.md

بحث فني في الكود الفعلي بتاع `openhands-agent-canvas` لمعرفة إزاي نحل فجوة الـ realtime chat الموثقة في README (قسم 22-26) و`BUGS_AND_FIXES.md` (مشكلة #5).

**تاريخ البحث:** 2026-08-13
**المصدر:** `openhands-agent-canvas/src/` (الكود الفعلي المستخدم في الإنتاج بواسطة OpenHands نفسه)

---

## 1. الاكتشاف الأساسي: الـ endpoint جاهز بالفعل

OpenHands Agent Server بيوفر WebSocket جاهز لكل محادثة على:

```
ws(s)://<host>[/path-prefix]/sockets/events/{conversationId}
```

مصدر البناء: `src/utils/websocket-url.ts` → `buildWebSocketUrl()`

**ملاحظات مهمة من الكود:**
- البروتوكول (`ws` أو `wss`) بيتحدد حسب بروتوكول الصفحة نفسها، مش حسب الـ URL الأصلي فقط — عشان صفحة HTTPS تفتح WSS إجباريًا، وصفحة HTTP تقدر تفتح WS عادي (مهم في بيئات الـ dev/proxy).
- فيه `path-prefix` بيتحسب تلقائي من الـ conversation URL، عشان يشتغل صح خلف reverse proxy (زي الحالة بتاعت MKDD نفسها).

---

## 2. آلية الـ Authentication على الـ WebSocket

**هي أبسط بكتير مما كنا نتوقع.** مفيش headers خاصة، ومفيش query params للمفتاح. بدل كده:

مصدر: `src/utils/websocket-auth.ts`

بعد فتح الاتصال مباشرة، بيتبعت **أول رسالة** بالشكل ده:

```json
{
  "type": "auth",
  "session_api_key": "<SESSION_API_KEY>"
}
```

**الأهمية بالنسبة لـ MKDD:** ده معناه إن الـ session key **لازم يتبعت فقط من طرف السيرفر** (MKDD backend) وقت ما بيفتح الاتصال مع OpenHands، مش من المتصفح خالص — وده متوافق 100% مع مبدأ الأمان الموثق في README قسم 46 ("Never expose the OpenHands session API key to the browser").

---

## 3. نموذج الـ Hook الجاهز (`use-websocket.ts`)

مصدر: `src/hooks/use-websocket.ts`

بيوفر:
- **Auto-reconnect** بفاصل زمني 3 ثواني، وبحد أقصى محاولات قابل للتهيئة (`maxAttempts`).
- **تتبع حالة الاتصال** (`isConnected`, `isReconnecting`, `error`).
- **تنظيف آمن** عند الـ unmount (بيلغي أي إعادة اتصال معلقة قبل ما يقفل الـ socket، عشان مايحصلش race condition).
- إرسال الـ auth تلقائيًا في `ws.onopen` قبل أي حاجة تانية.

**التوصية:** هذا النموذج (المنطق، مش الكود الحرفي) مناسب تمامًا ليُقتبس لبناء الاتصال بين **المتصفح والـ MKDD backend** (وليس بين المتصفح و OpenHands مباشرة).

---

## 4. آلية الـ Merge-by-ID ومنع التكرار (`use-event-store.ts`)

مصدر: `src/stores/use-event-store.ts`

هذا هو **بالضبط** الحل لمشكلة "Realtime must be event-driven" الموثقة في README (قسم 49) وخطة "Phase D" (قسم 26). آلية العمل:

1. **Set منفصل للمعرفات (`eventIds: Set<string | number>`)** بيتفحص أول ما event جديد يوصل — لو موجود بالفعل، الحدث يُتجاهل فورًا (O(1) lookup، مش O(n) بحث في الـ array).
2. **دمج الرسائل المتدفقة (streaming deltas):** لو الحدث الجديد والحدث الأخير في القائمة كلاهما streaming delta من نفس المُرسل، بيتم دمج المحتوى بدل إضافة عنصر جديد — وده بيمنع تكرار "فقاعات" الرسائل أثناء بث الرد.
3. **الترتيب حسب timestamp فقط عند الحاجة:** الدالة `needsSorting()` بتتأكد الأول هل الحدث الجديد فعلاً "متأخر زمنيًا" عن آخر حدث في القائمة قبل ما تعمل sort كامل — تحسين أداء مهم لما يكون فيه آلاف الأحداث.
4. **`addEvents` (bulk):** نفس منطق الـ dedup لكن لمجموعة أحداث دفعة واحدة — مستخدم لتحميل التاريخ الأولي (REST) وتحميل الصفحات الأقدم (scroll-up pagination).

**التوصية لـ MKDD:** هذا هو النموذج المرجعي لتطبيق "merge by event ID" المطلوب في `useConversation.ts` بتاع MKDD (README قسم 28)، بدل الاعتماد على استبدال القائمة بالكامل عند كل polling.

---

## 5. حل مشكلة #3 الموثقة (`Message content normalization mismatch`)

هذا البحث وضّح **بدقة** سبب المشكلة الموثقة في `BUGS_AND_FIXES.md`:

مصدر: `src/types/agent-server/core/base/event.ts`

الشكل الرسمي لمحتوى الرسالة في OpenHands هو دايمًا **array**:
```typescript
content: (TextContent | ImageContent)[]
```

لكن MKDD backend (حسب الموثق في `BUGS_AND_FIXES.md`) بيتوقع أحيانًا استقبال محتوى كـ string خام كمان. بما إن الشكل الرسمي في OpenHands نفسه هو array دايمًا (مفيش union type بـ `string` في تعريف الـ types الأساسي)، فالحل الصحيح المقترح هو:

**دالة توحيد واحدة (normalizer) في MKDD backend تقبل الشكلين وترجع array موحد دايمًا:**
```javascript
function normalizeMessageContent(content) {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content; // already in the correct shape
  }
  return [];
}
```

هذه الدالة يجب أن تكون **الدالة الوحيدة** المستخدمة في كل من:
- REST history route.
- WebSocket live event handler (المستقبلي).

(هذا يطابق "Phase A — shared normalization" الموثقة في README قسم 26، ويؤكد صحة الخطة الموضوعة أصلاً).

---

## 6. المعمارية المستهدفة النهائية (مبنية على الاكتشافات أعلاه)

```
┌──────────────┐     WebSocket (نفس منطق       ┌──────────────┐
│   المتصفح    │ ◄──  use-websocket.ts hook) ──► │ MKDD Backend │
│  (React UI)  │                                  │  (Node.js)   │
└──────────────┘                                  └──────┬───────┘
                                                           │
                                          WebSocket + auth message
                                          { type: "auth",
                                            session_api_key: "..." }
                                                           │
                                                           ▼
                                                ┌────────────────────┐
                                                │  OpenHands Agent   │
                                                │  Server            │
                                                │ /sockets/events/id │
                                                └────────────────────┘
```

### خطوات التنفيذ المقترحة (تفصيلية، تُبنى فوق الخطة الموجودة في README قسم 26):

1. **Phase A (شارد normalization):** استخراج `normalizeMessageContent` و`normalizeEvent` كدوال top-level مشتركة، تُستخدم من REST ومن WebSocket معًا (كما هو موثق أصلاً).

2. **Phase B:** تطبيق `normalizeMessageContent` أعلاه بالضبط — تم تأكيد الشكل الصحيح من كود OpenHands نفسه.

3. **Phase C (secure backend WebSocket bridge):**
   - MKDD backend يفتح اتصال WebSocket **من طرفه هو** (server-side) إلى:
     ```
     ws://agent-canvas:8000/sockets/events/{conversationId}
     ```
   - فور الفتح، يرسل رسالة الـ auth بنفس شكل `websocket-auth.ts`:
     ```json
     { "type": "auth", "session_api_key": "<KEY_FROM_/proc_OR_FUTURE_SECRET_MECHANISM>" }
     ```
   - يستقبل الأحداث الخام من OpenHands، يمررها على دالة الـ normalizer (Phase A)، ثم يعيد بثها فقط للمتصفح المصرح له (بعد التحقق من project/employee/conversation ownership، كما هو موثق في README قسم 24).

4. **Phase D (frontend live subscription):**
   - `useConversation.ts` في MKDD يستخدم نفس نموذج `use-websocket.ts` (الموجود في OpenHands نفسه) للاتصال بـ **MKDD backend** (مش OpenHands مباشرة).
   - دمج الأحداث الواردة باستخدام نفس منطق `use-event-store.ts` (dedup بـ Set + merge streaming deltas + ترتيب بالـ timestamp عند الحاجة فقط).

5. **Phase E (optimistic user message):** إضافة الرسالة المرسلة للواجهة فورًا، ثم استبدالها/تأكيدها عند وصول الـ echo من السيرفر (نفس مبدأ عام مستخدم في أي تطبيق تراسل حديث).

6. **Phase F (إزالة الـ polling التراكمي):** بمجرد أن يثبت مسار الـ WebSocket استقراره، يُزال الاعتماد على REST polling المتكرر الكامل، ويبقى REST فقط لتحميل التاريخ الأولي والتعافي عند فشل الـ WebSocket.

---

## 7. ملخص القيمة المضافة لهذا البحث


| السؤال المفتوح في README | الإجابة المكتشفة |
|---|---|
| ما شكل الـ WebSocket endpoint في OpenHands؟ | `/sockets/events/{conversationId}` — موثق ومُستخدم فعليًا |
| إزاي بيتم الـ authentication؟ | رسالة JSON أولى بعد الفتح: `{type: "auth", session_api_key: "..."}` |
| إزاي أعمل merge-by-ID بشكل مثبت وفعّال؟ | نموذج `use-event-store.ts` جاهز بالكامل (Set + streaming merge + conditional sort) |
| إزاي أعمل reconnect بشكل موثوق؟ | نموذج `use-websocket.ts` جاهز (backoff 3 ثواني + maxAttempts + تنظيف آمن) |
| إيه الشكل الرسمي لمحتوى الرسالة (string أم array)؟ | Array دايمًا في OpenHands (`(TextContent \| ImageContent)[]`) — يؤكد أن الحل هو normalizer واحد في MKDD وليس تغيير في توقعات الشكل |

**الخلاصة:** لا حاجة لابتكار بروتوكول أو معمارية جديدة من الصفر. الحل هو **إعادة استخدام نفس الأنماط والمنطق المُثبتة فعليًا داخل OpenHands نفسه**، مع تطبيقها مرتين:
- مرة بين **MKDD backend و OpenHands** (بنفس بروتوكول auth الأصلي).
- ومرة بين **المتصفح و MKDD backend** (بنفس نموذج الـ hook وإدارة الأحداث).

---

## 8. حالة التنفيذ (تحديث 2026-08-13)

| Phase | الوصف | الحالة |
|---|---|---|
| A | Shared normalization | ✅ تم — `server/lib/normalize-event.mjs` مستخدم من REST **و** WebSocket بدون أي فرق منطق |
| B | String message content | ✅ تم — نفس `textContent` بيدعم الشكلين |
| C | Secure backend WebSocket bridge | ✅ تم — `server/lib/ws-bridge.mjs`، مُختبَر فعليًا (auth check، رفض بارامترات ناقصة، رفض مسار غلط) |
| D | Frontend live subscription | ✅ تم — `useConversation.ts` بيتصل بـ WebSocket بعد تحميل التاريخ الأولي، مع reconnect بـ backoff (10 محاولات، 3 ثواني) |
| E | Optimistic user message | ✅ تم — رسالة المستخدم تظهر فورًا، وتُستبدَل تلقائيًا بالـ echo الحقيقي أول ما يوصل عبر WebSocket |
| F | إزالة الـ polling التراكمي | ✅ تم جزئيًا — الـ polling الرئيسي (كل ثانيتين) اتشال بالكامل؛ بقي resync خفيف كل 15 ثانية كـ fallback (تحديث الـ cost/execution status، والتعافي لو الـ WebSocket فشل يعيد الاتصال) |

**قيود معروفة بعد هذا التنفيذ (صريحة، مش مخفية):**
- **Work Plan لسه مش live 100%:** تحديثات `task_tracker` الحية عبر WebSocket بتوصل كأحداث منفردة، لكن حساب الـ work plan الكامل (نسبة الإنجاز، إلخ) لسه محسوب فقط في REST route (`server/lib/work-plan.mjs`) من تاريخ الأحداث الكامل. يتحدّث كل 15 ثانية عبر الـ resync، مش لحظيًا مع كل حدث.
- **الاختبار الفعلي محدود ببيئة بدون Docker:** تم التحقق الكامل من: منطق الأمان (رفض/قبول الاتصال)، توافق HTTP+WS في نفس السيرفر، البناء والاختبارات. **لم يتم بعد** اختبار محادثة حقيقية كاملة (رسالة → رد فعلي من موظف) على الـ staging، لأن هذا يحتاج بيئة Docker فعلية (VM المستخدم).

---
