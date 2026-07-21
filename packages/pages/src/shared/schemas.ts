import { Type } from '@sinclair/typebox';
import { PAGE_LAYOUTS } from './types';

export const NavItemSchema = Type.Object({
    label: Type.String({ minLength: 1 }),
    path: Type.String({ minLength: 1 }),
});

export const MountSchema = Type.Object({
    source: Type.String({ minLength: 1 }),
    route: Type.String({ pattern: '^/' }),
    title: Type.Optional(Type.String({ minLength: 1 })),
});

export const SiteConfigSchema = Type.Object({
    name: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    root: Type.Optional(Type.String({ minLength: 1 })),
    url: Type.Optional(Type.String({ pattern: '^https?://' })),
    repo: Type.Optional(Type.String({ pattern: '^https?://' })),
    locale: Type.Optional(Type.String({ minLength: 2 })),
    nav: Type.Optional(Type.Array(NavItemSchema)),
    social: Type.Optional(Type.Record(Type.String(), Type.String())),
    mounts: Type.Optional(Type.Array(MountSchema)),
});

export const FrontmatterSchema = Type.Object({
    title: Type.String({ minLength: 1 }),
    description: Type.Optional(Type.String()),
    layout: Type.Optional(Type.Union(PAGE_LAYOUTS.map(layout => Type.Literal(layout)))),
    date: Type.Optional(Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' })),
    draft: Type.Optional(Type.Boolean()),
    og: Type.Optional(Type.String()),
});
