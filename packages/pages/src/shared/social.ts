/**
 * Social link display names. Config keys stay lowercase (`social: { github: … }`);
 * renderers show the proper brand casing via `socialLabel`.
 */
const SOCIAL_LABELS: Record<string, string> = {
    bluesky: 'Bluesky',
    discord: 'Discord',
    facebook: 'Facebook',
    github: 'GitHub',
    gitlab: 'GitLab',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    mastodon: 'Mastodon',
    npm: 'npm',
    rss: 'RSS',
    threads: 'Threads',
    twitch: 'Twitch',
    twitter: 'Twitter',
    x: 'X',
    youtube: 'YouTube',
};

/** Display name for a social config key; unknown keys are capitalized. */
export function socialLabel(key: string): string
{
    return SOCIAL_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}
