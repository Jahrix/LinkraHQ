import { describe, expect, it } from "vitest";
import { __test__, runGitScanNow } from "../src/gitScan";

describe("git scan helpers", () => {
  it("dedupes repos by canonical path, keeps latest scan, and rewrites stable repo ids", () => {
    const deduped = __test__.dedupeRepos([
      {
        id: "a",
        name: "repo",
        path: "/tmp/repo",
        watchDir: "/tmp",
        remoteUrl: null,
        defaultBranch: "main",
        lastCommitAt: null,
        lastCommitMessage: null,
        lastCommitAuthor: null,
        dirty: false,
        untrackedCount: 0,
        ahead: 0,
        behind: 0,
        todayCommitCount: 0,
        lastHeadSha: "sha-old",
        lastStatusHash: "status-old",
        lastScanDurationMs: 3,
        scanError: null,
        scannedAt: "2026-02-19T04:00:00.000Z"
      },
      {
        id: "b",
        name: "repo",
        path: "/tmp/repo",
        watchDir: "/tmp",
        remoteUrl: null,
        defaultBranch: "main",
        lastCommitAt: null,
        lastCommitMessage: null,
        lastCommitAuthor: null,
        dirty: true,
        untrackedCount: 2,
        ahead: 0,
        behind: 0,
        todayCommitCount: 1,
        lastHeadSha: "sha-new",
        lastStatusHash: "status-new",
        lastScanDurationMs: 2,
        scanError: null,
        scannedAt: "2026-02-19T05:00:00.000Z"
      }
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe(__test__.repoId("/tmp/repo"));
    expect(deduped[0].lastHeadSha).toBe("sha-new");
    expect(deduped[0].dirty).toBe(true);
  });

  it("returns current status when a scan is already running", async () => {
    __test__.setScanInProgress(true);
    const result = await runGitScanNow();
    expect(result.running).toBe(true);
    __test__.resetScanStatus();
  });

  it("requires repo paths to stay inside configured watch dirs", () => {
    expect(__test__.isPathWithinWatchDirs("/tmp/repo", [])).toBe(false);
    expect(__test__.isPathWithinWatchDirs("/tmp/repo", ["/tmp"])).toBe(true);
    expect(__test__.isPathWithinWatchDirs("/etc/repo", ["/tmp"])).toBe(false);
  });

  it("bounds commit log args and normalizes since timestamps", () => {
    const args = __test__.buildCommitLogArgs(999, "2026-03-01T12:00:00-05:00");

    expect(args).toContain("-100");
    expect(args).toContain("--since=2026-03-01T17:00:00.000Z");
  });

  it("rejects invalid since filters", () => {
    expect(() => __test__.normalizeSinceValue("not-a-date")).toThrow("since must be a valid date");
  });
});
