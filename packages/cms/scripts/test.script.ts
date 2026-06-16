// /**
//  * Rebuild Published Cache Test Script
//  *
//  * publishedVersion 기준으로 publish cache를 재생성합니다.
//  *
//  * Usage:
//  *   DATABASE_URL=postgresql://... tsx scripts/test.script.ts
//  */
//
// import { initDatabase } from "@spfn/core/db";
// import { rebuildPublishedCache } from "../src/server/services/sync.service";
//
// async function main()
// {
//     process.env.DATABASE_URL = '';
//
//     console.log('🔗 Connecting to database...\n');
//
//     try {
//         await initDatabase();
//         await rebuildPublishedCache();
//         console.log('✅ Done!');
//         process.exit(0);
//     } catch (error) {
//         console.error('❌ Error:', error);
//         process.exit(1);
//     }
// }
//
// main();
