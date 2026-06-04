<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Yeoun Desktop Agent Rules

이 프로젝트는 **Bun + Next.js (App Router) + TypeScript + Tailwind CSS v4 + Electron** 환경으로 구성되어 있으며, **FSD(Feature-Sliced Design)** 방법론을 기반으로 설계되었습니다. AI 에이전트들은 코드를 작성하거나 수정할 때 다음 아키텍처 규칙을 엄격히 준수해야 합니다.

---

## 1. FSD (Feature-Sliced Design) 아키텍처 규칙

프로젝트 코드는 다음 레이어로 엄격하게 계층화하여 관리합니다. 아래 레이어 외에 루트 영역에 임의의 비표준 디렉토리를 생성하지 마십시오.

- `app/`: Next.js App Router 진입점, 글로벌 레이아웃, 스타일 선언 등 애플리케이션의 설정 영역.
- `pages/`: 실제 렌더링되는 개별 페이지 단위 컴포넌트(주로 Route와 1:1 대응하여 Features/Widgets를 조립하는 역할).
- `widgets/`: 여러 Features를 조합하여 완성되는 독립적인 UI 블록 (예: `4d-splat-viewer-card`, `sidebar-navigation`).
- `features/`: 비즈니스 가치를 제공하는 사용자 상호작용 단위 기능 (예: `play-4d-sequence`, `load-ply-files`).
- `entities/`: 비즈니스 엔티티 모델, 슬라이스 상태 및 개념 중심 컴포넌트 (예: `gaussian-splats`, `camera-config`).
- `shared/`: 프로젝트 전반에서 재사용되는 인프라 스트럭처 코드 (UI 원자 컴포넌트, 유틸리티 함수, 디자인 토큰 등).

### FSD 핵심 규칙

1.  **Strict Layer Hierarchy (하향 참조 금지)**: 레이어는 상위 레이어에서 하위 레이어만 참조할 수 있습니다. (`shared`는 어떠한 레이어도 참조할 수 없으며, `entities`는 `features`나 `widgets`를 참조할 수 없음).
2.  **Public API 선언**: 각 슬라이스 폴더의 내부 구조는 외부에 노출되지 않아야 합니다. 항상 `index.ts`를 생성하여 외부에 공유할 요소들만 `export` 하십시오.

---

## 2. Electron Integration & IPC 가이드

Next.js는 정적 파일(`.html`, `.js`, `.css`)로 빌드되어 Electron 메인 윈도우에 로드됩니다. 네이티브 기능 연동 시 다음 사항을 준수하십시오.

1.  **Static Export 제한 사항**:
    - `use client` 컴포넌트 내부에서 WebGPU / WebGL 및 4D GS 렌더링 조작을 수행합니다.
    - 서버 사이드 API Routes (`app/api/*`)는 사용할 수 없습니다. 데이터가 필요하면 외부 서버 통신을 하거나 Electron IPC를 통해 로컬 리소스를 활용합니다.
2.  **IPC 통신 및 파일 I/O**:
    - 대용량 4D GS 파일 읽기/쓰기, 로컬 폴더 다이얼로그 호출은 Electron 메인 프로세스(`main/main.ts`)에 구현합니다.
    - Renderer 컴포넌트에서는 `preload.ts`를 통해 노출된 IPC 브릿지(Bridge) API를 통해 비동기로 데이터를 통신합니다.

---

## 3. 스타일링 & 컴포넌트 규칙 (Tailwind CSS v4 & React 19)

- **Tailwind CSS v4** 규격을 사용하며, 디자인 토큰은 `@/shared/lib/design-tokens.ts` 또는 CSS Variables를 통해 통합 관리합니다.
- 가독성을 위해 여러 Tailwind 클래스 결합 시 반드시 `cn(...)` 유틸리티 함수를 사용합니다.
- 기본 폰트 사이즈는 **14px**이며, 기본 자간(`letter-spacing`)은 **-2%**로 기본 설정되어 스타일링합니다.
- 모든 컴포넌트는 Functional Component 형식을 띠며, 필요한 경우 `React.forwardRef`를 사용하여 Ref 전달 구조를 일관적으로 보장해야 합니다.
