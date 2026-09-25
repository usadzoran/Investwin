import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
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
  if (normalized.includes("email not confirmed")) return "يرجى تأكيد بريدك الإلكتروني أولاً.";
  if (normalized.includes("user already registered")) return "هذا البريد الإلكتروني مسجل بالفعل.";
  if (normalized.includes("password should be at least")) return "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.";
  if (normalized.includes("rate limit")) return "تم تجاوز عدد المحاولات. حاول مرة أخرى بعد قليل.";
  return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
}
