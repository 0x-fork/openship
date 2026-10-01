import { redirect } from "next/navigation";

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ workspaceId?: string }> }) {
  const { workspaceId } = await searchParams;
  redirect(workspaceId ? `/billing/overview?workspaceId=${encodeURIComponent(workspaceId)}` : "/billing/overview");
}
