# Tech Rules: Architecture, Stack, & Constraints

> **Status**: Permanent Architectural Invariants  
> **Authoritative Sources**: [`AGENTS.md`](AGENTS.md), [`AI_CONTEXT_MEMORY.md`](AI_CONTEXT_MEMORY.md), [`docs/adr/`](docs/adr/)

---

## 1. Technology Stack
| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons |
| **API & Backend** | Node.js, Express, TypeScript, Python 3.10+ worker subprocesses |
| **Video Engine** | FFmpeg 6.0+ (libass, EBU R128 loudness normalization, TalkNet MAR framing) |
| **Database & Auth** | Supabase (PostgreSQL, RLS) + Local JSON queue fallback |
| **Storage** | Backblaze B2 Cloud Storage + Local static stream fallback |

## 2. Hard Engineering Rules
1. **No Error Swallowing**: Never write empty `catch (e) {}` blocks or shell scripts with `|| true`.
2. **Process Isolation**: All Python invocations must pass through `safeSpawnPython.ts` with strict argument sanitization.
3. **Framing Invariant**: Active speaker determination must weight lip activity (`mar_activity * 3.5`) over face area (`area * 0.5`).
4. **Render Fidelity**: Render presets must strictly use `cropWidth = 1080`, `cropHeight = 1920`, `-crf 17`, `-preset medium`.
5. **Deterministic Package Boundaries**: Algorithms in `packages/clipping-core` must be pure TypeScript and free of external side-effects.
