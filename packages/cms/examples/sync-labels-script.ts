/**
 * Manual Label Sync Script
 *
 * 수동으로 라벨을 동기화하는 스크립트
 *
 * 사용법:
 * 1. 이 파일을 `scripts/sync-labels.ts`로 복사
 * 2. 실행: `tsx scripts/sync-labels.ts`
 */

import { syncAll } from '@spfn/cms';

async function main()
{
    console.log('🔄 Starting label synchronization...\n');

    try
    {
        const results = await syncAll({
            verbose: true,
            updateExisting: false,  // 기존 라벨 업데이트 안함
            removeUnused: false,    // 사용되지 않는 라벨 삭제 안함
            dryRun: false,          // 실제로 적용 (true로 설정하면 미리보기)
        });

        // 통계 계산
        const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
        const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
        const totalUnchanged = results.reduce((sum, r) => sum + r.unchanged, 0);
        const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

        console.log('\n✅ Label synchronization completed!\n');
        console.log('Summary:');
        console.log(`  Sections:  ${results.length}`);
        console.log(`  Created:   ${totalCreated}`);
        console.log(`  Updated:   ${totalUpdated}`);
        console.log(`  Unchanged: ${totalUnchanged}`);
        console.log(`  Deleted:   ${totalDeleted}`);

        if (totalErrors > 0)
        {
            console.log(`  Errors:    ${totalErrors}\n`);
            console.error('\nErrors:');
            results.forEach((result) =>
            {
                result.errors.forEach((error) =>
                {
                    console.error(`  [${result.section}] ${error.key}: ${error.error}`);
                });
            });
            process.exit(1);
        }
    }
    catch (error)
    {
        console.error('\n❌ Label synchronization failed:', error);
        process.exit(1);
    }
}

main();