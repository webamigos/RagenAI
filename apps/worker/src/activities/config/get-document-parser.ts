import { DOCUMENT_PARSER, DOCLING_STRICT } from '../../consts';

/**
 * Returns the parser configuration: which engine to use, and whether a Docling
 * failure may fall back to the legacy loaders.
 *
 * This exists as an activity because Temporal workflows run in a sandboxed
 * environment where `process.env` is not available. The workflow calls this
 * activity to learn how it should parse.
 */
export const getDocumentParser = async (): Promise<{
  parser: string;
  strict: boolean;
}> => {
  return { parser: DOCUMENT_PARSER, strict: DOCLING_STRICT };
};
