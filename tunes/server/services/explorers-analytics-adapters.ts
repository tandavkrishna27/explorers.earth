import geoip from "geoip-lite";

type GeoLookup = (ip: string) => { country?: string } | null;

const isPrivateOrLocalIp = (rawIp: string): boolean => {
  const ip = rawIp.trim().toLowerCase().replace(/^::ffff:/, "");
  if (!ip || ip === "::1" || ip === "localhost") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:")) {
    return true;
  }

  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

export function resolveCountryFromIp(
  ip: string | null,
  lookup: GeoLookup = geoip.lookup,
): string | null {
  if (!ip || isPrivateOrLocalIp(ip)) return null;
  const country = lookup(ip)?.country;
  return typeof country === "string" && /^[A-Za-z]{2}$/.test(country)
    ? country.toUpperCase()
    : null;
}
