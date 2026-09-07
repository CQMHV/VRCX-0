import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import type {
    AvatarStatsRecord,
    FileAnalysisRecord,
    PlatformFileAnalysis
} from '@/domain/entities/world';
import { openExternalLink } from '@/services/entityMediaService';
import {
    assessPerformanceStat,
    performanceDocsUrl,
    performanceRankClass,
    type PerformancePlatform
} from '@/shared/utils/avatarPerformanceLimits';
import { Badge } from '@/ui/shadcn/badge';
import { Spinner } from '@/ui/shadcn/spinner';

import { EntityDialogTabContent } from '../../EntityDialogScaffold';
import type { AvatarPlatformInfo } from '../avatarDialogTypes';

const EMPTY_VALUE = '\u2014';

type PerformanceStat = {
    key: keyof AvatarStatsRecord;
    label: string;
    format?: 'boolean' | 'bounds';
};

type PerformanceStatGroup = {
    label: string;
    stats: PerformanceStat[];
};

const PERFORMANCE_STAT_GROUPS: PerformanceStatGroup[] = [
    {
        label: 'geometry',
        stats: [
            { key: 'totalPolygons', label: 'triangles' },
            { key: 'totalVertices', label: 'vertices' },
            { key: 'skinnedMeshCount', label: 'skinned_meshes' },
            { key: 'meshCount', label: 'basic_meshes' },
            { key: 'materialSlotsUsed', label: 'material_slots' },
            { key: 'boneCount', label: 'bones' },
            { key: 'blendShapeCount', label: 'blend_shapes' },
            { key: 'bounds', label: 'bounds', format: 'bounds' }
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
        ? `${bounds.map((entry) => formatter.format(entry)).join(' \u00d7 ')} m`
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
    rank,
    note
}: {
    label: string;
    value: string;
    rank?: string;
    note?: string;
}) {
    const { t } = useTranslation();
    const rankLabel = rank
        ? t(`dialog.avatar.performance.ranks.${rank}`, { defaultValue: rank })
        : undefined;
    return (
        <div className="bg-muted/40 min-w-0 rounded-md border px-3 py-2">
            <span className="text-muted-foreground block truncate text-xs">
                {label}
            </span>
            <span
                title={note || rankLabel}
                className={`mt-0.5 block font-mono text-sm font-medium break-words ${performanceRankClass(rank)}`}
            >
                {value || EMPTY_VALUE}
            </span>
            {note || rank ? (
                <span className="text-muted-foreground block text-xs">
                    {note || rankLabel}
                </span>
            ) : null}
        </div>
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
        <section className="space-y-2">
            <h4 className="text-sm font-medium">
                {t(`dialog.avatar.performance.group.${group.label}`)}
            </h4>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.stats.map((stat) => {
                    const assessment = assessPerformanceStat(
                        stat.key,
                        stats[stat.key],
                        targetPlatform
                    );
                    const current = formatStatValue(
                        stats[stat.key],
                        stat.format,
                        locale,
                        t
                    );
                    const value =
                        assessment.maximum === undefined
                            ? current
                            : `${current} / ${formatStatValue(assessment.maximum, stat.format, locale, t)}`;
                    return (
                        <PerformanceFact
                            key={stat.key}
                            label={t(
                                `dialog.avatar.performance.stat.${stat.label}`
                            )}
                            value={value}
                            rank={assessment.rank}
                            note={
                                assessment.removed
                                    ? t(
                                          'dialog.avatar.performance.mobile_removed'
                                      )
                                    : undefined
                            }
                        />
                    );
                })}
            </div>
        </section>
    );
}

function PlatformPerformanceSection({
    label,
    platform,
    targetPlatform,
    analysis
}: {
    label: string;
    platform: AvatarPlatformInfo['pc'];
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
    const rating =
        analysis?.performanceRating ||
        platform.performanceRating ||
        EMPTY_VALUE;

    return (
        <section className="space-y-4 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{label}</h3>
                <Badge
                    variant="outline"
                    className={performanceRankClass(rating)}
                >
                    {t('dialog.avatar.performance.rating')}:{' '}
                    {t(`dialog.avatar.performance.ranks.${rating}`, {
                        defaultValue: rating
                    })}
                </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
                {t('dialog.avatar.performance.limits_help', {
                    poor: t('dialog.avatar.performance.ranks.Poor'),
                    good: t('dialog.avatar.performance.ranks.Good'),
                    medium: t('dialog.avatar.performance.ranks.Medium')
                })}{' '}
                <a
                    href={performanceDocsUrl(targetPlatform)}
                    className="text-primary underline"
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
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                <PerformanceFact
                    label={t('dialog.avatar.performance.download_size')}
                    value={analysis?._fileSize || EMPTY_VALUE}
                />
                <PerformanceFact
                    label={t('dialog.avatar.performance.uncompressed_size')}
                    value={analysis?._uncompressedSize || EMPTY_VALUE}
                />
                <PerformanceFact
                    label={t('dialog.avatar.performance.texture_memory')}
                    value={
                        texture.maximum !== undefined &&
                        analysis?._totalTextureUsage
                            ? `${analysis._totalTextureUsage} / ${texture.maximum} MB`
                            : analysis?._totalTextureUsage || EMPTY_VALUE
                    }
                    rank={texture.rank}
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
                <div className="space-y-4">
                    {pending ? (
                        <div className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
                            {t('dialog.avatar.performance.analysis_pending')}
                        </div>
                    ) : null}
                    {displayedPlatforms.map(
                        ({ key, label, platform, analysis }) => (
                            <PlatformPerformanceSection
                                key={key}
                                label={label}
                                targetPlatform={key}
                                platform={platform}
                                analysis={analysis}
                            />
                        )
                    )}
                </div>
            )}
        </EntityDialogTabContent>
    );
}
