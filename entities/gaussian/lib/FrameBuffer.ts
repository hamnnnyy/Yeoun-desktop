const BUFFER_AHEAD = 30;   // 30프레임 × 6.5MB ≈ 195MB
const BUFFER_BEHIND = 5;
const CONCURRENCY = 4;     // 병렬 IPC 읽기 수

export class FrameBuffer {
  private cache = new Map<number, ArrayBuffer>();
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

  get(frame: number): ArrayBuffer | null {
    return this.cache.get(frame) ?? null;
  }

  /** 재생 중 매 프레임 호출 — 오래된 프레임 퇴거 + 앞쪽 프리페치 */
  tick(currentFrame: number) {
    if (this.dead || this.plyFiles.length === 0) return;
    const total = this.plyFiles.length;

    for (const idx of this.cache.keys()) {
      const behind = (currentFrame - idx + total) % total;
      if (behind > BUFFER_BEHIND) this.cache.delete(idx);
    }

    const freeSlots = CONCURRENCY - this.inflight.size;
    let started = 0;
    for (let i = 0; i < BUFFER_AHEAD && started < freeSlots; i++) {
      const idx = (currentFrame + i) % total;
      if (!this.cache.has(idx) && !this.inflight.has(idx)) {
        this.fetch(idx);
        started++;
      }
    }
  }

  /** 스크럽 시 호출 — 새 위치 기준으로 버퍼 재구성 */
  seek(frame: number) {
    const total = this.plyFiles.length;
    for (const idx of this.cache.keys()) {
      const ahead = (idx - frame + total) % total;
      if (ahead > BUFFER_AHEAD) this.cache.delete(idx);
    }
    this.inflight.clear();
    this.tick(frame);
  }

  /** 프레임이 캐시에 들어올 때까지 대기, 타임아웃 시 직접 IPC 폴백 */
  async waitFor(frame: number, timeoutMs = 1000): Promise<ArrayBuffer | null> {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const buf = this.cache.get(frame);
      if (buf) return buf;
      await new Promise<void>((r) => setTimeout(r, 8));
    }
    return window.electronAPI?.readPlyFile(this.plyFiles[frame]) ?? null;
  }

  private async fetch(idx: number) {
    if (this.dead || !this.plyFiles[idx]) return;
    this.inflight.add(idx);
    try {
      const buf = await window.electronAPI?.readPlyFile(this.plyFiles[idx]);
      if (!this.dead && buf) this.cache.set(idx, buf);
    } catch {
      // 읽기 실패 시 해당 프레임 스킵
    } finally {
      this.inflight.delete(idx);
      // 슬롯이 생겼으니 다음 프리페치 트리거 — 이미 tick이 호출하므로 여기선 생략
    }
  }
}
