import { describe, expect, it, vi, beforeEach } from 'vitest';

const success = vi.fn();
const error = vi.fn();
const info = vi.fn();
const warning = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => success(...a),
    error: (...a: unknown[]) => error(...a),
    info: (...a: unknown[]) => info(...a),
    warning: (...a: unknown[]) => warning(...a),
  },
}));

import { statusToast } from '../toast';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('statusToast', () => {
  it('returns the same function identities on every call', () => {
    // The property the hook rules depend on. When these were created inside
    // the factory, a component holding one in a dependency array re-ran its
    // effect on every render — see the doc comment in toast.ts.
    const first = statusToast();
    const second = statusToast();

    expect(second.successToast).toBe(first.successToast);
    expect(second.errorToast).toBe(first.errorToast);
    expect(second.infoToast).toBe(first.infoToast);
    expect(second.warningToast).toBe(first.warningToast);
  });

  it('forwards each message to the matching sonner call', () => {
    const { successToast, errorToast, infoToast, warningToast } = statusToast();

    successToast({ message: 'saved' });
    errorToast({ message: 'broke' });
    infoToast({ message: 'note' });
    warningToast({ message: 'careful' });

    expect(success).toHaveBeenCalledWith('saved');
    expect(error).toHaveBeenCalledWith('broke');
    expect(info).toHaveBeenCalledWith('note');
    expect(warning).toHaveBeenCalledWith('careful');
  });
});
