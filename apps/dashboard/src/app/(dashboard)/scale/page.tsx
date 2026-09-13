import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { ScalePage } from "@/components/scale/ScalePage";
import { draftStorageKey } from "@/components/scale/topology";

export default async function ScaleRoute() {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <ScalePage
      storageKey={draftStorageKey(session.user.id, session.session.activeOrganizationId)}
    />
  );
}
