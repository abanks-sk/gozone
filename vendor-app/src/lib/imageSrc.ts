import { apiBaseUrl } from './host';

/**
 * Turn a stored image reference into something `<Image>` can load.
 *
 * Uploaded images are stored as relative paths (`/auth/uploads/{id}`) on purpose: the gateway's
 * address changes with the network — laptop IP, tunnel, deployed host — and baking an absolute URL
 * into the database would pin every vendor's photos to whatever address the server happened to
 * have the day they uploaded them. So the host is resolved here, at render time.
 *
 * Anything already absolute is passed through untouched, which is what the seeded vendors' bundled
 * stock imagery is.
 */
export function imageSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u) || u.startsWith('data:')) return u;
  return `${apiBaseUrl()}${u}`;
}
