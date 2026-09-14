/**
 * `pdf-parse`'s root entry decides it is running as a script when
 * `module.parent` is unset, and then reads a sample PDF from its own package
 * directory. Under CommonJS that never fired, because a `require` from another
 * module sets the parent. Loaded from an ESM graph it does fire, and the worker
 * dies at boot with `ENOENT: ./test/data/05-versions-space.pdf`.
 *
 * `lib/pdf-parse.js` is what the root entry re-exports, without that branch —
 * but `@types/pdf-parse` only declares the root specifier, so point the deep
 * path at the same types rather than losing them.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse';

  export default pdfParse;
}
