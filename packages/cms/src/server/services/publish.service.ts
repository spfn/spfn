/**
 * CMS Publish Helpers
 *
 * Draft → Published 워크플로우 헬퍼 함수
 */

import { env } from "@spfn/cms/config";
import { cmsLabelsRepository, cmsLabelValuesRepository, cmsPublishedCacheRepository } from "../repositories";

/**
 * 라벨 발행 (Draft → Published)
 *
 * @param labelId - 발행할 라벨 ID
 * @param options - 발행 옵션
 * @returns 발행 결과 (version, message)
 */
export async function publishLabel(
    labelId: number,
    options?: {
        notes?: string;
        publishedBy?: string;
    }
): Promise<{ version: number; message: string }>
{
    // 1. 라벨 조회
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new Error(`Label with id ${labelId} not found`);
    }

    // 2. Draft 값들 조회 (version = null)
    const drafts = await cmsLabelValuesRepository.findDraftsByLabelId(labelId);
    if (drafts.length === 0)
    {
        throw new Error(`No draft values found for label ${labelId}`);
    }

    // 3. 다음 버전 번호 계산
    const nextVersion = (label.publishedVersion ?? 0) + 1;

    // 4. Draft를 Published로 복사 (INSERT)
    for (const draft of drafts)
    {
        await cmsLabelValuesRepository.upsert({
            labelId: draft.labelId,
            version: nextVersion,
            locale: draft.locale,
            breakpoint: draft.breakpoint,
            value: draft.value
        });
    }

    // 5. publishedVersion 업데이트
    await cmsLabelsRepository.updateById(labelId, {
        publishedVersion: nextVersion
    });

    // 6. Published Cache 갱신
    await updatePublishedCache(label.section, options?.publishedBy);

    return {
        version: nextVersion,
        message: `Label published as version ${nextVersion}`
    };
}

/**
 * Published Cache 갱신
 *
 * 섹션의 모든 라벨을 조회하여 캐시 업데이트
 *
 * @param section - 섹션 이름 (예: home, why-futureplay)
 * @param publishedBy - 발행자 ID (optional)
 */
export async function updatePublishedCache(
    section: string,
    publishedBy?: string
): Promise<void>
{
    // 섹션의 모든 라벨 조회
    const labels = await cmsLabelsRepository.findBySection(section);

    const locales = env.SPFN_CMS_LOCALES;

    // 각 로케일별로 캐시 생성
    for (const locale of locales)
    {
        const content: Record<string, any> = {};

        for (const label of labels)
        {
            // 발행된 버전이 있으면 해당 값 사용
            if (label.publishedVersion !== null)
            {
                // 발행된 값 조회
                const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                    label.id,
                    label.publishedVersion,
                    { locale }
                );

                if (values.length > 0)
                {
                    // 발행된 값 사용 (breakpoint별로 여러 값이 있을 수 있음)
                    // 단순화: 첫 번째 값만 사용 (breakpoint 로직은 추후 개선)
                    content[label.key] = values[0].value;
                    continue;
                }
            }

            // Fallback: DB의 defaultValue 사용 (발행되지 않았거나 published 값이 없는 경우)
            if (label.defaultValue)
            {
                try
                {
                    const parsed = JSON.parse(label.defaultValue);

                    // 멀티링구얼 객체인지 확인
                    if (typeof parsed === 'object' && !Array.isArray(parsed))
                    {
                        // 멀티링구얼 구조: { ko: "...", en: "..." }
                        if (parsed[locale])
                        {
                            content[label.key] = parsed[locale];
                        }
                    }
                    else
                    {
                        // JSON이지만 멀티링구얼이 아님 (배열 등) - 모든 locale에 동일하게 할당
                        content[label.key] = parsed;
                    }
                }
                catch
                {
                    // JSON 파싱 실패 = 평문 문자열
                    // 평문은 모든 locale에 동일하게 할당
                    content[label.key] = label.defaultValue;
                }
            }
        }

        // Published Cache에 저장 (upsert)
        await cmsPublishedCacheRepository.upsert({
            section,
            locale,
            content,
            publishedAt: new Date(),
            publishedBy: publishedBy || 'system'
        });
    }
}