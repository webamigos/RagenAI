/**
 * Read `ENCRYPTION_MASTER_KEY` in either encoding.
 *
 * The repository spent a while telling operators to use one form while one of
 * its three copies could only read the other: `.env.example` documents a
 * 64-character hex string, `apps/web` and `apps/api` required exactly that,
 * and `apps/worker` decoded base64 and demanded 32 bytes. A 64-character hex
 * string is *also* valid base64 input — it decodes to 48 bytes — so the
 * documented key did not fail as unparseable, it failed as "wrong length",
 * and no single value satisfied both. Fixed for the worker in #979; this is
 * that behaviour, single-sourced.
 *
 * Hex is tested first and strictly, so a hex key can never be re-read as 48
 * bytes of base64. Base64 still works, because deployments that followed the
 * worker rather than the documentation use it.
 */
export declare function parseMasterKey(key: string): Buffer;
//# sourceMappingURL=master-key.d.ts.map
