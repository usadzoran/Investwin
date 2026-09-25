import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "https://cjmutyofskqaershxkko.supabase.co";
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqbXV0eW9mc2txYWVyc2h4a2tvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMzA4MDAsImV4cCI6MjEwNTgwNjgwMH0.fxPBgvf3O2jk1uVIFZgKof5HIkzVhN4kYb361ob1D8U";

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
  if (normalized.includes("email not confirmed")) return "يرجى تأكيد بريدك الإلكتروني أولاً.";
  if (normalized.includes("user already registered")) return "هذا البريد الإلكتروني مسجل بالفعل.";
  if (normalized.includes("password should be at least")) return "يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.";
  if (normalized.includes("rate limit")) return "تم تجاوز عدد المحاولات. حاول مرة أخرى بعد قليل.";
  return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
}
