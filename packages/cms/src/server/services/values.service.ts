/**
 * CMS Label Values Service
 *
 * 라벨 값 관리 비즈니스 로직을 담당하는 서비스 레이어
 */

import { LabelNotFoundError } from '@spfn/cms/errors';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '../repositories';

/**
 * 라벨 존재 확인 (없으면 에러)
 */
async function ensureLabelExists(labelId: number): Promise<void>
{
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new LabelNotFoundError({ labelId });
    }
}

/**
 * 라벨 값 저장 (upsert)
 */
export async function saveLabelValues(
    labelId: number,
    data: {
        version: number | null;
        values: Array<{
            locale: string;
            breakpoint?: string | null;
            value: any;
        }>;
    }
): Promise<{
    saved: number;
    version: number | null;
}>
{
    const { version, values } = data;

    // 라벨 존재 확인
    await ensureLabelExists(labelId);

    // 값 저장
    const savedValues = await cmsLabelValuesRepository.upsertMany(
        values.map((v) => ({
            labelId,
            version,
            locale: v.locale,
            breakpoint: v.breakpoint ?? null,
            value: v.value,
        }))
    );

    return {
        saved: savedValues.length,
        version,
    };
}

/**
 * 특정 버전의 값 조회
 */
export async function getLabelValuesByVersion(
    labelId: number,
    version: number,
    filters?: {
        locale?: string;
        breakpoint?: string;
    }
): Promise<{
    labelId: number;
    version: number;
    values: Array<{
        id: number;
        locale: string;
        breakpoint: string | null;
        value: any;
        createdAt: string;
    }>;
}>
{
    // 라벨 존재 확인
    await ensureLabelExists(labelId);

    // 값 조회
    const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(
        labelId,
        version,
        {
            locale: filters?.locale,
            breakpoint: filters?.breakpoint === 'null' ? null : filters?.breakpoint,
        }
    );

    return {
        labelId,
        version,
        values: values.map((v) => ({
            id: v.id,
            locale: v.locale,
            breakpoint: v.breakpoint,
            value: v.value,
            createdAt: v.createdAt.toISOString(),
        })),
    };
}