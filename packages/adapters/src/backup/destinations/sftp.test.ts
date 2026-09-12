import { Readable, Writable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupDestinationRow } from "../types";

const fake = vi.hoisted(() => ({
  mode: "success" as "success" | "stream-failure" | "rename-failure",
  sftp: undefined as unknown,
  unlinked: [] as string[],
  renamed: [] as Array<[string, string]>,
}));

vi.mock("ssh2", () => ({
  Client: class {
    private readonly listeners = new Map<string, (...args: unknown[]) => void>();

    on(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(event, listener);
      return this;
    }

    connect() {
      queueMicrotask(() => this.listeners.get("ready")?.());
      return this;
    }

    sftp(callback: (error: Error | undefined, sftp: unknown) => void) {
      callback(undefined, fake.sftp);
    }

    end() {}
  },
}));

import "./sftp";
import { resolveDestination } from "../registry";

type TestWriteStream = Writable & { bytesWritten: number };

function makeSftp() {
  const sftp = {
    mkdir: vi.fn((_path: string, callback: (error?: Error | null) => void) => callback(null)),
    stat: vi.fn(),
    createWriteStream: vi.fn((_path: string) => {
      let stream: TestWriteStream;
      stream = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          if (fake.mode === "stream-failure") {
            callback(new Error("upload failed"));
            return;
          }
          stream.bytesWritten += chunk.byteLength;
          callback();
        },
      }) as TestWriteStream;
      stream.bytesWritten = 0;
      return stream;
    }),
    unlink: vi.fn((path: string, callback: (error?: Error | null) => void) => {
      fake.unlinked.push(path);
      callback(null);
    }),
    rename: vi.fn((from: string, to: string, callback: (error?: Error | null) => void) => {
      fake.renamed.push([from, to]);
      callback(fake.mode === "rename-failure" ? new Error("rename failed") : null);
    }),
  };
  fake.sftp = sftp;
  return sftp;
}

const row: BackupDestinationRow = {
  id: "dest_1",
  organizationId: "org_1",
  name: "Backup SFTP",
  kind: "sftp",
  endpoint: null,
  region: null,
  bucket: null,
  pathPrefix: "/backups",
  sshHost: "backup.example.test",
  sshPort: 22,
  sshUser: "backup",
  accessKeyIdEnc: null,
  secretAccessKeyEnc: null,
  sftpPasswordEnc: "password",
  sftpPrivateKeyEnc: null,
  sftpKeyPassphraseEnc: null,
};

beforeEach(() => {
  fake.mode = "success";
  fake.unlinked = [];
  fake.renamed = [];
  makeSftp();
});

describe("SFTP destination temporary upload cleanup", () => {
  it("removes the temporary file when the stream fails", async () => {
    fake.mode = "stream-failure";

    await expect(
      resolveDestination(row).put(
        "openship/project/service/run/artifact.tar.zst",
        Readable.from(["payload"]),
        {},
      ),
    ).rejects.toThrow("upload failed");

    expect(fake.renamed).toEqual([]);
    expect(fake.unlinked).toHaveLength(1);
    expect(fake.unlinked[0]).toMatch(/\.uploading-[0-9a-f]{8}$/);
  });

  it("removes the temporary file when finalization fails", async () => {
    fake.mode = "rename-failure";

    await expect(
      resolveDestination(row).put(
        "openship/project/service/run/artifact.tar.zst",
        Readable.from(["payload"]),
        {},
      ),
    ).rejects.toThrow("rename failed");

    expect(fake.renamed).toHaveLength(2);
    expect(fake.unlinked).toEqual([fake.renamed[0]![1], fake.renamed[0]![0]]);
  });

  it("renames the temporary file and keeps it on success", async () => {
    const result = await resolveDestination(row).put(
      "openship/project/service/run/artifact.tar.zst",
      Readable.from(["payload"]),
      {},
    );

    expect(result.bytesWritten).toBe(7);
    expect(fake.renamed).toHaveLength(1);
    expect(fake.renamed[0]?.[0]).toMatch(/\.uploading-[0-9a-f]{8}$/);
    expect(fake.renamed[0]?.[1]).toBe("/backups/openship/project/service/run/artifact.tar.zst");
    expect(fake.unlinked).toEqual([]);
  });
});
