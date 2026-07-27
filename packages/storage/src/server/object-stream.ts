/**
 * 스트리밍 다운로드 공통 헬퍼.
 *
 * fs와 GCS의 read stream은 객체 부재를 promise 거부가 아니라 stream `error` 이벤트로
 * 알린다. 첫 바이트(또는 EOF)까지 기다려 그 오류를 계약 오류로 바꾼 뒤 스트림을 그대로
 * 넘긴다. 본문을 버퍼링하지 않으므로 backpressure는 소비자가 그대로 통제한다.
 */

import type { Readable } from 'node:stream';

export function awaitStreamStart(stream: Readable, toContractError: (error: unknown) => unknown): Promise<Readable>
{
    return new Promise((resolve, reject) =>
    {
        const detach = (): void =>
        {
            stream.off('readable', onStart);
            stream.off('end', onStart);
            stream.off('error', onFailure);
        };
        const onStart = (): void =>
        {
            detach();
            resolve(stream);
        };
        const onFailure = (error: unknown): void =>
        {
            detach();
            stream.destroy();
            reject(toContractError(error));
        };
        // 빈 객체도 `end` 직전에 `readable`이 한 번 뜨므로 두 이벤트 모두 시작 신호로 본다.
        stream.once('readable', onStart);
        stream.once('end', onStart);
        stream.once('error', onFailure);
    });
}
