'use client';

import type { ComponentType, SVGProps } from 'react';
import type { SettingsIcon } from '@/features/settings/registry';
import {
  Cog6ToothIcon,
  UserIcon,
  PuzzlePieceIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  ShieldExclamationIcon,
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  ChatBubbleLeftRightIcon,
  UserGroupIcon,
  KeyIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  CircleStackIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

/**
 * One icon map for both settings rails.
 *
 * Exhaustive by type: adding a `SettingsIcon` without a component here fails
 * typecheck, which is how the organization icons were caught the moment the
 * union grew rather than rendering as a hole in the rail. A second copy in the
 * organization nav would have been the same drift the registry just removed.
 */
export const SETTINGS_ICONS: Record<
  SettingsIcon,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  cog: Cog6ToothIcon,
  user: UserIcon,
  puzzle: PuzzlePieceIcon,
  building: BuildingOfficeIcon,
  'chart-bar': ChartBarIcon,
  'shield-exclamation': ShieldExclamationIcon,
  adjustments: AdjustmentsHorizontalIcon,
  beaker: BeakerIcon,
  'chat-bubble': ChatBubbleLeftRightIcon,
  'user-group': UserGroupIcon,
  key: KeyIcon,
  'shield-check': ShieldCheckIcon,
  'cpu-chip': CpuChipIcon,
  'circle-stack': CircleStackIcon,
  'document-text': DocumentTextIcon,
};
