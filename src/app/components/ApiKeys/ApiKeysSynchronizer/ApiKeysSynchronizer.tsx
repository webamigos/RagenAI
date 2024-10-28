/**
 * The role of this component is to check if database contains proper organization data in database
 * If everything is ok then display children
 * If not - create new record
 */

import { syncOrganizationAndProject } from './actions';

type Props = {
  children: React.ReactNode;
};

export const ApiKeysSynchronizer = ({ children }: Props) => {
  syncOrganizationAndProject();

  return children;
};
