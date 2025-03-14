export type AccountSetupStatus = {
  clerkOrganizationExists: boolean;
  internalOrganizationExists: boolean;
  organizationHasSubscription: boolean;
  organizationHasDefaultProject: boolean;
  accountSetupComplete: boolean;
  organizationId: string | null;
};
