import { createClient } from "@supabase/supabase-js";

let supabaseInstance: any = null;

function getClient() {
  if (!supabaseInstance) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase is not configured. Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables/settings.");
    }
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
}

export const supabase = new Proxy({} as any, {
  get(target, prop, receiver) {
    // If checking properties for console logging or checking existence without failing,
    // we can return undefined or handle gracefully.
    try {
      const client = getClient();
      const value = Reflect.get(client, prop);
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    } catch (err: any) {
      // If it's a standard JS/React inspection, we don't want to crash everything if possible
      if (prop === "then" || prop === "toJSON" || typeof prop === "symbol") {
        return undefined;
      }
      throw err;
    }
  }
});

