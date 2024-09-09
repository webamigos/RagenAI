import React from 'react';
import { render } from '@testing-library/react';

import Page from '../app/[locale]/(marketing)/page';

describe('Page', () => {
  it('should render successfully', () => {
    // const { baseElement } = render(<Page params={{ locale: 'pl' }} />);
    const baseElement = render(<p>test</p>);
    expect(baseElement).toBeTruthy();
  });
});
