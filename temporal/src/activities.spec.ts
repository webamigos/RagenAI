import { MockActivityEnvironment } from '@temporalio/testing';
import * as activities from './activities';

describe('check all activities', () => {
  it('onEmbeddingProcessCompleted activity call', async () => {
    const env = new MockActivityEnvironment();
    const response = await env.run(activities.onEmbeddingProcessCompleted, {
      documentId: '1234',
    });

    expect(response).toBe(`embedding for document #1234 has been completed`);
  });

  it('generateRandomAge activity call', async () => {
    const env = new MockActivityEnvironment();
    const response = await env.run(activities.generateRandomAge, {
      name: 'Janusz',
    });

    expect(response).toContain('Janusz has an estimated age of');
  });
});
