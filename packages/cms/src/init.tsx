/**
 * CMS Store Initializer
 *
 * 서버 컴포넌트에서 로드한 섹션 데이터를 클라이언트 store에 초기화
 */

'use client';

import { useEffect } from 'react';
import { useCmsStore } from './store';
import type { SectionAPI } from './server';

interface InitCmsProps
{
    /**
     * 서버에서 로드한 섹션 데이터
     * { home: { t, data }, ... }
     */
    sections: Record<string, SectionAPI>;
}

/**
 * CMS Store 초기화 컴포넌트
 *
 * 서버 컴포넌트에서 로드한 데이터를  클라이언트 store에 주입
 * 이후 하위 클라이언트 컴포넌트에서 useSection() 사용 가능
 *
 * @param props - InitCmsProps
 * @param props.sections - 서버에서 로드한 섹션 데이터
 *
 * @example
 * // Server Component
 * const home = await getSection('home');
 * <InitCms sections={{ home }} />
 * // 이후 하위 클라이언트 컴포넌트에서 useSection('home') 사용 가능
 */
export function InitCms({ sections }: InitCmsProps)
{
    const setSections = useCmsStore((state) => state.setSections);

    useEffect(() =>
    {
        // SectionAPI → SectionData 변환
        const sectionsData: Record<string, any> = {};
        Object.entries(sections).forEach(([key, { data }]) =>
        {
            sectionsData[key] = data;
        });

        setSections(sectionsData);
    }, [sections, setSections]);

    return null;
}