import { describe, it, expect } from 'vitest';
import { createMessageSchema } from '../message.types';

const schema = createMessageSchema();

describe('createMessageSchema', () => {
  describe('prompt field', () => {
    it('accepts a valid prompt (10+ characters)', () => {
      const result = schema.safeParse({ prompt: 'Hello world' });
      expect(result.success).toBe(true);
    });

    it('accepts prompt at exactly 3 characters', () => {
      const result = schema.safeParse({ prompt: 'abc' });
      expect(result.success).toBe(true);
    });

    it('rejects prompt shorter than 3 characters', () => {
      const result = schema.safeParse({ prompt: 'ab' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('prompt');
      }
    });

    it('rejects empty prompt', () => {
      const result = schema.safeParse({ prompt: '' });
      expect(result.success).toBe(false);
    });

    it('accepts prompt at exactly 10000 characters', () => {
      const result = schema.safeParse({ prompt: 'a'.repeat(10000) });
      expect(result.success).toBe(true);
    });

    it('rejects prompt over 10000 characters', () => {
      const result = schema.safeParse({ prompt: 'a'.repeat(10001) });
      expect(result.success).toBe(false);
    });

    it('rejects missing prompt', () => {
      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('optional fields', () => {
    const validBase = { prompt: 'Hello world test' };

    it('accepts mode as "conversation"', () => {
      const result = schema.safeParse({ ...validBase, mode: 'conversation' });
      expect(result.success).toBe(true);
    });

    it('accepts mode as "rag"', () => {
      const result = schema.safeParse({ ...validBase, mode: 'rag' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid mode', () => {
      const result = schema.safeParse({ ...validBase, mode: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('accepts messageType as "TEXT"', () => {
      const result = schema.safeParse({
        ...validBase,
        messageType: 'TEXT',
      });
      expect(result.success).toBe(true);
    });

    it('accepts messageType as "VOICE"', () => {
      const result = schema.safeParse({
        ...validBase,
        messageType: 'VOICE',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid messageType', () => {
      const result = schema.safeParse({
        ...validBase,
        messageType: 'VIDEO',
      });
      expect(result.success).toBe(false);
    });

    it.each(['KNOWLEDGE_BASE', 'ASSISTANT', 'MODEL_ONLY'])(
      'accepts knowledgeScope %s',
      (knowledgeScope) => {
        const result = schema.safeParse({ ...validBase, knowledgeScope });
        expect(result.success).toBe(true);
      },
    );

    it('accepts an omitted knowledgeScope, which means KNOWLEDGE_BASE', () => {
      expect(schema.safeParse(validBase).success).toBe(true);
    });

    it('rejects a scope outside the three levels', () => {
      // The generated Prisma enum would reject it too, but three layers down
      // and as a database error. The wire is where a bad value should die.
      const result = schema.safeParse({
        ...validBase,
        knowledgeScope: 'knowledge-base',
      });
      expect(result.success).toBe(false);
    });

    it('accepts voiceDurationSeconds number', () => {
      const result = schema.safeParse({
        ...validBase,
        voiceDurationSeconds: 30,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('threadDocuments', () => {
    const validBase = { prompt: 'Hello world test' };

    it('accepts valid threadDocuments array', () => {
      const result = schema.safeParse({
        ...validBase,
        threadDocuments: [
          {
            name: 'file.txt',
            content: 'Hello',
            size: 5,
            type: 'text/plain',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts threadDocuments with optional userFileId and sourceUrl', () => {
      const result = schema.safeParse({
        ...validBase,
        threadDocuments: [
          {
            name: 'file.txt',
            content: 'Hello',
            size: 5,
            type: 'text/plain',
            userFileId: 'pub-id-123',
            sourceUrl: 'https://example.com',
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty threadDocuments array', () => {
      const result = schema.safeParse({
        ...validBase,
        threadDocuments: [],
      });
      expect(result.success).toBe(true);
    });

    it('accepts omitted threadDocuments', () => {
      const result = schema.safeParse(validBase);
      expect(result.success).toBe(true);
    });

    it('rejects threadDocuments missing required fields', () => {
      const result = schema.safeParse({
        ...validBase,
        threadDocuments: [{ name: 'file.txt' }],
      });
      expect(result.success).toBe(false);
    });

    it('accepts multiple threadDocuments', () => {
      const result = schema.safeParse({
        ...validBase,
        threadDocuments: [
          { name: 'a.txt', content: 'aaa', size: 3, type: 'text/plain' },
          { name: 'b.md', content: 'bbb', size: 3, type: 'text/markdown' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('custom translation function', () => {
    it('uses custom translator for error messages', () => {
      const t = (key: string) => `translated:${key}`;
      const customSchema = createMessageSchema(t);
      const result = customSchema.safeParse({ prompt: 'ab' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('translated:prompt-min');
      }
    });
  });
});
