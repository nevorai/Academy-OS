import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/storage";
import { directMediaUrl } from "@/lib/media-paths";

/**
 * Renders an <img> for either an absolute URL or a `tenant-assets` storage path.
 * Public pictures on the media CDN have their address from the path alone, so the server-rendered
 * page already carries the <img src>; only files that need a signed link wait for a request.
 */
export function StoragedImage({
  path,
  alt,
  className,
  fallback,
  priority = false,
  lazy = false,
}: {
  path?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Above-the-fold picture: fetched ahead of everything else. */
  priority?: boolean;
  /** Below the fold: the browser may wait until it is near the screen. */
  lazy?: boolean;
}) {
  const direct = directMediaUrl(path);
  const [url, setUrl] = useState<string>(direct);
  useEffect(() => {
    if (!path) {
      setUrl("");
      return;
    }
    if (direct) {
      setUrl(direct);
      return;
    }
    let active = true;
    signedUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path, direct]);
  const src = direct || url;
  if (!path || !src) return <>{fallback ?? null}</>;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      {...(lazy ? { loading: "lazy" as const } : {})}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
