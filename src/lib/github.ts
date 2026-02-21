import { Octokit } from "@octokit/rest";

export interface GitHubRepo {
  name: string;
  fullName: string;
  htmlUrl: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  htmlUrl: string;
  requestedReviewers: string[];
  draft: boolean;
}

export interface GitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async listRepos(): Promise<GitHubRepo[]> {
    const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
    });

    return data.map((repo) => ({
      name: repo.name,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
    }));
  }

  async listOpenPRs(owner: string, repo: string): Promise<GitHubPR[]> {
    const { data } = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
    });

    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      requestedReviewers: (pr.requested_reviewers ?? []).map((r: { login: string }) => r.login),
      draft: pr.draft ?? false,
    }));
  }

  async getCheckRuns(owner: string, repo: string, ref: string): Promise<GitHubCheckRun[]> {
    const { data } = await this.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref,
    });

    return data.check_runs.map((check) => ({
      name: check.name,
      status: check.status,
      conclusion: check.conclusion ?? null,
    }));
  }

  async getFileContent(owner: string, repo: string, path: string): Promise<{ content: string; sha: string } | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if ("content" in data && typeof data.content === "string") {
        return {
          content: Buffer.from(data.content, "base64").toString("utf-8"),
          sha: data.sha,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async listFilesRecursively(owner: string, repo: string, pathPrefix: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: "HEAD",
        recursive: "1",
      });
      return data.tree
        .filter((item) => item.type === "blob" && item.path?.startsWith(pathPrefix + "/"))
        .map((item) => item.path!);
    } catch {
      return [];
    }
  }

  async listDirectoryContents(owner: string, repo: string, path: string): Promise<string[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if (Array.isArray(data)) {
        return data.filter((item) => item.type === "file").map((item) => item.path);
      }
      return [];
    } catch {
      return [];
    }
  }
}
