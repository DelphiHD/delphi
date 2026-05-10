# DECISIONS.md

Append-only log of why-we-chose-X. New entries go at the top. Each entry: date, decision, why, alternatives considered, and any open questions.

---

## 2026-05-10 — Repo named `delphi`, not `hd-reports`

**Decision.** The GitHub repo is `github.com/DelphiHD/delphi`. The local clone lives at `~/delphi`. The product is still called HD Reports.

**Why.** "hd-reports" was a placeholder used in early drafts of the master plan. "Delphi" is the project codename Kaycee and Tennyson chose for the build. Master plan Phase 0 still says `hd-reports` in the Start Here block; treat that as a stale string, not a directive. The CLAUDE.md and this DECISIONS.md are the source of truth for naming.

**How to apply.** Any prompt or doc that says `~/code/hd-reports` or `gh repo create hd-reports` should be read as "the delphi repo at `~/delphi`". Don't rename the repo to match the master plan; update the master plan instead when there's a natural moment.

**Open.** None. Naming is stable.

---

## 2026-05-10 — Ported stack lives at `DelphiHD/*`, not `tennysonmilesperhour/*`

**Decision.** The 19 forks listed in `STACK_PORTED.md` have been re-forked into the `DelphiHD` GitHub org. That org is the canonical home for HD Reports work.

**Why.** Keeps everything HD-Reports-related under one org for access control, billing, and visibility. Tennyson's personal `tennysonmilesperhour` copies still exist as an upstream layer for many of these forks; we don't depend on them, but they're not deleted.

**How to apply.** When code, docs, or prompts reference a ported repo, point at `DelphiHD/<name>`. If you find a stale `tennysonmilesperhour/*` reference, update it.

**Open.** Branch protection, default-branch policy, and team permissions on the DelphiHD org are not yet configured. Decide before Phase 1 ships.

---
