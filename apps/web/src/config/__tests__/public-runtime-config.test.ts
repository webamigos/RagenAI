import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPublicRuntimeConfigCache,
  parsePublicRuntimeConfig,
  publicRuntimeConfig,
  readPublicRuntimeConfig,
  PUBLIC_CONFIG_ELEMENT_ID,
} from '../public-runtime-config';

/**
 * The reader that decides whether `apps/web` can be published as one image.
 *
 * `NEXT_PUBLIC_*` is replaced at build time, so an image carries the
 * publisher's answers for every install. These tests pin the two properties
 * that make the runtime path a real alternative: the environment is read when
 * it is asked for, and a browser with no configuration element degrades
 * instead of throwing.
 */
describe('readPublicRuntimeConfig', () => {
  it('prefers the runtime name over the build-time one', () => {
    const config = readPublicRuntimeConfig({
      APP_URL: 'https://ragen.example',
      NEXT_PUBLIC_APP_URL: 'https://baked-at-build.example',
    });

    expect(config.appUrl).toBe('https://ragen.example');
  });

  /**
   * The migration's whole safety: a deployment configured the old way keeps
   * working, because this reads the *actual* environment rather than the
   * inlined text. Next rewrites `process.env.NAME` and nothing else, so an
   * access on a parameter — which is what this function does — is invisible
   * to it.
   */
  it('still accepts the NEXT_PUBLIC name, so nothing has to be reconfigured', () => {
    expect(
      readPublicRuntimeConfig({
        NEXT_PUBLIC_PUSHER_KEY: 'pk',
        NEXT_PUBLIC_PUSHER_CLUSTER: 'eu',
      }),
    ).toMatchObject({ pusherKey: 'pk', pusherCluster: 'eu' });
  });

  it('treats blank as absent, so an empty line in an env file is not a value', () => {
    expect(
      readPublicRuntimeConfig({
        APP_URL: '   ',
        NEXT_PUBLIC_APP_URL: 'https://fallback.example',
      }).appUrl,
    ).toBe('https://fallback.example');
  });

  it('falls back to BETTER_AUTH_URL for the app url, which already means this', () => {
    // `app/emails/utils/base-url.ts` has preferred it for the same reason:
    // it is the one origin a deployment must already have set correctly.
    expect(
      readPublicRuntimeConfig({ BETTER_AUTH_URL: 'https://auth.example' })
        .appUrl,
    ).toBe('https://auth.example');
  });

  it('answers with empty strings rather than undefined for an empty environment', () => {
    // Consumers branch on truthiness; `undefined` would type-check and then
    // print "undefined" into an embed snippet.
    expect(
      Object.values(readPublicRuntimeConfig({})).every((v) => v === ''),
    ).toBe(true);
  });
});

describe('parsePublicRuntimeConfig', () => {
  it('reads what the script element carries', () => {
    expect(
      parsePublicRuntimeConfig('{"appUrl":"https://ragen.example"}').appUrl,
    ).toBe('https://ragen.example');
  });

  it.each([[null], [undefined], ['']])(
    'degrades to empty values when the element is missing (%s)',
    (value) => {
      expect(parsePublicRuntimeConfig(value).appUrl).toBe('');
    },
  );

  /**
   * A configuration reader that throws during hydration takes the page with
   * it, which is a much worse failure than the one it would be reporting.
   */
  it.each([['not json at all'], ['[]'], ['null'], ['"a string"']])(
    'degrades rather than throwing on %s',
    (value) => {
      expect(() => parsePublicRuntimeConfig(value)).not.toThrow();
      expect(parsePublicRuntimeConfig(value).pusherKey).toBe('');
    },
  );

  it('keeps every field present even when the document carries only some', () => {
    const config = parsePublicRuntimeConfig('{"pusherKey":"pk"}');

    expect(config.pusherKey).toBe('pk');
    expect(config.appUrl).toBe('');
  });
});

describe('publicRuntimeConfig in a browser', () => {
  beforeEach(() => {
    clearPublicRuntimeConfigCache();
    document.getElementById(PUBLIC_CONFIG_ELEMENT_ID)?.remove();
  });

  it('reads the element the server rendered', () => {
    const script = document.createElement('script');
    script.id = PUBLIC_CONFIG_ELEMENT_ID;
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      pusherKey: 'pk',
      pusherCluster: 'eu',
    });
    document.body.append(script);

    expect(publicRuntimeConfig()).toMatchObject({
      pusherKey: 'pk',
      pusherCluster: 'eu',
    });
  });

  it('does not throw when nothing rendered it', () => {
    expect(() => publicRuntimeConfig()).not.toThrow();
    expect(publicRuntimeConfig().appUrl).toBe('');
  });
});
