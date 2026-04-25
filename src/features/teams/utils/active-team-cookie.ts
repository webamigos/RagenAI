import { cookies } from 'next/headers';

export const ACTIVE_TEAM_COOKIE = 'ragen_active_team';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function getActiveTeamIdFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACTIVE_TEAM_COOKIE)?.value ?? null;
}

export async function setActiveTeamCookie(teamId: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_TEAM_COOKIE, teamId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearActiveTeamCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(ACTIVE_TEAM_COOKIE);
}
