---
name: js-performance-patterns
description: Provides framework-agnostic JavaScript runtime performance patterns. Use when optimizing hot paths, loops, DOM operations, caching, or data structure choices — in NestJS/Node.js application code and other performance-critical JavaScript.
paths:
  - "**/*.js"
  - "**/*.ts"
license: MIT
metadata:
  author: patterns.dev
  version: "1.1"
related_skills:
  - "singleton-pattern"
harness:
  tier: shared
  family: language
  gist: "Hot-path runtime performance — 12 patterns (index + topics)"
---

# JavaScript Performance Patterns

Index skill for runtime performance micro-patterns in JavaScript hot paths. These patterns matter most in tight loops, frequent callbacks (scroll, resize, animation frames), and data-heavy operations. They apply to any JavaScript environment — Node.js server code, scripts, or browser-side code. In this harness they apply primarily to NestJS/Node.js application code. Each pattern group has its own file in [topics/](topics/) with full explanations and avoid/prefer examples.

Read this SKILL.md to identify which topic applies; then read the specific topic file for the depth.

## When to Use

Reference these patterns when:
- Profiling reveals a hot function or tight loop
- Processing large datasets (1,000+ items)
- Handling high-frequency events (scroll, mousemove, resize)
- Optimizing build-time or server-side scripts
- Reviewing code for performance in critical paths

## When NOT to use

Don't optimize before you have evidence of a problem. Premature optimization adds complexity that costs more than the performance it gains. **No measurement → no optimization.** If you can't show a profile / benchmark / SLA violation, the right answer is "not yet".

## The 5-step optimization workflow

Apply these in order. Skipping a step usually means optimizing the wrong thing.

```
1. MEASURE   → Establish a baseline with real data. Profile, benchmark, or capture timing.
2. IDENTIFY  → Find the actual bottleneck. Don't guess from intuition; let the profile point.
3. FIX       → Address the specific bottleneck. One change at a time so attribution is clean.
4. VERIFY    → Re-measure. Confirm the fix moved the metric you targeted.
5. GUARD     → Add a benchmark, regression test, or monitor that will catch a future regression.
```

**Common failure modes**: skipping MEASURE ("I think this loop is slow") → optimizing the wrong code; skipping VERIFY ("the change should be faster") → no evidence the fix landed; skipping GUARD → the optimization erodes silently the next time someone refactors nearby code.

## Where to start measuring (decision tree)

Use the symptom to pick the first measurement target. The branches split by environment — server symptoms point at the server/data layer; browser-side symptoms point at the render/network layer.

```
What is slow?
├── Node.js server code (primary)
│   ├── Single API endpoint              → measure DB query time + service-method timing (`console.time`)
│   │   ├── DB query slow?               → check the explained query, indexes, N+1 patterns
│   │   ├── Service method slow?         → profile CPU; look for synchronous heavy work, regex backtracking
│   │   └── Waterfall of awaited calls?  → check `async-error-handling` § Promise composition (parallelize where safe)
│   ├── All endpoints slow               → check connection pool size, GC pauses, memory pressure (heap snapshots)
│   ├── Intermittent slowness            → check lock contention, GC pauses, downstream timeouts
│   └── Background job / queue consumer  → measure per-message timing; look for unbounded fetches, retry storms
├── Browser-side code
│   ├── Slow initial load                → measure bundle size + critical-path requests
│   ├── Janky scroll / animation / input → profile with the browser performance panel; throttle/debounce, `requestAnimationFrame`
│   ├── Slow re-renders / sluggish UI    → check wasted renders and memoization
│   └── Slow data fetch / waterfall      → check request waterfalls and caching
├── Hot in-process loop / data-heavy     → apply the patterns in topics/ (Set/Map lookups, batched updates, caching)
└── Shared / type-heavy library code     → measure where the code actually runs (server or browser), then branch above
```

## Topics (index)

| Situation | Depth |
|---|---|
| Repeated lookups against a collection (`includes`/`find` in loops), dynamic-key objects (caches, counters, registries), immutable array operations (`toSorted`/`toReversed`/`toSpliced`) — patterns 1, 12, 9 | [topics/data-structures.md](topics/data-structures.md) |
| Tight loops and hot functions: caching property access, combining `.filter().map().reduce()` into a single pass, length-check short-circuits, early returns, hoisting RegExp/constants out of loops — patterns 3, 5, 6, 7, 8 | [topics/loops-and-control-flow.md](topics/loops-and-control-flow.md) |
| Browser-side code only: layout thrashing from interleaved DOM reads/writes, jank from visual updates outside the render cycle (`requestAnimationFrame`) — patterns 2, 10 | [topics/dom-and-rendering.md](topics/dom-and-rendering.md) |
| Recomputing pure-function results (memoization, Map caches, LRU/`WeakMap`), deep copies (`structuredClone` vs `JSON.parse(JSON.stringify())`) — patterns 4, 11 | [topics/caching-and-cloning.md](topics/caching-and-cloning.md) |

## Cross-cutting rules

- Apply these patterns only in **measured hot paths** — code that runs frequently or processes large datasets. Don't apply them to cold code paths where readability is more important than nanosecond gains.
- Micro-optimizations are **not** a substitute for algorithmic improvements. Address the algorithm first (O(n^2) to O(n), removing waterfalls, reducing DOM mutations). Once the algorithm is right, these patterns squeeze additional performance from hot paths.

## Source

Patterns from [patterns.dev](https://www.patterns.dev/) — JavaScript performance guidance for the broader web engineering community.
