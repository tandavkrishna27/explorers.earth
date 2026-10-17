type DiscoveryProcess = {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

/** Playwright's JSON reporter puts loader failures on stdout, not stderr. */
export function discoveryReport<T = unknown>(config: string, result: DiscoveryProcess): { suites: T[] } {
  const evidence = `${config}: status=${result.status}, signal=${result.signal}; ${result.error?.message ?? ''}\n${result.stderr}`;
  let report: { suites?: T[]; errors?: { message?: string }[] } | undefined;
  try { report = JSON.parse(result.stdout); } catch { /* retain raw evidence below */ }
  const errors = report?.errors?.map(error => error.message ?? 'Unknown discovery error').join('\n');
  if (result.status !== 0 || result.signal || result.error || errors) {
    throw new Error(`${evidence}\n${errors || result.stdout.slice(0, 4096)}`);
  }
  if (!report) throw new Error(`${evidence}\ninvalid JSON: ${result.stdout.slice(0, 4096)}`);
  if (!Array.isArray(report.suites)) throw new Error(`${evidence}\nmissing suites`);
  return { suites: report.suites };
}
