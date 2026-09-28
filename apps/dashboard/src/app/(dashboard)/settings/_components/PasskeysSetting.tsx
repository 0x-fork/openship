"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon as UiIcon } from "@repo/ui/icons";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "./SettingsSection";

type UserPasskey = {
  id: string;
  name?: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt?: string | Date | null;
};

type PasskeyClient = {
  passkey: {
    addPasskey: (input?: {
      name?: string;
    }) => Promise<{ data: UserPasskey | null; error: { message?: string } | null }>;
    listUserPasskeys: () => Promise<{
      data: UserPasskey[] | null;
      error: { message?: string } | null;
    }>;
    deletePasskey: (input: {
      id: string;
    }) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

const passkeys = authClient as unknown as PasskeyClient;

export function PasskeysSetting() {
  const { showToast } = useToast();
  const [items, setItems] = useState<UserPasskey[]>([]);
  const [name, setName] = useState("");
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const result = await passkeys.passkey.listUserPasskeys();
    if (result.error) throw new Error(result.error.message || "Could not load passkeys.");
    setItems(result.data ?? []);
  }, []);

  useEffect(() => {
    if (!("PublicKeyCredential" in window)) return;
    setSupported(true);
    setLoading(true);
    let alive = true;
    void load()
      .catch((error) => {
        if (alive)
          showToast(
            error instanceof Error ? error.message : "Could not load passkeys.",
            "error",
            "Passkeys",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [load, showToast]);

  async function addPasskey() {
    setWorking(true);
    try {
      const result = await passkeys.passkey.addPasskey({ name: name.trim() || "My passkey" });
      if (result.error) throw new Error(result.error.message || "Could not add the passkey.");
      setName("");
      await load();
      showToast("Passkey added.", "success", "Passkeys");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not add the passkey.",
        "error",
        "Passkeys",
      );
    } finally {
      setWorking(false);
    }
  }

  async function removePasskey(item: UserPasskey) {
    if (
      !window.confirm(
        `Remove “${item.name || "Passkey"}”? You cannot use it to sign in afterwards.`,
      )
    )
      return;
    setWorking(true);
    try {
      const result = await passkeys.passkey.deletePasskey({ id: item.id });
      if (result.error) throw new Error(result.error.message || "Could not remove the passkey.");
      await load();
      showToast("Passkey removed.", "success", "Passkeys");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not remove the passkey.",
        "error",
        "Passkeys",
      );
    } finally {
      setWorking(false);
    }
  }

  if (!supported) return null;

  return (
    <SettingsSection
      icon="key"
      title="Passkeys"
      description="Use Face ID, Touch ID, Windows Hello or a security key for passwordless sign-in."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Passkey name, for example MacBook Pro"
            aria-label="Passkey name"
            maxLength={80}
          />
          <Button
            type="button"
            disabled={working}
            onClick={() => void addPasskey()}
            className="sm:shrink-0"
          >
            {working ? (
              <UiIcon name="spinner" className="size-4 animate-spin" />
            ) : (
              <UiIcon name="key" className="size-4" />
            )}
            Add passkey
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UiIcon name="spinner" className="size-4 animate-spin" /> Loading passkeys…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No passkeys added yet.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/10 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name || "Passkey"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.deviceType === "multiDevice" || item.backedUp
                      ? "Synced passkey"
                      : "Device-bound passkey"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={working}
                  onClick={() => void removePasskey(item)}
                  aria-label={`Remove ${item.name || "passkey"}`}
                >
                  <UiIcon name="trash" className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
