import { afterEach, afterAll, beforeEach, vi } from 'vitest';
// import { cleanup } from '@testing-library/react'
// import '@testing-library/jest-dom/vitest';
import '@testing-library/jest-dom';
// import matchers from '@testing-library/jest-dom/matchers';

import { toHaveNoViolations } from 'jest-axe';
// import { server } from "./src/mocks/node";

// Mock ioredis to prevent connection attempts in test/CI environments
vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => ({
    hget: vi.fn().mockResolvedValue(null),
    hgetall: vi.fn().mockResolvedValue({}),
    hset: vi.fn().mockResolvedValue(0),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    eval: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    on: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    status: 'ready',
  }));
  return { default: RedisMock, Redis: RedisMock };
});

expect.extend(toHaveNoViolations);

beforeEach(() => {
  // server.listen();
});

afterEach(() => {
  // cleanup();
  // server.resetHandlers();
});

afterAll(() => {
  // server.close();
});
