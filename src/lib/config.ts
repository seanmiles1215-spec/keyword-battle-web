export interface PublicConfig {
  supabaseUrl: string;
  publishableKey: string;
  apiBaseUrl: string;
}

type BrowserEnvironment = Record<string, string | boolean | undefined>;

function requiredString(environment: BrowserEnvironment, name: string) {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} is required`);
  }
  return value;
}

function requiredUrl(environment: BrowserEnvironment, name: string) {
  const value = requiredString(environment, name);
  const parsed = new URL(value);
  const isLocalHttp = parsed.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    throw new TypeError(`${name} must use HTTPS`);
  }
  return value.replace(/\/$/u, "");
}

export function readPublicConfig(environment: BrowserEnvironment): PublicConfig {
  const publishableKey = requiredString(environment, "VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new TypeError("VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key");
  }

  return {
    supabaseUrl: requiredUrl(environment, "VITE_SUPABASE_URL"),
    publishableKey,
    apiBaseUrl: requiredUrl(environment, "VITE_API_BASE_URL"),
  };
}
