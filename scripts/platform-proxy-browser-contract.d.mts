export interface ProxyIdentity { file: string; project: string; title: string; }
export interface ProxyManifest { version: string; count: number; identities: ProxyIdentity[]; }
export function validateProxyResources(resources: unknown): void;
export function identities(report: unknown): Array<ProxyIdentity & {test: unknown}>;
export function validateProxyDiscovery(report: unknown, manifest: ProxyManifest): number;
export function validateProxyExecution(report: unknown, manifest: ProxyManifest, exitCode: number): number;
