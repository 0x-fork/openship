"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./SettingsSection";

/** Team access shares the Instance location flow; no separate migration wizard. */
export function TeamWorkspaceCard({ canMigrate }: { canMigrate: boolean }) {
  return (
    <SettingsSection
      icon="server"
      title="Keep your instance online"
      description="Move Openship to a server for team access and incoming webhooks."
    >
      {canMigrate ? (
        <Button asChild>
          <Link href="/settings?tab=instance">Manage instance</Link>
        </Button>
      ) : (
        <Button disabled>Manage instance</Button>
      )}
    </SettingsSection>
  );
}
