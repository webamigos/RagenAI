import '@testing-library/jest-dom';

const { axe, toHaveNoViolations } = require('jest-axe');

expect.extend(toHaveNoViolations);
