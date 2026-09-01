import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Ragen AI",
  tagline: "Developer Documentation",
  url: "https://docs.ragen.ai",
  baseUrl: "/",
  onBrokenLinks: "throw",
  // Moved under `markdown.hooks` in Docusaurus 3.10; the top-level form warns
  // on every build and goes away in v4.
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  favicon: "img/favicon.ico",

  organizationName: "ragenai",
  projectName: "ragen-docs",

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.ts"),
          routeBasePath: "docs",
        },
        blog: false,
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: "light",
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
        alt: "Ragen AI",
        src: "img/logo.svg",
        srcDark: "img/logo-dark.svg",
      },
      items: [
        {
          type: "doc",
          docId: "introduction",
          position: "left",
          label: "Docs",
        },
        {
          type: "doc",
          docId: "api-reference/chat",
          position: "left",
          label: "API Reference",
        },
        {
          href: "https://app.ragen.ai",
          label: "Dashboard",
          position: "right",
        },
        {
          href: "https://github.com/ragenai",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "Getting Started",
              to: "/docs/quickstart",
            },
            {
              label: "API Reference",
              to: "/docs/api-reference/chat",
            },
          ],
        },
        {
          title: "Product",
          items: [
            {
              label: "Dashboard",
              href: "https://app.ragen.ai",
            },
          ],
        },
        {
          title: "Company",
          items: [
            {
              label: "Website",
              href: "https://ragen.ai",
            },
            {
              label: "GitHub",
              href: "https://github.com/ragenai",
            },
          ],
        },
      ],
      copyright: `Copyright &copy; ${new Date().getFullYear()} Ragen AI. All rights reserved.`,
    },
    prism: {
      theme: require("prism-react-renderer").themes.github,
      darkTheme: require("prism-react-renderer").themes.dracula,
      additionalLanguages: ["bash", "json", "typescript"],
    },
  } satisfies Preset.ThemeConfig,
};

export default async function createConfig() {
  return config;
}
