import { useEffect, useState } from "react";
import { signedUrl } from "@/lib/storage";
import { directMediaUrl } from "@/lib/media-paths";

/**
 * Address for a stored file. Public files on the media CDN need no request, so the server-rendered
 * page already has it; anything else is signed in the browser after load.
 */
export function useMediaUrl(path?: string | null): string {
  const direct = directMediaUrl(path);
  const [signed, setSigned] = useState("");
  useEffect(() => {
    if (!path || direct) {
      setSigned("");
      return;
    }
    let active = true;
    signedUrl(path).then((u) => {
      if (active) setSigned(u);
    });
    return () => {
      active = false;
    };
  }, [path, direct]);
  return direct || signed;
}
