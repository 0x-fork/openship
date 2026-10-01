"use client";

import { useCallback } from "react";
import { systemApi, type ServerInfo } from "@/lib/api/system";
import { usePlatform } from "@/context/PlatformContext";
import { useI18n } from "@/components/i18n-provider";
import { CreateManagedServerForm } from "./managed/CreateManagedServerForm";
import { useModal } from "@/context/ModalContext";
import { ServerForm } from "./server-form";

/**
 * Open the add-server panel as a modal from anywhere a server is required.
 *
 * Every flow that needs a server (deploy, app install, mail setup, backup
 * destinations, jobs, migrations) used to dead-end at "connect a server first"
 * plus a link to /servers/new — a full navigation that threw away whatever the
 * user had configured. Adding a server is a 30-second credentials form, so it
 * belongs on top of the flow, not instead of it.
 *
 * The panel is the same ServerForm the /servers routes render, in its modal
 * chrome: credentials only, no component-install step (that can be finished on
 * the server detail page later).
 *
 * `onCreated` receives the saved server so the caller can select it right away.
 */
export function useAddServerModal() {
  const { showModal, hideModal } = useModal();
  const { selfHosted } = usePlatform();
  const { t } = useI18n();

  return useCallback(
    (onCreated?: (server: ServerInfo) => void) => {
      let id = "";
      id = showModal({
        width: "720px",
        maxWidth: "92vw",
        showCloseButton: false,
        // Pickers live inside other modals (backup destination, adopt mail,
        // the migration wizard), and a plain <Modal> defaults to z-10000 — the
        // same value ModalContext hands out first, which would leave this panel
        // tied with its own host. Sit deliberately above it.
        zIndex: 10500,
        customContent: !selfHosted ? <CreateManagedServerForm submitLabel={t.servers.list.addServer} onCancel={() => hideModal(id)} onCreated={async managed => {
          const server = await systemApi.getServerById(managed.serverId);
          hideModal(id);
          onCreated?.(server);
        }} /> : (
          <ServerForm
            variant="modal"
            onCancel={() => hideModal(id)}
            onSaved={({ server }) => {
              hideModal(id);
              onCreated?.(server);
            }}
          />
        ),
      });
      return id;
    },
    [showModal, hideModal, selfHosted, t.servers.list.addServer],
  );
}
