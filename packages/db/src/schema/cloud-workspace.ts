import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./organization";

/** Durable intent. A crashed worker resumes the same provider operation. */
export interface CloudWorkspaceOperation {
  id: string;
  kind: "ensure" | "resize" | "delete";
  status: "queued" | "running" | "failed" | "succeeded";
  requestedAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  error: string | null;
  logs: string[];
  /** Retain the last result for logs and safe retries of a lost HTTP response. */
  completedAt?: string;
  revision?: string;
  resources?: { cpuCores: number; memoryMb: number; diskMb: number };
  restartWorkloads?: { wasRunning: boolean; containers: string[]; processes: string[] };
  /** Membership approved by the operator before the host restart. */
  restartProjectIds?: string[];
}

/** A subscription and execution target. Provider VM identities belong to its runtime. */
export const cloudWorkspace = pgTable(
  "cloud_workspace",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    namespace: text("namespace"),
    // Mirrors only. Provider reads authorize billing and execution.
    planTierId: text("plan_tier_id").notNull().default("free"),
    subscriptionStatus: text("subscription_status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    deletionInProgress: timestamp("deletion_in_progress"),
    operation: jsonb("operation").$type<CloudWorkspaceOperation>(),
    // Durable purchase intents, not a payment ledger. Provider status alone
    // decides when a checkout can no longer charge this workspace.
    pendingCheckouts: jsonb("pending_checkouts")
      .$type<Array<{ request: Record<string, unknown>; checkoutId?: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cloud_workspace_namespace_unique").on(table.namespace),
    uniqueIndex("cloud_workspace_id_org_unique").on(table.id, table.organizationId),
    index("cloud_workspace_org_idx").on(table.organizationId),

  ],
);
