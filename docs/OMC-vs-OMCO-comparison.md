# OMC vs OMCO 비교 분석

> **OMC** = oh-my-claudecode (Claude Code 플러그인)
> **OMCO** = oh-my-claudecode-opencode (OpenCode 플러그인)

## 개요

| 항목 | OMC (v3.3.6) | OMCO (v0.2.0) |
|------|--------------|---------------|
| 플랫폼 | Claude Code | OpenCode |
| 구현 언어 | TypeScript (Node.js) | TypeScript (Bun) |
| 플러그인 방식 | Shell hooks + Bridge | Native Plugin API |
| 기본 모델 | Claude (claude-*) | GitHub Copilot Claude |

---

## 1. 디렉토리 구조 비교

### OMC 구조
```
src/
├── agents/           # 에이전트 정의 (13개 파일)
├── cli/              # CLI 도구
├── commands/         # 슬래시 커맨드
├── config/           # 설정 로더
├── features/         # 기능 모듈 (9개)
├── hooks/            # 훅 (30개 디렉토리)
├── hud/              # HUD 상태바
├── installer/        # 설치 스크립트
├── lib/              # 라이브러리
├── mcp/              # MCP 서버 연동
├── shared/           # 공유 유틸리티
├── tools/            # 도구 정의
└── utils/            # 유틸리티
```

### OMCO 구조
```
src/
├── agents/           # 에이전트 정의 (1개 파일)
├── config/           # 설정 로더
├── hooks/            # 훅 (20개 파일)
├── plugin-handlers/  # 플러그인 핸들러
├── prd/              # PRD 관리
├── prompts/          # 프롬프트 템플릿
├── shared/           # 공유 유틸리티
├── skills/           # 스킬 정의
├── state/            # 상태 관리
└── tools/            # 도구 정의
```

### 차이점
- OMC는 더 세분화된 모듈 구조 (features, cli, commands, mcp, hud, installer)
- OMCO는 단순화된 구조 (OpenCode 네이티브 API 활용)
- OMC의 hooks는 디렉토리 단위, OMCO는 파일 단위

---

## 2. 에이전트 비교

### 에이전트 수

| 구분 | OMC | OMCO |
|------|-----|------|
| 총 에이전트 | 24개 (유니크) | 24개 |
| 별칭 포함 | 40+개 | 40+개 |

### 에이전트 구현 방식

#### OMC (개별 파일)
```
agents/
├── analyst.ts
├── architect.ts
├── coordinator.ts
├── critic.ts
├── designer.ts
├── executor.ts
├── explore.ts
├── planner.ts
├── qa-tester.ts
├── researcher.ts
├── scientist.ts
├── vision.ts
└── writer.ts
```

각 에이전트는 개별 파일에서 메타데이터와 프롬프트를 관리:
```typescript
export const architectAgent = {
  name: 'architect',
  model: 'opus',
  readOnly: true,
  systemPrompt: '...'
};
export const ARCHITECT_PROMPT_METADATA = { ... };
```

#### OMCO (단일 파일)
`agents/index.ts` 하나에 모든 에이전트 정의:
```typescript
export const architectAgent: AgentDefinition = {
  name: "architect",
  model: "opus",
  readOnly: true,
  systemPrompt: '...'
};
```

### 에이전트 목록 (공통)

| 에이전트 | 티어 | 역할 | 별칭 |
|----------|------|------|------|
| **architect** | opus | 아키텍처 어드바이저 (READ-ONLY) | oracle |
| architect-medium | sonnet | 균형 잡힌 아키텍처 분석 | oracle-medium |
| architect-low | haiku | 빠른 아키텍처 체크 | oracle-low |
| **executor** | sonnet | 작업 실행자 | sisyphus-junior |
| executor-high | opus | 복잡한 멀티파일 작업 | sisyphus-junior-high |
| executor-low | haiku | 간단한 작업 | sisyphus-junior-low |
| **explore** | haiku | 코드베이스 검색 | - |
| explore-medium | sonnet | 깊은 코드 분석 | - |
| **researcher** | sonnet | 문서 연구 | librarian |
| researcher-low | haiku | 빠른 문서 조회 | librarian-low |
| **designer** | sonnet | UI/UX 구현 | frontend-engineer |
| designer-high | opus | 복잡한 UI 시스템 | frontend-engineer-high |
| designer-low | haiku | 간단한 스타일링 | frontend-engineer-low |
| **writer** | haiku | 기술 문서 작성 | document-writer |
| **planner** | opus | 전략적 계획 | prometheus |
| **analyst** | opus | 사전 분석 | metis |
| **critic** | opus | 계획 검토 | momus |
| **vision** | sonnet | 시각 분석 | multimodal-looker |
| **qa-tester** | sonnet | CLI 테스팅 | - |
| qa-tester-high | opus | 종합 QA | - |
| **scientist** | sonnet | 데이터 분석 | - |
| scientist-high | opus | 복잡한 연구/ML | - |
| scientist-low | haiku | 빠른 데이터 검사 | - |
| **coordinator** | opus | 마스터 오케스트레이터 | - |

### 에이전트별 모델 비교

| 에이전트 | OMC 모델 | OMCO 모델 |
|----------|----------|-----------|
| **HIGH 티어** (opus) | `claude-opus-4-5-20251101` | `github-copilot/claude-opus-4` |
| **MEDIUM 티어** (sonnet) | `claude-sonnet-4-5-20250929` | `github-copilot/claude-sonnet-4` |
| **LOW 티어** (haiku) | `claude-haiku-4-5-20251001` | `github-copilot/claude-haiku-4` |

### 에이전트별 Tool Calling 비교

| 에이전트 | 허용 도구 | 차단 도구 | READ-ONLY |
|----------|-----------|-----------|-----------|
| **architect** | Read, Glob, Grep, Bash, WebSearch | Write, Edit | ✅ |
| architect-medium | Read, Glob, Grep | Write, Edit | ✅ |
| architect-low | Read, Glob, Grep | Write, Edit | ✅ |
| **executor** | 모든 도구 | Task (위임 금지) | ❌ |
| executor-high | 모든 도구 | Task | ❌ |
| executor-low | 모든 도구 | Task | ❌ |
| **explore** | Glob, Grep, Read | Write, Edit | ✅ |
| explore-medium | Glob, Grep, Read | Write, Edit | ✅ |
| **researcher** | WebSearch, WebFetch, Read, Glob, Grep | Write, Edit | ✅ |
| researcher-low | WebSearch, WebFetch, Read, Glob, Grep | Write, Edit | ✅ |
| **designer** | 모든 도구 | - | ❌ |
| designer-high | 모든 도구 | - | ❌ |
| designer-low | 모든 도구 | - | ❌ |
| **writer** | Read, Glob, Grep, Edit, Write | - | ❌ |
| **planner** | Read, Glob, Grep, Edit, Write, Bash, WebSearch | - | ✅ (분석만) |
| **analyst** | Read, Glob, Grep, WebSearch | Write, Edit | ✅ |
| **critic** | Read, Glob, Grep | Write, Edit | ✅ |
| **vision** | Read, Glob, Grep | Write, Edit | ✅ |
| **qa-tester** | Read, Glob, Grep, Bash (tmux) | - | ❌ |
| qa-tester-high | Read, Glob, Grep, Bash (tmux) | - | ❌ |
| **scientist** | Read, Grep, Glob, Bash, python_repl* | - | ❌ |
| scientist-high | Read, Grep, Glob, Bash, python_repl* | - | ❌ |
| scientist-low | Read, Grep, Glob, Bash | - | ❌ |
| **coordinator** | 모든 도구 (Task 포함) | - | ❌ |

> *python_repl: OMC에서만 지원, OMCO는 Bash로 대체

### 도구 제한 구현 차이

#### OMC
```typescript
// agents/definitions.ts에서 에이전트별 도구 제한 정의
createAgentToolRestrictions(agent) {
  if (agent.readOnly) {
    return { blocked: ['Write', 'Edit', 'NotebookEdit'] };
  }
  if (agent.name === 'executor') {
    return { blocked: ['Task'] };  // 위임 금지
  }
}
```

#### OMCO
```typescript
// hooks/omc-orchestrator.ts에서 도구 제한 정의
const TOOL_RESTRICTIONS: Record<string, string[]> = {
  architect: ["Write", "Edit"],
  planner: ["Write", "Edit"],
  analyst: ["Write", "Edit"],
  critic: ["Write", "Edit"],
  vision: ["Write", "Edit"],
  explore: ["Write", "Edit"],
  researcher: ["Write", "Edit"],
};

// enforcement 레벨에 따라 처리
if (delegationEnforcement === 'strict') {
  tools[restrictedTool] = false;  // 완전 차단
} else if (delegationEnforcement === 'warn') {
  log('Warning: tool restriction violated');  // 경고만
}
```

### Coordinator/Orchestrator 모델 및 도구

| 항목 | OMC (coordinator) | OMCO (coordinator) |
|------|-------------------|---------------------|
| 모델 | claude-opus-4-5-20251101 | github-copilot/claude-opus-4 |
| Task 도구 | ✅ 사용 가능 | ✅ 사용 가능 |
| Read/Write | ✅ | ✅ |
| Bash | ✅ | ✅ |
| TodoWrite | ✅ 필수 | ✅ 필수 |
| 백그라운드 실행 | ✅ run_in_background | ✅ background_task |
| 병렬 실행 | ✅ 다중 Task 호출 | ✅ 다중 Task 호출 |

---

## 3. 훅(Hook) 비교

### OMC 훅 (30개)
```
hooks/
├── agent-usage-reminder/
├── auto-slash-command/
├── autopilot/
├── background-notification/
├── bridge.ts
├── comment-checker/
├── context-window-limit-recovery/
├── directory-readme-injector/
├── edit-error-recovery/
├── empty-message-sanitizer/
├── keyword-detector/
├── learner/
├── non-interactive-env/
├── notepad/
├── omc-orchestrator/
├── persistent-mode/
├── plugin-patterns/
├── preemptive-compaction/
├── ralph-loop/
├── ralph-prd/
├── ralph-progress/
├── ralph-verifier/
├── rules-injector/
├── session-recovery/
├── think-mode/
├── thinking-block-validator/
├── todo-continuation/
├── ultraqa-loop/
└── ultrawork-state/
```

### OMCO 훅 (20개)
```
hooks/
├── agent-usage-reminder.ts
├── autopilot.ts
├── context-recovery.ts
├── continuation-messages.ts
├── edit-error-recovery.ts
├── keyword-detector.ts
├── notepad.ts
├── omc-orchestrator.ts
├── persistent-mode.ts
├── ralph-loop.ts
├── ralph-verifier.ts
├── remember-tag-processor.ts
├── session-recovery.ts
├── skill-injector.ts
├── system-prompt-injector.ts
├── todo-continuation-enforcer.ts
├── tui-status.ts
└── ultraqa-loop.ts
```

### 훅 비교 표

| 훅 | OMC | OMCO | 설명 |
|----|-----|------|------|
| agent-usage-reminder | ✅ | ✅ | 에이전트 사용 권장 |
| auto-slash-command | ✅ | ❌ | 자동 슬래시 커맨드 |
| autopilot | ✅ | ✅ | 자율 실행 모드 |
| background-notification | ✅ | ❌ | 백그라운드 알림 |
| comment-checker | ✅ | ❌ | 코멘트 체커 |
| context-recovery | ❌ | ✅ | 컨텍스트 복구 |
| context-window-limit-recovery | ✅ | ❌ | 컨텍스트 윈도우 복구 |
| directory-readme-injector | ✅ | ❌ | README 주입 |
| edit-error-recovery | ✅ | ✅ | 편집 오류 복구 |
| empty-message-sanitizer | ✅ | ❌ | 빈 메시지 정리 |
| keyword-detector | ✅ | ✅ | 키워드 감지 |
| learner | ✅ | ❌ | 학습 추출 |
| non-interactive-env | ✅ | ❌ | 비대화형 환경 |
| notepad | ✅ | ✅ | 노트패드 메모리 |
| omc-orchestrator | ✅ | ✅ | 오케스트레이터 |
| persistent-mode | ✅ | ✅ | 지속 모드 |
| plugin-patterns | ✅ | ❌ | 플러그인 패턴 |
| preemptive-compaction | ✅ | ❌ | 선제적 압축 |
| ralph-loop | ✅ | ✅ | Ralph 반복 실행 |
| ralph-prd | ✅ | ❌ | Ralph PRD 관리 |
| ralph-progress | ✅ | ❌ | Ralph 진행 추적 |
| ralph-verifier | ✅ | ✅ | Ralph 검증 |
| remember-tag-processor | ❌ | ✅ | Remember 태그 처리 |
| rules-injector | ✅ | ❌ | 규칙 주입 |
| session-recovery | ✅ | ✅ | 세션 복구 |
| skill-injector | ❌ | ✅ | 스킬 주입 |
| system-prompt-injector | ❌ | ✅ | 시스템 프롬프트 주입 |
| think-mode | ✅ | ❌ | 사고 모드 |
| thinking-block-validator | ✅ | ❌ | Thinking 블록 검증 |
| todo-continuation | ✅ | ✅ | TODO 연속 실행 |
| tui-status | ❌ | ✅ | TUI 상태 표시 |
| ultraqa-loop | ✅ | ✅ | UltraQA 반복 |
| ultrawork-state | ✅ | ❌ | Ultrawork 상태 |

**OMCO에 없는 주요 기능:**
- HUD (상태바)
- CLI 도구
- MCP 서버 직접 연동
- Learner (학습 추출)
- Think Mode
- Context Window 관리
- Preemptive Compaction

---

## 4. 오케스트레이터 비교

### OMC omc-orchestrator

**파일 구조:**
```
hooks/omc-orchestrator/
├── index.ts
├── constants.ts
└── audit.ts
```

**기능:**
1. **파일 경로 검사**: 허용된 경로(.omc/, .claude/, CLAUDE.md 등)만 직접 수정 가능
2. **Git 변경 추적**: `git diff --numstat`으로 변경 통계 수집
3. **Remember 태그 처리**: `<remember>` 태그를 Working Memory로 저장
4. **Boulder State 연동**: 계획 진행 상황 추적
5. **검증 리마인더**: Task 완료 후 자동 검증 안내
6. **감사 로그**: 모든 위임 기록

**주요 코드:**
```typescript
// 허용 경로 체크
export function isAllowedPath(filePath: string): boolean {
  return ALLOWED_PATH_PATTERNS.some(pattern => pattern.test(filePath));
}

// Post-tool 처리
export function processOrchestratorPostTool(input, output) {
  // Git stats 수집
  const gitStats = getGitDiffStats(workDir);
  // Boulder state 확인
  const boulderState = readBoulderState(workDir);
  // 검증 리마인더 추가
  return { modifiedOutput: output + verificationReminder };
}
```

### OMCO omc-orchestrator

**파일:** `hooks/omc-orchestrator.ts` (단일 파일)

**기능:**
1. **에이전트 도구 제한**: READ-ONLY 에이전트의 Write/Edit 도구 차단
2. **별칭 해석**: 레거시 에이전트 이름을 새 이름으로 변환
3. **감사 로그**: `.omc/logs/delegation-audit.jsonl`에 기록
4. **enforcement 레벨**: strict (차단), warn (경고), off

**주요 코드:**
```typescript
const TOOL_RESTRICTIONS: Record<string, string[]> = {
  architect: ["Write", "Edit"],
  planner: ["Write", "Edit"],
  analyst: ["Write", "Edit"],
  // ... READ-ONLY 에이전트들
};

// tool.execute.before 훅
if (delegationEnforcement === 'strict') {
  tools[restrictedTool] = false; // 도구 차단
}
```

### 차이점 요약

| 기능 | OMC | OMCO |
|------|-----|------|
| 파일 경로 검사 | ✅ 정규식 기반 | ❌ |
| Git 변경 추적 | ✅ | ❌ |
| Remember 태그 | ✅ (오케스트레이터 내장) | ✅ (별도 훅) |
| Boulder State | ✅ | ❌ |
| 도구 제한 | ✅ | ✅ |
| 감사 로그 | ✅ | ✅ |
| enforcement 레벨 | ❌ | ✅ (strict/warn/off) |

---

## 5. 설정 시스템 비교

### 설정 경로

| 구분 | OMC | OMCO |
|------|-----|------|
| 사용자 설정 | `~/.config/claude-sisyphus/config.jsonc` | `~/.config/opencode/omco.json` |
| 프로젝트 설정 | `.claude/sisyphus.jsonc` | `.opencode/omco.json` |

### 설정 스키마 비교

#### 공통 설정
- `agents`: 에이전트별 모델/온도 오버라이드
- `features`: 기능 토글
- `permissions`: 권한 설정
- `magicKeywords`: 키워드 트리거
- `routing`: 모델 라우팅

#### OMC만의 설정
- `mcpServers`: MCP 서버 연동 (exa, context7, grepApp)

#### OMCO만의 설정
- `model_mapping.tierDefaults`: 티어별 기본 모델
- `ralph_loop`: Ralph 설정
- `autopilot`: Autopilot 설정
- `ultraqa`: UltraQA 설정
- `orchestrator`: 오케스트레이터 설정
- `tui_status`: TUI 상태 설정

### 모델 라우팅

#### OMC
```typescript
routing: {
  tierModels: {
    LOW: 'claude-haiku-4-5-20251001',
    MEDIUM: 'claude-sonnet-4-5-20250929',
    HIGH: 'claude-opus-4-5-20251101'
  }
}
```

#### OMCO
```typescript
routing: {
  tierModels: {
    LOW: 'github-copilot/claude-haiku-4',
    MEDIUM: 'github-copilot/claude-sonnet-4',
    HIGH: 'github-copilot/claude-opus-4'
  }
}
```

---

## 6. 도구(Tools) 비교

### OMC 도구
Claude Code의 내장 Task 도구를 통해 에이전트 호출

### OMCO 도구

| 도구 | 설명 |
|------|------|
| `background_task` | 백그라운드 에이전트 실행 |
| `background_output` | 백그라운드 결과 조회 |
| `background_cancel` | 백그라운드 작업 취소 |
| `call_omo_agent` | 에이전트 직접 호출 |

**call_omo_agent 한계:**
```typescript
subagent_type: ["explore", "librarian"] // 2개만 지원
// 실제로는 새 세션 생성 → 프롬프트 전송
// 시스템 프롬프트 주입 없음
// 모델 선택 불가
```

---

## 7. 기능 격차 분석

### OMCO에 없는 OMC 기능

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| **HUD** | 상태바 표시 | 낮음 |
| **CLI 도구** | `omc doctor`, `omc setup` 등 | 중간 |
| **MCP 연동** | exa, context7, grepApp | 높음 |
| **Learner** | 대화에서 스킬 추출 | 중간 |
| **Think Mode** | 깊은 사고 모드 | 중간 |
| **Boulder State** | 계획 진행 상태 추적 | 높음 |
| **Git 변경 추적** | 변경 요약 | 중간 |
| **Context Window 관리** | 자동 압축 | 높음 |
| **에이전트 메타데이터** | 개별 프롬프트 관리 | 중간 |

### OMCO의 장점

| 기능 | 설명 |
|------|------|
| **네이티브 플러그인 API** | OpenCode 플러그인 시스템 직접 활용 |
| **Bun 런타임** | 빠른 실행 속도 |
| **TUI Status** | 에이전트 실행 상태 토스트 알림 |
| **enforcement 레벨** | strict/warn/off 선택 가능 |
| **GitHub Copilot 모델** | 추가 비용 없이 Claude 사용 |

---

## 8. 향후 개선 방향

### 높은 우선순위
1. **call_omo_agent 개선**: 모든 에이전트 지원 + 시스템 프롬프트 주입
2. **MCP 서버 연동**: exa, context7 등 연동
3. **Boulder State**: 계획 진행 상태 추적

### 중간 우선순위
4. **에이전트 메타데이터 분리**: 개별 파일로 관리
5. **Context Window 관리**: 자동 압축/복구
6. **Git 변경 추적**: 오케스트레이터에 통합

### 낮은 우선순위
7. **CLI 도구**: setup, doctor 커맨드
8. **HUD**: 상태바 (OpenCode TUI 활용)

---

## 결론

**OMC**는 Claude Code의 쉘 훅 시스템 위에서 성숙한 에코시스템을 구축했으며, 30개의 훅과 다양한 기능(HUD, CLI, MCP)을 제공합니다.

**OMCO**는 OpenCode의 네이티브 플러그인 API를 활용하여 핵심 기능(에이전트, 오케스트레이터, Ralph Loop 등)을 포팅했으나, 아직 일부 고급 기능(MCP, Boulder State, Context Window 관리)이 부족합니다.

OMCO의 에이전트 정의는 OMC와 동일한 수준으로 구현되어 있으며, GitHub Copilot의 Claude 모델을 기본으로 사용하여 추가 비용 없이 멀티 에이전트 오케스트레이션을 제공합니다.
