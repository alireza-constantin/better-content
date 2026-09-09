# Phase 6 Assets deployment readiness

This document is the deployment checklist for the approved Phase 6 worker and
private managed-media contract. It does not select a hosting vendor. A host
that cannot meet this checklist requires architecture review; media work must
not be moved into ordinary HTTP requests or weakened.

## Application and storage configuration

Use one backend per environment. Local development is filesystem-first and
does not need cloud credentials. Production uses the provider-neutral S3
adapter with these server-only variables:

| Variable | Requirement |
| --- | --- |
| `ASSET_STORAGE_DRIVER` | Explicitly `s3` in production; `filesystem` is for local development. |
| `ASSET_STORAGE_ROOT` | Optional filesystem root, outside the public application tree. |
| `ASSET_STORAGE_VERSIONING` | Exactly `disabled`. The managed-media bucket must have object versioning disabled. |
| `ASSET_S3_ENDPOINT` | The S3-compatible HTTPS endpoint. No credentials or signed URL is stored in PostgreSQL. |
| `ASSET_S3_REGION` | Provider region/signing region. |
| `ASSET_S3_BUCKET` | One dedicated private managed-media bucket/namespace for the environment. |
| `ASSET_S3_ACCESS_KEY_ID` | Server-only least-privilege storage credential. |
| `ASSET_S3_SECRET_ACCESS_KEY` | Server-only secret; never expose it as `NEXT_PUBLIC_*`. |
| `ASSET_S3_FORCE_PATH_STYLE` | `true` or `false`, according to the provider contract. |

The bucket must deny anonymous object reads and writes. Its CORS policy must
allow the application origin only, and only the required browser methods and
headers for the exact presigned staging PUT and private signed reads (at
minimum `PUT`, `GET`, `HEAD`, `Content-Type`, and `Content-Length`). Do not use
`*` for origins or credentials. Verify this with the opt-in storage contract
before launch.

Object keys are opaque `staging/<UUID>` and `permanent/<UUID>` values. The
application never creates permanent public URLs, persists signed capabilities,
or puts provider identity into Asset, Content, Version, job, or reference
records.

## Worker capability gate

Run `npm run assets:jobs` as a trusted server-side scheduler invocation or a
supervised process, outside the Next.js request lifecycle. The invocation is
bounded and starts with one heavy media job. A scheduler should invoke it
frequently enough to respect the job lease window; a supervisor may invoke the
same entrypoint repeatedly. The job table remains PostgreSQL-backed.

The runner preflight requires:

- Node.js 24 (the package engine is pinned to `>=24 <25`);
- the direct package-lock-pinned Sharp runtime with JPEG, PNG, and WebP input;
- `FFPROBE_PATH` pointing to the deployment-provided executable;
- `FFPROBE_EXPECTED_VERSION` matching the exact approved, image-pinned build;
- child-process execution for ffprobe with no shell, remote protocol, or
  dynamic binary download;
- outbound HTTPS, PostgreSQL connectivity, and private storage access;
- a writable temporary directory with at least 1 GiB free per heavy job;
- enough execution duration for the approved 500 MiB video and 100 MiB audio
  limits; and
- structured logging and the deployment's alert route.

The preflight performs no media processing, object writes, or provider binary
downloads. Missing or mismatched ffprobe fails closed with a generic startup
error. A `SIGINT`/`SIGTERM` prevents new work and lets the current bounded
attempt finish; PostgreSQL lease expiry remains the crash-recovery backstop.
Temporary files are removed after every attempt.

## Operations

Send structured runner logs to the deployment's standard protected log sink;
retain them according to the environment's incident-response policy and limit
access to operators. Route alerts for repeated provider/inspector failures,
stale or exhausted leases, missing READY objects, unexplained DELETING state,
reference projection drift, and uncertain reconciliation candidates.

Retries are authorized only for retryable failures through the existing
PostgreSQL job path. Do not manually delete an uncertain object. Use the
bounded reconciliation operations after an ownership recheck; object cleanup
is object-first, idempotent, and metadata-last. A missing READY object is an
integrity incident and must be investigated rather than refetched from a
source URL.

## Verification commands

Normal CI remains deterministic and does not need ArvanCloud or arbitrary
remote hosts:

```text
npm run format:check
npm run lint
npm run typecheck
npm run db:check
npm run test
npm run build
```

To run the real S3-compatible contract, configure the generic variables in a
protected environment, set `ASSET_STORAGE_LIVE_CONTRACT=1`, and run the
focused Vitest file. This is an explicit deployment verification item, not a
normal CI dependency. The suite uses generated opaque keys and removes its
objects in a `finally` block; it must be run only against a disposable,
dedicated managed-media namespace.

```text
ASSET_STORAGE_LIVE_CONTRACT=1 npm exec vitest run src/modules/assets/infrastructure/s3-compatible-asset-storage.live.test.ts
```

The live contract must be recorded as `LIVE_PROVIDER_EXECUTED` only when it
actually ran against the configured private provider. Otherwise record
`LIVE_PROVIDER_NOT_EXECUTED` and complete the remaining deterministic checks;
absence of credentials is not a fabricated provider pass.
