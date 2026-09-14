import { Type, type Static } from "@sinclair/typebox";
import { PrepareDeployBody, type TBuildAccessBody } from "./deployment-inputs";
import { RevealSourceSchema } from "./sources";
import type { CreateDeploymentResult } from "./deployments";

export type PrepareDeploymentInput = Static<typeof PrepareDeployBody>;
/** Explicit disclosure of selected Compose values from an unpersisted source. */
export const RevealPreparedEnvBody = Type.Object({
  ...PrepareDeployBody.properties,
  ...RevealSourceSchema.properties,
});
export type RevealPreparedEnvInput = Static<typeof RevealPreparedEnvBody>;
export type BuildAccessInput = TBuildAccessBody;
export interface PreparedProject {
  stack: string;
  projectType: string;
  packageManager: string;
  buildCommand: string;
  startCommand: string;
  repository: { name: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface BuildOperations {
  prepare(input: PrepareDeploymentInput): Promise<PreparedProject>;
  revealPreparedEnv(input: RevealPreparedEnvInput): Promise<Record<string, string>>;
  buildAccess(input: BuildAccessInput): Promise<CreateDeploymentResult>;
  start(id: string): Promise<CreateDeploymentResult>;
}
