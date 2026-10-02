export type PageEntry = "tool" | "report";

/** Resolve a nested static entry to the existing application's hash route. */
export function resolvePageEntryHref(entry: PageEntry, currentHref: string): string {
  const currentUrl = new URL(currentHref);
  const appRoot = new URL("../", currentUrl);

  if (entry === "tool") {
    appRoot.hash = "/new-report";
    return appRoot.href;
  }

  const reportId = currentUrl.searchParams.get("id");
  if (reportId === null || reportId.length === 0) return appRoot.href;

  appRoot.hash = `/reports/${encodeURIComponent(reportId)}`;
  return appRoot.href;
}
