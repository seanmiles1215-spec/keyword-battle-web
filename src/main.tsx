import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App, type WebServices } from "./app/App";
import { createApiService, hashFile } from "./lib/api";
import { readPublicConfig } from "./lib/config";
import { createSupabaseServices } from "./lib/supabase";
import { createWorkbenchPageServices } from "./workbench/services";
import "./styles.css";

const { supabaseUrl, publishableKey, apiBaseUrl } = readPublicConfig({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
});
const supabaseServices = createSupabaseServices({ supabaseUrl, publishableKey });
const api = createApiService({ apiBaseUrl, getAccessToken: supabaseServices.getAccessToken });

const services: WebServices = {
  auth: supabaseServices.auth,
  supabase: supabaseServices.supabase,
  api,
  workbench: createWorkbenchPageServices({
    api,
    submission: supabaseServices.supabase,
    workbench: supabaseServices.workbench,
    hashFile,
    createIdempotencyKey: () => crypto.randomUUID(),
  }),
  hashFile,
  createIdempotencyKey: () => crypto.randomUUID(),
  createTaskId: () => crypto.randomUUID(),
  createFeeQuoteRequestId: () => crypto.randomUUID(),
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new TypeError("#app root is required");
createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
