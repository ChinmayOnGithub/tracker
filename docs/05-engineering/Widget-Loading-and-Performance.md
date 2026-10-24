# Widget Loading, Data Freshness & Performance Rules

These rules apply to Tracker web and mobile (Expo). They define shared behavior and architecture, not a React-only implementation. Web and mobile may use different libraries, but must preserve the same user-facing guarantees.

## 1. Core UX contract

1. **Never block a whole page for independent widget data.** Render the page shell and every widget whose layout is known immediately. Each data-owning widget loads, refreshes, fails, and recovers independently.
2. **Prefer usable cached data.** If valid cached data exists for the current user, scope, and query, render it immediately while revalidating in the background. Do not replace it with a full-widget spinner during ordinary refreshes.
3. **Use a skeleton only when there is no usable data.** Skeletons should match the widget's expected shape and reserve space to prevent layout shifts. Use small inline progress indicators for background refreshes.
4. **Make freshness visible but quiet.** Use a subtle spinner or progress affordance on the widget being refreshed. Avoid global blocking overlays unless the action truly blocks the entire experience.
5. **Keep layout stable.** Refreshing must not cause cards to jump, change height unnecessarily, or move surrounding controls. Keep stale content visible unless it is unsafe or invalid.
6. **Respect navigation.** When switching dates, tabs, filters, or accounts, show cached data for that exact key if available. Never briefly show data from the previous key as if it belonged to the new key.
7. **Keep the UI minimal.** Prefer concise titles and visual status. Do not add redundant explanatory copy such as “Loading your latest data” to every widget. Keep essential labels, accessible names, validation, destructive-action confirmation, and actionable error messages.

## 2. Standard widget state model

Every async data widget must account for these states explicitly:

- **Initial loading:** no usable data; show a shape-matched skeleton or concise placeholder.
- **Ready:** data is available; render normally.
- **Refreshing:** usable data remains visible; show a subtle local progress indicator.
- **Empty:** the request succeeded and the result is genuinely empty; show a concise empty state with a relevant next action where useful.
- **Stale:** cached data is shown while revalidation is pending or has failed; preserve it and provide a non-blocking retry/status affordance when appropriate.
- **Error without data:** show a local error and retry action. Do not blank or crash the entire page.
- **Offline:** use permitted cached data, identify that it may be stale when this matters, and queue only mutations that are explicitly designed to be offline-safe.
- **Mutation pending:** give immediate feedback for the affected item/control only. Roll back optimistic changes on failure and explain the result.
- **Unauthorized / expired session:** do not render protected cached data across users or sessions; follow the authentication flow.

Avoid separate, contradictory booleans such as `isLoading`, `isRefreshing`, `isError`, and `hasData` when they allow impossible combinations. Use a discriminated state or a well-defined query/cache library contract.

## 3. Cache keys, ownership, and correctness

1. A cache key must include every dimension that changes the result: authenticated user/tenant, module, date/range, filters, pagination, sort order, and relevant entity identifiers.
2. Cache only data that is safe to persist in that cache layer. Sensitive Vault data must follow its authentication, authorization, encryption, retention, and logout-clearing rules; do not place decrypted secrets in broad shared or persistent caches.
3. Separate cache policy from presentation. Components should consume a stable query/service contract rather than each inventing their own fetch/cache logic.
4. Define freshness and retention per domain. Calendar provider data, Today summaries, weight history, leave balances, and static preferences have different freshness needs; do not use one global TTL without evidence.
5. Invalidate or update related caches after successful mutations. Prefer targeted invalidation by entity/query key over clearing every cache.
6. Treat the server/database/provider as authoritative. Client caches are a performance layer, not a source of truth.
7. Avoid duplicate requests for the same key. Deduplicate concurrent reads and share results between widgets that truly consume the same resource.
8. Never cache failed responses as successful empty data. Keep error and empty states distinct.

## 4. Race safety and cancellation

1. Cancel obsolete network requests when supported; otherwise ignore their results.
2. Only the latest request for a given key may update that key's visible state. A slow old response must never overwrite a newer response.
3. Keep data keyed by query identity so a late response for yesterday cannot replace today's widget.
4. Use request IDs, generation counters, abort signals, or a query library with equivalent guarantees.
5. Handle component unmount, navigation, logout, and account switching safely. Do not update state after disposal or leak one user's cached data into another session.
6. Use bounded retries with backoff and jitter for transient failures. Do not retry validation errors, permission failures, or mutations blindly.
7. Respect server rate limits and `Retry-After`; avoid a refresh loop caused by re-rendering or effect dependencies.

## 5. Mutations, optimistic UI, and synchronization

1. Optimistic updates are allowed only when the outcome can be predicted and rollback is reliable.
2. Keep mutation state local to the changed item/widget; unrelated widgets remain interactive.
3. Roll back to the latest confirmed snapshot on failure, not a stale snapshot captured before subsequent edits.
4. Prevent duplicate submissions with disabled/guarded actions and idempotency at the API/service layer where appropriate.
5. After a successful mutation, update or invalidate all affected query keys, including summaries/counts that depend on the changed record.
6. Do not make destructive or security-sensitive operations look like harmless background refreshes. Deletions, restores, sync conflicts, and permission changes need explicit and honest feedback.
7. If offline writes are supported, use a durable queue, idempotency, retry policy, conflict handling, and a clear sync status. Never queue an operation merely because the device is offline.

## 6. Performance rules

### Network and data access
- Fetch only the fields and date range required by the widget; paginate large collections.
- Avoid loading every log/record to calculate a small summary. Push aggregation/filtering to indexed database queries or dedicated services when appropriate.
- Batch related reads where it reduces round trips without coupling unrelated widgets into one failure domain.
- Use request deduplication and targeted cache invalidation.
- Avoid polling by default. Prefer event-driven invalidation, focus/reconnect revalidation, or a measured polling interval when real-time behavior is required.
- Apply timeouts, bounded retries, and observable error handling to network/provider requests.

### Rendering and bundle size
- Keep page shells lightweight; lazy-load expensive, below-the-fold, or rarely opened modules when it improves measured startup performance.
- Memoize expensive derived calculations, not every trivial expression. Profile before adding memoization.
- Virtualize long lists and timelines; avoid rendering unbounded histories.
- Keep stable keys and avoid remounting widgets during refresh.
- Reserve image/chart dimensions; load media lazily and avoid large payloads when thumbnails suffice.
- Respect reduced-motion settings and avoid animations that delay interaction.

### Database and server
- Select only needed columns; use indexes that match actual filters/sorts and verify with query plans.
- Avoid N+1 queries and loading unbounded relations.
- Keep authorization on the server for every protected query and mutation; cache keys never replace authorization.
- Use server-side aggregation for dashboard counts and summaries where it reduces repeated client work.
- Measure p50/p95 latency, slow queries, payload sizes, error rates, cache hit rate, and request duplication before and after changes.

### Mobile and battery
- Reuse the same domain query keys, freshness rules, mutation semantics, and error contracts on mobile.
- Use platform-appropriate storage and cache libraries; do not assume browser APIs such as IndexedDB exist on mobile or server.
- Revalidate on foreground/reconnect rather than continuously polling in the background.
- Respect metered networks, low-power constraints, and OS background execution limits.
- Provide stable offline read behavior only where data is safe and a defined sync/conflict policy exists.

## 7. Page composition and failure isolation

- Page layout should render independently of data availability wherever possible.
- Widgets should be isolated by domain and query key; one provider or API failure must not blank unrelated widgets.
- A parent may coordinate shared refresh intent, but should not own a single loading flag for all independent widgets.
- If a widget depends on another result, model the dependency explicitly and keep unrelated widgets loading/rendering independently.
- Keep shared query/service logic outside visual components so web and mobile can reuse the contract.
- Avoid “God components” that issue many unrelated requests, transform large histories, and own every widget's state.

## 8. Accessibility and interaction

- Expose loading status accessibly (for example, `aria-busy` on the updating region and an announced status where necessary), without announcing every tiny background request repeatedly.
- Preserve focus and keyboard position during refreshes.
- Keep controls usable when stale data is safe to act on; disable only controls whose correctness depends on the pending operation.
- Use adequate touch targets and visible focus indicators; the same interaction must work with keyboard, touch, and assistive technology.
- Do not communicate loading or errors by color alone.

## 9. Testing requirements

For each shared query/widget pattern, test:

- Cold load with no cache.
- Warm load with cached data and background refresh.
- Refresh success and refresh failure while stale data remains visible.
- Empty result distinct from error.
- Retry after a recoverable error.
- Out-of-order responses and rapid date/filter changes.
- Duplicate request deduplication and cancellation/unmount.
- Mutation success, optimistic rollback, and dependent-cache invalidation.
- Logout/account switching and sensitive-cache clearing.
- Offline/reconnect behavior where supported.
- Responsive layout, reduced motion, accessibility status, and mobile foreground/reconnect behavior.

Use deterministic clocks and controlled deferred promises for race tests. Avoid tests that depend on live third-party APIs or network availability.

## 10. Implementation sequence

1. Inventory existing data fetching, caches, loading flags, and mutation invalidation; identify duplicated requests and oversized page-level loading boundaries.
2. Define shared query keys, cache ownership, freshness policies, and widget state contracts.
3. Introduce or standardize a reusable widget boundary/loading pattern using the repository's existing libraries rather than adding a second competing cache system.
4. Migrate one representative dashboard widget end-to-end, including tests and instrumentation.
5. Verify race safety, cache invalidation, auth boundaries, and error isolation.
6. Migrate other widgets incrementally; avoid a risky big-bang rewrite.
7. Reuse domain contracts in Expo/mobile with platform-specific storage and lifecycle adapters.
8. Compare real measurements before and after; do not claim performance gains without evidence.

## 11. Definition of done

- The page shell does not disappear for an independent widget refresh.
- Cached data is rendered immediately only when its key and security scope match.
- Loading, refreshing, empty, error, stale, offline, and mutation states are distinct and tested.
- Out-of-order responses cannot overwrite current data.
- Duplicate reads and unnecessary full-cache invalidations are avoided.
- A widget failure does not blank unrelated widgets.
- Sensitive data is not leaked through shared caches.
- Build, typecheck, lint, tests, and relevant web/mobile checks pass; failures are investigated rather than waived.
- Metrics confirm the intended performance improvement.
