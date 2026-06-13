# DOM and Rendering

Patterns for code that runs in the browser: batching DOM reads/writes to avoid layout thrashing, and syncing visual updates to the render cycle.

---

## 2. Batch DOM Reads and Writes

**Impact: HIGH** — Prevents layout thrashing.

Interleaving DOM reads (e.g., `offsetHeight`, `getBoundingClientRect`) with DOM writes (e.g., `style.height = ...`) forces the browser to recalculate layout multiple times. Batch all reads first, then all writes. (Browser-only — this applies to code that runs in the browser.)

**Avoid — layout thrashing (read/write/read/write):**

```typescript
elements.forEach(el => {
  const height = el.offsetHeight    // read → forces layout
  el.style.height = `${height * 2}px` // write
})
// Each iteration forces a layout recalculation
```

**Prefer — batched reads then writes:**

```typescript
// Read phase
const heights = elements.map(el => el.offsetHeight)

// Write phase
elements.forEach((el, i) => {
  el.style.height = `${heights[i] * 2}px`
})
```

For complex cases, use `requestAnimationFrame` to defer writes to the next frame, or use a library like [fastdom](https://github.com/wilsonpage/fastdom).

**CSS class approach — single reflow:**

```typescript
// Avoid multiple style mutations
el.style.width = '100px'
el.style.height = '200px'
el.style.margin = '10px'

// Prefer — one reflow
el.classList.add('expanded')
// or
el.style.cssText = 'width:100px;height:200px;margin:10px;'
```

---

## 10. Use `requestAnimationFrame` for Visual Updates

**Impact: MEDIUM** — Syncs with the browser's render cycle.

DOM updates triggered outside the rendering cycle (from timers, event handlers, etc.) can cause jank. Batch visual updates inside `requestAnimationFrame`. (Browser-only — this applies to code that runs in the browser.)

**Avoid — updates outside render cycle:**

```typescript
window.addEventListener('scroll', () => {
  progressBar.style.width = `${getScrollPercent()}%`
  counter.textContent = `${getScrollPercent()}%`
}, { passive: true })
```

**Prefer — synced to render:**

```typescript
let ticking = false

window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      const pct = getScrollPercent()
      progressBar.style.width = `${pct}%`
      counter.textContent = `${pct}%`
      ticking = false
    })
    ticking = true
  }
}, { passive: true })
```
