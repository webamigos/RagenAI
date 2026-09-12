import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EncryptionRequiredScreen } from '../EncryptionRequiredScreen';

describe('EncryptionRequiredScreen', () => {
  it('names the missing configuration and the opt-out', () => {
    render(<EncryptionRequiredScreen />);

    expect(
      screen.getByText('Encryption is not configured'),
    ).toBeInTheDocument();
    expect(screen.getByText('ENCRYPTION_PROVIDER')).toBeInTheDocument();
    expect(screen.getByText('ALLOW_UNENCRYPTED=1')).toBeInTheDocument();
  });
});
