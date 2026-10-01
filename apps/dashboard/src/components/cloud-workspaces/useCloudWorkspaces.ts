"use client";

import { useCallback, useEffect, useState } from "react";
import type { CloudWorkspaceOperations } from "@repo/contracts";
import { cloudWorkspacesApi } from "@/lib/api/cloud-workspaces";
import { getApiErrorMessage } from "@/lib/api/client";
import { useSession } from "@/lib/auth-client";

export function useCloudWorkspaces(enabled = true) {
  const { data: session } = useSession();
  const organizationId = session?.session.activeOrganizationId;
  const [data, setData] = useState<Awaited<ReturnType<CloudWorkspaceOperations["list"]>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setLoading(enabled);
    if (enabled)
      void cloudWorkspacesApi
        .list()
        .then((value) => {
          if (active) setData(value);
        })
        .catch((error) => {
          if (active) setError(getApiErrorMessage(error));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [enabled, organizationId, revision]);
  return { data, error, loading, refresh };
}
