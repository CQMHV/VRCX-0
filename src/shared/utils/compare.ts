import {
    presenceOf,
    presencePlace,
    presenceSection
} from '@/domain/friends/presence';

import { sortStatus } from './friendStatus';

type ComparableFieldValue = string | number | undefined;

type ComparableRef = Record<string, unknown> & {
    last_activity?: ComparableFieldValue;
    last_login?: ComparableFieldValue;
    location?: string;
    state?: string;
    status?: string;
};

type ComparableRecord = Record<string, unknown> & {
    $friendNumber?: number;
    created_at?: string;
    displayName?: string;
    id?: string;
    last_activity?: ComparableFieldValue;
    last_login?: ComparableFieldValue;
    location?: string;
    memberCount?: number;
    name?: string;
    ref?: ComparableRef;
    state?: string;
    updated_at?: string;
};
type Comparator = (a: ComparableRecord, b: ComparableRecord) => number;

// Mirrors JS `<` semantics for possibly-undefined operands: any comparison
// involving `undefined` is false, so it ranks the value as "not lower".
function isLessThan(a: ComparableFieldValue, b: ComparableFieldValue): boolean {
    if (a === undefined || b === undefined) {
        return false;
    }
    return a < b;
}

function isGreaterThan(
    a: ComparableFieldValue,
    b: ComparableFieldValue
): boolean {
    if (a === undefined || b === undefined) {
        return false;
    }
    return a > b;
}

function isOnlineRecord(record: ComparableRecord | ComparableRef): boolean {
    const presence = presenceOf(record);
    return presence
        ? presenceSection(presence) === 'online'
        : record.state === 'online';
}

function recordPlace(record: ComparableRecord | ComparableRef) {
    const presence = presenceOf(record);
    return presence ? presencePlace(presence)?.location : null;
}

function activityValue(
    ref: ComparableRef,
    field: string
): ComparableFieldValue {
    const value = ref[field];
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : undefined;
}

function compareByName(a: ComparableRecord, b: ComparableRecord): number {
    if (typeof a.name !== 'string' || typeof b.name !== 'string') {
        return 0;
    }
    return a.name.localeCompare(b.name);
}

function compareByDisplayName(
    a: ComparableRecord,
    b: ComparableRecord
): number {
    if (
        typeof a.displayName !== 'string' ||
        typeof b.displayName !== 'string'
    ) {
        return 0;
    }
    return a.displayName.localeCompare(b.displayName);
}

function compareByMemberCount(
    a: ComparableRecord,
    b: ComparableRecord
): number {
    if (
        typeof a.memberCount !== 'number' ||
        typeof b.memberCount !== 'number'
    ) {
        return 0;
    }
    return a.memberCount - b.memberCount;
}

function compareByPrivate(a: ComparableRecord, b: ComparableRecord): number {
    if (typeof a.ref === 'undefined' || typeof b.ref === 'undefined') {
        return 0;
    }
    const aPrivate = recordPlace(a.ref)?.isPrivate === true;
    const bPrivate = recordPlace(b.ref)?.isPrivate === true;
    if (aPrivate === bPrivate) {
        return 0;
    }
    return aPrivate ? 1 : -1;
}

function compareByStatus(a: ComparableRecord, b: ComparableRecord): number {
    if (typeof a.ref === 'undefined' || typeof b.ref === 'undefined') {
        return 0;
    }
    const aPresence = presenceOf(a.ref);
    const bPresence = presenceOf(b.ref);
    const aOffline = aPresence
        ? presenceSection(aPresence) === 'offline'
        : a.ref.state === 'offline';
    const bOffline = bPresence
        ? presenceSection(bPresence) === 'offline'
        : b.ref.state === 'offline';
    if (aOffline && !bOffline) {
        return 1;
    }
    if (!aOffline && bOffline) {
        return -1;
    }
    if (a.ref.status === b.ref.status) {
        return 0;
    }
    return sortStatus(a.ref.status ?? '', b.ref.status ?? '');
}

function onlineSince(record: ComparableRecord | ComparableRef) {
    const presence = presenceOf(record);
    const since =
        presence?.kind === 'online' || presence?.kind === 'pendingOffline'
            ? presence.onlineSinceMs
            : null;
    return since ?? 0;
}

function compareByLastActive(a: ComparableRecord, b: ComparableRecord): number {
    if (isOnlineRecord(a) && isOnlineRecord(b)) {
        if (typeof a.ref === 'undefined' || typeof b.ref === 'undefined') {
            return 0;
        }
        const aSince = onlineSince(a.ref);
        const bSince = onlineSince(b.ref);
        if (aSince && bSince && aSince === bSince) {
            return compareByActivityField(a, b, 'last_login');
        }
        return compareActivityValues(aSince, bSince);
    }

    return compareByActivityField(a, b, 'last_activity');
}

function compareByLastActiveRef(
    a: ComparableRecord,
    b: ComparableRecord
): number {
    if (isOnlineRecord(a) && isOnlineRecord(b)) {
        const aSince = onlineSince(a);
        const bSince = onlineSince(b);
        if (aSince && bSince && aSince === bSince) {
            return isLessThan(a.last_login, b.last_login) ? 1 : -1;
        }
        return isLessThan(aSince, bSince) ? 1 : -1;
    }
    return isLessThan(a.last_activity, b.last_activity) ? 1 : -1;
}

function compareByLastSeen(aLastSeen?: string, bLastSeen?: string): number {
    if (!aLastSeen || !bLastSeen) {
        return Number(!aLastSeen) - Number(!bLastSeen);
    }
    return compareActivityValues(aLastSeen, bLastSeen);
}

function compareByActivityField(
    a: ComparableRecord,
    b: ComparableRecord,
    field: string
): number {
    if (typeof a.ref === 'undefined' || typeof b.ref === 'undefined') {
        return 0;
    }
    return compareActivityValues(
        activityValue(a.ref, field),
        activityValue(b.ref, field)
    );
}

function compareActivityValues(
    aValue: ComparableFieldValue,
    bValue: ComparableFieldValue
): number {
    // When the field is just and empty string, it means they've been
    // in whatever active state for the longest
    if (isLessThan(aValue, bValue) || (aValue !== '' && bValue === '')) {
        return 1;
    }
    if (isGreaterThan(aValue, bValue) || (aValue === '' && bValue !== '')) {
        return -1;
    }
    return 0;
}

function compareByLocationAt(
    a: ComparableRecord,
    b: ComparableRecord,
    aStaySinceMs?: number,
    bStaySinceMs?: number
): number {
    const aTraveling = recordPlace(a)?.isTraveling === true;
    const bTraveling = recordPlace(b)?.isTraveling === true;
    if (aTraveling !== bTraveling) {
        return aTraveling ? 1 : -1;
    }
    if (aTraveling) {
        return 0;
    }
    if (isLessThan(aStaySinceMs, bStaySinceMs)) {
        return -1;
    }
    if (isGreaterThan(aStaySinceMs, bStaySinceMs)) {
        return 1;
    }
    return 0;
}

function compareByLocation(a: ComparableRecord, b: ComparableRecord): number {
    if (typeof a.ref === 'undefined' || typeof b.ref === 'undefined') {
        return 0;
    }
    if (!isOnlineRecord(a) || !isOnlineRecord(b)) {
        return 0;
    }

    return (recordPlace(a.ref)?.tag ?? '').localeCompare(
        recordPlace(b.ref)?.tag ?? ''
    );
}

function compareByFriendOrder(
    a: ComparableRecord,
    b: ComparableRecord
): number {
    if (typeof a === 'undefined' || typeof b === 'undefined') {
        return 0;
    }
    return (b.$friendNumber ?? NaN) - (a.$friendNumber ?? NaN);
}

export {
    compareByName,
    compareByDisplayName,
    compareByMemberCount,
    compareByPrivate,
    compareByStatus,
    compareByLastActive,
    compareByLastActiveRef,
    compareByLastSeen,
    compareByLocationAt,
    compareByLocation,
    compareByFriendOrder
};
export type { ComparableRecord, Comparator };
