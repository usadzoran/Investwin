import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://vmhhriytxjeikorzoqcs.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtaGhyaXl0eGplaWtvcnpvcWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTYzMzUsImV4cCI6MjEwNTk5MjMzNX0.HxSSo5S89bpTM7cbRSCcqnTxXR1c73xVyGZtAFHJBCU";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export function getSupabaseErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (normalized.includes("email not confirmed")) return "تأكيد البريد الإلكتروني مفعّل حالياً في Supabase. عطّل خيار Confirm email من Authentication ثم حاول مرة أخرى.";
  if (normalized.includes("user already registered")) return "هذا البريد الإلكتروني مسجل بالفعل.";
  if (normalized.includes("database error saving new user") || normalized.includes("user_profiles")) return "قاعدة البيانات غير مكتملة. شغّل ملف supabase/setup.sql كاملاً في SQL Editor ثم أعد المحاولة.";
  if (normalized.includes("signup is disabled") || normalized.includes("signups not allowed")) return "تسجيل الحسابات معطّل في Supabase. فعّل Allow new users من إعدادات Authentication.";
  if (normalized.includes("password should be at least")) return "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.";
  if (normalized.includes("rate limit")) return "تم تجاوز عدد المحاولات. حاول مرة أخرى بعد قليل.";
  return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
}
