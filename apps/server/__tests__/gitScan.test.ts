import { describe, expect, it } from "vitest";
import { __test__, runGitScanNow } from "../src/gitScan";

describe("git scan helpers", () => {
  it("dedupes repos by canonical path and keeps latest scan", () => {
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
    expect(deduped[0].lastHeadSha).toBe("sha-new");
    expect(deduped[0].dirty).toBe(true);
  });

  it("returns current status when a scan is already running", async () => {
    __test__.setScanInProgress(true);
    const result = await runGitScanNow();
    expect(result.running).toBe(true);
    __test__.resetScanStatus();
  });
});
