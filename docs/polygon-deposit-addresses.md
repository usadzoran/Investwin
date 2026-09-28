# عناوين إيداع Polygon الفريدة

يستخدم الخادم `ethers` مع مفتاح اشتقاق رئيسي HD لإنشاء عنوان فريد لكل مستخدم. يتم حفظ العنوان العام فقط في `public.user_profiles.polygon_deposit_address`; لا يتم حفظ المفتاح الخاص ولا إرساله إلى المتصفح.

تم استخدام عمود مستقل عمدًا: `wallet_address` في التطبيق الحالي يمثل محفظة المستخدم الخارجية المتصلة عبر MetaMask/WalletConnect، واستبداله بعنوان الإيداع سيؤدي إلى خلط المحفظتين وتعطيل عمليات المستخدم.

## التثبيت

الحزمة موجودة في المشروع بالفعل:

```bash
pnpm install
# أو
npm install ethers @supabase/supabase-js express
```

## متغيرات الخادم

ضعها في بيئة الخادم أو Secret Manager، وليس في Vite أو GitHub Pages:

```bash
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
POLYGON_DEPOSIT_MASTER_SEED="your twelve or twenty four word BIP-39 phrase"
```

`POLYGON_DEPOSIT_MASTER_SEED` سر بالغ الحساسية. استخدم Secret Manager، ودوّر السر وفق سياسة تشغيلية، واحتفظ بنسخة احتياطية مشفرة. لا تضعه في `.env` المرفوع أو GitHub أو سجلات الخادم.

## تهيئة قاعدة البيانات

شغّل ملف:

```text
supabase/polygon_deposit_addresses.sql
```

وهو يضيف `polygon_deposit_address` و`polygon_deposit_derivation_index` وفهارس فريدة ودالة ذرية تمنع تعارض العناوين عند الطلب المتزامن.

## Endpoint

بعد تشغيل Express:

```http
GET /api/polygon/deposit-address
Authorization: Bearer <Supabase access token>
```

مثال استجابة:

```json
{
  "network": "polygon",
  "chain_id": 137,
  "wallet_address": "0x...",
  "wallet_derivation_index": 123,
  "claimed": true
}
```

المسار يعيد العنوان الموجود للمستخدم إذا كان قد أُنشئ سابقًا، وإلا يشتق:

```text
m/44'/60'/0'/0/<wallet_derivation_index>
```

لا يعيد الـ endpoint `privateKey` أو seed أو بيانات مشتقة حساسة.

## الشبكات

### Polygon Mainnet للإنتاج

- Chain ID: `137`
- RPC: استخدم مزودًا موثوقًا عبر متغير خادم مثل `POLYGON_RPC_URL`
- USDT Polygon: تحقّق من عنوان العقد الرسمي من وثائق Polygon/Tether قبل تشغيل مراقبة الإيداعات.

### Polygon Amoy للاختبار

- Chain ID: `80002`
- استخدم seed منفصلًا تمامًا عن Mainnet:

```bash
POLYGON_DEPOSIT_MASTER_SEED="testnet-only seed"
POLYGON_NETWORK=amoy
```

لا تعِد استخدام seed الخاص بـ Mainnet على Amoy.

## الاستخدام في الواجهة

يستخدم الموقع الآن Supabase Edge Function باسم `polygon-backend` مباشرة، لذلك لا يحتاج GitHub Pages إلى `VITE_API_BASE_URL` أو خادم Node.js منفصل لهذا المسار.

ضع الأسرار التالية في Supabase Dashboard → Edge Functions → Secrets، وليس في GitHub:

```text
POLYGON_DEPOSIT_MASTER_SEED
POLYGON_NETWORK
POLYGON_RPC_URL
POLYGON_TREASURY_ADDRESS
POLYGON_USDT_ADDRESS
```

`SUPABASE_URL` و`SUPABASE_SERVICE_ROLE_KEY` متاحان كأسرار تشغيلية داخل Edge Functions. لا تضع Master Seed أو Service Role Key في الواجهة.

بعد تسجيل الدخول، أرسل access token إلى الخادم:

```ts
const { data: { session } } = await supabase.auth.getSession();
const response = await fetch("/api/polygon/deposit-address", {
  headers: { Authorization: `Bearer ${session?.access_token}` },
});
const { wallet_address: depositAddress } = await response.json();
```

## ملاحظات تشغيلية مهمة

- هذا التصميم احتجازي: الخادم/المنصة يملك القدرة التقنية على التحكم في العناوين المشتقة.
- توليد العنوان لا يثبت وصول الإيداع. يجب تشغيل indexer أو خدمة مراقبة تتحقق من عقد USDT والشبكة وعدد التأكيدات ثم تسجل المعاملة في `deposit_records`.
- لا ترسل USDT إلى عنوان شبكة أخرى، ولا تعرض عنوانًا قبل تأكيد الشبكة للمستخدم.
- لا تستخدم `SUPABASE_SERVICE_ROLE_KEY` أو seed في كود React أو متغيرات `VITE_*`.
