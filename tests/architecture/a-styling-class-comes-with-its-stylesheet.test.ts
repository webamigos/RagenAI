import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A component that paints with `chat-response` also imports the stylesheet.
 *
 * `chat-response` is not a Tailwind utility. It is a hand-written stylesheet
 * that gives rendered markdown its headings, lists, tables and callouts, and
 * a component gets it only by importing the file. Writing the class name
 * alone compiles, typechecks, lints and renders — as an unstyled wall of
 * body text.
 *
 * That happened twice in the same directory. `MarkdownViewer` and
 * `DocxViewer` in the knowledge base preview both used the class without the
 * import, and both *looked* fine for a while because a sibling in the same
 * bundle imported it: `Grid/MarkdownPreview` did, so the stylesheet reached
 * the page by accident. The accident is the problem — nothing declared that
 * dependency, and it would have broken the day the grid preview moved.
 *
 * Nothing else can see this. It is not a type, not a lint rule, and in jsdom
 * there is no layout to assert against.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SOURCE_ROOT = join('apps', 'web', 'src');

/**
 * The class, the module specifier a user of it has to import, and where that
 * file lives so the pairing can be checked rather than trusted.
 */
const STYLING_CLASSES = [
  {
    className: 'chat-response',
    specifier: '@/app/components/Assistant/ChatOutput/chat-response.css',
    path: join(
      'app',
      'components',
      'Assistant',
      'ChatOutput',
      'chat-response.css',
    ),
  },
] as const;

const SKIP_DIRS = new Set(['node_modules', '.next', 'generated', 'coverage']);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        found.push(...sourceFiles(full));
      }
      continue;
    }
    if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

const files = sourceFiles(join(REPO_ROOT, SOURCE_ROOT));

describe.each(STYLING_CLASSES)(
  '$className',
  ({ className, specifier, path }) => {
    /**
     * The class inside a `className` string, not in prose. A doc comment
     * naming the class — this file does it, and so do both viewers — is not
     * a use of it.
     */
    const usage = new RegExp(
      `className=(?:"|'|\`|\\{[^}]*?["'\`])[^"'\`]*\\b${className}\\b`,
    );
    /**
     * Side-effect imports, as written. A search for the basename anywhere in
     * the file passes on a comment that mentions it, on a string literal, and
     * on an import of a different file that happens to share the name — three
     * ways to be green while the stylesheet is absent.
     */
    const sideEffectImports = (source: string): string[] =>
      [...source.matchAll(/^\s*import\s+['"]([^'"]+)['"];?\s*$/gm)].map(
        (match) => match[1],
      );

    const stylesheetPath = join(REPO_ROOT, SOURCE_ROOT, path);

    /**
     * The alias, or a relative specifier that resolves to the same file —
     * `ChatOutput.tsx` imports its own stylesheet as `./chat-response.css`,
     * and that is a real import of it. Anything else is not, including a
     * different file with the same name.
     */
    const importsTheStylesheet = (file: string, source: string): boolean =>
      sideEffectImports(source).some((imported) => {
        if (imported === specifier) {
          return true;
        }
        if (!imported.startsWith('.')) {
          return false;
        }
        return resolve(dirname(file), imported) === stylesheetPath;
      });

    const users = files.filter((file) =>
      usage.test(readFileSync(file, 'utf8')),
    );

    it('is used somewhere, or this test is checking nothing', () => {
      expect(users.length).toBeGreaterThan(0);
    });

    it.each(users.map((f) => relative(REPO_ROOT, f)))(
      '%s imports the stylesheet it paints with',
      (relativePath) => {
        const file = join(REPO_ROOT, relativePath);
        const source = readFileSync(file, 'utf8');

        expect(
          importsTheStylesheet(file, source),
          `${relativePath} sets className="${className}" but has no import of ` +
            `${specifier}. The class does nothing unless something else in the ` +
            `bundle happens to import it, which is not a dependency anyone ` +
            `declared.`,
        ).toBe(true);
      },
    );

    it('the stylesheet it names is really there', () => {
      // Otherwise every import above could name a file that does not exist and
      // this suite would still be green.
      expect(() => statSync(join(REPO_ROOT, SOURCE_ROOT, path))).not.toThrow();
    });

    it('does not accept a mention of the file for an import of it', () => {
      const somewhere = join(REPO_ROOT, SOURCE_ROOT, 'app', 'x', 'y.tsx');
      const beside = join(stylesheetPath, '..', 'neighbour.tsx');
      const basename = specifier.split('/').pop() as string;

      // Prose and string literals are not imports.
      expect(
        importsTheStylesheet(somewhere, `// see ${basename} for the rules`),
      ).toBe(false);
      expect(importsTheStylesheet(somewhere, `const s = '${basename}';`)).toBe(
        false,
      );

      // A different file that happens to share the name is not this one.
      expect(
        importsTheStylesheet(somewhere, `import '@/app/other/${basename}';`),
      ).toBe(false);

      // The alias, and a relative path that resolves to the same file, are.
      expect(importsTheStylesheet(somewhere, `import '${specifier}';`)).toBe(
        true,
      );
      expect(importsTheStylesheet(beside, `import './${basename}';`)).toBe(
        true,
      );
    });
  },
);

describe('the scan itself', () => {
  it('does not count a class named only in a comment', () => {
    // This file is in the scanned tree and names `chat-response` a dozen
    // times in prose. If the pattern matched prose it would be listed as a
    // user of the class, and it imports no stylesheet.
    const self = files.find((f) =>
      f.endsWith('a-styling-class-comes-with-its-stylesheet.test.ts'),
    );
    expect(self).toBeUndefined();

    const pattern = new RegExp(
      `className=(?:"|'|\`|\\{[^}]*?["'\`])[^"'\`]*\\bchat-response\\b`,
    );
    expect(pattern.test('// the chat-response stylesheet')).toBe(false);
    expect(pattern.test('<div className="chat-response h-full">')).toBe(true);
    expect(pattern.test('<div className={`chat-response ${x}`}>')).toBe(true);
  });

  it('walks a directory tree that actually has files in it', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.every((f) => !f.includes(`${sep}generated${sep}`))).toBe(true);
  });
});
