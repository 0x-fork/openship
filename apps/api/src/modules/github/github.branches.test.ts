import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "../../lib/request-context";
import { githubFetch } from "./github.auth";
import { GITHUB_BRANCH_PAGE_SIZE, listBranches } from "./github.service";
import type { GitHubBranch } from "./github.types";

vi.mock("./github.auth", () => ({
  githubFetch: vi.fn(),
  getGitHubAuthMode: vi.fn(),
}));

const ctx = {} as RequestContext;
const branch = (name: string): GitHubBranch =>
  ({ name, commit: { sha: `sha-${name}` }, protected: false }) as GitHubBranch;

describe("listBranches", () => {
  beforeEach(() => {
    vi.mocked(githubFetch).mockReset();
  });

  it("requests one page", async () => {
    const branches = [branch("alpha"), branch("main")];
    vi.mocked(githubFetch).mockResolvedValue(branches);

    const result = await listBranches(ctx, "owner", "repo", { page: 2 });

    expect(githubFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { page: 2, per_page: GITHUB_BRANCH_PAGE_SIZE },
      }),
    );
    expect(result).toEqual({
      branches,
      page: 2,
      perPage: GITHUB_BRANCH_PAGE_SIZE,
      hasMore: false,
    });
  });

  it("reports another page when the current page is full", async () => {
    const branches = Array.from({ length: GITHUB_BRANCH_PAGE_SIZE }, (_, index) =>
      branch(`branch-${index}`),
    );
    vi.mocked(githubFetch).mockResolvedValue(branches);

    const result = await listBranches(ctx, "owner", "repo");

    expect(result.hasMore).toBe(true);
    expect(result.page).toBe(1);
  });
});
