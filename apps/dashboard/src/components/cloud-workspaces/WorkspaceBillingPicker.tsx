"use client";
import { useRouter, usePathname } from "next/navigation";
import { WorkspacePicker } from "./WorkspacePicker";
import { workspaceBillingHref } from "@/components/billing/BillingWorkspaceContext";
import { usePlatform } from "@/context/PlatformContext";
export function WorkspaceBillingPicker({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { selfHosted } = usePlatform();
  if (selfHosted) return null;
  return (
    <div className="max-w-lg">
      <WorkspacePicker
        value={workspaceId}
        purpose="billing"
        onChange={(id) => router.push(workspaceBillingHref(pathname || "/billing/overview", id))}
      />
    </div>
  );
}
