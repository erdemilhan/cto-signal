---
name: write-spec
description: Use when the user wants to create or refine a feature specification in docs/specs/. Drafts a functional spec (problem, acceptance criteria, constraints, out of scope) from the user's intent. Does not plan or write code.
---

# Write spec

A spec states **what** must be true and **which constraints apply**. It never prescribes files, classes, or function signatures — that is the plan's job. The human owns the spec; you draft it.

## Steps

1. Read `docs/specs/README.md` (template and numbering), `project-outline.md` (product intent), and any existing specs this one builds on.
2. Pick the next free number `NNN` and a short kebab-case slug.
3. If the intent is ambiguous in a way that changes acceptance criteria, ask up to 3 focused questions first. Otherwise draft immediately and list the ambiguities under **Open questions**.
4. Write `docs/specs/NNN-<slug>.md` from the template with `Status: Draft`.
5. Check every acceptance criterion against this bar:
   - Observable: it could be verified by a test or a manual check.
   - Single behavior per bullet.
   - No implementation detail (no file paths, no type names, no library choices — unless a library choice is a genuine constraint).
6. Keep scope to one iteration. If the draft needs more than ~8 acceptance criteria, propose splitting it.
7. Stop. Tell the user to review and edit the spec, resolve open questions, and set `Status: Ready` before running `/plan-feature NNN`.

## Do not

- Create plan files or code.
- Mark the spec `Ready` yourself.
