import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la clave secreta (service_role). SOLO para código de servidor
 * (route handlers). Nunca lo importes desde un componente "use client".
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
