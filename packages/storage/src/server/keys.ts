/**
 * 범용 키 헬퍼 — provider 무관 순수 함수.
 * 도메인 키(avatar/본문이미지/og 등)는 앱이 prefix를 정해 randomKey로 만든다.
 */

import { randomUUID } from 'node:crypto';

export function sanitize(segment: string): string
{
    return segment.replace(/\.\./g, '').replace(/[/\\]/g, '').trim();
}

/** `<prefix>/<uuid>.<ext>`. prefix는 `public/...`이면 공개 객체로 취급된다. */
export function randomKey(prefix: string, ext: string): string
{
    const clean = prefix.replace(/^\/+|\/+$/g, '');

    return `${clean}/${randomUUID()}.${sanitize(ext)}`;
}

/** `public/` 프리픽스 = 서명 없이 공개 가능. */
export function isPublicKey(key: string): boolean
{
    return key.startsWith('public/');
}

/** 공개/CDN URL에서 객체 key 역추출 (GCS `storage.googleapis.com/<bucket>/<key>` 포함). */
export function extractKeyFromUrl(url: string): string | null
{
    try
    {
        const u = new URL(url);
        const path = u.pathname.replace(/^\/+/, '');
        if (u.hostname === 'storage.googleapis.com')
        {
            const slash = path.indexOf('/');

            return slash >= 0 ? path.slice(slash + 1) : null;
        }

        return path;
    }
    catch
    {
        return null;
    }
}
