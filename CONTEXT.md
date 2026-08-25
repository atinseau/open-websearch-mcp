# Open WebSearch

Open WebSearch gives local agents a shared, evidence-oriented search capability
over the public Web without embedding a reasoning model in the search runtime.

## Language

**Investigation**:
An isolated, persistent search journey whose returned pages are remembered.
_Avoid_: Session, thread, conversation

**Candidate**:
A public destination that may contain evidence relevant to an investigation but
has not yet been accepted as a result.
_Avoid_: Hit, answer

**Explored page**:
A candidate whose content has been retrieved or evaluated internally. Exploration
does not make the page unavailable to the agent.
_Avoid_: Consumed page, visited result

**Consumed page**:
A page reserved for and emitted in an investigation result. It cannot be emitted
again in that investigation.
_Avoid_: Explored page, cached page

**Evidence passage**:
A bounded, source-located portion of extractable content returned to support an
agent's investigation.
_Avoid_: Summary, answer, chunk

**Discovery**:
The acquisition of candidate URLs from Google front-end pages and the local
cache.
_Avoid_: Crawling, rendering

**Renderer**:
The local capability that loads a destination, executes its JavaScript, and
exposes its rendered document for extraction.
_Avoid_: Fetcher, search engine

**Teacher run**:
A versioned, observable WebSearch run performed by a target agent to establish a
high-quality reference.
_Avoid_: Ground truth, oracle

**Teacher fixture**:
A sanitized, versioned test case derived from teacher runs and graded without a
reasoning model.
_Avoid_: Live evaluation, golden URL list

**Conformity score**:
A deterministic benchmark score measuring how well a result satisfies a teacher
fixture's evidence contract.
_Avoid_: Runtime relevance, truth score

**Runtime relevance**:
An algorithmic estimate used to order candidates for an arbitrary live query.
_Avoid_: Conformity score, correctness

**Workspace**:
The private local state rooted at `~/.open-websearch-mcp` for configuration,
cache, investigations, installed renderer versions, benchmarks, and logs.
_Avoid_: Repository, project directory

