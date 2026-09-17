import { ClusterEditor } from "@/components/servers/clusters/ClusterEditor";

export default async function NewServerClusterPage({
  searchParams,
}: {
  searchParams: Promise<{ preparation?: string }>;
}) {
  const { preparation } = await searchParams;
  return <ClusterEditor key={preparation} preparationId={preparation} />;
}
