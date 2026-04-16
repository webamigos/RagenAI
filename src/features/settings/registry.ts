import type { ComponentType, SVGProps } from 'react';
import {
  Cog6ToothIcon,
  UserIcon,
  PuzzlePieceIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

export type SettingsRole = 'user' | 'orgAdmin' | 'orgOwner' | 'appAdmin';

export type SettingsVisibility = {
  requireRole?: SettingsRole;
  featureFlag?: string;
};

export type SettingsPage = {
  id: string;
  path: string;
  labelKey: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  order: number;
  visibility: SettingsVisibility;
};

export const settingsRegistry: readonly SettingsPage[] = [
  {
    id: 'general',
    path: '/settings/general',
    labelKey: 'general',
    icon: Cog6ToothIcon,
    order: 10,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'account',
    path: '/settings/account',
    labelKey: 'account',
    icon: UserIcon,
    order: 20,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'connectors',
    path: '/settings/connectors',
    labelKey: 'connectors',
    icon: PuzzlePieceIcon,
    order: 30,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'audit-logs',
    path: '/settings/audit-logs',
    labelKey: 'audit-logs',
    icon: DocumentTextIcon,
    order: 200,
    visibility: { requireRole: 'appAdmin' },
  },
];
