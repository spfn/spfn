# @spfn/storage

Provider-agnostic object storage for S3-compatible services, Google Cloud Storage,
and the local filesystem. The package exposes presigned upload, direct upload and
download, streaming download, server-side copy, prefix listing and cleanup, public
URL, finalization, and object deletion APIs without owning a database.

## Installation

```bash
pnpm add @spfn/storage
```

## Server-side object operations

Generation and staging pipelines need to move objects around without pulling bytes
through the application. Four operations cover that, and every bundled provider
implements all four:

```ts
import { getStorageService, StorageObjectNotFoundError } from '@spfn/storage/server';

const storage = await getStorageService();

// Promote a chosen candidate to its confirmed key. The source is left in place.
await storage.copy('gen/req-1/2.png', 'house-assets/house-id/asset-id.png');

// Serve a large private object without buffering it in memory.
const stream = await storage.getStream('house-assets/house-id/asset-id.png');

// Enumerate one page at a time.
const { objects, cursor } = await storage.list('gen/req-1', { maxKeys: 100 });

// Clean up the whole generation request.
const { deleted, failed } = await storage.deletePrefix('gen/req-1');
```

### Prefixes match on the path boundary

`list(prefix)` and `deletePrefix(prefix)` match `<prefix>/` — never a raw string
prefix. `deletePrefix('gen/req-1')` therefore cannot touch `gen/req-10/...`, which is
the failure mode a naive string-prefix sweep produces. Two consequences worth knowing:

- An object stored at *exactly* `gen/req-1` is **not** covered. Remove that with
  `delete('gen/req-1')`.
- An empty prefix is rejected, as are `/`, `//`, `.`, and `..`. There is no way to
  spell "the whole bucket", so a missing variable cannot erase everything.

Paginate by following `cursor` until it is `undefined` — **not** until `objects` is
empty. The cursor is an opaque provider value (an S3 continuation token, a GCS page
token, the last key on local); do not persist or parse it.

`deletePrefix` is not atomic. It lists and deletes page by page, holding only one
page in memory, so a very large prefix will not exhaust the heap — but objects
uploaded under the prefix while the sweep runs may survive. Repeat until `deleted`
is `0` if you need a hard guarantee. Partial failures are reported rather than
thrown; check `failed` and retry those keys.

### Streaming download

`getStream(key)` resolves once the object is confirmed to exist and the first bytes
(or EOF) are available, so a missing object rejects instead of failing halfway
through a response. The body is never buffered, so backpressure stays with the
consumer. **The caller owns the stream**: consume it or call `destroy()`, otherwise a
file descriptor or HTTP connection stays open. `download(key)` still returns a
`Buffer` and is unchanged apart from its error type.

### Provider notes

- **S3, R2, MinIO, Wasabi:** `CopyObject` with a per-segment URL-encoded
  `CopySource` — the SDK does not encode it, and keys containing `?`, `#`, `+`, or a
  space fail with `NoSuchKey` otherwise. `deletePrefix` deletes **key by key** rather
  than with `DeleteObjects`, because the GCS interoperability endpoint does not
  support batch deletion and the two would otherwise diverge.
- **GCS:** server-side rewrite for `copy`, which crosses buckets correctly when the
  `public/` rule puts source and destination in different ones. Unfinalized temp
  objects live under `tmp/<key>` and are **not** covered by `deletePrefix(prefix)`;
  the `tmp/` lifecycle rule removes those.
- **Local:** a filesystem cannot hold a file and a directory under the same name, so
  `a/b` and `a/b/c.png` cannot both exist — object stores allow both. Keep keys
  non-overlapping if you plan to switch providers. `deletePrefix` may leave empty
  directories behind; they are invisible to `list`, which reports files only.
  Symlinks are neither listed nor followed, so a link cannot escape the storage root.

## Key validation

Every object operation — `upload`, `download`, `getStream`, `copy`, `delete`,
`list`, `deletePrefix` — validates its key before it reaches the provider and throws
`StorageKeyError` on a bad one. Rejected: empty strings, URLs, a leading `/`,
backslashes, control characters, `.` or `..` segments, empty segments (`a//b`,
`a/b/`), and anything over 1,024 UTF-8 bytes.

Everything else is allowed. Segment counts, character whitelists, and naming schemes
are application policy, not storage policy — use `randomKey()` or your own convention
on top. `assertObjectKey` and `assertKeyPrefix` are exported if you want to validate
before writing a key to your database.

The presigned URL methods (`getUploadUrl`, `getPublicUploadUrl`, `getDownloadUrl`,
`getPublicUrl`) and `finalizeObject` do not validate keys today.

## Missing objects

`download`, `getStream`, and `copy` (on a missing source) all reject with
`StorageObjectNotFoundError` on every provider, so one check covers all three:

```ts
catch (error)
{
    if (error instanceof StorageObjectNotFoundError)
    {
        return notFound();
    }
    throw error;
}
```

The error carries the offending `key` and sets `code = 'ENOENT'`, so Node-style
`error.code === 'ENOENT'` checks work uniformly across S3, GCS, and local.

`delete` is the deliberate exception: it stays idempotent and treats a missing key as
success. A failed `copy` does not create the destination.

## Presigned upload size limits

Server-side checks of a client-declared file size do not bind the upload itself —
a client can declare 1 byte and PUT gigabytes to the presigned URL. To enforce size
at the storage layer, pass a limit when presigning:

```ts
const { uploadUrl, requiredHeaders } = await storage.getUploadUrl({
    key: 'private/attachments/id.webp',
    contentType: 'image/webp',
    maxBytes: 10 * 1024 * 1024,   // upper bound
    // or contentLength: exactSize — exact size, strictest
});
```

When `requiredHeaders` is returned, the client must send those headers verbatim on
the PUT request; the signature is invalid (or the provider rejects the upload) without
them. Enforcement by provider:

- **GCS:** both `maxBytes` (`x-goog-content-length-range: 0,max`) and `contentLength`
  (exact range) are signed. Uploads outside the range are rejected with HTTP 400.
- **S3, R2, MinIO, Wasabi:** presigned PUT cannot sign a size *range*, so `maxBytes`
  is **not enforceable and is ignored**. `contentLength` is signed (`Content-Length`
  becomes a signed header) and a mismatched size fails the signature check. If you
  only know an upper bound and must enforce it on S3, use a presigned POST policy
  (not provided by this package) or verify size after upload.
- **Local:** presigned upload is not supported at all (`getUploadUrl` throws).

`getPublicUploadUrl` behaves the same and additionally always returns its signed
`cache-control` (and S3 `x-amz-tagging`) in `requiredHeaders`.

## Temp uploads and orphan cleanup

`getUploadUrl({ temp: true })` marks the upload as unconfirmed so that objects whose
owning flow never completes (the client uploads but the confirming API call never
arrives) do not accumulate forever. `finalizeObject(key)` confirms the upload.

- **S3, R2, MinIO, Wasabi:** the object is tagged `lifecycle=temp`; `finalizeObject`
  removes the tag. Configure a bucket lifecycle rule that expires objects with that
  tag after e.g. 1 day. Temp objects are readable at their final key before
  finalization.
- **GCS:** the presigned URL targets `tmp/<key>`; `finalizeObject` moves it to the
  final key (server-side rewrite). **The object is not readable at its final key
  until finalized.** Configure a lifecycle rule on *both* buckets (public and
  private): `matchesPrefix: ["tmp/"]`, `age: 1` → Delete.
- **Local:** presigned upload is not supported.

`finalizeObject` is idempotent — finalizing an already-finalized key succeeds. If
neither the temp nor the final object exists (the client never finished the PUT),
it rejects so the caller can surface the failed upload.

`getPublicUploadUrl` has no orphan protection on GCS today: the upload lands directly
on the final key. On S3 it is always tagged `lifecycle=temp` and must be finalized.

## Deleting objects

Deletion accepts an object key, never an arbitrary URL:

```ts
import { getStorageService } from '@spfn/storage/server';

const storage = await getStorageService();

await storage.delete('public/question-cards/card-id.webp');
```

`delete(key)` is idempotent. Deleting a key that does not exist succeeds. Other
provider errors are not suppressed; the promise rejects so callers can retry or
leave the item in a deletion outbox.

All bundled providers also implement optional batch deletion:

```ts
const result = await storage.deleteMany?.(keys);

for (const failure of result?.failed ?? [])
{
    await scheduleRetry(failure.key, failure.error);
}
```

`deleteMany()` returns per-key partial results. GCS and Local execute idempotent
single-key deletions and collect failures. S3-compatible storage uses `DeleteObjects`
in batches of at most 1,000 keys. If an entire S3 batch request fails, every key in
that batch appears in `failed`; the batch method does not throw after work may have
partially completed. An empty input returns empty `deleted` and `failed` arrays.

Do not log object contents, signed URLs, or storage credentials when processing a
failure. Treat returned error text as operational data with the same log-scrubbing
policy used for provider exceptions.

## Provider behavior

- **GCS:** `file.delete({ ignoreNotFound: true })`. Public keys (`public/*`) use the
  public bucket and all other keys use the private bucket.
- **S3, R2, MinIO, Wasabi:** `DeleteObject` for one key and `DeleteObjects` for a
  batch. S3 delete markers make missing-key deletion idempotent. `deletePrefix` is
  the exception and never batches — see the provider notes above.
- **Local:** `unlink` below `LOCAL_STORAGE_DIR`. Lexical traversal, absolute paths,
  and parent-directory symlinks escaping the storage root are rejected. Missing
  files and missing parent directories succeed.

## The provider contract suite

One suite defines what every provider must do; `src/__tests__/provider.contract.ts`
holds the cases and each provider registers them. The local provider runs it on every
`pnpm test` with no environment gate, so the required coverage cannot silently
disappear.

Real backends are opt-in. Set every variable for a provider and the same suite runs
against it; set only some and the suite **fails** rather than skipping quietly, so a
typo cannot hide a whole backend:

```bash
# S3-compatible (MinIO shown; the same variables cover R2, AWS S3, and GCS interop)
docker run -d -p 9000:9000 -e MINIO_ROOT_USER=... -e MINIO_ROOT_PASSWORD=... \
    minio/minio server /data

STORAGE_CONTRACT_S3_ENDPOINT=http://127.0.0.1:9000 \
STORAGE_CONTRACT_S3_BUCKET=spfn-storage-contract \
STORAGE_CONTRACT_S3_ACCESS_KEY_ID=... \
STORAGE_CONTRACT_S3_SECRET_ACCESS_KEY=... \
pnpm test

# GCS (credentials fall back to ADC when the base64 variable is unset)
STORAGE_CONTRACT_GCS_PRIVATE_BUCKET=... STORAGE_CONTRACT_GCS_PUBLIC_BUCKET=... pnpm test
```

These tests write and delete real objects under `spfn-storage-contract/<uuid>/`.
Point them at a throwaway bucket, never a production one. Cleanup is best-effort; a
lifecycle rule on that prefix is the reliable backstop.

## CDN and versioning caveats

Deleting an origin object does not purge already cached public responses. A CDN or
browser may continue serving the object until its cache TTL expires unless the
application separately issues a CDN purge. Prefer immutable, content-addressed keys
for public assets and account for cache retention in privacy deletion procedures.

With S3 Versioning enabled, these APIs delete the current view by creating a delete
marker; older versions remain until lifecycle rules or a separate version-aware
purge removes them. With GCS Object Versioning enabled, deleting the live generation
makes it noncurrent; archived generations remain. These APIs intentionally do not
enumerate or permanently delete every version. Configure provider lifecycle policies
or implement an audited version-purge workflow when permanent erasure of all versions
is required.

## Consistency with database deletion

Database and object storage changes cannot share one transaction. A retryable flow is:

1. Record the rows and storage keys to delete, preferably in a `pending_deletion`
   state or deletion outbox.
2. Delete storage objects.
3. Delete or mark complete only the database records whose object deletion succeeded.
4. Retry failures. Repeated execution is safe because deletion is idempotent.

This ordering also works as compensation when an upload succeeds but the related
database write fails.
