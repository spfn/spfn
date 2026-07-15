# @spfn/storage

Provider-agnostic object storage for S3-compatible services, Google Cloud Storage,
and the local filesystem. The package exposes presigned upload, direct upload and
download, public URL, finalization, and object deletion APIs without owning a database.

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
  batch. S3 delete markers make missing-key deletion idempotent.
- **Local:** `unlink` below `LOCAL_STORAGE_DIR`. Lexical traversal, absolute paths,
  and parent-directory symlinks escaping the storage root are rejected. Missing
  files and missing parent directories succeed.

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
