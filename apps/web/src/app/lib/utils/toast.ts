import { toast } from 'sonner';

export type ToastProps = {
  message: string;
};

/**
 * The four toast helpers, defined once at module scope.
 *
 * They used to be created inside `statusToast()`, which handed every caller a
 * fresh set of closures on every render. Nothing in them varies — they close
 * over no state — so the identities changed while the behaviour did not, and
 * any component that put one in a dependency array got a hook that
 * invalidated itself forever:
 *
 *   const { errorToast } = statusToast();                  // new every render
 *   const load = useCallback(..., [id, errorToast]);       // so: new every render
 *   useEffect(() => { load(); }, [isOpen, load]);          // so: runs every render
 *
 * `load()` sets state, the state change renders, the render makes a new
 * `errorToast`, and round it goes. `ShareAccessDialog` did exactly this: a
 * failing permission fetch produced 79 requests and 79 toasts in 250ms
 * instead of one, which is what a demo user saw as a waterfall of "failed to
 * share". On the happy path the same loop ran silently as an unbounded
 * request storm, which is why it went unnoticed for so long.
 *
 * Stable references make the hook rules work as written. `statusToast()`
 * stays a function and keeps returning the same object, so all 69 call sites
 * are unchanged.
 */
const successToast = ({ message }: ToastProps) => {
  toast.success(message);
};

const errorToast = ({ message }: ToastProps) => {
  toast.error(message);
};

const infoToast = ({ message }: ToastProps) => {
  toast.info(message);
};

const warningToast = ({ message }: ToastProps) => {
  toast.warning(message);
};

const toasts = {
  successToast,
  errorToast,
  infoToast,
  warningToast,
} as const;

export const statusToast = () => toasts;
