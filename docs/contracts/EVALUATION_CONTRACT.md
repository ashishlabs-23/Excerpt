# EVALUATION CONTRACT
# Excerpt — Multi-Agent Clip Evaluation (Step 6)

> **Status**: COMPLETE
> The multi-agent evaluation tier has been implemented in `packages/video-worker/src/intelligence/evaluation`. It safely coordinates Hook, Story, Critic, and Judge agents while strictly enforcing budget ceilings, timeout fallbacks, and hard media constraints.

## 1. Agent Topology

The `MultiAgentOrchestrator` receives the generated `ClipCandidate[]` from Step 5.
1. **Parallel Base Agents**: The `HookAgent`, `StoryAgent`, `EmotionAgent`, `ViralityAgent`, and `PlatformAgent` critique the clip independently in parallel.
2. **Debate Trail**: Their outputs (`score`, `confidence`, `reasoning`, `risks`) form the `AgentDebateTrail`.
3. **Critic & Judge**: The `CriticAgent` evaluates the trail to find logical gaps or overly optimistic scoring. Finally, the `JudgeAgent` absorbs the full context, issuing a conclusive `accept/reject` decision and optional boundary change recommendations.

## 2. Fallbacks and Budget Ceilings

AI models timeout, OOM, and incur costs. The subsystem protects the job from failing when these LLM boundaries are hit.

- **Timeout/Error Fallback**: If an individual agent (e.g., `HookAgent`) times out, it is caught securely. The subsystem mathematically falls back to the deterministic signal score calculated in Step 5. The agent's record explicitly flags `fallbackUsed: true` and proceeds. The job does not fail.
- **Budget Ceilings**: The orchestrator is wired to the `CostLedger`. If a job hits its global token/API cost limit mid-debate, subsequent agent calls will throw `BudgetExceeded`. This is instantly caught, triggering the fallback mechanism for all remaining steps. The job concludes successfully without catastrophic failure.

## 3. Hard Constraint Guardrails

LLMs hallucinate. The `JudgeAgent` (or `CriticAgent`) may recommend adjusting a clip's boundaries (e.g., "Cut the first 7 seconds").

The orchestrator enforces a mathematical guardrail: it calculates the proposed duration, and if it violates the hard `minDuration` or `maxDuration` set by the `CandidateConstraints` in Step 5, it silently rejects the recommendation. **LLMs are strictly forbidden from overriding physical media constraints.**

## 4. Auditable Persistence

Because LLM calls are expensive and non-deterministic, reproducing a pipeline state to debug why a clip was rejected is difficult. 
The `EvaluationStore` persists the complete `AuditableEvaluation` payload—containing the initial candidate, the full `AgentDebateTrail`, and the `JudgeDecision`—keyed by `correlationId` and `candidateId`. This allows engineers to instantly fetch the exact mathematical and narrative context of any decision without executing a single API call.

## 5. Test Verification

4 explicit edge-cases in `evaluation.test.ts` continuously assert these guarantees:
1. `CostLedger.append` throwing `BudgetExceeded` correctly triggers the fallback mechanism without crashing the orchestrator.
2. A single agent timing out successfully yields its internal fallback logic while peer agents continue unaffected.
3. The `JudgeDecision` and evidence trail are flawlessly written to the `EvaluationStore` and successfully re-fetched.
4. An LLM-recommended boundary change that produces a clip duration smaller than the `minDuration` constraint is actively rejected by the orchestrator.
