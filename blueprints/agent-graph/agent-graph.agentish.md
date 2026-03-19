# Agent Graph

## Contents

- `Purpose`
  - State what Agentish is for.
- `Authority`
  - Define how truth weight and human authority work.
- `Corpus`
  - Define the document as one global semantic graph.
- `Refinement`
  - Define how the graph is iteratively improved.
- `Analysis`
  - Define what graph analysis should judge.
- `Open Questions`
  - Preserve unresolved design questions explicitly.

## Purpose

```ts agentish
const Agentish = define.language("Agentish");

const AgentGraph = define.system("AgentGraph", {
  format: Agentish,
  role: "authoritative system memory for humans and llms",
});

const Implementation = define.system("Implementation", {
  role: "mechanical realization of the agent graph",
});

AgentGraph.enforces(`
- Agentish is the authoritative knowledge graph for the system.
- The document is self-descriptive.
- Implementation must not invent design truth outside the graph.
`);

when(Implementation.needs("a design decision not present in AgentGraph"))
  .then(Implementation.surfaces("a graph gap"))
  .and(AgentGraph.requires("explicit revision"));
```

## Authority

```ts agentish
AgentGraph.assignsAuthority(`
- Direct human-written comments and edits are highest authority.
- Human answers to llm-framed constrained choices are medium authority.
- Llm-originated synthesis or suggestions are lower authority until reinforced.
`);

const ConversationReference = define.section("DesignConversationsReference", {
  purpose: "Provide semantically named references to chat sessions when provenance matters.",
});

when(AgentGraph.references("a design conversation"))
  .then(AgentGraph.prefers("one compact authority annotation"))
  .and(AgentGraph.avoids("verbose inline metadata"));
```

## Corpus

```ts agentish
AgentGraph.uses(`
- One coherent global semantic graph.
- Globally unique named nodes for statement-level references.
- Separate files for human governance and targeted revision.
- A flattened llm-facing view when useful.
`);

when(AgentGraph.isPresentedTo("an llm"))
  .then(AgentGraph.mayFlatten("the canonical files"))
  .and(AgentGraph.separates("sections or files").with("// filename.ts"))
  .and(AgentGraph.avoids("typescript import boilerplate"));
```

## Refinement

```ts agentish
AgentGraph.refinesThrough(`
- Document-graph denoising.
- Diagnostic multi-result comparison.
- Targeted semantic-block rewrite rather than arbitrary text replacement.
`);

when(AgentGraph.detects("a weak semantic region"))
  .then(AgentGraph.generates("multiple candidate rewrites"))
  .and(AgentGraph.compares("their semantic quality"))
  .and(AgentGraph.keeps("the strongest expression that preserves meaning"))
  .and(AgentGraph.promotes("newly discovered truth to the rightful place"));
```

## Analysis

```ts agentish
const Analyzer = define.system("AgentGraphAnalyzer", {
  role: "qualitative and structural graph critic",
});

Analyzer.judges(`
- ownership correctness
- recoverable structure
- semantic locality
- cross-document coherence
- decision closure
- non-ceremonial density
`);

when(Analyzer.finds("single-use ceremony"))
  .then(Analyzer.flags("a weak abstraction"));

when(Analyzer.finds("meaning trapped in strings"))
  .then(Analyzer.flags("low semantic density"));

when(Analyzer.finds("plausible incompatible interpretations"))
  .then(Analyzer.flags("upstream ambiguity"));
```

## Open Questions

- What is the densest single annotation for authority and conversation provenance?
- What should the `design-conversations` bridge document export?
- What is the ideal final section list for a self-descriptive Agentish memory document?
- Which graph-quality checks should be systematic and which should remain LLM-judged?
