"use client";

import { useCallback, type ComponentProps } from "react";
import { systemApi, type ServerInfo } from "@/lib/api/system";
import { usePlatform } from "@/context/PlatformContext";
import { CreateManagedServerForm } from "./managed/CreateManagedServerForm";
import { CloudDeployPlanModal } from "@/components/billing/CloudDeployPlanModal";
import { useI18n } from "@/components/i18n-provider";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useModal } from "@/context/ModalContext";
import { ServerForm } from "./server-form";

function CreateManagedServerDialog({
  onCancel,
  onCreated,
}: Required<Pick<ComponentProps<typeof CreateManagedServerForm>, "onCancel" | "onCreated">>) {
  const { t } = useI18n();
  const { dialog, onKeyDown } = useDialogFocus(onCancel);
  return (
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={t.billing.workspaces.create}
      tabIndex={-1} onKeyDown={onKeyDown} className="outline-none">
      <CreateManagedServerForm onCancel={onCancel} onCreated={onCreated} autoFocus={false} />
    </div>
  );
}

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

  return useCallback(
    (onCreated?: (server: ServerInfo) => void) => {
      let id = "";
      let active = true;
      id = showModal({
        width: "720px",
        maxWidth: "92vw",
        showCloseButton: false,
        onClose: () => { active = false; },
        // Pickers live inside other modals (backup destination, adopt mail,
        // the migration wizard), and a plain <Modal> defaults to z-10000 — the
        // same value ModalContext hands out first, which would leave this panel
        // tied with its own host. Sit deliberately above it.
        zIndex: 10500,
        customContent: !selfHosted ? (
          <CreateManagedServerDialog
            onCancel={() => hideModal(id)}
            onCreated={async (managed) => {
              if (!active) return;
              const server = await systemApi.getServerById(managed.serverId);
              if (!active) return;
              onCreated?.(server);
              hideModal(id);
              let plansId = "";
              plansId = showModal({
                width: "100%",
                maxWidth: "1440px",
                maxHeight: "calc(100dvh - 2rem)",
                overflow: "hidden",
                showCloseButton: false,
                zIndex: 10500,
                customContent: (
                  <CloudDeployPlanModal
                    workspaceId={managed.id}
                    serverName={managed.name}
                    onClose={() => hideModal(plansId)}
                  />
                ),
              });
            }}
          />
        ) : (
          <ServerForm
            variant="modal"
            onCancel={() => hideModal(id)}
            onSaved={({ server }) => {
              if (!active) return;
              hideModal(id);
              onCreated?.(server);
            }}
          />
        ),
      });
      return id;
    },
    [showModal, hideModal, selfHosted],
  );
}
