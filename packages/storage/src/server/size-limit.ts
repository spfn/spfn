/**
 * presigned 업로드 크기 제한 파라미터(maxBytes / contentLength) 공통 검증·변환.
 */

export function assertSizeLimits(maxBytes?: number, contentLength?: number): void
{
    if (maxBytes !== undefined && (!Number.isInteger(maxBytes) || maxBytes <= 0))
    {
        throw new Error(`maxBytes must be a positive integer: ${maxBytes}`);
    }
    if (contentLength !== undefined && (!Number.isInteger(contentLength) || contentLength <= 0))
    {
        throw new Error(`contentLength must be a positive integer: ${contentLength}`);
    }
    if (maxBytes !== undefined && contentLength !== undefined && contentLength > maxBytes)
    {
        throw new Error(`contentLength (${contentLength}) exceeds maxBytes (${maxBytes})`);
    }
}

/** GCS `x-goog-content-length-range` 헤더 값. 제한이 없으면 null. */
export function gcsContentLengthRange(maxBytes?: number, contentLength?: number): string | null
{
    if (contentLength !== undefined)
    {
        return `${contentLength},${contentLength}`;
    }
    if (maxBytes !== undefined)
    {
        return `0,${maxBytes}`;
    }

    return null;
}
