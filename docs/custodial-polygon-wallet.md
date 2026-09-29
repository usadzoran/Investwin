# محفظة USDT احتجازية على Polygon

أضيف إلى المشروع نظام محفظة احتجازية Polygon-only لكل مستخدم:

- عنوان إيداع فريد مشتق من `POLYGON_DEPOSIT_MASTER_SEED`.
- عنوان سحب خارجي يحفظه المستخدم ويستعمله النظام فقط للسحب.
- رصيد متاح ورصيد قيد المعالجة في قاعدة البيانات.
- دفتر قيود idempotent يمنع تكرار احتساب إيداع USDT.
- طلب سحب يحجز الرصيد أولًا، ثم تتم معالجته من الخادم.
- لا يصل `POLYGON_DEPOSIT_MASTER_SEED` أو `POLYGON_WITHDRAWAL_PRIVATE_KEY` إلى React أو GitHub Pages.

## تثبيت قاعدة البيانات

شغّل بالترتيب:

1. `supabase/setup.sql`
2. `supabase/polygon_deposit_addresses.sql`
3. `supabase/polygon_indexer.sql`
4. `supabase/custodial_polygon_wallet.sql`

## أسرار الخادم

ضعها في Secret Manager على خادم Backend دائم، وليس في متغيرات `VITE_*`:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-key
SUPABASE_ANON_KEY=public-anon-key
POLYGON_NETWORK=amoy
POLYGON_RPC_URL=https://your-polygon-rpc-provider
POLYGON_USDT_ADDRESS=verified-token-address-for-the-selected-network
POLYGON_DEPOSIT_MASTER_SEED=testnet-only-bip39-seed
POLYGON_WITHDRAWAL_PRIVATE_KEY=testnet-only-hot-wallet-private-key
POLYGON_WITHDRAWALS_ENABLED=false
POLYGON_INDEXER_ENABLED=true
```

ابدأ دائمًا على **Polygon Amoy** باستخدام seed ومفتاح سحب منفصلين. لا تستخدم أسرار Amoy على Mainnet. قبل الإنتاج، تحقّق يدويًا من عقد USDT الرسمي، RPC، chain ID، وعنوان الخزينة/المحفظة الساخنة.

## التدفق التشغيلي

1. بعد تسجيل الدخول، يحصل المستخدم على عنوان إيداع Polygon الخاص به.
2. عامل `pnpm indexer:polygon` يقرأ أحداث ERC-20 Transfer بعد عدد التأكيدات المحدد.
3. عند وصول USDT إلى عنوان المستخدم، يستدعي `record_polygon_custodial_deposit` ويزيد الرصيد مرة واحدة فقط.
4. المستخدم يحفظ عنوان سحب Polygon الخارجي.
5. طلب السحب يمر عبر `create_polygon_withdrawal`: يتحقق من العنوان، يحجز الرصيد ذريًا، ويمنع الطلب المكرر عبر idempotency key.
6. الأدمن أو عامل معالجة محمي يستدعي:

```http
POST /api/admin/polygon/withdrawals/:id/process
Authorization: Bearer <admin-session-token>
```

لا يُفعّل التنفيذ الفعلي إلا بعد اختبار Amoy:

```text
POLYGON_WITHDRAWALS_ENABLED=true
```

## ضوابط إلزامية قبل Mainnet

- استخدام HSM/MPC أو مزود حفظ مؤسسي بدل مفتاح ساخن منفرد كلما أمكن.
- تفعيل allowlist لعناوين السحب، و2FA/موافقة إدارية للسحب، وحد يومي وحد أقصى لكل طلب.
- تمويل محفظة الإيداع بالـ POL للغاز، ومراقبة أرصدة الغاز وRPC.
- تشغيل indexer وBackend كخدمات دائمة مع logs وتنبيهات وقفل موزع.
- عدم تشغيل signer أو indexer على GitHub Pages.
- إجراء reconciliation دوري بين رصيد USDT على السلسلة، دفتر القيود، والأرصدة الداخلية.
- إجراء مراجعة أمنية واختبار استرداد قبل استقبال أموال حقيقية.

هذا الكود يجهز مسارًا احتجازيًا قابلًا للاختبار، لكنه لا ينشر Backend ولا يضع الأسرار تلقائيًا ولا يفعّل تحويلات Mainnet.
