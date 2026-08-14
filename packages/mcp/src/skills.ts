/**
 * @spfn/mcp/skills — Skill 타입 + MCP 어댑터 (선택 사용)
 *
 * "Skills for your AI"의 핵심 단위 타입만 제공한다(정본: "타입+어댑터만 제공"). 원본
 * superself `skill.types.ts`의 `SkillContext`는 구체 형태(spaceId·actorId·sandboxLimits)라
 * 이식하지 않고 `Ctx` 제네릭으로 치환한다 — oauth·mcpSessionId 등 프로토콜 필드는
 * `resolveContext(auth, session)` 인자로 이미 전달되므로 앱이 필요하면 Ctx에 담는다.
 *
 * 제외(앱 소관, 정본 확정): registry 데이터·조립, grant 원천(app_installs),
 * coreScopes/appScopes/entryPromptsForScopes, lazy loader(skill_load/skill_call),
 * second-party 프록시, toAgentTools.
 *
 * spfn-capabilities에서 이관했다(2026-08-14). 그 레포의 @spfn/mcp 사본은 정본이
 * 아니었고, 이 모듈만 사본에 있어 사본을 지우기 전에 옮겼다.
 */

import type { McpObjectSchema } from './index';

export interface SkillTool<Ctx>
{
    name: string;
    description: string;
    /** 노출·실행에 필요한 사용자 스코프 — 내부 그룹핑용. 노출 게이트 원천은 `skillScope(skill.id)`. */
    scope: string;
    inputSchema: McpObjectSchema;
    handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

export type SkillKind = 'builtin' | 'thirdparty';
export type SkillTrustTier = 'verified' | 'community';

/**
 * App = 스킬들을 사람용 UI/UX로 묶는 컨테이너 (App ⊃ Skill ⊃ tools의 최상위).
 * isFirstParty는 consent 생략·신뢰등급·게이트 차등의 표식.
 */
export interface AppMeta
{
    id: string;
    label: string;
    description: string;
    isFirstParty: boolean;
    frontendUrl?: string;
    catalogReady?: boolean;
    /** 설치(install/grant) 없이 항상 노출되는 1st-party 기본 앱. 게이트 우회. */
    core?: boolean;
    mcpEnabled?: boolean;
    entryPrompt?: AppEntryPrompt;
}

/**
 * App 진입 프롬프트 — 외부 AI(Claude·ChatGPT)가 이 앱의 인격·운영규율을 입는 시작점.
 * MCP `prompts/get` 반환 형태(messages: user text)와 1:1.
 */
export interface AppEntryPrompt
{
    name: string;
    description: string;
    /** {{var}} 치환 가능 — `../server/prompt-template`의 `renderPrompt`와 짝. */
    content: string;
    arguments?: { name: string; description?: string }[];
}

export interface Skill<Ctx>
{
    id: string;
    appId: string;
    label: string;
    description: string;
    kind: SkillKind;
    trustTier: SkillTrustTier;
    /**
     * default: tools/list에 직접 노출. lazy: skill_load 후 skill_call로만 실행(패키지는
     * lazy loader를 제공하지 않는다 — 앱 소관). internal: 구현은 보존하되 미노출.
     */
    exposure?: 'default' | 'lazy' | 'internal';
    tools: SkillTool<Ctx>[];
}

/** 스킬이 요구하는 스코프 — 스킬 단위 하나(`skill:<id>`). first/second-party 동일 단위. */
export function skillRequiredScopes<Ctx>(skill: Skill<Ctx>): string[]
{
    return [skillScope(skill.id)];
}

/** 스킬 노출 scope의 단일 표기 — first/second-party 공용. */
export function skillScope(skillId: string): string
{
    return `skill:${skillId}`;
}

/** MCP 표면용 평면 도구 뷰 — `toMcpTools()`가 만든다. */
export interface McpToolView<Ctx>
{
    name: string;
    /** 소속 App — 설치(install) 필터·경고 로그용. */
    appId: string;
    description: string;
    inputSchema: McpObjectSchema;
    handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>;
}

/**
 * Skill[] → `McpTool<Ctx>`(패키지 `server`가 받는 형태)와 호환되는 평면 도구 목록.
 * scope 필터는 앱 책임(정본) — 이 어댑터는 변환만 하고 게이트는 걸지 않는다.
 * 원본 registry.toMcpTools의 일반화(BUILTIN_SKILLS 인자 없음 — 앱이 자기 스킬을 넘긴다).
 */
export function toMcpTools<Ctx>(skills: Skill<Ctx>[]): McpToolView<Ctx>[]
{
    return skills.flatMap(skill => skill.tools.map(tool => ({
        name: tool.name,
        appId: skill.appId,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: tool.handler,
    })));
}
