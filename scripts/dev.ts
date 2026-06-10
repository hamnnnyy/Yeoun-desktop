import { spawn } from "bun";
import { readFileSync } from "fs";
import { join } from "path";

const procs: ReturnType<typeof spawn>[] = [];

function spawnProc(cmd: string[]) {
  const p = spawn(cmd, { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  procs.push(p);
  return p;
}

async function killAll() {
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
}

process.on("SIGINT", async () => { await killAll(); process.exit(0); });
process.on("SIGTERM", async () => { await killAll(); process.exit(0); });

// 1. Electron 메인 프로세스 빌드 (watch 모드)
spawnProc(["node", "node_modules/tsup/dist/cli-default.js", "--watch"]);

// 2. Next.js 개발 서버
spawnProc(["node", "node_modules/next/dist/bin/next", "dev"]);

// 3. Next.js 준비 대기 (native fetch loop)
console.log("[dev] http://localhost:3000 대기 중...");
const deadline = Date.now() + 120_000;
while (Date.now() < deadline) {
  try {
    const res = await fetch("http://localhost:3000");
    if (res.status < 500) break;
  } catch {}
  await Bun.sleep(500);
}

// 4. Electron 바이너리 직접 실행
console.log("[dev] Electron 실행 중...");
const electronExe = join(
  process.cwd(),
  "node_modules", "electron", "dist",
  readFileSync("node_modules/electron/path.txt", "utf-8").trim(),
);
const electron = spawnProc([electronExe, "."]);

await electron.exited;
await killAll();
process.exit(0);
