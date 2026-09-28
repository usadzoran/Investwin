# نقل USDT من محفظة الإيداع إلى الخزينة

أضيف مسار يدوي آمن أولًا. لا يعمل تلقائيًا ولا يرسل أي معاملة بمجرد تثبيت الكود.

## متغيرات الخادم

```bash
POLYGON_NETWORK=mainnet
POLYGON_RPC_URL=https://your-rpc-provider
POLYGON_TREASURY_ADDRESS=0xYourTreasuryAddress
POLYGON_USDT_ADDRESS=0xOfficialPolygonUsdtContract
POLYGON_SWEEP_ENABLED=false
```

فعّل التنفيذ فقط بعد اختبار `dry_run`:

```bash
POLYGON_SWEEP_ENABLED=true
```

لا تضع هذه المتغيرات في React أو GitHub Pages. يجب حفظها في Secret Manager على خادم Node.js.

## Endpoint الإداري

```http
POST /api/admin/polygon/sweep
Authorization: Bearer <Supabase access token>
Content-Type: application/json
```

فحص فقط دون إرسال:

```json
{
  "source_user_id": "USER_UUID",
  "amount": "12.50",
  "dry_run": true
}
```

تنفيذ بعد الفحص:

```json
{
  "source_user_id": "USER_UUID",
  "amount": "12.50",
  "dry_run": false
}
```

اترك `amount` فارغًا لتحويل كامل رصيد USDT. الخادم يتحقق من:

- جلسة Supabase وصلاحية الأدمن.
- عنوان الإيداع المشتق ومطابقته للفهرس المسجل.
- رصيد USDT.
- رصيد POL/MATIC لتكلفة الغاز.
- عنوان الخزينة وعنوان عقد USDT من متغيرات الخادم.
- تسجيل العملية قبل الإرسال ثم تحديثها إلى `confirmed` أو `failed`.
- انتظار تأكيد بلوك واحد على الأقل.

## لوحة الأدمن

في تبويب التحويلات توجد منطقة **نقل USDT إلى الخزينة الرئيسية**. تختار المستخدم، تجري الواجهة فحصًا جافًا، تعرض المصدر والخزينة ورسوم الغاز التقديرية، ثم تطلب تأكيدًا صريحًا قبل التنفيذ.

## لماذا لا توجد أتمتة افتراضية؟

الأتمتة تحتاج عاملًا دائمًا أو مهمة مجدولة ومراقبة للتأكيدات وإعادة المحاولة ومنع التكرار. يجب تشغيلها فقط بعد اختبار المسار اليدوي، ووضع حدود للمبلغ، وقائمة سماح للشبكة والعقد، وقفل موزع. الكود الحالي يتعمد إبقاء `POLYGON_SWEEP_ENABLED=false` افتراضيًا.

## تشغيل Polygon Amoy

```bash
POLYGON_NETWORK=amoy
POLYGON_SWEEP_ENABLED=false
```

استخدم RPC وعقد USDT تجريبيين وSeed مختلفًا عن Mainnet.
