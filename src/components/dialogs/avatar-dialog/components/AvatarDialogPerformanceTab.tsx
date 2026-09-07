import type { TFunction } from 'i18next';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
    AvatarStatsRecord,
    FileAnalysisRecord,
    PlatformFileAnalysis
} from '@/domain/entities/world';
import { cn } from '@/lib/utils';
import { openExternalLink } from '@/services/entityMediaService';
import {
    assessPerformanceStat,
    performanceDocsUrl,
    performanceRankClass,
    performanceRankFillClass,
    type PerformancePlatform
} from '@/shared/utils/avatarPerformanceLimits';
import { Spinner } from '@/ui/shadcn/spinner';
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/ui/shadcn/tabs';

import { EntityDialogTabContent } from '../../EntityDialogScaffold';
import type { AvatarPlatformInfo } from '../avatarDialogTypes';

const EMPTY_VALUE = '—';
const STAT_GRID_CLASS =
    'grid grid-cols-1 @2xl/performance:grid-cols-2 @max-2xl/performance:[&>div:nth-child(even)]:bg-muted/30 @2xl/performance:[&>div:nth-child(4n+3)]:bg-muted/30 @2xl/performance:[&>div:nth-child(4n+4)]:bg-muted/30 @2xl/performance:[&>div:last-child:nth-child(odd)]:col-span-2';

type PerformanceStat = {
    key: keyof AvatarStatsRecord;
    label: string;
    format?: 'boolean' | 'bounds';
    unit?: string;
};

type PerformanceStatGroup = {
    label: string;
    stats: PerformanceStat[];
};

const TRIANGLE_STAT: PerformanceStat = {
    key: 'totalPolygons',
    label: 'triangles'
};

const PERFORMANCE_STAT_GROUPS: PerformanceStatGroup[] = [
    {
        label: 'geometry',
        stats: [
            { key: 'bounds', label: 'bounds', format: 'bounds', unit: 'm' },
            { key: 'skinnedMeshCount', label: 'skinned_meshes' },
            { key: 'meshCount', label: 'basic_meshes' },
            { key: 'materialSlotsUsed', label: 'material_slots' },
            { key: 'boneCount', label: 'bones' },
            { key: 'totalVertices', label: 'vertices' },
            { key: 'blendShapeCount', label: 'blend_shapes' }
        ]
    },
    {
        label: 'dynamics',
        stats: [
            { key: 'physBoneComponentCount', label: 'physbone_components' },
            { key: 'physBoneTransformCount', label: 'affected_transforms' },
            { key: 'physBoneColliderCount', label: 'physbone_colliders' },
            {
                key: 'physBoneCollisionCheckCount',
                label: 'collision_checks'
            },
            { key: 'contactCount', label: 'contacts' },
            { key: 'constraintCount', label: 'constraints' },
            { key: 'constraintDepth', label: 'constraint_depth' }
        ]
    },
    {
        label: 'components',
        stats: [
            { key: 'animatorCount', label: 'animators' },
            { key: 'particleSystemCount', label: 'particle_systems' },
            { key: 'totalMaxParticles', label: 'max_particles' },
            {
                key: 'meshParticleMaxPolygons',
                label: 'mesh_particle_triangles'
            },
            { key: 'lightCount', label: 'lights' },
            { key: 'audioSourceCount', label: 'audio_sources' },
            { key: 'raycastCount', label: 'raycasts' },
            { key: 'clothCount', label: 'cloths' },
            { key: 'totalClothVertices', label: 'cloth_vertices' },
            { key: 'trailRendererCount', label: 'trail_renderers' },
            { key: 'lineRendererCount', label: 'line_renderers' },
            { key: 'physicsColliders', label: 'physics_colliders' },
            { key: 'physicsRigidbodies', label: 'rigidbodies' },
            {
                key: 'particleTrailsEnabled',
                label: 'particle_trails',
                format: 'boolean'
            },
            {
                key: 'particleCollisionEnabled',
                label: 'particle_collision',
                format: 'boolean'
            }
        ]
    }
];

function formatBounds(value: unknown, locale: string): string {
    if (!Array.isArray(value) || value.length === 0) {
        return EMPTY_VALUE;
    }
    const formatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 2
    });
    const bounds = value.filter(
        (entry): entry is number => typeof entry === 'number'
    );
    return bounds.length
        ? bounds.map((entry) => formatter.format(entry)).join('×')
        : EMPTY_VALUE;
}

function formatStatValue(
    value: unknown,
    format: PerformanceStat['format'],
    locale: string,
    t: TFunction
): string {
    if (format === 'boolean' && typeof value === 'boolean') {
        return value
            ? t('dialog.avatar.performance.yes')
            : t('dialog.avatar.performance.no');
    }
    if (format === 'bounds') {
        return formatBounds(value, locale);
    }
    return typeof value === 'number'
        ? new Intl.NumberFormat(locale).format(value)
        : EMPTY_VALUE;
}

function PerformanceFact({
    label,
    value,
    limit,
    unit,
    rank,
    ratio,
    note
}: {
    label: string;
    value: string;
    limit?: string;
    unit?: string;
    rank?: string;
    ratio?: number;
    note?: string;
}) {
    const { t } = useTranslation();
    const rankLabel = rank
        ? t(`dialog.avatar.performance.ranks.${rank}`, { defaultValue: rank })
        : undefined;
    const rankClass = performanceRankClass(rank);
    const detail =
        note ??
        (rank === 'Poor' || rank === 'VeryPoor' ? rankLabel : undefined);
    const measured = value || EMPTY_VALUE;
    const suffix = unit && measured !== EMPTY_VALUE ? ` ${unit}` : '';
    return (
        <div className="min-w-0 px-3 py-2">
            <span className="text-muted-foreground block text-xs">{label}</span>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span
                    title={note || rankLabel}
                    className={cn(
                        'min-w-0 text-sm font-semibold break-words tabular-nums',
                        rankClass
                    )}
                >
                    {limit
                        ? `${measured}/${limit}${suffix}`
                        : `${measured}${suffix}`}
                </span>
                {detail ? (
                    <span className={cn('text-xs', rankClass)}>{detail}</span>
                ) : null}
            </div>
            {ratio ? (
                <div className="bg-border mt-1.5 h-0.5 w-20 overflow-hidden rounded-full">
                    <div
                        className={cn(
                            'h-full rounded-full',
                            performanceRankFillClass(rank)
                        )}
                        style={{ width: `${Math.min(100, ratio * 100)}%` }}
                    />
                </div>
            ) : null}
        </div>
    );
}

function PerformanceMetric({
    stat,
    stats,
    locale,
    targetPlatform,
    t
}: {
    stat: PerformanceStat;
    stats: AvatarStatsRecord;
    locale: string;
    targetPlatform: PerformancePlatform;
    t: TFunction;
}) {
    const assessment = assessPerformanceStat(
        stat.key,
        stats[stat.key],
        targetPlatform
    );
    return (
        <PerformanceFact
            label={t(`dialog.avatar.performance.stat.${stat.label}`)}
            value={formatStatValue(stats[stat.key], stat.format, locale, t)}
            limit={
                stat.format === 'boolean' || assessment.maximum === undefined
                    ? undefined
                    : formatStatValue(
                          assessment.maximum,
                          stat.format,
                          locale,
                          t
                      )
            }
            unit={stat.unit}
            rank={assessment.rank}
            ratio={assessment.ratio}
            note={
                assessment.removed
                    ? t('dialog.avatar.performance.mobile_removed')
                    : undefined
            }
        />
    );
}

function PlatformPerformanceSection({
    targetPlatform,
    analysis
}: {
    targetPlatform: PerformancePlatform;
    analysis?: FileAnalysisRecord;
}) {
    const { t, i18n } = useTranslation();
    const stats = analysis?.avatarStats;
    const texture = assessPerformanceStat(
        'totalTextureUsage',
        stats?.totalTextureUsage,
        targetPlatform
    );
    return (
        <section className="@container/performance space-y-4">
            <p className="text-muted-foreground text-xs">
                {t('dialog.avatar.performance.limits_help', {
                    poor: t('dialog.avatar.performance.ranks.Poor')
                })}{' '}
                <a
                    href={performanceDocsUrl(targetPlatform)}
                    className="text-foreground underline underline-offset-2"
                    onClick={(event) => {
                        event.preventDefault();
                        void openExternalLink(
                            performanceDocsUrl(targetPlatform)
                        );
                    }}
                >
                    {t(
                        targetPlatform === 'pc'
                            ? 'dialog.avatar.performance.pc_rules'
                            : 'dialog.avatar.performance.mobile_rules'
                    )}
                </a>
            </p>
            <div className={STAT_GRID_CLASS}>
                <PerformanceFact
                    label={t('dialog.avatar.performance.download_size')}
                    value={analysis?._fileSize || EMPTY_VALUE}
                />
                <PerformanceFact
                    label={t('dialog.avatar.performance.texture_memory')}
                    value={(analysis?._totalTextureUsage || '').replace(
                        / MB$/,
                        ''
                    )}
                    limit={
                        texture.maximum === undefined
                            ? undefined
                            : String(texture.maximum)
                    }
                    unit="MB"
                    rank={texture.rank}
                    ratio={texture.ratio}
                />
                <PerformanceFact
                    label={t('dialog.avatar.performance.uncompressed_size')}
                    value={analysis?._uncompressedSize || EMPTY_VALUE}
                />
                <PerformanceMetric
                    stat={TRIANGLE_STAT}
                    stats={stats ?? {}}
                    locale={i18n.language || 'en'}
                    targetPlatform={targetPlatform}
                    t={t}
                />
            </div>
            {stats ? (
                PERFORMANCE_STAT_GROUPS.map((group) => (
                    <PerformanceGroup
                        key={group.label}
                        group={group}
                        stats={stats}
                        locale={i18n.language || 'en'}
                        targetPlatform={targetPlatform}
                        t={t}
                    />
                ))
            ) : (
                <p className="text-muted-foreground text-sm">
                    {t('dialog.avatar.performance.analysis_unavailable')}
                </p>
            )}
        </section>
    );
}

function PerformanceGroup({
    group,
    stats,
    locale,
    targetPlatform,
    t
}: {
    group: PerformanceStatGroup;
    stats: AvatarStatsRecord;
    locale: string;
    targetPlatform: PerformancePlatform;
    t: TFunction;
}) {
    return (
        <section className="space-y-1.5 pt-2">
            <h4 className="text-muted-foreground px-3 text-xs font-medium">
                {t(`dialog.avatar.performance.group.${group.label}`)}
            </h4>
            <div className={STAT_GRID_CLASS}>
                {group.stats.map((stat) => (
                    <PerformanceMetric
                        key={stat.key}
                        stat={stat}
                        stats={stats}
                        locale={locale}
                        targetPlatform={targetPlatform}
                        t={t}
                    />
                ))}
            </div>
        </section>
    );
}

export function AvatarDialogPerformanceTab({
    platformInfo,
    fileAnalysis,
    loading = false,
    pending = false
}: {
    platformInfo: AvatarPlatformInfo;
    fileAnalysis: PlatformFileAnalysis;
    loading?: boolean;
    pending?: boolean;
}) {
    const { t } = useTranslation();
    const [selectedPlatform, setSelectedPlatform] =
        useState<PerformancePlatform>('pc');
    const contentRef = useRef<HTMLDivElement>(null);
    const platforms: Array<{
        key: PerformancePlatform;
        label: string;
        platform: AvatarPlatformInfo['pc'];
        analysis?: FileAnalysisRecord;
    }> = [
        {
            key: 'pc',
            label: 'PC',
            platform: platformInfo.pc,
            analysis: fileAnalysis.standalonewindows
        },
        {
            key: 'android',
            label: 'Android',
            platform: platformInfo.android,
            analysis: fileAnalysis.android
        },
        {
            key: 'ios',
            label: 'iOS',
            platform: platformInfo.ios,
            analysis: fileAnalysis.ios
        }
    ];
    const availablePlatforms = platforms.filter(
        ({ platform, analysis }) => platform.platform || analysis
    );
    const displayedPlatforms = pending
        ? availablePlatforms.filter(({ analysis }) => Boolean(analysis))
        : availablePlatforms;
    const activePlatform =
        displayedPlatforms.find(({ key }) => key === selectedPlatform) ??
        displayedPlatforms[0];
    const rating =
        activePlatform?.analysis?.performanceRating ||
        activePlatform?.platform.performanceRating ||
        EMPTY_VALUE;

    return (
        <EntityDialogTabContent value="performance">
            {loading ? (
                <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
                    <Spinner />
                    <span>
                        {t('dialog.avatar.performance.analysis_loading')}
                    </span>
                </div>
            ) : (
                <div ref={contentRef} className="space-y-4">
                    {pending ? (
                        <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
                            {t('dialog.avatar.performance.analysis_pending')}
                        </div>
                    ) : null}
                    {activePlatform ? (
                        <Tabs
                            className="gap-4"
                            value={activePlatform.key}
                            onValueChange={(value) => {
                                const next = displayedPlatforms.find(
                                    ({ key }) => key === value
                                );
                                if (next) {
                                    setSelectedPlatform(next.key);
                                    const scrollContainer =
                                        contentRef.current?.parentElement;
                                    if (scrollContainer)
                                        scrollContainer.scrollTop = 0;
                                }
                            }}
                        >
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                {displayedPlatforms.length > 1 ? (
                                    <TabsList>
                                        {displayedPlatforms.map(
                                            ({ key, label }) => (
                                                <TabsTab key={key} value={key}>
                                                    {label}
                                                </TabsTab>
                                            )
                                        )}
                                    </TabsList>
                                ) : null}
                                <div className="flex items-baseline gap-2">
                                    <span className="text-muted-foreground text-xs">
                                        {t('dialog.avatar.performance.rating')}
                                    </span>
                                    <span
                                        className={cn(
                                            'text-xl font-semibold',
                                            performanceRankClass(rating)
                                        )}
                                    >
                                        {t(
                                            `dialog.avatar.performance.ranks.${rating}`,
                                            { defaultValue: rating }
                                        )}
                                    </span>
                                </div>
                            </div>
                            {displayedPlatforms.map(({ key, analysis }) => (
                                <TabsPanel key={key} value={key}>
                                    <PlatformPerformanceSection
                                        targetPlatform={key}
                                        analysis={analysis}
                                    />
                                </TabsPanel>
                            ))}
                        </Tabs>
                    ) : null}
                </div>
            )}
        </EntityDialogTabContent>
    );
}
