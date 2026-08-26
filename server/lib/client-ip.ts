import { type Context } from "hono";
import { authEnv } from "./env";

/**
 * Spoof-resistant client IP resolution.
 *
 * X-Forwarded-For is only trusted when the direct socket peer is inside the
 * TRUST_PROXY CIDR allowlist; the chain is then walked right-to-left, skipping
 * only trusted hops. An empty allowlist means XFF is never trusted.
 */

type Cidr = { kind: 4 | 6; base: bigint; prefix: number };

function ipv4ToBigInt(ip: string): bigint | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function ipv6ToBigInt(ip: string): bigint | null {
  let addr = ip;
  // Strip zone index and brackets
  addr = addr.replace(/^\[|\]$/g, "").split("%")[0];
  // IPv4-mapped tail (::ffff:1.2.3.4)
  const v4Tail = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Tail) {
    const v4 = ipv4ToBigInt(v4Tail[2]);
    if (v4 === null) return null;
    const hi = ((v4 >> 16n) & 0xffffn).toString(16);
    const lo = (v4 & 0xffffn).toString(16);
    addr = `${v4Tail[1]}${hi}:${lo}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 0) return null;
  if (halves.length === 1 && head.length !== 8) return null;
  const groups = [
    ...head,
    ...Array(halves.length === 2 ? missing : 0).fill("0"),
    ...tail,
  ];
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

function parseIp(ip: string): { kind: 4 | 6; value: bigint } | null {
  const trimmed = ip.trim();
  if (trimmed.includes(":")) {
    const v6 = ipv6ToBigInt(trimmed);
    return v6 === null ? null : { kind: 6, value: v6 };
  }
  const v4 = ipv4ToBigInt(trimmed);
  return v4 === null ? null : { kind: 4, value: v4 };
}

function parseCidr(cidr: string): Cidr | null {
  const [ip, prefixRaw] = cidr.trim().split("/");
  const parsed = parseIp(ip);
  if (!parsed) return null;
  const maxPrefix = parsed.kind === 4 ? 32 : 128;
  const prefix =
    prefixRaw === undefined ? maxPrefix : Number.parseInt(prefixRaw, 10);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    return null;
  }
  const shift = BigInt(maxPrefix - prefix);
  return { kind: parsed.kind, base: (parsed.value >> shift) << shift, prefix };
}

const trustedCidrs: Cidr[] = authEnv.TRUST_PROXY.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const cidr = parseCidr(entry);
    if (!cidr) {
      throw new Error(`TRUST_PROXY contains an invalid CIDR: "${entry}"`);
    }
    return cidr;
  });

function isTrusted(ip: string): boolean {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  return trustedCidrs.some((cidr) => {
    if (cidr.kind !== parsed.kind) return false;
    const maxPrefix = cidr.kind === 4 ? 32 : 128;
    const shift = BigInt(maxPrefix - cidr.prefix);
    return (parsed.value >> shift) << shift === cidr.base;
  });
}

type Bindings = {
  ip?: { address: string } | null;
};

/** Direct socket peer address (from Bun.serve's requestIP, passed via env). */
function socketPeer(c: Context): string | null {
  return (c.env as Bindings | undefined)?.ip?.address ?? null;
}

export function clientIp(c: Context): string {
  const peer = socketPeer(c);
  if (!peer) return "unknown";
  if (trustedCidrs.length === 0 || !isTrusted(peer)) return peer;

  const xff = c.req.header("x-forwarded-for");
  if (!xff) return peer;

  // Walk right-to-left, skipping trusted hops; first untrusted = the client
  const chain = xff.split(",").map((entry) => entry.trim());
  for (let i = chain.length - 1; i >= 0; i--) {
    const hop = chain[i];
    if (!parseIp(hop)) return peer; // malformed chain — fall back to the peer
    if (!isTrusted(hop)) return hop;
  }
  // Every hop was a trusted proxy — take the leftmost entry
  return chain[0] ?? peer;
}

/**
 * Rate-limit key: IPv4 as-is; IPv6 collapsed to its /64 so one host can't
 * dodge limits by rotating within its subnet.
 */
export function rateLimitKey(c: Context): string {
  const ip = clientIp(c);
  const parsed = parseIp(ip);
  if (parsed?.kind === 6) {
    const base = (parsed.value >> 64n) << 64n;
    return `v6:${base.toString(16)}`;
  }
  return ip;
}
