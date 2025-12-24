'use client';

/**
 * CMS Label Manager Component
 *
 * Table view for managing labels by section
 */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cmsApi } from '@/lib/labels';

interface Label
{
    id: number;
    key: string;
    defaultValue: Record<string, string>;
    draft: Record<string, string> | null;
    published: Record<string, string> | null;
    hasDraft: boolean;
}

interface SectionData
{
    section: string;
    locales: string[];
    labels: Label[];
}

interface Props
{
    locales: string[];
    defaultLocale: string;
}

const SECTIONS = ['home', 'about', 'common'];

export function CmsLabelManager({ locales, defaultLocale }: Props)
{
    const [selectedSection, setSelectedSection] = useState(SECTIONS[0]);
    const [sectionData, setSectionData] = useState<SectionData | null>(null);
    const [editedValues, setEditedValues] = useState<Record<number, Record<string, string>>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    // Fetch section labels
    const fetchLabels = useCallback(async () =>
    {
        setIsLoading(true);
        setError(null);

        try
        {
            const data = await cmsApi.getSectionLabels.call({
                params: { section: selectedSection },
                query: { locales: locales.join(',') },
            });
            setSectionData(data as SectionData);
            setEditedValues({});
        }
        catch (err)
        {
            console.error('Failed to fetch labels:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch labels');
        }
        finally
        {
            setIsLoading(false);
        }
    }, [selectedSection, locales]);

    useEffect(() =>
    {
        fetchLabels();
    }, [fetchLabels]);

    // Handle input change
    const handleValueChange = (labelId: number, locale: string, value: string) =>
    {
        setEditedValues(prev => ({
            ...prev,
            [labelId]: {
                ...prev[labelId],
                [locale]: value,
            },
        }));
    };

    // Get display value for a cell
    const getDisplayValue = (label: Label, locale: string): string =>
    {
        // Priority: edited > draft > published > default
        if (editedValues[label.id]?.[locale] !== undefined)
        {
            return editedValues[label.id][locale];
        }
        if (label.draft?.[locale])
        {
            return label.draft[locale];
        }
        if (label.published?.[locale])
        {
            return label.published[locale];
        }
        return label.defaultValue[locale] || '';
    };

    // Check if a cell has been edited
    const isEdited = (labelId: number, locale: string): boolean =>
    {
        return editedValues[labelId]?.[locale] !== undefined;
    };

    // Save draft
    const handleSaveDraft = async () =>
    {
        if (Object.keys(editedValues).length === 0)
        {
            setMessage('No changes to save');
            return;
        }

        setIsSaving(true);
        setError(null);
        setMessage(null);

        try
        {
            const labels = Object.entries(editedValues).map(([id, values]) => ({
                id: parseInt(id),
                values,
            }));

            await cmsApi.saveSectionDraft.call({
                params: { section: selectedSection },
                body: { labels },
            });

            setMessage('Draft saved successfully');
            await fetchLabels();
        }
        catch (err)
        {
            console.error('Failed to save draft:', err);
            setError(err instanceof Error ? err.message : 'Failed to save draft');
        }
        finally
        {
            setIsSaving(false);
        }
    };

    // Publish section
    const handlePublish = async () =>
    {
        setIsPublishing(true);
        setError(null);
        setMessage(null);

        try
        {
            const result = await cmsApi.publishSection.call({
                params: { section: selectedSection },
                body: { locales },
            }) as { published: number; labels: string[] };

            setMessage(`Published ${result.published} labels: ${result.labels.join(', ')}`);
            await fetchLabels();
        }
        catch (err)
        {
            console.error('Failed to publish:', err);
            setError(err instanceof Error ? err.message : 'Failed to publish');
        }
        finally
        {
            setIsPublishing(false);
        }
    };

    // Reset draft
    const handleResetDraft = async () =>
    {
        if (!confirm('Are you sure you want to reset all drafts in this section?'))
        {
            return;
        }

        setError(null);
        setMessage(null);

        try
        {
            await cmsApi.resetSectionDraft.call({
                params: { section: selectedSection },
            });

            setMessage('Drafts reset successfully');
            await fetchLabels();
        }
        catch (err)
        {
            console.error('Failed to reset drafts:', err);
            setError(err instanceof Error ? err.message : 'Failed to reset drafts');
        }
    };

    const hasChanges = Object.keys(editedValues).length > 0;
    const hasDrafts = sectionData?.labels.some(l => l.hasDraft) || false;

    return (
        <div className="space-y-6">
            {/* Section Selector */}
            <div className="flex items-center gap-4">
                <label className="font-medium">Section:</label>
                <select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    className="border rounded-md px-3 py-2 bg-white dark:bg-zinc-900"
                    disabled={isLoading}
                >
                    {SECTIONS.map(section => (
                        <option key={section} value={section}>
                            {section}
                        </option>
                    ))}
                </select>

                <div className="flex-1" />

                <Button
                    onClick={handleSaveDraft}
                    disabled={!hasChanges || isSaving}
                    variant="outline"
                >
                    {isSaving ? 'Saving...' : 'Save Draft'}
                </Button>

                <Button
                    onClick={handlePublish}
                    disabled={isPublishing || (!hasChanges && !hasDrafts)}
                >
                    {isPublishing ? 'Publishing...' : 'Publish'}
                </Button>

                <Button
                    onClick={handleResetDraft}
                    disabled={!hasDrafts}
                    variant="outline"
                >
                    Reset Drafts
                </Button>
            </div>

            {/* Messages */}
            {error && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {message && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-green-700 dark:text-green-300">{message}</p>
                </div>
            )}

            {/* Labels Table */}
            {isLoading ? (
                <div className="text-center py-8 text-zinc-500">Loading...</div>
            ) : sectionData?.labels.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">No labels in this section</div>
            ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                                    <th className="text-left px-4 py-3 font-medium text-sm">Key</th>
                                    {locales.map(locale => (
                                        <th key={locale} className="text-left px-4 py-3 font-medium text-sm">
                                            {locale.toUpperCase()}
                                        </th>
                                    ))}
                                    <th className="text-center px-4 py-3 font-medium text-sm w-20">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sectionData?.labels.map((label) => (
                                    <tr
                                        key={label.id}
                                        className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                                    >
                                        <td className="px-4 py-3 font-mono text-sm text-zinc-600 dark:text-zinc-400">
                                            {label.key}
                                        </td>
                                        {locales.map(locale => (
                                            <td key={locale} className="px-4 py-3">
                                                <Input
                                                    value={getDisplayValue(label, locale)}
                                                    onChange={(e) => handleValueChange(label.id, locale, e.target.value)}
                                                    className={`text-sm ${
                                                        isEdited(label.id, locale)
                                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                                                            : label.draft?.[locale]
                                                                ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950'
                                                                : ''
                                                    }`}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-center">
                                            {Object.keys(editedValues[label.id] || {}).length > 0 ? (
                                                <span className="inline-block w-3 h-3 rounded-full bg-blue-500" title="Edited" />
                                            ) : label.hasDraft ? (
                                                <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" title="Draft" />
                                            ) : label.published ? (
                                                <span className="inline-block w-3 h-3 rounded-full bg-green-500" title="Published" />
                                            ) : (
                                                <span className="inline-block w-3 h-3 rounded-full bg-zinc-300" title="Default" />
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-6 text-sm text-zinc-500">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-blue-500" />
                    <span>Edited</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" />
                    <span>Draft</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
                    <span>Published</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-zinc-300" />
                    <span>Default</span>
                </div>
            </div>
        </div>
    );
}
