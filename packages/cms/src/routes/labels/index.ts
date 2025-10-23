/**
 * CMS Labels Routes
 *
 * 라벨 메타데이터 관리 API
 * - GET /cms/labels - 라벨 목록 조회
 * - POST /cms/labels - 새 라벨 생성
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository } from '../../repositories';
import { getLabelsContract, createLabelContract } from './contract.js';

const app = createApp();

/**
 * GET /cms/labels
 * 라벨 목록 조회 (페이지네이션, 섹션 필터)
 */
app.bind(getLabelsContract, async (c) =>
{
    const { section, limit = 20, offset = 0 } = c.query;

    // 라벨 목록 조회
    const labels = await cmsLabelsRepository.findMany({
        section,
        limit,
        offset,
    });

    // 전체 개수 조회
    const total = await cmsLabelsRepository.count(section);

    return c.json({
        labels: labels.map((label) => ({
            id: label.id,
            key: label.key,
            section: label.section,
            type: label.type,
            publishedVersion: label.publishedVersion,
            createdBy: label.createdBy,
            createdAt: label.createdAt.toISOString(),
            updatedAt: label.updatedAt.toISOString(),
        })),
        total,
        limit,
        offset,
    });
});

/**
 * POST /cms/labels
 * 새 라벨 생성
 */
app.bind(createLabelContract, [Transactional()], async (c) =>
{
    const body = await c.data();

    // 중복 key 체크
    const existing = await cmsLabelsRepository.findByKey(body.key);
    if (existing)
    {
        return c.json(
            { error: 'Label with this key already exists', key: body.key },
            409
        );
    }

    // 라벨 생성
    const label = await cmsLabelsRepository.create({
        key: body.key,
        section: body.section,
        type: body.type,
        createdBy: body.createdBy,
    });

    return c.json(
        {
            id: label.id,
            key: label.key,
            section: label.section,
            type: label.type,
            publishedVersion: label.publishedVersion,
            createdBy: label.createdBy,
            createdAt: label.createdAt.toISOString(),
            updatedAt: label.updatedAt.toISOString(),
        },
        201
    );
});

export default app;
