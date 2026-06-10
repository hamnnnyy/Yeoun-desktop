import { parsePly, type ParsedSplat } from './PlyReader';

const BUFFER_AHEAD = 30;   // 30프레임 선독 (~195MB parsed)
const BUFFER_BEHIND = 5;
const IPC_CONCURRENCY = 4; // 병렬 IPC 읽기

export class FrameBuffer {
  private cache = new Map<number, ParsedSplat>();
  private inflight = new Set<number>();
  private plyFiles: string[] = [];
  private dead = false;

  load(plyFiles: string[]) {
    this.dead = false;
    this.plyFiles = plyFiles;
    this.cache.clear();
    this.inflight.clear();
  }

  destroy() {
    this.dead = true;
    this.cache.clear();
    this.inflight.clear();
  }

  get(frame: number): ParsedSplat | null {
    return this.cache.get(frame) ?? null;
  }

  /** 재생 중 매 프레임 호출 — 퇴거 + 프리페치 */
  tick(currentFrame: number) {
    if (this.dead || this.plyFiles.length === 0) return;
    const total = this.plyFiles.length;

    for (const idx of this.cache.keys()) {
      const behind = (currentFrame - idx + total) % total;
      if (behind > BUFFER_BEHIND) this.cache.delete(idx);
    }

    const freeSlots = IPC_CONCURRENCY - this.inflight.size;
    let started = 0;
    for (let i = 0; i < BUFFER_AHEAD && started < freeSlots; i++) {
      const idx = (currentFrame + i) % total;
      if (!this.cache.has(idx) && !this.inflight.has(idx)) {
        this.fetch(idx);
        started++;
      }
    }
  }

  /** 스크럽 시 — 새 위치 기준으로 버퍼 재구성 */
  seek(frame: number) {
    const total = this.plyFiles.length;
    for (const idx of this.cache.keys()) {
      const ahead = (idx - frame + total) % total;
      if (ahead > BUFFER_AHEAD) this.cache.delete(idx);
    }
    this.inflight.clear();
    this.tick(frame);
  }

  /** 캐시에 ParsedSplat이 들어올 때까지 대기, 타임아웃 시 직접 읽기/파싱 폴백 */
  async waitFor(frame: number, timeoutMs = 1000): Promise<ParsedSplat | null> {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const splat = this.cache.get(frame);
      if (splat) return splat;
      await new Promise<void>((r) => setTimeout(r, 8));
    }
    // 타임아웃 — 직접 읽어서 파싱
    const buf = await window.electronAPI?.readPlyFile(this.plyFiles[frame]);
    return buf ? parsePly(buf) : null;
  }

  private async fetch(idx: number) {
    if (this.dead || !this.plyFiles[idx]) return;
    this.inflight.add(idx);
    try {
      const buf = await window.electronAPI?.readPlyFile(this.plyFiles[idx]);
      if (!this.dead && buf) {
        const splat = await parsePly(buf);
        if (!this.dead) this.cache.set(idx, splat);
      }
    } catch {
      // 읽기/파싱 실패 시 해당 프레임 스킵
    } finally {
      this.inflight.delete(idx);
    }
  }
}
