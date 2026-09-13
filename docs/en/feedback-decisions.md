# Feedback decisions

This register records what happened to every proposal that came out of community
feedback: whether it was adopted, deferred, discarded, or blocked because the
data format does not carry what it needs. It exists so an idea never becomes a
feature by inertia and never disappears in silence, and so anyone can open the
evidence a decision rests on.

- [Español](../es/feedback-decisions.md)
- [Documentation index](index.md)

This is a product register. It does not replace the
[ADRs](../adr/0001-rendering-ownership.md), which record architecture decisions,
nor the `deferred-work.md` technical backlog, which collects work deferred from
code reviews.

One clarification about citations, because this register promises openable
evidence: anything in backticks starting with `packages/`, `apps/`, `scripts/`
or `docs/` is a path in this repository and opens as written. The planning
artifacts, by contrast — the v1.0 epic plan, the input document
`Reddit reception evidence, August 2026`, `deferred-work.md`, and references to
Epic 1 or Epic 5 — live in the maintainer's planning workspace, outside this
repository; that is why they are cited by name and never as a link.

## Status vocabulary

An entry declares exactly one of these four statuses.

| Status           | What it means                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **adopted**      | It will be implemented. There is a user need, data that actually exists, and a test or fixture that will accept it.               |
| **deferred**     | Reasonable, but not now. It names where it is deferred to.                                                                        |
| **discarded**    | It will not be done, and the reason is about product or contract, not schedule.                                                   |
| **data-blocked** | The data it requires does not exist in `.cslmap`. It defers to a richer source and promises no representation on the current map. |

## Required fields per status

Every entry declares `Status`, `Source` and `Reason`. The reason is short and
anchored in evidence you can open from the text itself: a file path, a symbol, a
fixture, or the epic plan.

| Status                 | Additional fields      |
| ---------------------- | ---------------------- |
| adopted                | `Need`, `Data`, `Test` |
| deferred, data-blocked | `Destination`          |
| discarded              | none                   |

`scripts/verify-feedback-decisions.mjs` checks this shape on every
`pnpm test:scripts` run, in both languages, and requires both trees to declare
the same ids and the same statuses.

## Supersession rule

A decision is never rewritten in place. When new evidence changes it, the entry
keeps all of its previous fields and gains a final revision line:

```markdown
- **Revision 2026-11-04:** previously "data-blocked"; changed to "adopted"
  because the CS1 spike confirmed the API exposes the data.
```

The `Status` field is updated to the current value — that is what you read at a
glance — but the revision line records which status it came from and why. The
history of the decision then lives in the file and in git history, not only in a
diff.

## Entries

### FD-001 — Tell real transfers apart from ordinary stops

- **Status:** adopted
- **Source:** the public reception of August 2026, recorded as the input
  document `Reddit reception evidence, August 2026` in the v1.0 epic plan. No
  verbatim transcript exists in the repository, so this entry cites the
  provenance rather than anyone's exact words.
- **Reason:** proximity grouping of stops is already a derived domain value, not
  an invention: `TransitTransferCandidate` and
  `TransitNetwork.transferCandidates`
  (`packages/core/src/types/transit-network.ts:211-301`) exist and are computed
  from real `.cslmap` stops.
- **Need:** a transit planner needs to see where passengers actually change
  services instead of inferring it from a cluster of identical markers.
- **Data:** `TransitNetwork.transferCandidates`
  (`packages/core/src/types/transit-network.ts:211-301`), derived from the stops
  the parser does extract in
  `packages/parser-cslmap/src/parser/handlers/transit.rs`.
- **Test:** `packages/core/src/transit-network/transit-network.test.ts` over
  `packages/parser-cslmap/fixtures/altavento.cslmap`, which carries four real
  sets of transit stops.

### FD-002 — Read the road hierarchy at a glance

- **Status:** adopted
- **Source:** the public reception of August 2026 (see FD-001 for provenance).
- **Reason:** the hierarchy needs neither inference nor invention: `itemClass` is
  the source of truth and is already mapped to tiers by `ITEM_CLASS_TIER`
  (`packages/core/src/road-classification.ts:92`).
- **Need:** a map reader needs to separate highway, arterial and local street
  without eyeballing widths.
- **Data:** `RoadSegment.item_class` and `RoadSegment.width`
  (`packages/parser-cslmap/src/city_data.rs`), resolved to a tier by
  `ITEM_CLASS_TIER` (`packages/core/src/road-classification.ts:92`).
- **Test:** `packages/core/src/road-classification.test.ts` and the fixture
  `packages/parser-cslmap/fixtures/altavento.cslmap`, which contains `Highway`,
  `Gravel Road` and the remaining classes at realistic volume.

### FD-003 — Draw individual trees

- **Status:** data-blocked
- **Source:** the public reception of August 2026 (see FD-001 for provenance).
- **Reason:** `.cslmap` exports neither tree entities nor vegetation polygons.
  `parse_forest_csv`
  (`packages/parser-cslmap/src/parser/terrain/grid.rs:56`) reads a 512 × 512
  grid of density cells (≈33.75 world units per cell), and `ForestCell`
  (`packages/parser-cslmap/src/city_data.rs`) stores exactly `x`, `z` and
  `density`. Drawing individual trees would mean inventing positions the file
  does not contain.
- **Destination:** Vellum Bridge / CS1 spike (Epic 5, Story 5.1), whose
  per-domain inventory explicitly covers vegetation. The current density overlay
  stays as the honest representation of what exists today.

### FD-004 — Mark RICO ploppable buildings

- **Status:** data-blocked
- **Source:** the public reception of August 2026 (see FD-001 for provenance).
- **Reason:** no layer carries a RICO ploppable marker. `Building`
  (`packages/parser-cslmap/src/city_data.rs`) copies `subsrv` verbatim, and the
  `BuildingServiceType` union
  (`packages/core/src/types/city-data.ts:203`) enumerates the values observed in
  real exports without any variant distinguishing a ploppable from a grown
  building. A RICO building arrives indistinguishable from its zoned equivalent.
- **Destination:** Vellum Bridge / CS1 spike (Epic 5, Story 5.1). If the game
  API exposes the building's origin, the evidence gets tied to a fixture and this
  entry is superseded; if it does not, this closes as discarded.

### FD-005 — Street names on the map

- **Status:** data-blocked
- **Source:** the public reception of August 2026 (see FD-001 for provenance).
- **Reason:** `<Seg>` carries no name at all. `RoadBuilder::handle_start`
  (`packages/parser-cslmap/src/parser/handlers/roads.rs:212-235`) reads exactly
  `id`, `sn`, `en`, `icls` and `width`, and `RoadSegment`
  (`packages/parser-cslmap/src/city_data.rs`) has no name field. Transit line
  names are real; street names do not exist in the format.
- **Destination:** Vellum Bridge / CS1 spike (Epic 5, Story 5.1), whose inventory
  covers names as well as geometry. Until then the map labels no streets: a label
  derived from the segment `id` would be a fake name.

### FD-006 — Give the map each platform's native look

- **Status:** discarded
- **Source:** the public reception of August 2026 (see FD-001 for provenance).
- **Reason:** the platform owns the shell, never the cartographic output. That
  boundary is a contract with its own guardrail in
  `packages/ui/src/shell/platform-parity.test.ts`, and breaking it would make the
  same `.cslmap` with the same `.vellumstyle` export different images on Windows,
  macOS and Linux. The platform adaptation people actually wanted — window
  behavior, shell tokens, installers — is already covered by Epic 1 and does not
  need to touch the map.
