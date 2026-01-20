# omo-omcs Roadmap

## Current Status (v0.1.0)

### Implemented Features

| Feature | Status | Description |
|---------|--------|-------------|
| Ultrawork Mode | ✅ | System prompt injection via `experimental.chat.system.transform` |
| Ralph Loop | ✅ | PRD-based task tracking with completion detection |
| Ultrawork-Ralph | ✅ | Combined mode (ultrawork + ralph-loop) |
| Keyword Detection | ✅ | `ultrawork`, `ulw`, `uw`, `/ralph-loop`, `/ultrawork-ralph` |
| Completion Detection | ✅ | `<promise>TASK_COMPLETE</promise>` and `<promise>DONE</promise>` |
| TODO Continuation | ✅ | Injects continuation prompt on `session.idle` event |
| Background Agents | ✅ | `explore`, `librarian` via `background_task` tool |
| Session Recovery | ✅ | Handles session errors and recovery |
| Notepad Memory System | ✅ | Compaction-resilient memory with `<remember>` tags |
| Remember Tag Processor | ✅ | Post-tool-use hook for memory persistence |
| Persistent Mode Handler | ✅ | Unified continuation handler (Ralph > Ultrawork > Todo) |

### Test Coverage

- 40 tests passing (unit + integration)
- Covers: keyword detection, system prompt injection, ralph-loop state, plugin lifecycle, notepad system

---

## Known Issues & Limitations

### 1. No Stop Hook (Critical)

**Problem**: OpenCode plugin API does not expose a `Stop` event hook.

**Impact**: 
- Cannot block premature stopping like oh-my-claude-sisyphus
- Must rely on `session.idle` detection + prompt injection (reactive, not proactive)
- Different UX: countdown before continuation vs immediate block

**Comparison**:
```
oh-my-claude-sisyphus (Claude Code):
  User stops → Stop hook intercepts → Returns {continue: false} → Blocked immediately

omo-omcs (OpenCode):
  User stops → Session goes idle → Detected after delay → New prompt injected → Resumes
```

**Mitigation**: Current implementation uses `session.idle` event with 2-second countdown before injecting continuation prompt.

**Resolution**: Request Stop hook feature from OpenCode team, or explore alternative detection methods.

---

### 2. In-Memory State Only

**Problem**: All mode states (ultrawork, ralph-loop) are stored in memory only.

**Impact**:
- State lost on plugin restart
- No cross-session persistence
- Cannot resume interrupted sessions

**oh-my-claude-sisyphus approach**:
- `.sisyphus/ultrawork-state.json` - Local project state
- `.sisyphus/ralph-state.json` - Ralph loop state
- `~/.claude/ultrawork-state.json` - Global cross-session state

---

### 3. Missing Oracle Verification

**Problem**: Ralph-loop completion is not verified by Oracle agent.

**Impact**:
- Agent can claim completion without verification
- No second opinion on task completion quality

**oh-my-claude-sisyphus approach**:
- `ralph-verifier` hook intercepts completion claims
- Spawns Oracle agent to verify before accepting
- Uses `<oracle-approved>VERIFIED_COMPLETE</oracle-approved>` tag

---

### 4. Incomplete PRD Progress Tracking

**Problem**: `.sisyphus/progress.txt` not fully implemented.

**Impact**:
- Learnings not persisted between iterations
- Patterns not recorded for future reference
- Story completion history not tracked

---

## Feature Roadmap

### Phase 1: State Persistence (Priority: High) ✅ COMPLETED

#### 1.1 File-Based Ultrawork State ✅
```typescript
// Location: .sisyphus/ultrawork-state.json
{
  "active": true,
  "started_at": "2025-01-20T13:00:00Z",
  "original_prompt": "ultrawork implement auth system",
  "session_id": "ses_xxx",
  "reinforcement_count": 0,
  "last_checked_at": "2025-01-20T13:05:00Z"
}
```

Tasks:
- [x] Create `src/state/ultrawork-state.ts`
- [x] Write state on mode activation
- [x] Read state on plugin init (resume interrupted sessions)
- [x] Clear state on completion or `/cancel-ultrawork`
- [x] Add global state at `~/.opencode/ultrawork-state.json`

#### 1.2 File-Based Ralph State ✅
```typescript
// Location: .sisyphus/ralph-state.json
{
  "active": true,
  "iteration": 3,
  "max_iterations": 50,
  "completion_promise": "TASK_COMPLETE",
  "started_at": "2025-01-20T13:00:00Z",
  "prompt": "implement user registration",
  "session_id": "ses_xxx",
  "prd_mode": true,
  "current_story_id": "US-002"
}
```

Tasks:
- [x] Update `src/hooks/ralph-loop.ts` to persist state
- [x] Implement iteration tracking
- [x] Resume from last iteration on restart

---

### Phase 2: PRD Enhancement (Priority: High) ✅ COMPLETED

#### 2.1 Full PRD Structure ✅
```typescript
// Location: .sisyphus/prd.json
{
  "project": "User Authentication",
  "description": "Implement full auth system with JWT",
  "userStories": [
    {
      "id": "US-001",
      "title": "User registration",
      "acceptanceCriteria": [
        "Email validation",
        "Password hashing",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": true
    },
    {
      "id": "US-002",
      "title": "User login",
      "acceptanceCriteria": ["JWT generation", "Token validation"],
      "priority": 2,
      "passes": false
    }
  ]
}
```

Tasks:
- [x] Create `src/prd/prd-manager.ts`
- [x] Auto-generate PRD from task description
- [x] Track story completion status
- [x] Inject current story context into prompts

#### 2.2 Progress Tracking ✅
```
// Location: .sisyphus/progress.txt

## Iteration 1 (2025-01-20 13:00)
Story: US-001 - User registration
Implementation:
- Created User model with email validation
- Added bcrypt password hashing
- Created POST /api/auth/register endpoint
Files Changed:
- src/models/user.ts
- src/routes/auth.ts
Learnings:
- bcrypt.hash needs cost factor of 12 for production
- Email regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/

## Patterns Discovered
- All routes use express.Router()
- Error handling via middleware in src/middleware/error.ts
```

Tasks:
- [x] Create `src/prd/progress-tracker.ts`
- [x] Append progress after each story completion
- [x] Record discovered patterns
- [x] Inject progress context into continuation prompts

---

### Phase 3: Oracle Verification (Priority: Medium) ✅ COMPLETED

#### 3.1 Verification Flow ✅
```
Agent outputs <promise>TASK_COMPLETE</promise>
    ↓
ralph-verifier intercepts
    ↓
Spawns Oracle agent with verification prompt
    ↓
Oracle checks:
  - All acceptance criteria met?
  - Implementation complete?
  - Tests passing?
  - Code quality acceptable?
    ↓
If APPROVED: <oracle-approved>VERIFIED_COMPLETE</oracle-approved>
If REJECTED: Continue working with Oracle's feedback
```

Tasks:
- [x] Create `src/hooks/ralph-verifier.ts`
- [x] Detect completion promise in assistant messages
- [x] Spawn Oracle for verification
- [x] Handle approval/rejection flow
- [x] Track verification attempts (max 3)

#### 3.2 Verification State ✅
```typescript
// Location: .sisyphus/ralph-verification.json
{
  "pending": true,
  "original_task": "implement user registration",
  "completion_claim": "All registration features implemented",
  "verification_attempts": 1,
  "max_verification_attempts": 3,
  "oracle_feedback": "Missing email confirmation flow"
}
```

---

### Phase 4: Enhanced Continuation (Priority: Medium) ✅ COMPLETED

#### 4.1 Smarter Idle Detection ✅

Current: Fixed 2-second countdown after `session.idle`

Improved:
- [x] Detect partial completion (some todos done, some pending)
- [x] Vary countdown based on task complexity
- [x] Skip countdown if agent is clearly mid-task (>90% complete)
- [x] Track consecutive idle events for rapid sequence detection
- [x] Adaptive countdown based on in-progress tasks

#### 4.2 Continuation Message Variants ✅

```typescript
const CONTINUATION_MESSAGES = [
  "[SYSTEM REMINDER - TODO CONTINUATION] ...",
  "[THE BOULDER NEVER STOPS] ...",
  "[SISYPHUS REMINDER] ...",
  "[CONTINUATION REQUIRED] ...",
  "[TASK PERSISTENCE ACTIVE] ..."
];
```

Tasks:
- [x] Add message variety to prevent pattern fatigue
- [x] Include specific next task in message
- [x] Show progress summary (X/Y completed)
- [x] Different messages for todo, ralph-loop, and ultrawork-ralph modes

---

### Phase 5: Platform Feature Requests (Priority: Low)

#### 5.1 Request Stop Hook from OpenCode

Feature request for OpenCode plugin API:
```typescript
// Desired API
"session.stop"?: (input: {
  sessionID: string;
  reason?: string;
}, output: {
  continue: boolean;
  message?: string;
}) => Promise<void>;
```

#### 5.2 Request Completion Detection Hook

```typescript
// Desired API  
"assistant.message.complete"?: (input: {
  sessionID: string;
  messageID: string;
  content: string;
}, output: {
  intercept: boolean;
  response?: string;
}) => Promise<void>;
```

---

## Comparison: oh-my-claude-sisyphus vs omo-omcs

| Feature | oh-my-claude-sisyphus | omo-omcs Current | Status |
|---------|----------------------|------------------|--------|
| Stop Hook | ✅ Native | ❌ Not available | ⏳ Request from OpenCode |
| System Prompt Injection | ✅ Bash hooks | ✅ `experimental.chat.system.transform` | ✅ Done |
| Ultrawork Mode | ✅ | ✅ | ✅ Done |
| Ralph Loop | ✅ | ✅ | ✅ Done |
| Ultrawork-Ralph | ✅ | ✅ | ✅ Done |
| File-Based State | ✅ | ✅ Full | ✅ Done (Phase 1) |
| PRD Support | ✅ Full | ✅ Full | ✅ Done (Phase 2) |
| Progress Tracking | ✅ | ✅ | ✅ Done (Phase 2) |
| Oracle Verification | ✅ | ✅ | ✅ Done (Phase 3) |
| Continuation Messages | ✅ Varied | ✅ Varied | ✅ Done (Phase 4) |
| Cross-Session State | ✅ ~/.claude/ | ✅ ~/.opencode/ | ✅ Done (Phase 1) |
| Notepad Memory | ✅ | ✅ | ✅ Done |
| Remember Tags | ✅ | ✅ | ✅ Done |
| Mnemosyne Skills | ✅ | ❌ | ⏳ Future |

---

## Contributing

When implementing new features:

1. Follow existing code patterns in `src/hooks/`
2. Add unit tests in `tests/`
3. Update this roadmap document
4. Run `bun test` before committing

---

## References

- [oh-my-claude-sisyphus](https://github.com/code-yeongyu/oh-my-claude-sisyphus) - Original Claude Code plugin
- [OpenCode Plugin API](https://github.com/opencode-ai/opencode) - Plugin documentation
