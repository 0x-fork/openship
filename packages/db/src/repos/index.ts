export * from "./factory";
import { createRepositories } from "./factory";
import { db } from "../client";

export const repos = createRepositories(db);
