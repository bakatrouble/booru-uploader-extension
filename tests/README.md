# Tests

## Commands

- `pnpm test` — unit + headless e2e
- `pnpm test:unit` — vitest only (`vitest run`)
- `pnpm test:e2e` — Playwright only (spawns its own web server)

## Unit (`tests/unit`, vitest + jsdom)

- `queue.test.ts` — FIFO `put`/`wait`/`shift` semantics, pending-waiter
  notification, `Wait conflict` on a second concurrent waiter.
- `semaphore.test.ts` — cap enforcement, FIFO wake order across
  same-tick acquirers, idempotent release, invalid limits rejected.
- `attempt.test.ts` — `withRetries` attempt counting, exhaustion and
  backoff schedule; `attemptUpload` per-type posts, terminal server
  errors, retry-then-success with attempt counting, retry cap, missing
  blob short-circuit.
- `hasher.test.ts` — buffer transfer + stale-reply filtering, timeout
  rejection when the worker stays silent.
- `thumbnails.test.ts` — JPEG downscale dimensions, passthrough when
  imaging APIs are missing or the image is already small.
- `photo-intake.test.ts` — base64 with/without prefix, ArrayBuffer MIME
  handling, full blob + thumbnail stored at intake, duplicate
  short-circuit dropping the full blob.
- `task-utils.test.ts` — `buildTaskListMessage` shape; `removeTaskFromLists`
  returns the removed task (any processed status, queued unless
  processing); `trimProcessed` evicts oldest terminal tasks but never
  failed ones; `retryFailedTask` requeues failures with reset retries.
- `uploader.test.ts` — `getKyClient` endpoint scoping (`prefix`); `getHashes`
  caching; `getHash` hit/miss bookkeeping; `handleExternalMessage` routing
  (upload/getUploadLinks/updateContextMenu); port connect/message/disconnect;
  `computeHash` ignoring stale worker responses (pins the fixed id-matching).
- `uploader-upload.test.ts` — `handleMessage` photo paths: full blob +
  thumbnail stored at intake (no object URLs), base64 with/without the
  `data:` prefix (raw defaults to JPEG), `photoArrayBuffer` MIME default,
  duplicate short-circuit; Loading notification sent before the intake
  gate even when saturated.
- `uploader-worker.test.ts` — end-to-end worker pass: upload, hash
  caching, thumbnail-key hygiene (full blob deleted, thumbnail kept),
  badge reset, terminal server errors.
- `subscriptions.test.ts` — `resolveApiKey` fallback; `fetchSubscriptions`
  populating both websites and notifying ports, keeping cached data on
  network failure; add/remove subscription flows with honest
  success/failure responses; no network without a key.
- `context-menu.test.ts` — menu construction (root, per-link, separator,
  settings); callback routing (options page, ArrayBuffer upload
  forwarding, unreachable-tab and render-failure ignores); re-init
  cleanup without stacking click listeners.
- `website.test.ts` — `detectWebsite` hostname mapping: exact hosts and
  subdomains per site, lookalikes fall through to the default.
- `image-encoder.test.ts` — `fitDimensionSum` scaling/caps; worker
  encoding with bitmap transfer, worker error and timeout paths;
  strict-only behavior (no Worker, no canvas fallback) rejecting
  without touching the page.
- `image-getter.test.ts` — `resolveSelectorTarget` plain and `::`-chained
  shadow-DOM resolution; missing-target error paths; `getImageBase64`
  complete/broken/in-flight/error/tainted-canvas paths; ArrayBuffer
  handlers (strict no-legacy menus path, legacy selector path).
- `upload-links.test.ts` — `moveUploadLink` moves and boundary refusals
  (the options-page reorder buttons); `isValidEndpointUrl` accepts
  absolute http(s) URLs and rejects the rest.
- `use-sync-storage.test.ts` — backward-compatible reads (native values
  stored by older versions), JSON round-trips, defaults.
- `amo-auth.test.ts` — AMO JWT carries `iss` with a 300s expiry.
- `notifications.test.ts` — push/update/remove timing (fake timers),
  loading notifications surviving until resolved, runtime message routing.
- `task-list.test.ts` — cell rendering, stored-blob thumbnails for file
  tasks (mocked store) vs direct remote urls, spinner only for
  queued/processing, remove button for idle tasks, retry button and
  `retryTask` event only for failed tasks.
- `task-thumbnail.test.ts` — stored thumbnail rendering, object URL
  revocation on unmount, remote-url passthrough without storage access,
  empty state when nothing is stored.
- `subscription-item.test.ts` — delete hits the website-scoped endpoint
  and invalidates the matching query key; post links point at e621 or
  gelbooru based on the website.
- `uploads-tab.test.ts` — dev-only test-upload button sends a
  `photoBase64` runtime message; remove/retry events forwarded to the
  port; failed-only toggle narrows the processed list.
- `favorites.test.ts` — subscriptions port connects on mount and
  reconnects after a disconnect; unmount disconnects.
- `setup.ts` — stubs the `browser` WebExtension global (storage, menus as
  `contextMenus`, tabs, runtime, browserAction), the WXT
  `defineBackground`/`defineContentScript` globals, and resets the DOM
  between tests.

## E2E (`tests/e2e`, Playwright + headless Chromium)

- `harness/` — a minimal Vite app mounting the real `TaskList` and
  `Notifications` components with stubbed ports and icons (works offline).
  `harness.css` points Tailwind's scanner at `entrypoints/` + `components/`
  so the component utilities are generated.
- `specs/tasks.spec.ts` — task cells render with statuses; remove click
  forwards `removeTask` with the task id (captured via a stub port);
  processing tasks have no remove button; only failed tasks offer retry
  (`retryTask`); the failed-only toggle narrows the processed list.
- `specs/notifications.spec.ts` — a pushed notification renders and
  auto-dismisses; loading notifications persist until resolved.

`playwright.config.ts` serves the harness on port 5200 (5199 is taken by
another project on this machine).
