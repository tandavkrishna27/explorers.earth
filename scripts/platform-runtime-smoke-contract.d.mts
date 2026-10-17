/** Typed inputs for the strict runtime rehearsal assertions. */
export interface CompiledEntry { file: string; source: string }
export interface SessionResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface SchemaEvidence {
  ready: boolean;
  currentId: string;
  currentChecksum: string;
  schemaChecksum: string;
}
export interface RestartEvidence {
  healthy: boolean;
  session: SessionResponse;
  schema: SchemaEvidence;
  roleCount: number;
}
export function selectCompiledExport(entries: CompiledEntry[], name: string): string;
export function assertUnauthenticatedSession(response: SessionResponse): void;
export function assertRestartQualification(result: RestartEvidence, before: SchemaEvidence): void;
