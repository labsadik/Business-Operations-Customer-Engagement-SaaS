import "server-only";

export function getServerNowMs(): number {
  return Date.now();
}
