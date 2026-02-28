'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { shareThreadWithTeam } from '@/app/actions/teams';

type TeamOption = {
  id: string;
  name: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  threadPublicId: string;
  currentTeamId: string | null;
  userTeams: TeamOption[];
  onShared: () => void;
};

export function ShareThreadDialog({
  isOpen,
  onClose,
  threadPublicId,
  currentTeamId,
  userTeams,
  onShared,
}: Props) {
  const { successToast, errorToast } = statusToast();
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    currentTeamId || '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setSelectedTeamId(currentTeamId || '');
  }, [currentTeamId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const teamId = selectedTeamId || null;
      const result = await shareThreadWithTeam(threadPublicId, teamId);
      if (result.success) {
        successToast({
          message: teamId
            ? 'Thread shared with team'
            : 'Thread sharing removed',
        });
        onClose();
        onShared();
      } else {
        errorToast({ message: result.error || 'Failed to share thread' });
      }
    } catch {
      errorToast({ message: 'Failed to share thread' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>Share Thread with Team</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        {userTeams.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You are not a member of any team. Ask an admin to add you to a team
            first.
          </p>
        ) : (
          <div>
            <label
              htmlFor="team-select"
              className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
            >
              Select Team
            </label>
            <select
              id="team-select"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">No team (private)</option>
              {userTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancel
          </Button>
          {userTeams.length > 0 && (
            <Button isSubmit={true} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
