export type GuidesReportMatcher='toBeVisible'|'toHaveValue'|'toMatchObject'|'toBe'|'toContain'|'toHaveAttribute'|'toBeChecked'|'toBeEnabled'|'unknown';
export type GuidesBrowserReportCapsule=Readonly<{version:1;counts:Readonly<{passed:number;failed:number;timedOut:number;interrupted:number;skipped:number}>;failures:readonly Readonly<{caseIndex:number;project:'guides-desktop'|'guides-mobile';repeat:0;kind:'assertion'|'timeout'|'strict-mode'|'transport'|'error';matcher:GuidesReportMatcher;line:number|null;column:number|null}>[]}>;
export const GUIDES_REPORT_KINDS:readonly string[];
export const GUIDES_REPORT_MATCHERS:readonly string[];
export function validateGuidesBrowserReportCapsule(input:unknown,isSourcePoint:(line:number,column:number)=>boolean):GuidesBrowserReportCapsule;
export function buildGuidesBrowserReportCapsule(decoded:unknown,titles:readonly string[],projects:readonly string[],isSourcePoint:(line:number,column:number)=>boolean):GuidesBrowserReportCapsule;
export function decodeGuidesBrowserReportFailureLine(line:unknown,lane:unknown,context:unknown):GuidesBrowserReportCapsule|undefined;
export function retainGuidesBrowserReportFailure(record:object,child:unknown,lane:unknown,context:unknown):string|undefined;
