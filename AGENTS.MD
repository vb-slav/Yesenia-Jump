# Universal Game Development Agent Rules

Use this file as shared cross-project guidance for game-development repositories.
Project-level instructions extend or override it. When rules conflict, follow the
closest project-specific instruction and call out the override when it matters.

This file defines workflow and engineering policy. C# formatting lives in
`code-style.md`.

## Role And Ownership

The human owns:

- player-facing game design and content intent;
- product priorities and scope;
- final approval of durable architecture choices;
- subjective playtest feedback.

The agent owns:

- turning an understood brief into a working, verified implementation;
- routine reversible engineering decisions;
- preserving existing project structure and user changes;
- keeping useful project documentation current;
- reporting evidence, skipped checks, risks, and follow-ups honestly.

Do not silently invent player-facing rules, tuning, progression, economy,
narrative, naming, controls, UI copy, art direction, or content identity.
The human can explicitly delegate any of these choices; record the delegated
choice as an assumption and proceed.

## First Pass

Before changing a project:

1. Read the project-level `AGENTS.md` and the shared rules it references.
2. Detect the engine, language, packages, project version, run path, and tests.
3. Read the relevant game-design, architecture, plan, and onboarding documents.
4. Search existing code, assets, scenes, prefabs, configs, tests, and packages
   for the requested capability.
5. Inspect `git status` and preserve unrelated user work.

Do not impose Unity, a folder layout, an architecture pattern, or a package on a
repository that already has a different working convention.

## Plan Mode First

Before editing project files for any implementation request, including quick
fixes, start in Plan mode. Inspect the project and its instructions, resolve
design questions through the Feature Readiness Gate, and present a concrete
plan with scope, affected systems, acceptance checks, and known risks. Do not
edit files while planning; wait for the user's explicit go-ahead before
implementation. After approval, continue autonomously through routine
implementation and verification.

If Plan mode is unavailable in the current environment, state that clearly,
prepare the same plan in the available mode, and wait for explicit approval
before editing. Do not claim Plan mode was active when it was not.

## Feature Readiness Gate

Apply this gate to every implementation request, including quick fixes, clear
regressions, and narrow one-purpose edits.

Analyze the repository before asking questions. Resolve discoverable facts from
code and docs instead of asking the human.

For every implementation request, ask the human at least one focused question
about the concrete implementation, even when the requested outcome appears
clear. Continue with focused follow-up questions in small batches until the
desired behavior and implementation boundaries can be restated with at least
90% confidence. Do not change code or content below that threshold.

Questions should resolve decisions that affect:

- player-facing goal and behavior;
- states, transitions, inputs, outputs, and failure behavior;
- data/config ownership and persistence needs;
- UI, feedback, assets, scene, prefab, or external integration;
- scope boundaries and workstream ownership;
- important edge cases;
- acceptance criteria and verification.

Do not ask the human to repeat details already specified or facts discoverable
from the repository. Once the 90% threshold is met, routine low-level
implementation details remain agent-owned. An explicit instruction such as
“choose this yourself” resolves only the decision it delegates and gives the
agent authority to select a reasonable option for that decision.

Before implementation, provide or internally record:

```text
Feature Readiness:
- goal: <player/user outcome>
- behavior and boundaries: <what changes and what does not>
- integrations/data: <owned systems and contracts>
- acceptance: <observable pass conditions>
- delegated assumptions: <none or list>
- confidence: <0-100%>
```

Do not start implementation below 90% confidence. If the remaining uncertainty
cannot be resolved, identify the smallest safe slice that is ready and stop for
the missing decision.

## Autonomous Delivery

After the readiness gate passes, continue autonomously through implementation,
verification, and documentation. Do not wait after every small stage.

Stop for input only when the next step requires:

- an unresolved product or game-design decision;
- a new broad or paid dependency;
- a durable architecture boundary with material future cost;
- destructive or difficult-to-recover state changes;
- credentials, missing assets, or external coordination;
- a blocker that cannot be safely bypassed or reported as degraded.

If the approved approach becomes wrong during implementation, stop before a
large pivot and explain the evidence and tradeoff.

## Change And Architecture Rules

- Make the smallest coherent change that solves the requested problem.
- Extend existing architecture before creating a parallel system.
- Preserve public APIs, serialized field names, scenes, prefabs,
  ScriptableObjects, save formats, and data layouts unless migration is part of
  the task.
- Prefer explicit references, narrow components, plain classes, and small
  adapters over new global managers or frameworks.
- Do not add Manager, Service, EventBus, Singleton, DI, ServiceLocator, state
  machine, object pool, or interface layers without a concrete current need.
- Use configuration for genuinely tunable or reusable content. Do not turn every
  local value into a global config asset.
- Implement only what the human requested and the smallest support required to
  make it work. Do not add settings, controls, documents, states, or architecture
  for completeness. If an unrequested detail seems necessary with 80% or higher
  confidence, propose it and wait for approval; otherwise omit it.
- A player-controlled camera config contains only the tuning explicitly requested
  by the human. Keep implementation constants such as fixed view orientation or
  safety bounds local unless configurability was requested.
- Do not refactor unrelated code or revert user-owned changes.
- Treat generated files and third-party packages as read-only unless the task
  explicitly targets them.

## Dependency Policy

Search in this order:

1. existing project code and assets;
2. already installed packages;
3. Unity or engine built-ins and official packages;
4. a narrow maintained dependency that is smaller and safer than custom code;
5. the smallest project-local implementation.

Install nothing “for later.” Do not add broad game frameworks, no-code runtime
graphs, or external agent orchestrators during project bootstrap. A new
dependency needs a concrete feature, license review, integration boundary, and
human approval when it materially changes the project.

## Workstreams And Handoffs

When the project documents feature chats, workstreams, or ownership boundaries,
read the map before implementing.

At the start of cross-system work, identify:

- the active workstream;
- what can be changed inside it now;
- dependencies owned elsewhere;
- the required handoff and its expected contract;
- the coordination document that will be updated.

Do not silently implement another workstream’s owned surface. Record handoffs
with the source feature, required data/behavior, open decisions, and status.
Do not create a workstream split unless the human approves it.

### Cross-Agent Change Handoff

When another chat or agent may encounter a meaningful completed fix, feature,
or behavioral change, update the project's canonical plan or established
coordination document before closing the task. Leave one concise handoff entry
that records:

- the original symptom or requested behavior;
- the root cause, when known;
- the systems, files, scene/prefab wiring, or data contracts changed;
- the resulting behavior and any intentionally unchanged boundaries;
- automated, runtime, build, and manual verification results, including
  degraded or skipped checks;
- remaining work that is explicitly outside the completed change.

Mark the corresponding checklist item complete and update an existing handoff
instead of creating a competing changelog. Before modifying unfamiliar changed
code, read the canonical handoff and inspect the current diff so another
agent's work is understood, preserved, and not mistaken for an unfinished or
unrelated edit.

## Persistence Awareness

When a feature creates meaningful runtime state, decide whether that state may
need persistence. If save/load is outside the current scope, do not implement it
opportunistically. Record a requirement in the project’s save backlog when one
exists:

- system/feature;
- state to persist and why;
- mutation timing;
- restore behavior;
- milestone priority;
- open design or technical questions.

The save/load workstream owns the real schema, migrations, and implementation.

## Plans And Documentation

For a multi-stage project, keep
`gamedesign/DEVELOPMENT_PLAN.md` as the canonical staged checklist unless the
project has another established location. A stage closes only after its
implementation, verification, documentation, blockers, and follow-ups are
updated.

Use documentation only when it preserves decisions or reduces future work:

- When the user answers a clarification question, record the agreed decision in
  the existing author-written documentation when relevant. Match the author's
  structure and writing style; do not create a separate report or document for
  the answer unless it is actually needed.

- `gamedesign/` for feature and mechanic intent;
- `architecture/` for durable technical boundaries;
- `architecture/systems/` for important system contracts and data flow;
- `architecture/configs/` for reusable config formats;
- `architecture/content-pipelines/` for approved repeatable content work.

Do not create a log, task page, QA duplicate, or architecture document for every
small edit. Update existing documents instead of growing competing sources of
truth.

If a repeated action could become a useful pipeline, propose it before adding
scripts, generators, editor menus, or mandatory checklist steps. Do not automate
a one-off merely because it can be automated.

## Artifact Rules

Keep project-relevant inputs, generated assets, screenshots, scripts, exports,
and deliverables inside the project. Do not intentionally leave them in the user
home, OS temp, clipboard storage, another project, or a tool’s default output
folder.

Store durable visual references with stable names and a small index that states
their purpose. Separate source references, generated concepts, and runtime-ready
assets.

## Unity Rules

Apply this section only when `Assets/`, `Packages/`, and
`ProjectSettings/` identify a Unity project.

- Use the official Unity CLI as the primary automation transport. Follow
  `pipelines/unity-cli.md`.
- Preserve the existing render pipeline, input stack, UI stack, folder
  convention, and assembly graph.
- Keep serialized fields private with `[SerializeField]` when Inspector
  assignment is needed. Never assume the reference is assigned; verify it or
  document the wiring.
- Use ScriptableObjects for shared authored data when they improve content
  creation or reuse, not as a default wrapper for every value.
- Keep gameplay rules testable outside MonoBehaviour lifecycle when practical.
- Mention required scene, prefab, Inspector, layer, tag, sorting layer,
  animation, build-setting, and ScriptableObject changes.
- Do not hide mandatory scene setup in editor-only code.

### Unity Testing Policy

Follow `pipelines/unity-testing-asmdefs.md`.

Write EditMode tests for deterministic logic such as state transitions,
calculations, inventory/economy rules, generation, save serialization, and
migrations.

Write PlayMode tests for critical Unity integrations such as lifecycle, scene
and prefab wiring, input, physics/collision, UI flows, spawn/despawn,
scene transitions, and high-value end-to-end gameplay paths.

Do not create PlayMode tests for trivial getters or every component. Do not
pretend a screenshot proves interactive behavior. Visual quality, game feel,
animation timing, and tuning still require a human playtest.

When a required automated or manual check cannot run, mark it
`degraded`, state the exact reason, and list the remaining manual check.

### Assembly Definitions

For a new small Unity project, start with at most:

- `Game.Runtime`;
- `Game.Editor`;
- `Game.Tests.EditMode`;
- `Game.Tests.PlayMode`.

Do not add an assembly per feature or rewrite an existing assembly structure
without a measured compile-time or dependency-boundary reason.

## Other Engines And Web Games

Detect and preserve the actual stack. Do not add a heavy framework to a small
prototype without approval. Keep game state, rendering, input, UI, configs, and
assets separated only as far as the current project benefits.

Run the project using its documented path, inspect the runtime/browser console,
and provide an engine-appropriate manual smoke test.

## Verification And Definition Of Done

A task is complete only when:

- behavior matches the ready brief and selected scope;
- relevant automated checks pass, or skipped checks are marked degraded;
- runtime/Play Mode/manual verification covers the changed behavior;
- new console errors are fixed or explicitly attributed;
- changed files and engine/editor wiring are summarized;
- relevant docs are updated, or no update is needed for a stated reason;
- risks, assumptions, and follow-ups are reported;
- project artifacts live inside the project.

Use this concise final shape unless the human requests another:

```md
## Done
What changed and the resulting behavior.

## Verification
- Automated and runtime checks, including degraded checks.

## Project Setup / Manual Check
- Required editor wiring and human playtest steps.

## Risks / Follow-ups
- Important remaining items only.
```
