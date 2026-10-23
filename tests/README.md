# Tests

## Commands

- `pnpm test` — unit + headless e2e
- `pnpm test:unit` — vitest only (`vitest run`)
- `pnpm test:e2e` — Playwright only (spawns its own web server)

## Unit (`tests/unit`, vitest + jsdom)

- `queue.test.ts` — FIFO `put`/`wait`/`shift` semantics, pending-waiter
  notification, `Wait conflict` on a second concurrent waiter.
- `task-utils.test.ts` — `buildTaskListMessage` shape; `removeTaskFromLists`
  keeps `processing` tasks, removes queued/processed ones, ignores unknown
  ids. Mirrors the logic wired into `Uploader.handlePortConnection`.
- `uploader.test.ts` — `getKyClient` endpoint scoping; `getHashes` caching;
  `getHash` hit/miss bookkeeping; `handleExternalMessage` routing
  (upload/getUploadLinks/updateContextMenu); port connect/message/disconnect;
  `computeHash` ignoring stale worker responses (pins the fixed id-matching).
- `subscriptions.test.ts` — `resolveApiKey` fallback; `fetchSubscriptions`
  populating both websites and notifying ports; add/remove subscription
  flows; no network without a key.
- `context-menu.test.ts` — menu construction (root, per-link, separator,
  settings); callback routing (options page, base64 upload forwarding,
  ignores); re-init cleanup.
- `website.test.ts` — `detectWebsite` hostname mapping (pins the current
  substring-match behavior, including lookalikes).
- `image-getter.test.ts` — `resolveSelectorTarget` plain and `::`-chained
  shadow-DOM resolution; missing-target error paths.
- `upload-links.test.ts` — `moveUploadLink` moves and boundary refusals
  (the options-page reorder buttons).
- `use-sync-storage.test.ts` — backward-compatible reads (native values
  stored by older versions), JSON round-trips, defaults.
- `amo-auth.test.ts` — AMO JWT carries `iss` with a 300s expiry.
- `notifications.test.ts` — push/update/remove timing (fake timers),
  loading notifications surviving until resolved, runtime message routing.
- `task-list.test.ts` — cell rendering, thumbnail only for file tasks,
  spinner only for queued/processing, remove-button visibility + event.
- `subscription-item.test.ts` — delete hits the website-scoped endpoint
  and invalidates the matching query key.
- `setup.ts` — stubs the `browser` WebExtension global (storage, menus as
  `contextMenus`, tabs, runtime, browserAction), the WXT
  `defineBackground`/`defineContentScript` globals, and resets the DOM
  between tests.

## E2E (`tests/e2e`, Playwright + headless Chromium)

- `harness/` — a minimal Vite app mounting the real `TaskList` and
  `Notifications` components with stubbed ports and icons (works offline).
  `harness.css` points Tailwind's scanner at `entrypoints/` + `components/`
  so the component utilities are generated.
- `specs/tasks.spec.ts` — task cells render with statuses; remove buttons
  emit `removeTask` with the task id (captured via a stub port);
  processing tasks hide the remove button.
- `specs/notifications.spec.ts` — a pushed notification renders and
  auto-dismisses; loading notifications persist until resolved.

`playwright.config.ts` serves the harness on port 5200 (5199 is taken by
another project on this machine).
