import type {GuidesFailureDiagnostic} from '../tunes/scripts/guides-parent-supervision.js';

/** Runtime checks accept untrusted input and expose only closed diagnostic data. */
export declare function decodeGuidesFixtureFailureLine(line: unknown): GuidesFailureDiagnostic | undefined;
export declare function retainGuidesFixtureFailure(record: unknown, child: unknown): string | undefined;
export declare function retainGuidesNativeFailure(record: unknown, child: unknown, lane: unknown): string | undefined;
export declare function retainGuidesPageFailure(record: unknown, child: unknown, lane: unknown): string | undefined;
export declare function retainGuidesPageSeal(record: unknown, child: unknown, lane: unknown): string | undefined;
