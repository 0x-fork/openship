"use client";

import { useEffect, useState } from "react";
import { setNetworkErrorHandler, setNetworkRecoveryHandler } from "@/lib/api/client";
import { useBrowserOnline } from "@/hooks/useBrowserOnline";
import { useI18n } from "@/components/i18n-provider";
import { ConnectionNotice } from "@/components/shared/ConnectionNotice";

/**
 * Mounts once in the root layout and registers a global handler so that any
 * API call that fails at the network level (server down, ECONNREFUSED, timeout)
 * shows one persistent connection notice. Existing requests clear it when the
 * API answers; this adds no connectivity probes or background work.
 */
export function NetworkErrorHandler() {
  const { t } = useI18n();
  const online = useBrowserOnline();
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setNetworkErrorHandler(() => setUnavailable(true));
    setNetworkRecoveryHandler(() => setUnavailable(false));

    return () => {
      // Clear the handler when this component unmounts
      setNetworkErrorHandler(null);
      setNetworkRecoveryHandler(null);
    };
  }, []);

  if (online && !unavailable) return null;
  const c = t.issues.connectivity;
  return <div className="fixed bottom-4 start-4 end-4 z-50 mx-auto max-w-xl rounded-2xl shadow-lg">
    <ConnectionNotice
      title={online ? c.apiTitle : c.offlineTitle}
      message={online ? c.apiHint : c.offlineHint}
    />
  </div>;
}
