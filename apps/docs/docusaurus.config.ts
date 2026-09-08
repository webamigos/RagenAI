import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

/**
 * Traffic measurement lives here and nowhere else in the monorepo.
 *
 * `apps/web` is the application customers self-host, so an analytics id in it
 * is an id in an Apache-2.0 repository: it used to be, and every self-hosted
 * deployment following `self-hosting.md` reported to the vendor's container.
 * This site is the one surface only the vendor deploys, which is what makes it
 * the safe place for a measurement id.
 *
 * The id still comes from the environment and has no default, so a `docs:dev`
 * or a docs build by anybody else loads no script at all. It is read at build
 * time — a static site has no other moment — which is why the Dockerfile has
 * to declare it as an `ARG`; Railway passes service variables to a Dockerfile
 * build only through one. Setting it in Railway alone changes nothing until
 * the next build. See
 * `docs/lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md`.
 *
 * A GA4 measurement id (`G-…`), not a Tag Manager container: this is a static
 * documentation site with no other tags to manage. Swap `gtag` below for
 * `googleTagManager: { containerId }` if that ever stops being true.
 */
const gtagId = process.env.DOCS_GTAG_ID?.trim();

const config: Config = {
  title: 'Ragen AI',
  tagline: 'Developer Documentation',
  url: 'https://docs.ragen.ai',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  // Moved under `markdown.hooks` in Docusaurus 3.10; the top-level form warns
  // on every build and goes away in v4.
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  favicon: 'img/favicon.ico',

  organizationName: 'ragenai',
  projectName: 'ragen-docs',

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.ts'),
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        // Omitted entirely when unset — passing `{ trackingID: undefined }`
        // makes the plugin throw rather than opt out.
        ...(gtagId ? { gtag: { trackingID: gtagId, anonymizeIP: true } } : {}),
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    docs: {
      sidebar: {
        hideable: true,
      },
    },
    navbar: {
      logo: {
        alt: 'Ragen AI',
        src: 'img/logo.svg',
        srcDark: 'img/logo-dark.svg',
      },
      items: [
        {
          type: 'doc',
          docId: 'introduction',
          position: 'left',
          label: 'Docs',
        },
        {
          type: 'doc',
          docId: 'api-reference/chat',
          position: 'left',
          label: 'API Reference',
        },
        {
          href: 'https://demo.ragen.ai',
          label: 'Live demo',
          position: 'right',
        },
        {
          href: 'https://github.com/ragenai',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/quickstart',
            },
            {
              label: 'API Reference',
              to: '/docs/api-reference/chat',
            },
          ],
        },
        {
          title: 'Product',
          items: [
            {
              label: 'Live demo',
              href: 'https://demo.ragen.ai',
            },
          ],
        },
        {
          title: 'Company',
          items: [
            {
              label: 'Website',
              href: 'https://ragen.ai',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/ragenai',
            },
          ],
        },
      ],
      copyright: `Copyright &copy; ${new Date().getFullYear()} Ragen AI. All rights reserved.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default async function createConfig() {
  return config;
}
