/**
 * CMS Labels Service
 *
 * 라벨 관리 비즈니스 로직을 담당하는 서비스 레이어
 */

import { join } from 'path';
import { logger } from '@spfn/core/logger';
import { env } from '@spfn/cms/config';
import { DuplicateLabelError, LabelNotFoundError } from '@spfn/cms/errors';

import { type LabelStatus } from "../routes/labels/schema";
import { CmsLabel, CmsLabelValue } from '../entities';
import { extractLabels } from '../helpers/label.helper';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '../repositories';
import { loadLabelsFromJson, publishLabel as publishLabelService } from '../services';

const labelsLogger = logger.child('@spfn/cms:labels-service');

/**
 * 라벨 존재 확인 (없으면 에러)
 */
async function ensureLabelExists(id: number): Promise<CmsLabel>
{
    const label = await cmsLabelsRepository.findById(id);
    if (!label)
    {
        throw new LabelNotFoundError({ labelId: id });
    }

    return label;
}

/**
 * Draft와 Published 값들을 비교하여 실제 변경이 있는지 확인
 *
 * @param draftValues - Draft 값 목록
 * @param publishedValues - Published 값 목록
 * @returns 변경 사항이 있으면 true, 없으면 false
 */
function compareValues(
    draftValues: CmsLabelValue[],
    publishedValues: CmsLabelValue[]
): boolean
{
    // locale + breakpoint 조합별로 값 매핑
    const draftMap = new Map(
        draftValues.map(v => [
            `${v.locale}:${v.breakpoint || 'default'}`,
            v.value
        ])
    );

    const publishedMap = new Map(
        publishedValues.map(v => [
            `${v.locale}:${v.breakpoint || 'default'}`,
            v.value
        ])
    );

    // 개수가 다르면 변경됨
    if (draftMap.size !== publishedMap.size)
    {
        return true;
    }

    // 각 값 깊은 비교 (JSON 직렬화로 비교)
    for (const [key, draftValue] of draftMap.entries())
    {
        const publishedValue = publishedMap.get(key);

        // Published에 해당 키가 없거나 값이 다르면 변경됨
        if (!publishedValue || JSON.stringify(draftValue) !== JSON.stringify(publishedValue))
        {
            return true;
        }
    }

    // 모든 값이 동일함
    return false;
}

/**
 * 라벨 상태 계산
 *
 * @param label - 라벨 메타데이터
 * @param draftValues - Draft 값 목록
 * @param publishedValues - Published 값 목록
 * @returns 상태 ('default-only' | 'unpublished' | 'published' | 'modified')
 */
function calculateLabelStatus(
    label: CmsLabel,
    draftValues: CmsLabelValue[],
    publishedValues: CmsLabelValue[]
): LabelStatus
{
    const hasDraft = draftValues.length > 0;
    const hasPublished = label.publishedVersion !== null && publishedValues.length > 0;

    if (!hasPublished && !hasDraft)
    {
        return 'default-only';
    }

    if (!hasPublished && hasDraft)
    {
        return 'unpublished';
    }

    if (hasPublished && !hasDraft)
    {
        return 'published';
    }

    // hasPublished && hasDraft
    // Draft와 Published 내용을 실제로 비교하여 변경 여부 확인
    const hasActualChanges = compareValues(draftValues, publishedValues);
    return hasActualChanges ? 'modified' : 'published';
}

/**
 * 기본값 맵 로드
 */
async function loadDefaultValuesMap(section: string): Promise<Record<string, any>>
{
    try
    {
        const labelsDir = join(process.cwd(), env.SPFN_CMS_LABELS_DIR ?? 'src/lib/labels');
        const sections = loadLabelsFromJson(labelsDir);
        const sectionDef = sections.find(s => s.section === section);

        if (!sectionDef)
        {
            return {};
        }

        const extracted = extractLabels(sectionDef);
        return extracted.reduce((acc, label) =>
        {
            acc[label.key] = label.defaultValue;
            return acc;
        }, {} as Record<string, any>);
    }
    catch (error)
    {
        const err = error instanceof Error ? error : new Error(String(error));
        labelsLogger.warn('Failed to load default values', err);
        return {};
    }
}

// ==========================================
// Public Service Functions
// ==========================================

/**
 * 라벨 목록 조회 (기본값 포함 옵션)
 */
export async function getLabelsWithDefaults(options: {
    section?: string;
    includeDefaultValues?: boolean;
}): Promise<{
    labels: Array<CmsLabel & { defaultValue?: any }>;
    total: number;
}>
{
    const { section, includeDefaultValues } = options;

    // 라벨 목록 조회
    const labels = await cmsLabelsRepository.findMany({ section });

    // 전체 개수 조회
    const total = await cmsLabelsRepository.count(section);

    // 기본값 포함이 필요하면 로드
    let defaultValuesMap: Record<string, any> = {};
    if (includeDefaultValues && section)
    {
        defaultValuesMap = await loadDefaultValuesMap(section);
    }

    return {
        labels: labels.map((label) => ({
            ...label,
            ...(includeDefaultValues && { defaultValue: defaultValuesMap[label.key] })
        })),
        total,
    };
}

/**
 * 라벨 생성 (중복 체크 포함)
 */
export async function createLabelWithValidation(data: {
    key: string;
    section: string;
    type: string;
    createdBy?: string;
}): Promise<CmsLabel>
{
    // 중복 key 체크
    const existing = await cmsLabelsRepository.findByKey(data.key);
    if (existing)
    {
        throw new DuplicateLabelError({ labelKey: data.key });
    }

    // 라벨 생성
    return await cmsLabelsRepository.create(data);
}

/**
 * ID로 라벨 조회
 */
export async function getLabelById(id: number): Promise<CmsLabel>
{
    return await ensureLabelExists(id);
}

/**
 * 라벨 메타데이터 수정
 */
export async function updateLabelById(
    id: number,
    data: {
        section?: string;
        type?: string;
    }
): Promise<CmsLabel | null>
{
    // 라벨 존재 확인
    await ensureLabelExists(id);

    // 라벨 수정
    return await cmsLabelsRepository.updateById(id, data);
}

/**
 * 라벨 삭제
 */
export async function deleteLabelById(id: number): Promise<{ id: number }>
{
    // 라벨 존재 확인
    await ensureLabelExists(id);

    // 라벨 삭제
    await cmsLabelsRepository.deleteById(id);

    return { id };
}

/**
 * Key로 라벨 조회
 */
export async function getLabelByKey(key: string): Promise<CmsLabel>
{
    const label = await cmsLabelsRepository.findByKey(key);
    if (!label)
    {
        throw new LabelNotFoundError({ labelKey: key });
    }

    return label;
}

/**
 * 라벨 발행
 */
export async function publishLabelById(
    id: number,
    options?: {
        notes?: string;
        publishedBy?: string;
    }
): Promise<{
    id: number;
    version: number;
    message: string;
}>
{
    // 라벨 존재 확인
    await ensureLabelExists(id);

    // 발행 서비스 호출
    const result = await publishLabelService(id, options);

    return {
        id,
        version: result.version,
        message: result.message,
    };
}

/**
 * Admin용 라벨 상세 데이터 조회 (Draft + Published + Status)
 */
export async function getAdminLabelData(id: number): Promise<{
    label: CmsLabel;
    draft: CmsLabelValue[];
    published: CmsLabelValue[];
    status: LabelStatus;
}>
{
    // 라벨 조회
    const label = await ensureLabelExists(id);

    // Draft 값들 조회
    const draft = await cmsLabelValuesRepository.findDraftsByLabelId(id);

    // Published 값들 조회
    let published: CmsLabelValue[] = [];
    if (label.publishedVersion !== null)
    {
        published = await cmsLabelValuesRepository.findByLabelIdAndVersion(
            id,
            label.publishedVersion
        );
    }

    // Status 계산 (실제 값 비교)
    const status = calculateLabelStatus(label, draft, published);

    return {
        label,
        draft,
        published,
        status,
    };
}

/**
 * 라벨 버전 히스토리 조회
 */
export async function getLabelVersionHistory(id: number): Promise<{
    versions: Array<{
        version: number;
        publishedAt: string;
        publishedBy: null;
        notes: null;
        values: Array<{
            id: number;
            locale: string;
            breakpoint: string | null;
            value: any;
            createdAt: string;
        }>;
    }>;
}>
{
    // 라벨 조회
    const label = await ensureLabelExists(id);

    // 버전 히스토리가 없으면 빈 배열 반환
    if (label.publishedVersion === null)
    {
        return { versions: [] };
    }

    // 버전 히스토리 조회
    const versions = await cmsLabelValuesRepository.findVersionHistoryByLabelId(
        id,
        label.publishedVersion
    );

    return { versions };
}