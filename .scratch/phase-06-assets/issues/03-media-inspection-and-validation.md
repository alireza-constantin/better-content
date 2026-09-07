# 03: Validate managed media through Sharp and ffprobe

**What to build:** Let the worker identify and normalize supported image,
video, and audio media from actual bytes so unsupported or unsafe media can
never become READY.

**Blocked by:** 01 — Establish the Asset domain, persistence, and
ContentDocumentV3 foundation.

**Status:** ready-for-agent

## Scope

- Define the provider-neutral `MediaInspector` result/error contract.
- Implement Sharp inspection for JPEG, PNG, and static WebP.
- Implement pinned ffprobe inspection for MP4/H.264 with optional AAC, MP3 Layer
  III, MP4/M4A AAC, and PCM WAV.
- Enforce exact byte, dimension, pixel, duration, container, codec, animation,
  media-type, and upload-extension rules.
- Return stable normalized metadata/failure categories and implement bounded
  safe temporary-file/process behavior.
- Add small sanitized media fixtures at/below/above important boundaries.

## Architecture and documentation references

- Phase 6 specification ``5, 9, 12, 21, 23–25 and acceptance criteria 1, 2,
  18–22, 36, 38–40.
- ADR-019 inspection/READY promotion and deployment decisions.
- AGENTS dependency, validation, security, logging, testing, and error-handling
  rules.

## Expected behavior

- IMAGE accepts only JPEG, PNG, or static WebP up to 10 MiB, width/height at most
  12,000, and at most 60,000,000 display-oriented pixels.
- VIDEO accepts only MP4 with H.264/AVC and optional AAC up to 500 MiB,
  display-oriented dimension at most 3,840, at most 8,294,400 pixels, and
  duration at most 1,800,000 ms.
- AUDIO accepts only MP3 Layer III, MP4/M4A AAC, or PCM WAV up to 100 MiB and
  duration at most 3,600,000 ms.
- All measurements are positive/finite. Duration milliseconds are the ceiling
  of authoritative seconds multiplied by 1,000. Rotation/EXIF is applied before
  display-dimension validation.
- Browser MIME, extension, and remote Content-Type remain hints. Browser MIME
  disagreement alone does not reject upload media; detected bytes must match
  declared media type and the supported upload extension.
- Unlisted/corrupt/animated/mismatched/out-of-bound media maps to the approved
  stable terminal failure categories and never yields READY metadata.
- Missing inspector runtime, timeout, crash, or invalid inspector output maps
  safely to transient infrastructure failure without exposing raw output.

## Implementation constraints and invariants

- Sharp is the direct image dependency. ffprobe is an exact
  deployment-pinned executable; use ffprobe only, never transcoding/conversion.
- Invoke ffprobe without a shell, with fixed arguments, bounded output, process
  timeout, strict JSON validation, and remote protocols disabled.
- Creator names, URLs, source hosts, and storage keys never become command-line
  arguments, executable names, or filesystem paths. Temporary files use
  application-generated paths.
- Enforce the byte ceiling while copying into the temp file. Keep no more than
  one full media file on disk per heavy job and remove it on success, failure,
  timeout, and cancellation.
- Persist/return normalized metadata only. Raw Sharp/ffprobe output, stderr,
  temp paths, and media contents never enter logs or creator-facing failures.
- Apply Sharp pixel/resource limits before decode-intensive work and document
  the pinned runtime/security-update expectation.

## Explicit non-goals

- Transcoding, format conversion, optimization, compression, thumbnails,
  poster frames, waveforms, alternate renditions, media editing, antivirus,
  moderation, steganography detection, or rights verification.
- Remote URL retrieval, object promotion, READY transition, previews, or UI.
- Checksums, duplicate detection, ETags as integrity identity, or new supported
  formats/codecs.

## Acceptance criteria

- [ ] MediaInspector returns the approved normalized metadata for every
      supported fixture and rejects every unsupported container/codec or corrupt
      fixture through a stable safe failure category.
- [ ] Exact byte, dimension, pixel, duration, rotation/EXIF, animation, media
      type, and upload-extension boundaries are enforced.
- [ ] A mismatched browser MIME alone is not a failure, while detected
      media-type/extension mismatch is terminal.
- [ ] ffprobe execution uses no shell or remote protocol and enforces fixed
      arguments, timeout, and bounded validated output.
- [ ] Sharp inspection applies resource/pixel limits and rejects animated WebP.
- [ ] Temporary media is streamed with byte ceilings, never creator-named, and
      removed after every success/failure path.
- [ ] Raw tool output and private media metadata do not escape through persisted
      values, application errors, or structured logs.

## Focused tests

- **Unit/domain:** allowlist, boundary arithmetic, duration rounding,
  extension/media compatibility, normalized metadata, and stable error mapping.
- **Inspector adapter contract:** sanitized fixtures for supported formats,
  representative unsupported/corrupt media, rotation, animation, codecs, and
  process timeout/invalid output.
- **Security-focused process tests:** prove fixed executable/arguments, no shell,
  bounded output, temp cleanup, and no remote protocol.
- **E2E:** none.
