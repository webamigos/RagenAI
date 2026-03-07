'use server';

// Legacy usage tracking removed — thread creation is now tracked
// via the AiUsage table when chat completions occur.
export const trackThreadCreatedCommand = async () => {
  // no-op: retained for backward compatibility with callers
};
