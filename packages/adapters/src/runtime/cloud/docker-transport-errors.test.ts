import { expect, it, vi } from "vitest";
import { request } from "node:http";
import { OblienError } from "oblien";
import { AppError } from "@repo/core";
import { createCloudDockerTransport } from "./docker-transport";

it.each([429, 503])(
  "preserves provider HTTP %s and retry guidance without replaying Docker requests",
  async (status) => {
    const open = vi.fn(async () => {
      throw new OblienError("Provider unavailable", status, "rate_limit", {
        retryAfterSeconds: 3,
        token: "private",
      });
    });
    const transport = createCloudDockerTransport(open);
    try {
      const options = await transport.establish();
      const response = await new Promise<{ status: number; retry?: string; body: string }>(
        (resolve, reject) => {
          const req = request(
            { ...options, path: "/containers/create", method: "POST", agent: false },
            (res) => {
              const chunks: Buffer[] = [];
              res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
              res.on("error", reject);
              res.on("end", () =>
                resolve({
                  status: res.statusCode!,
                  retry: res.headers["retry-after"],
                  body: Buffer.concat(chunks).toString(),
                }),
              );
            },
          );
          req.on("error", reject);
          req.end("{}");
        },
      );
      expect(response.status).toBe(status);
      expect(response.retry).toBe("3");
      expect(JSON.parse(response.body)).toEqual({
        message: "Provider unavailable",
        code: "rate_limit",
        retryAfterSeconds: 3,
      });
      expect(response.body).not.toContain("private");
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      await transport.close();
    }
  },
);

it.each([
  [new AppError("Cloud access unavailable", 429, "CLOUD_TOKEN_UNAVAILABLE"), 429],
  [new Error("Connect failed https://provider.example?token=private"), 502],
])(
  "keeps application failures and redacts credentials from connection failures",
  async (error, expectedStatus) => {
    const transport = createCloudDockerTransport(async () => {
      throw error;
    });
    try {
      const options = await transport.establish();
      await new Promise<void>((resolve, reject) => {
        const req = request({ ...options, path: "/_ping", agent: false }, (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => {
            try {
              expect(res.statusCode).toBe(expectedStatus);
              expect(body).not.toContain("private");
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        });
        req.on("error", reject);
        req.end();
      });
    } finally {
      await transport.close();
    }
  },
);
