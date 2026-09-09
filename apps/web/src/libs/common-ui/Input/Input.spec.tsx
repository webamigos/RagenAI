import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { axe } from 'jest-axe';

import { Input } from './Input';

describe('Input component', () => {
  it('should have no violations', async () => {
    const { container } = render(
      <NextIntlClientProvider messages={{}} locale="en">
        <Input label="Name" />
      </NextIntlClientProvider>,
    );
    const result = await axe(container);
    expect(result).toHaveNoViolations();
  });
});
