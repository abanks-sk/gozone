import { useEffect, useState } from 'react';
import api from '../api/client';

/**
 * An image that needs a bearer token to fetch.
 *
 * KYC documents are served from a protected endpoint — the whole point is that holding the URL is
 * not the same as being allowed to see the file. A plain `<img src>` sends no Authorization header
 * and would just render broken, so the bytes come through the API client (which has the token and
 * the refresh-on-401 interceptor) and are handed to the browser as an object URL.
 *
 * The object URL is revoked on unmount; without that, paging through a review queue leaks a blob
 * per document for as long as the tab is open.
 */
export default function AuthImage({
  path,
  alt,
  height = 150,
  onClick,
}: {
  path?: string | null;
  alt: string;
  height?: number;
  onClick?: (objectUrl: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    let revoked = false;
    let url: string | null = null;
    api.get(path, { responseType: 'blob' })
      .then((r) => {
        if (revoked) return;
        url = URL.createObjectURL(r.data as Blob);
        setSrc(url);
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  const frame: React.CSSProperties = {
    height, width: '100%', borderRadius: 10, background: 'var(--surface-alt)',
    border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', overflow: 'hidden', fontSize: 12,
  };

  if (!path) return <div style={frame} className="muted">Not provided</div>;
  if (failed) return <div style={{ ...frame, color: 'var(--danger)' }}>Couldn’t load</div>;
  if (!src) return <div style={frame} className="muted">Loading…</div>;

  return (
    <img
      src={src}
      alt={alt}
      onClick={() => onClick?.(src)}
      style={{ ...frame, objectFit: 'cover', cursor: onClick ? 'zoom-in' : 'default' }}
    />
  );
}
