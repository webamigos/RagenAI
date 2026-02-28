export type TeamListItem = {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
};

export type TeamDetails = {
  id: string;
  name: string;
  organizationId: string;
  members: TeamMemberItem[];
  createdAt: Date;
};

export type TeamMemberItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
  joinedAt: Date;
};
