/**
 * Express' default route matching is ASCII case-insensitive and permits one
 * trailing slash. Callers must pass the already-separated URL pathname.
 */
const NATIVE_REGISTRATION_PATH = /^\/[aA][pP][iI]\/[rR][eE][gG][iI][sS][tT][eE][rR]\/?$/;

export function isNativeRegistrationPath(pathname: string): boolean {
  return NATIVE_REGISTRATION_PATH.test(pathname);
}

export function pathnameFromRequestTarget(target: string | undefined): string | undefined {
  if (target === undefined) return undefined;
  try {
    return new URL(target, "http://music-registration.invalid").pathname;
  } catch {
    return undefined;
  }
}
