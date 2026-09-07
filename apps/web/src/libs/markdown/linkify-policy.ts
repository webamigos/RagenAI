import type MarkdownIt from 'markdown-it';

/**
 * Only text that names its scheme becomes a link.
 *
 * ## Why a filename was turning into an external link
 *
 * `linkify: true` makes markdown-it hand plain text to linkify-it, which will
 * link a bare host with no scheme — `example.com` becomes
 * `http://example.com`. It decides what is a host by matching the trailing
 * label against the IANA TLD list, and that list is not a list of
 * "internet-looking things": it contains **`md`** (Moldova), and also `pl`,
 * `sh`, `zip`, `mov`, `it`, `me` and `py`.
 *
 * So `availability.md` — a document in the knowledge base — rendered as a
 * link to a Moldovan domain, and clicking a citation in an answer tried to
 * navigate off-site. This product's answers cite filenames by design, so that
 * is not an edge case: it is the common case, and every `.md`, `.pl` or `.sh`
 * file hits it.
 *
 * ## Why turn fuzzy links off rather than filter the TLD list
 *
 * Removing the offending TLDs means restating the whole list minus a
 * hand-picked few, which drifts the moment IANA delegates another one that
 * happens to look like a file extension — and the next one is not
 * predictable.
 *
 * What is lost is small and specific: text like `www.example.com`, written
 * without a scheme, stops becoming a link. Text written as
 * `https://example.com` still does, and so do ordinary markdown links.
 * Weighed against citations that navigate to a domain nobody here controls,
 * requiring the scheme is the cheaper side.
 *
 * `fuzzyEmail` is deliberately left on — a bare address is unambiguous and no
 * filename looks like one.
 */
export function applyLinkifyPolicy(md: MarkdownIt): MarkdownIt {
  md.linkify.set({ fuzzyLink: false, fuzzyIP: false });
  return md;
}
