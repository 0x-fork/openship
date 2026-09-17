import { ClusterEditor } from "@/components/servers/clusters/ClusterEditor";

export default async function EditServerClusterPage({
  params,
  searchParams,
}: {
  params: Promise<{ clusterId: string }>;
  searchParams: Promise<{ preparation?: string }>;
}) {
  const { clusterId } = await params;
  const { preparation } = await searchParams;
  return (
    <ClusterEditor
      key={`${clusterId}:${preparation ?? ""}`}
      clusterId={clusterId}
      preparationId={preparation}
    />
  );
}
