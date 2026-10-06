import {
  CloudSupportReceiptSchema,
  parseInput,
  CloudSupportCustomerListSchema,
  CloudSupportCustomerDetailSchema,
  type CloudSupportCustomerInput,
  type CloudSupportCustomerReply,
  type CloudSupportCustomerQuery,
} from "@repo/contracts";
import { api } from "./client";

const customerPath = "cloud/support/mine";
const ticketPath = (id: string) => `${customerPath}/${encodeURIComponent(id)}`;

/** Account-private reads must not reuse a request started under an earlier session. */
export const cloudSupportApi = {
  async list(input: Partial<CloudSupportCustomerQuery> = {}) {
    return parseInput(
      CloudSupportCustomerListSchema,
      await api.get<unknown>(customerPath, {
        dedupe: false,
        cache: "no-store",
        params: { limit: 25, ...input },
      }),
    );
  },
  async create(input: CloudSupportCustomerInput) {
    return parseInput(CloudSupportReceiptSchema, await api.post<unknown>(customerPath, input));
  },
  async get(id: string) {
    return parseInput(
      CloudSupportCustomerDetailSchema,
      await api.get<unknown>(ticketPath(id), { dedupe: false, cache: "no-store" }),
    );
  },
  async reply(id: string, input: CloudSupportCustomerReply) {
    return parseInput(
      CloudSupportCustomerDetailSchema,
      await api.post<unknown>(`${ticketPath(id)}/replies`, input),
    );
  },
  async setStatus(id: string, status: "open" | "resolved") {
    return parseInput(
      CloudSupportCustomerDetailSchema,
      await api.patch<unknown>(ticketPath(id), { status }),
    );
  },
};
