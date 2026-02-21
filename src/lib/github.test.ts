import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubClient } from "./github";

// Mock Octokit - use regular function so it works as a constructor
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(function () {
    return {
      rest: {
        repos: {
          listForAuthenticatedUser: vi.fn().mockResolvedValue({
            data: [
              { name: "repo-a", html_url: "https://github.com/user/repo-a", full_name: "user/repo-a" },
              { name: "repo-b", html_url: "https://github.com/user/repo-b", full_name: "user/repo-b" },
            ],
            headers: { etag: "abc123" },
          }),
          getContent: vi.fn().mockResolvedValue({
            data: {
              content: Buffer.from("# Hello World").toString("base64"),
              sha: "def456",
            },
          }),
        },
        pulls: {
          list: vi.fn().mockResolvedValue({
            data: [
              {
                number: 1,
                title: "Add feature",
                html_url: "https://github.com/user/repo/pull/1",
                requested_reviewers: [{ login: "user" }],
                draft: false,
              },
            ],
          }),
        },
        checks: {
          listForRef: vi.fn().mockResolvedValue({
            data: {
              check_runs: [
                { name: "test", status: "completed", conclusion: "failure" },
              ],
            },
          }),
        },
      },
    };
  }),
}));

describe("GitHubClient", () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient("fake-token");
  });

  it("fetches user repos", async () => {
    const repos = await client.listRepos();
    expect(repos).toHaveLength(2);
    expect(repos[0].name).toBe("repo-a");
  });

  it("fetches open PRs for a repo", async () => {
    const prs = await client.listOpenPRs("user", "repo");
    expect(prs).toHaveLength(1);
    expect(prs[0].title).toBe("Add feature");
  });

  it("fetches check runs for a ref", async () => {
    const checks = await client.getCheckRuns("user", "repo", "abc123");
    expect(checks).toHaveLength(1);
    expect(checks[0].conclusion).toBe("failure");
  });
});
