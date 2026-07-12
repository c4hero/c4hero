# TEA-64 Branch Reconciliation Report

**Date**: 2026-07-12  
**Status**: CONTAINMENT CHECK FAILED — Further Investigation Required

## Executive Summary

The `tea-ai-byok-features` branch is **NOT** fully contained within `tea-44-50-ai-ops-byok-batch`. The branch contains two additional commits that are not present in the batch branch or main:
- `88d707d` (2026-07-05): Merge commit resolving main into tea-ai-byok-features
- `3497ba7` (2026-07-05): Fix for viewport-restore rAF retry cap on CI flakiness

The TEA-39 and TEA-40 streaming/stop-button features **ARE** present in main, confirming successful delivery. However, the additional commits represent important post-merge work that should not be silently deleted.

## Verification Commands and Output

### Command Set A: Containment Proof

**Command A1**: `git rev-parse origin/tea-ai-byok-features`
```
3497ba758cca8298993fd82a16d5d725347a31f9
```

**Command A2**: `git merge-base origin/tea-ai-byok-features origin/tea-44-50-ai-ops-byok-batch`
```
ddc02537e0092d06456a903d6eac830accf1c2de
```

**Result**: ❌ FAIL — A1 ≠ A2  
Expected: Both refs should be equal (tea-ai-byok-features fully contained in batch)  
Actual: A1 is 3497ba7, A2 is ddc0253 (merge-base, v0.2.2 release)

### Command Set B: Commits Unique to tea-ai-byok-features

**Command**: `git log --oneline origin/tea-44-50-ai-ops-byok-batch..origin/tea-ai-byok-features`
```
3497ba7 fix: bring viewport-restore rAF retry cap in line with fit-content path
88d707d Merge main into tea-ai-byok-features, resolve conflicts
```

These commits are **only** on tea-ai-byok-features and **not** in:
- `origin/main` (confirmed via `git branch -r --contains 3497ba7`)
- `origin/tea-44-50-ai-ops-byok-batch`

### Command Set C: Feature Verification (TEA-39 & TEA-40 in main)

**Command C1**: `git grep -l 'answerQuestionStream' origin/main -- src/components/`
```
origin/main:src/components/ai/ChatBody.tsx
```
✅ PASS — Ask-anything Q&A wiring present in main

**Command C2**: `git grep -n 'completeStream' origin/main -- src/lib/ai/features.ts` (first 5 matches)
```
origin/main:src/lib/ai/features.ts:39:  if (!provider.completeStream) {
origin/main:src/lib/ai/features.ts:44:  const text = await provider.completeStream({ ...req, onText, signal })
origin/main:src/lib/ai/features.ts:121:  if (!provider.completeStream) {
origin/main:src/lib/ai/features.ts:135:  // completeStream carries no JSON mode (unlike completeJson), so spell out the
origin/main:src/lib/ai/features.ts:140:  const text = await provider.completeStream({
```
✅ PASS — Streaming completion infrastructure present in main

## Analysis of Additional Commits

### Commit 88d707d: Merge main into tea-ai-byok-features

**Purpose**: Resolve merge conflicts from main branch  
**Date**: 2026-07-05 16:19:40 UTC  
**Scope**: 10 files changed  
**Key Conflict Resolution**:
- `package.json` / `package-lock.json`: Kept v0.3.0 version bump from tea-ai-byok-features; regenerated lockfile
- `.gitleaks.toml`: Applied main's `[extend] useDefault = true` config
- `CHANGELOG.md`: Preserved both unreleased [0.3.0] and main's [0.2.2]/[0.2.1] entries

**Post-Merge Verification**: Lint, typecheck, full test suite (1769 tests), and build all passed

### Commit 3497ba7: Viewport-restore rAF retry cap fix

**Purpose**: Fix CI test flakiness in Canvas viewport restoration  
**Date**: 2026-07-05 16:32:01 UTC  
**Scope**: 1 file changed (src/components/canvas/Canvas.tsx)  
**Change**: `< 30` → `< MAX_MEASURE_ATTEMPTS` (60) in tryRestoreViewport rAF polling loop

**Details**:
- CI's test job failed Canvas.test.tsx's "restores a saved viewport when switching to a view that has one" twice in a row
- Same test passed 5/5 locally, indicating CI runner resource contention
- fitContentNodes path uses `MAX_MEASURE_ATTEMPTS` (60), but viewport restore was using 30 attempts
- Aligning both paths provides consistent rAF polling resilience

**Status in main**: The original 30-attempt code remains in main; the fix is unique to tea-ai-byok-features

## Implications

1. **Features delivered**: TEA-39 (stop buttons, streaming) and TEA-40 (ask-anything) are successfully in main via PR #91.

2. **Stale branch with additional work**: tea-ai-byok-features has not been simply superseded; it contains:
   - A conflict resolution merge from main (88d707d)
   - A post-merge bug fix for CI flakiness (3497ba7)

3. **Missing from main**: The viewport-restore rAF fix has not been cherry-picked or merged back into main. This represents potential unfinished work:
   - The fix was created after the merge from main
   - It's only present on tea-ai-byok-features
   - It addresses a real CI test flakiness that may recur

## Recommendations

**Do NOT delete tea-ai-byok-features without**:
1. Evaluating whether commit 3497ba7 (viewport-restore fix) should be cherry-picked into main
2. Checking if the CI test flakiness still occurs in main (if fixed elsewhere, no action needed)
3. Understanding the intent of the 88d707d merge (was it an attempted PR #82 that never landed?)

## Next Steps for TEA-64

1. Determine if 3497ba7 is needed in main (run Canvas.test.tsx multiple times on CI)
2. If needed: cherry-pick 3497ba7 to main via new PR
3. After resolution: branch can be safely deleted as stale
4. Update Linear with reconciliation findings and final status

## Raw Command Outputs

All commands executed from repo root on 2026-07-12 with fresh `git fetch origin`:
- `git fetch origin` completed successfully
- All queries used `origin/` refs (remote, not local)
- No local branch state affected during verification
