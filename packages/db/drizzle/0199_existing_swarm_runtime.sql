-- External Swarm clusters retain their own network. Existing K3s rows keep
-- their network references and deferred membership foreign keys unchanged.
ALTER TABLE "compute_cluster" ALTER COLUMN "network_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "compute_cluster_member" ALTER COLUMN "network_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "cluster_runtime" DROP CONSTRAINT "cluster_runtime_provider_check";
--> statement-breakpoint
ALTER TABLE "cluster_runtime" ADD CONSTRAINT "cluster_runtime_provider_check" CHECK ("provider" IN ('k3s', 'swarm'));
--> statement-breakpoint
CREATE UNIQUE INDEX "cluster_runtime_swarm_identity_idx" ON "cluster_runtime" ("organization_id", ("plan"->>'clusterUid')) WHERE "provider" = 'swarm';
