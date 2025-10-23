/**
 * CMS Labels Repository
 *
 * 라벨 메타데이터 관리를 위한 Repository
 */

import { findOne, findMany as findManyHelper, create as createHelper, updateOne, deleteOne, count as countHelper } from '@spfn/core/db';
import { desc, eq, and } from 'drizzle-orm';
import { cmsLabels, type CmsLabel, type NewCmsLabel } from '../entities';

/**
 * 라벨 목록 조회 (페이지네이션)
 */
export async function findMany(options?: {
    section?: string;
    limit?: number;
    offset?: number;
}): Promise<CmsLabel[]>
{
    const { section, limit = 20, offset = 0 } = options || {};

    return findManyHelper(cmsLabels, {
        where: section ? { section } : undefined,
        orderBy: desc(cmsLabels.updatedAt),
        limit,
        offset
    });
}

/**
 * 전체 라벨 수 조회
 */
export async function count(section?: string): Promise<number>
{
    return countHelper(cmsLabels, section ? { section } : undefined);
}

/**
 * ID로 라벨 조회
 */
export async function findById(id: number): Promise<CmsLabel | null>
{
    return findOne(cmsLabels, { id });
}

/**
 * Key로 라벨 조회
 */
export async function findByKey(key: string): Promise<CmsLabel | null>
{
    return findOne(cmsLabels, { key });
}

/**
 * 섹션으로 모든 라벨 조회
 */
export async function findBySection(section: string): Promise<CmsLabel[]>
{
    return findManyHelper(cmsLabels, {
        where: { section },
        orderBy: desc(cmsLabels.updatedAt),
    });
}

/**
 * 라벨 생성
 */
export async function create(data: NewCmsLabel): Promise<CmsLabel>
{
    return createHelper(cmsLabels, data);
}

/**
 * 라벨 수정
 */
export async function updateById(id: number, data: Partial<NewCmsLabel>): Promise<CmsLabel | null>
{
    return updateOne(cmsLabels, { id }, { ...data, updatedAt: new Date() });
}

/**
 * 라벨 삭제
 */
export async function deleteById(id: number): Promise<CmsLabel | null>
{
    return deleteOne(cmsLabels, { id });
}

// Legacy export for backward compatibility
export const cmsLabelsRepository = {
    findMany,
    count,
    findById,
    findByKey,
    findBySection,
    create,
    updateById,
    deleteById
};