import { useQuery } from '@tanstack/react-query';

import { UserDialogProfileDecorationImage } from '@/components/dialogs/user-dialog/components/UserDialogProfileDecorationImage';
import {
    normalizeProfileAppearanceColor,
    resolveProfileDecorationAssetUrls
} from '@/components/dialogs/user-dialog/userDialogProfileAppearance';
import { FadeInImage } from '@/components/media/FadeInImage';
import { entityQueryPolicies } from '@/lib/entityQueryCache';
import { cn } from '@/lib/utils';
import vrchatMediaRepository, {
    type InventoryItemRecord
} from '@/repositories/vrchatMediaRepository';

function useProfileDecorationItem(templateId: string) {
    return useQuery({
        queryKey: ['sidebarProfileDecoration', templateId],
        queryFn: async () =>
            (await vrchatMediaRepository.getInventoryTemplate(templateId)).json,
        enabled: Boolean(templateId),
        staleTime: entityQueryPolicies.inventoryTemplate.staleTime,
        gcTime: entityQueryPolicies.inventoryTemplate.gcTime,
        retry: false,
        refetchOnWindowFocus: false
    }).data;
}

function DecorationImage({
    item,
    animated,
    className,
    imageClassName
}: {
    item: InventoryItemRecord | undefined;
    animated: boolean;
    className: string;
    imageClassName: string;
}) {
    if (animated) {
        return (
            <UserDialogProfileDecorationImage
                item={item}
                className={className}
                imageClassName={imageClassName}
            />
        );
    }
    const { animatedUrl, staticUrl } = resolveProfileDecorationAssetUrls(item);
    const src = staticUrl || animatedUrl;
    if (!src) {
        return null;
    }
    return (
        <span
            aria-hidden="true"
            className={cn('pointer-events-none block', className)}
        >
            <FadeInImage
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                fallback={null}
                className={cn('size-full', imageClassName)}
            />
        </span>
    );
}

export function SidebarAvatarFrame({
    templateId,
    animated = false
}: {
    templateId: string;
    animated?: boolean;
}) {
    const item = useProfileDecorationItem(templateId);
    return (
        <DecorationImage
            item={item}
            animated={animated}
            className="absolute -inset-[18.75%] z-5"
            imageClassName="object-contain"
        />
    );
}

export function SidebarNameplate({
    templateId,
    animated = false,
    className
}: {
    templateId: string;
    animated?: boolean;
    className?: string;
}) {
    const item = useProfileDecorationItem(templateId);
    if (!item) {
        return null;
    }
    const gradientStart = normalizeProfileAppearanceColor(
        item.metadata?.gradientStart
    );
    const gradientEnd = normalizeProfileAppearanceColor(
        item.metadata?.gradientEnd
    );
    return (
        <span
            aria-hidden="true"
            style={
                gradientStart && gradientEnd
                    ? {
                          backgroundImage: `linear-gradient(90deg, ${gradientStart}, ${gradientEnd})`
                      }
                    : undefined
            }
            className={cn(
                'pointer-events-none absolute inset-y-0.5 right-0 -z-10 w-2/3 overflow-hidden rounded-[inherit] [mask-image:linear-gradient(to_left,black,rgb(0_0_0/0.7)_25%,rgb(0_0_0/0.3)_55%,rgb(0_0_0/0.08)_80%,transparent)]',
                className
            )}
        >
            <DecorationImage
                item={item}
                animated={animated}
                className="absolute inset-0"
                imageClassName="object-cover"
            />
        </span>
    );
}
