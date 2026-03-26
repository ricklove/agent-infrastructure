# Agent Graph Process Summary

## Core Idea

The documents are the truth.

There should not be a hidden latent model behind them. The Agentish corpus itself is the authoritative design graph, and implementation is answerable to it.

This means:

- the design corpus is authoritative over implementation
- implementation must not invent design truth silently
- if implementation needs a missing decision, that is a document gap
- if implementation diverges, that is either an implementation bug or evidence that the design corpus needs an explicit revision

## Better Model

The current idea of a strict linear layer stack is too coarse. The better model is a **purpose graph** of documents.

Documents should be organized by what truth they own, not just by their position in a hierarchy.

For now, the intended authoritative document set is:

- `agentish-graph.agentish.ts`
- `infrastructure-architecture`
- `tech-stack`
- `coding-standards`

We should keep architecture-led names, but define each document strictly by:

- what truth it owns
- what truth it may import
- what truth it must not contain

## Authority Model

Human input should be treated as highest-weight truth by default.

Important implications:

- human edits act as anchors
- authority should be local, at statement/block level
- divergence from higher-weight truth must be explicit to the human
- the human should be able to adjust the weight of parts of the truth graph

The current conclusion is that authority should be expressed with a **single compact annotation**.

The annotation should answer one question clearly for the LLM: how much weight should this statement carry?

Important nuance:

- direct human-written comments or edits are highest authority
- human answers to LLM-framed multiple-choice questions are medium authority
- LLM-originated thoughts or synthesis are lower authority

Chat provenance matters, but the chat reference itself is not the weight. One chat session may contain statements with different effective authority.

To avoid polluting the main design docs with metadata noise, the current likely direction is a bridge document such as `design-conversations.ts` that defines semantically named conversation references. Main docs can then attach a compact reference to a meaningful name instead of embedding verbose chat metadata inline everywhere.

## Global Graph Model

For LLM reasoning, the current conclusion is that explicit TypeScript-style imports and exports are mostly boilerplate noise.

What the LLM mainly cares about is direct reference through named semantic nodes/constants inside statements.

So the preferred model is:

- one global semantic graph
- globally unique names
- direct statement-level references between named nodes
- separate files for human governance and purpose boundaries
- no heavy import/export boilerplate in the LLM-facing representation

This means the preferred representation is:

- one subject file
- one coherent graph with explicit in-file sections
- globally unique names and directly referenceable semantic nodes

## File Boundaries And Ordering

Separate files still matter for humans:

- purpose discipline
- review boundaries
- targeted regeneration
- revision history

But for LLM consumption, the preferred representation is a **canonical flattened order** with file separators such as:

```ts
// agentish-graph.agentish.ts
// SectionMap
// Concept
// Scenarios
// ImplementationPlan
// Contracts
```

This gives the LLM:

- one continuous global graph
- explicit awareness of document boundaries
- a single canonical reading order
- less top-of-file module boilerplate

So the current best model is:

- canonical storage form: one subject file with a canonical section map
- canonical LLM presentation form: the same file in its native section order

## Refinement Model

The process should not be "pick the best lower-layer draft."

It should be:

1. treat the documents as a graph of truth
2. identify weak semantic regions
3. regenerate only those regions with multiple candidates
4. compare the candidates for semantic quality
5. extract what was learned
6. move newly discovered truth to the highest rightful owning document
7. reflow dependent documents or sections coherently within the same global graph
8. repeat until divergence is mostly local expression rather than semantics

This is a kind of **document-graph denoising**, but the documents themselves remain the truth.

## Denoising

"Denoising" here means removing:

- ambiguity
- weak ownership
- wrong-layer truth
- duplicated truth
- drift from imports
- low-density local expression
- invented decisions in the wrong place

The preferred denoising operator is **targeted semantic-block regeneration**, not arbitrary random chunk replacement.

Good denoising units are things like:

- one invariant block
- one scenario
- one decision cluster
- one contract family
- one ownership region
- one conflict policy

## Comparison

Multi-result comparison is useful, but only as a diagnostic tool.

It should not be treated as majority voting or winner-picking.

The point of comparison is to reveal:

- hidden ambiguity in upstream documents
- invented decisions in downstream documents
- stronger local expressions
- misplaced ownership or duplicated truth

The most important comparison result is not "which draft is prettiest." It is:

- what disagreement shows that the current corpus still leaves too much freedom

## Quality Criteria

The process should evaluate outputs using explicit semantic criteria rather than stylistic preference.

Important criteria include:

- ownership correctness
- recoverable structure
- semantic locality
- cross-document coherence
- decision closure
- inferability from dependencies
- non-ceremonial density

In short:

- semantic density matters more than token count
- explicit structure matters more than textual compression
- repetition is fine when it preserves clarity and locality
- abstraction is good only when it clarifies meaning

## Canonical Goal

The goal is to build an authoritative Agentish design corpus that is:

- definitive over implementation
- iteratively refinable by humans and LLMs
- explicit about authority and ownership
- structured as one coherent global semantic graph
- stable enough that implementation becomes mostly mechanical

## Immediate Next Step

Define the actual purpose graph in detail:

- what documents exist
- what each one owns
- what each one imports
- what each one exports
- what each one must never contain

That is the next major step needed before refining the process further.

## Scenario-First Product Plan

The graph system should now be framed as the React Flow viewer/editor for Agentish documents, not as a document about Agentish process theory.

Primary user:

- Agentish author/maintainer

Primary mode:

- read-first, edit-capable
- graph-only, no adjacent source editor
- multi-document workspace
- complete underlying graph
- user-composable persistent layers
- edits allowed from any view
- external change and conflict handling are first-class

### Family 1: Whole-System Comprehension

Problem:

- the user needs to understand a complete multi-document Agentish workspace from the graph alone and trust that the graph is complete

Stories:

- open a workspace and see a complete clustered overview of the full semantic graph
- actively explore that overview through pan, zoom, hover, and selection
- understand what exists and how the major parts connect
- trust that later derived layers remain slices of the same complete graph

Success:

- the user can explain the major structures in the workspace and how they connect
- the user trusts that the graph represents the whole workspace, not an accidental partial

Primary failure to prevent:

- distrust of completeness

Important constraints:

- initial view is a global overview
- overview is clustered and legible, not raw dense detail
- cross-document relationships are balanced with within-document structure
- hidden connected context remains visibly present as hidden-but-real context
- the user actively explores immediately rather than passively observing

### Family 2: View Composition And Navigation

Problem:

- the user needs to construct a persistent workspace of meaningful semantic slices and compare them in one shared graph

Stories:

- clone the current view into a new layer
- interactively filter, select, hide, isolate, and refine what a layer contains
- arrange whole layers spatially as grouped regions with invisible parent containers
- show multiple layers at once in the same React Flow workspace
- see direct and derived connections across layers
- inspect why a derived cross-layer edge exists

Success:

- the user can explain how different semantic slices relate to each other
- the workspace becomes a persistent comparative reasoning environment, not just a temporary filter

Primary failure to prevent:

- losing the relationship between slices and the full graph

Important constraints:

- layers are user-defined, not limited to built-in concern categories
- layer creation is interactive-tools first, not query-language first
- layers are persistent workspace state
- indirect visible-to-visible relationships may appear as derived edges
- derived edges must support inspection of the hidden supporting path
- layers are rendered together in the same graph and may move independently as grouped regions

### Family 3: Graph-Native Inspection

Problem:

- the user needs to understand how a visible thing connects and what hidden context surrounds it without reading source text

Stories:

- select a node and inspect its immediate neighborhood
- select a direct edge and inspect its local relationship context
- encounter hidden connected context and get a meaningful summary plus reveal path
- inspect a derived edge and reveal the hidden path that justifies it

Success:

- the user can explain how a selected thing connects locally and what hidden context matters next

Primary failure to prevent:

- the graph shows objects without enough relational meaning to interpret them confidently

Important constraints:

- inspection is local-first, not transitive-first
- hidden context should summarize and allow reveal
- derived-edge inspection must reveal the supporting path

### Family 4: Safe Graph-Native Editing

Problem:

- the user edits from a graph-only interface, often from a partial custom layer, and the system must never silently apply an ambiguous source mutation

Stories:

- edit the meaning of an existing visible node
- validate that edit against the complete hidden graph and source context
- apply the change if it is unambiguous
- if not safe, explain the ambiguity in graph terms
- connect visible things and validate that relationship against hidden context

Success:

- the user can make local high-value edits from the graph and trust that safe edits round-trip correctly
- unsafe edits are blocked with graph-native explanation rather than opaque failure

Primary failure to prevent:

- ambiguous silent writes

Important constraints:

- first anchor edit type is editing existing node meaning
- second anchor edit type is connecting visible things
- validation failure should explain ambiguity in graph terms

### Family 5: Trust Under Change

Problem:

- the underlying source may change outside the session, and the user must understand graph-level change before they can trust the workspace again

Stories:

- external source change becomes visible in the graph
- inspect change through graph-native diff layers such as old, new, and changed-only
- understand why trust was interrupted if current state or pending edits are stale
- conflict resolution comes after change explanation, not before

Success:

- the user can understand what changed in graph terms and why the current workspace state may no longer be trustworthy

Primary failure to prevent:

- silent drift between graph and source

Important constraints:

- graph diff is explanatory first
- diff may use layer-based comparison views
- trust interruption must be explained before resolution is demanded

### Cross-Family Product Truths

- the graph represents a complete underlying semantic graph
- every user-created layer is a slice of that same complete graph
- hidden context must remain legible as hidden-but-present context
- derived edges are allowed, but they must be distinguishable and inspectable
- the graph must be trustworthy as a primary surface, not just as a visualization
