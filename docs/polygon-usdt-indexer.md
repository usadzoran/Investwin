# مراقب إيداعات USDT على Polygon

الملف `scripts/polygon-usdt-indexer.mjs` هو عامل Node.js deterministic يقرأ أحداث ERC-20 `Transfer` من عقد USDT، يطابق المستلم مع `user_profiles.polygon_deposit_address`، ثم يستدعي RPC ذريًا في Supabase لتسجيل الإيداع وزيادة `user_balances.usdt_deposit_balance`.

## التثبيت

```bash
pnpm install
pnpm indexer:polygon
```

## الإعداد

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-key
POLYGON_NETWORK=mainnet
POLYGON_RPC_URL=https://your-polygon-rpc-provider
POLYGON_USDT_ADDRESS=0xOfficialPolygonUsdtContract
POLYGON_INDEXER_ENABLED=true
POLYGON_INDEXER_CONFIRMATIONS=20
POLYGON_INDEXER_BLOCK_BATCH=1500
POLYGON_INDEXER_START_BLOCK=0
POLYGON_INDEXER_INTERVAL_MS=15000
```

استخدم `POLYGON_INDEXER_ENABLED=false` افتراضيًا. لا تشغّل العامل على GitHub Pages أو داخل المتصفح؛ يجب تشغيله على Backend دائم أو عامل مجدول موثوق مع حفظ الأسرار في Secret Manager.

## السلامة ومنع التكرار

- ينتظر العامل عدد التأكيدات المحدد قبل قراءة البلوك.
- يحفظ `next_block` في `polygon_indexer_state` ليستأنف بعد إعادة التشغيل.
- يطابق عنوان العقد المحدد في البيئة فقط.
- يسجل كل transaction مرة واحدة عبر قيد `(chain_key, tx_hash)`.
- الدالة `record_polygon_usdt_deposit` تزيد الرصيد فقط إذا كان الإدخال جديدًا، لذلك لا يتكرر الرصيد عند إعادة الفحص.
- لا يعتبر تحويلًا إلى عنوان غير معروف إيداعًا.

## Amoy

```bash
POLYGON_NETWORK=amoy
POLYGON_INDEXER_ENABLED=true
POLYGON_INDEXER_START_BLOCK=0
```

استخدم عقد USDT تجريبيًا وRPC وseed منفصلة تمامًا عن Mainnet.

## لوحة الأدمن

أضيف endpoint محمي:

```http
GET /api/admin/polygon/treasury-stats
Authorization: Bearer <Supabase access token>
```

يعيد:

- رصيد USDT الحالي للخزينة من الشبكة.
- رصيد POL/MATIC للغاز.
- إجمالي الإيداعات المؤكدة من قاعدة البيانات.
- عدد معاملات الإيداع.
- إجمالي التحويلات المؤكدة المسجلة كفوائد أدمن.

وتعرض لوحة الأدمن هذه القيم في بطاقات **خزينة Polygon**.

## تشغيل مستمر

هذا العامل يحتاج تشغيلًا دائمًا أو مهمة خلفية متكررة على خادم Node.js. لا تستخدم Manus schedule لفحص كل عدة ثوانٍ؛ استخدم worker دائمًا أو cron/heartbeat على منصة استضافة Backend، مع مراقبة logs وإنذارات عند توقف RPC أو فشل Supabase.
