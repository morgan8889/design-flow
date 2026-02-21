import { describe, it, expect } from "vitest";
import {
  createProjectSchema,
  updateProjectSchema,
  attentionFilterSchema,
} from "./validators";

describe("createProjectSchema", () => {
  it("accepts valid github project", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      githubUrl: "https://github.com/user/repo",
      source: "github_manual",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid local project", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      localPath: "/Users/nick/Code/project",
      source: "local",
    });
    expect(result.success).toBe(true);
  });

  it("rejects project with neither githubUrl nor localPath", () => {
    const result = createProjectSchema.safeParse({
      name: "my-project",
      source: "local",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createProjectSchema.safeParse({
      name: "",
      localPath: "/some/path",
      source: "local",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProjectSchema", () => {
  it("accepts partial update with isTracked", () => {
    const result = updateProjectSchema.safeParse({
      isTracked: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with localPath", () => {
    const result = updateProjectSchema.safeParse({
      localPath: "/some/path",
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty update", () => {
    const result = updateProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty localPath string", () => {
    const result = updateProjectSchema.safeParse({
      localPath: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("attentionFilterSchema", () => {
  it("accepts valid filters", () => {
    const result = attentionFilterSchema.safeParse({
      type: "pr_needs_review",
      projectId: "some-id",
      resolved: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty filters", () => {
    const result = attentionFilterSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
