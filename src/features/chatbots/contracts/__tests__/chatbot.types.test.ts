import { describe, it, expect } from 'vitest';
import { themeConfigSchema } from '../chatbot.types';

describe('themeConfigSchema', () => {
  it('accepts undefined (optional schema)', () => {
    expect(themeConfigSchema.parse(undefined)).toBeUndefined();
  });

  it('accepts an empty object', () => {
    expect(themeConfigSchema.parse({})).toEqual({});
  });

  it('accepts valid theme config', () => {
    const config = {
      primaryColor: '#6366f1',
      bubbleColor: '#fff',
      position: 'right' as const,
      welcomeMessage: 'Hello!',
      botName: 'Assistant',
    };
    expect(themeConfigSchema.parse(config)).toEqual(config);
  });

  it('accepts partial theme config', () => {
    expect(themeConfigSchema.parse({ primaryColor: '#000' })).toEqual({
      primaryColor: '#000',
    });
  });

  it('rejects invalid position value', () => {
    expect(() => themeConfigSchema.parse({ position: 'center' })).toThrow();
  });

  it('rejects welcomeMessage longer than 500 characters', () => {
    expect(() =>
      themeConfigSchema.parse({ welcomeMessage: 'a'.repeat(501) }),
    ).toThrow();
  });

  it('rejects botName longer than 100 characters', () => {
    expect(() =>
      themeConfigSchema.parse({ botName: 'a'.repeat(101) }),
    ).toThrow();
  });

  it('accepts valid position left', () => {
    expect(themeConfigSchema.parse({ position: 'left' })).toEqual({
      position: 'left',
    });
  });

  it('accepts starterQuestions array', () => {
    const config = { starterQuestions: ['Czym jest Ragen?', 'Jak zacząć?'] };
    expect(themeConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects starterQuestions with more than 5 items', () => {
    expect(() =>
      themeConfigSchema.parse({
        starterQuestions: ['a', 'b', 'c', 'd', 'e', 'f'],
      }),
    ).toThrow();
  });

  it('rejects starterQuestions item longer than 100 characters', () => {
    expect(() =>
      themeConfigSchema.parse({ starterQuestions: ['a'.repeat(101)] }),
    ).toThrow();
  });

  it('rejects empty string in starterQuestions', () => {
    expect(() => themeConfigSchema.parse({ starterQuestions: [''] })).toThrow();
  });

  it('accepts empty starterQuestions array', () => {
    expect(themeConfigSchema.parse({ starterQuestions: [] })).toEqual({
      starterQuestions: [],
    });
  });

  it('rejects whitespace-only string in starterQuestions', () => {
    expect(() =>
      themeConfigSchema.parse({ starterQuestions: ['   '] }),
    ).toThrow();
  });

  it('accepts avatarUrl string', () => {
    const config = { avatarUrl: 'https://example.com/avatar.webp' };
    expect(themeConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects avatarUrl longer than 500 characters', () => {
    expect(() =>
      themeConfigSchema.parse({
        avatarUrl: 'https://x.com/' + 'a'.repeat(490),
      }),
    ).toThrow();
  });

  it('accepts undefined avatarUrl', () => {
    expect(themeConfigSchema.parse({})).toEqual({});
  });
});
