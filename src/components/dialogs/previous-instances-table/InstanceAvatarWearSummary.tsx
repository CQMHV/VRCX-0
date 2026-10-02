import { UserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatClock } from '@/lib/dateTime';
import type { AvatarWearSegment } from '@/platform/tauri/bindings';
import { commands } from '@/platform/tauri/bindings';
import { openAvatarDialog } from '@/services/dialogService';
import { useRuntimeStore } from '@/state/runtimeStore';
import {
    Avatar,
    AvatarFallback,
    AvatarGroup,
    AvatarGroupCount,
    AvatarImage
} from '@/ui/shadcn/avatar';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/ui/shadcn/hover-card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/shadcn/tooltip';

import type { PreviousInstanceVisitWindow } from './previousInstancesRows';

const STACKED_AVATAR_LIMIT = 3;

function spanVisitWindow(
    segments: AvatarWearSegment[],
    startMs: number,
    endMs: number
): AvatarWearSegment[] {
    return segments.map((segment, index) => ({
        ...segment,
        startedAtMs: index === 0 ? startMs : segment.startedAtMs,
        endedAtMs: segments[index + 1]?.startedAtMs ?? endMs
    }));
}

export function useInstanceAvatarWearSegments(
    location: string,
    visitWindow: PreviousInstanceVisitWindow | null
) {
    const startMs = visitWindow?.startMs ?? 0;
    const endMs = visitWindow?.endMs ?? 0;
    const currentUserId = useRuntimeStore(
        (state) => state.auth.currentUserId || ''
    );
    const isOngoing = useRuntimeStore(
        (state) =>
            state.gameState.isGameRunning === true &&
            Boolean(location) &&
            state.gameState.currentLocation === location &&
            endMs <= startMs
    );
    const [segments, setSegments] = useState<AvatarWearSegment[]>([]);

    useEffect(() => {
        setSegments([]);
        if (!currentUserId || !startMs) {
            return undefined;
        }
        const nowMs = Date.now();
        const toMs = isOngoing ? nowMs : endMs;
        let active = true;
        commands
            .appAvatarWearSegments(currentUserId, startMs, toMs)
            .then((rows) => {
                if (!active) {
                    return;
                }
                const snapshot =
                    useRuntimeStore.getState().auth.currentUserSnapshot;
                const liveAvatarId = snapshot?.currentAvatar?.trim() || '';
                const swapMs = Number(snapshot?.$previousAvatarSwapTime) || 0;
                const appendsLive =
                    isOngoing &&
                    Boolean(liveAvatarId && swapMs) &&
                    rows.at(-1)?.avatarId !== liveAvatarId;
                const worn = appendsLive
                    ? [
                          ...rows,
                          {
                              avatarId: liveAvatarId,
                              name: snapshot?.currentAvatarName || '',
                              thumbnailImageUrl:
                                  snapshot?.currentAvatarThumbnailImageUrl ||
                                  '',
                              imageUrl: snapshot?.currentAvatarImageUrl || '',
                              startedAtMs: Math.max(swapMs, startMs),
                              endedAtMs: nowMs
                          }
                      ]
                    : rows;
                setSegments(spanVisitWindow(worn, startMs, toMs));
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [currentUserId, endMs, isOngoing, startMs]);

    return segments;
}

function segmentName(segment: AvatarWearSegment) {
    return segment.name || segment.avatarId;
}

function WearAvatarImage({ segment }: { segment: AvatarWearSegment }) {
    const imageUrl = segment.thumbnailImageUrl || segment.imageUrl;
    return (
        <>
            {imageUrl ? (
                <AvatarImage src={imageUrl} alt="" loading="lazy" />
            ) : null}
            <AvatarFallback>
                <UserIcon className="size-3" />
            </AvatarFallback>
        </>
    );
}

function WearAvatar({ segment }: { segment: AvatarWearSegment }) {
    const name = segmentName(segment);
    return (
        <Tooltip>
            <TooltipTrigger
                render={
                    <Avatar
                        size="sm"
                        className="cursor-pointer hover:z-10"
                        render={
                            <button
                                type="button"
                                aria-label={name}
                                onClick={() =>
                                    openAvatarDialog({
                                        avatarId: segment.avatarId
                                    })
                                }
                            />
                        }
                    />
                }
            >
                <WearAvatarImage segment={segment} />
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
        </Tooltip>
    );
}

function WearSegmentList({
    segments
}: {
    segments: readonly AvatarWearSegment[];
}) {
    return (
        <ul className="max-h-72 overflow-y-auto py-1">
            {segments.map((segment) => {
                const name = segmentName(segment);
                return (
                    <li key={segment.startedAtMs}>
                        <button
                            type="button"
                            className="hover:bg-muted focus-visible:ring-ring/50 flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2"
                            onClick={() =>
                                openAvatarDialog({ avatarId: segment.avatarId })
                            }
                        >
                            <Avatar size="sm">
                                <WearAvatarImage segment={segment} />
                            </Avatar>
                            <span
                                className="min-w-0 flex-1 truncate text-sm"
                                title={name}
                            >
                                {name}
                            </span>
                            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                                {formatClock(segment.startedAtMs)}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

export function InstanceAvatarWearSummary({
    segments,
    label
}: {
    segments: readonly AvatarWearSegment[];
    label: string;
}) {
    if (!segments.length) {
        return null;
    }
    const stacked = segments.slice(0, STACKED_AVATAR_LIMIT);
    const extra = segments.length - stacked.length;

    return (
        <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="mt-1 flex items-center">
                <AvatarGroup>
                    {stacked.map((segment) => (
                        <WearAvatar
                            key={segment.startedAtMs}
                            segment={segment}
                        />
                    ))}
                    {extra > 0 ? (
                        <HoverCard>
                            <HoverCardTrigger
                                delay={250}
                                closeDelay={120}
                                render={
                                    <AvatarGroupCount
                                        tabIndex={0}
                                        className="focus-visible:ring-ring/50 cursor-default text-xs tabular-nums outline-none focus-visible:ring-2"
                                    />
                                }
                            >
                                +{extra}
                            </HoverCardTrigger>
                            <HoverCardContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="w-72 p-1.5"
                            >
                                <div className="text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium">
                                    {label}
                                </div>
                                <WearSegmentList segments={segments} />
                            </HoverCardContent>
                        </HoverCard>
                    ) : null}
                </AvatarGroup>
            </dd>
        </div>
    );
}
