import { DrawerClosed } from '../../components/PageDrawer';

/**
 * Nothing in the drawer on the graph itself. A soft navigation back to the
 * graph — "Show neighbourhood" from inside the drawer — would otherwise keep
 * the last page open, since a slot that matches nothing keeps what it had.
 */
export default function NoDrawer() {
  return <DrawerClosed />;
}
