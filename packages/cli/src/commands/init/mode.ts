import prompts from 'prompts';

export const SCAFFOLD_MODES = ['bare', 'full'] as const;

export type ScaffoldMode = typeof SCAFFOLD_MODES[number];

export interface ModeSelectionOptions
{
    mode?: ScaffoldMode;
    yes?: boolean;
}

/**
 * Resolve the scaffold profile shared by `spfn create` and `spfn init`.
 *
 * Interactive runs recommend the Prototype-to-Production `full` profile.
 * Non-interactive runs without an explicit mode retain the historical core-only
 * scaffold, so existing `--yes` automation does not silently gain services or
 * required environment variables.
 */
export async function selectScaffoldMode(options: ModeSelectionOptions): Promise<ScaffoldMode>
{
    if (options.mode)
    {
        return options.mode;
    }

    if (options.yes)
    {
        return 'bare';
    }

    const { selectedMode } = await prompts({
        type: 'select',
        name: 'selectedMode',
        message: 'Which SPFN scaffold do you want?',
        choices: [
            {
                title: 'full (recommended)',
                description: 'Core, auth, i18n, and ops CLI — ready for Prototype to Production',
                value: 'full',
            },
            {
                title: 'bare',
                description: 'Core-only full-stack skeleton',
                value: 'bare',
            },
        ],
        initial: 0,
    });

    if (!selectedMode)
    {
        process.exit(0);
    }

    return selectedMode as ScaffoldMode;
}
