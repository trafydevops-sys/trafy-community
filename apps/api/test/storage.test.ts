import { describe, expect, it, vi } from "vitest";

// Static, file-scoped mock (hoisted by Vitest) — unlike vi.doMock +
// vi.resetModules(), this never touches the module registry, so it can't
// leak a second db/redis client instance into other test files sharing this
// process (apps/api's vitest.config runs with poolOptions.forks.singleFork,
// so all test files share one process — a prior version of this file used
// vi.resetModules() and hung assessments.integration.test.ts's afterAll for
// hours, almost certainly by orphaning a second Postgres connection pool).
const send = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return { ...actual, S3Client: vi.fn().mockImplementation(() => ({ send })) };
});

import { requireS3Config, publicUrlFor, saveUpload } from "../src/lib/storage.js";
import { env, usingLocalStorage } from "../src/lib/env.js";

describe("requireS3Config", () => {
  it("throws a clear config error when bucket/keys are missing", () => {
    expect(() => requireS3Config({ S3_ENDPOINT: "https://s3.example.com" })).toThrow(/S3_BUCKET/);
  });

  it("returns a complete config with defaults applied when fully set", () => {
    const config = requireS3Config({
      S3_ENDPOINT: "https://s3.example.com",
      S3_BUCKET: "trafy-uploads",
      S3_ACCESS_KEY_ID: "AKIAFAKE",
      S3_SECRET_ACCESS_KEY: "fakesecret",
    });
    expect(config).toEqual({
      endpoint: "https://s3.example.com",
      bucket: "trafy-uploads",
      accessKeyId: "AKIAFAKE",
      secretAccessKey: "fakesecret",
      region: "auto",
      forcePathStyle: true,
      publicUrl: undefined,
    });
  });
});

describe("publicUrlFor", () => {
  const base = {
    endpoint: "https://accountid.r2.cloudflarestorage.com",
    bucket: "trafy-uploads",
    accessKeyId: "x",
    secretAccessKey: "x",
    region: "auto",
    forcePathStyle: true,
  };

  it("falls back to path-style off the endpoint when no public URL is set", () => {
    expect(publicUrlFor(base, "user-123/certificate-abc.pdf")).toBe(
      "https://accountid.r2.cloudflarestorage.com/trafy-uploads/user-123/certificate-abc.pdf"
    );
  });

  it("prefers a configured public/CDN host, trimming any trailing slash", () => {
    expect(publicUrlFor({ ...base, publicUrl: "https://cdn.trafy.example.com/" }, "user-123/avatar-abc.png")).toBe(
      "https://cdn.trafy.example.com/user-123/avatar-abc.png"
    );
  });
});

describe("saveUpload", () => {
  const file = { buffer: Buffer.from("hello world"), filename: "notes.txt", mimetype: "text/plain" };

  it(`exercises this environment's actual configured path (${usingLocalStorage ? "local disk" : "S3"}) end to end`, async () => {
    send.mockClear();
    const result = await saveUpload("user-123", "certificate", file);

    expect(result.sizeBytes).toBe(file.buffer.byteLength);
    expect(result.contentType).toBe("text/plain");
    expect(result.url).toMatch(/\/certificate-.+\.txt$/);

    if (usingLocalStorage) {
      expect(send).not.toHaveBeenCalled();
      expect(result.url.startsWith(env.API_URL)).toBe(true);
    } else {
      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0]![0];
      expect(command.input.Bucket).toBe(env.S3_BUCKET);
      expect(command.input.Key).toMatch(/^user-123\/certificate-.+\.txt$/);
      expect(command.input.Body).toBe(file.buffer);
    }
  });
});
