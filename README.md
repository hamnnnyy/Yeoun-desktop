# Yeoun Desktop

4D Gaussian Splatting 기반의 동적 장면 뷰어 및 카메라 패스 에디터 데스크탑 애플리케이션.

멀티뷰 영상을 입력받아 COLMAP → 4DGaussians 트레이닝 파이프라인을 자동 실행하고, 결과 splat을 실시간으로 렌더링하며 카메라 경로를 편집할 수 있습니다.

## 주요 기능

- **4DGS 트레이닝 파이프라인** — 멀티뷰 영상 → ffmpeg 프레임 추출 → COLMAP 캘리브레이션 → 4DGaussians 학습까지 원클릭 자동화
- **실시간 Splat 뷰어** — `@mkkellogg/gaussian-splats-3d` 기반 WebGL 렌더링, 타임라인 스크러빙으로 4D 시퀀스 재생
- **카메라 패스 에디터** — 키프레임 기반 카메라 경로 편집, 스플라인 보간, 경로 미리보기
- **Electron IPC 브릿지** — 네이티브 파일 다이얼로그, 대용량 PLY 파일 I/O, 파이프라인 프로세스 관리

## 기술 스택

| 영역 | 기술 |
|------|------|
| 런타임 | Bun |
| 프론트엔드 | Next.js 16 (App Router, Static Export), React 19, TypeScript |
| 스타일링 | Tailwind CSS v4 |
| 상태관리 | Zustand v5 |
| 3D 렌더링 | Three.js, gaussian-splats-3d |
| 데스크탑 | Electron 42 |
| 아키텍처 | FSD (Feature-Sliced Design) |

## 프로젝트 구조

```
├── app/                  # Next.js App Router 진입점, 글로벌 스타일
├── pages/                # 페이지 단위 컴포넌트
│   └── player/           # 메인 뷰어/에디터 페이지
├── widgets/              # 독립적인 UI 블록
│   ├── splat-viewer/     # 4DGS 렌더링 뷰어
│   └── camera-path-panel/# 카메라 패스 에디터 패널
├── features/             # 비즈니스 기능 단위
│   ├── camera-path-editor/  # 키프레임 편집, 뷰포트, 타임라인
│   ├── timeline-control/    # 재생/스크러빙 컨트롤
│   ├── training-pipeline/   # 트레이닝 진행 UI
│   └── video-import/        # 영상 파일 가져오기
├── entities/             # 비즈니스 엔티티
│   ├── gaussian/         # Splat 렌더러, PLY 리더, 스토어
│   └── camera-path/      # 카메라 패스 스토어 및 타입
├── shared/               # 공용 UI, 유틸리티
└── main/                 # Electron 메인 프로세스
    ├── main.ts           # BrowserWindow, IPC 핸들러
    ├── preload.ts        # Renderer IPC 브릿지
    └── pipeline/         # 4DGS 트레이닝 파이프라인 스테이지
```

## 환경 요구사항

- [Bun](https://bun.sh) 1.x
- [Node.js](https://nodejs.org) 20+
- [ffmpeg](https://ffmpeg.org) (PATH에 등록)
- [COLMAP](https://colmap.github.io) (PATH 또는 `COLMAP_BIN` 환경변수)
- Python 3.10+ (PATH에 등록)
- `4DGS_SCRIPT_PATH` 환경변수 → `4DGaussians/train.py` 경로

## 시작하기

```bash
# 의존성 설치
bun install

# 개발 서버 실행 (Next.js + Electron 동시 시작)
bun dev

# 프로덕션 빌드
bun run build

# 배포용 패키징 (electron-builder)
bun run dist
```

## 라이선스

Private
