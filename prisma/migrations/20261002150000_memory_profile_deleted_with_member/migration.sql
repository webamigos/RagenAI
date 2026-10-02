-- Personal memory, Phase A5 (spec 2026-09-27-personal-memory-across-threads).
-- A member who is removed from an organization, or leaves it, takes their
-- memory profile with them, in the delete's own transaction.
--
-- A0 found that no Better Auth hook covers every way a membership ends: the
-- plugin's `/organization/remove-member` calls one, but `/organization/leave`,
-- the panel's `removeMember` action and apps/admin's platform removal do not.
-- All four delete the `members` row, so a trigger on that delete covers them,
-- and any path added later. `members` cascades from `organizations` and
-- `users`, so an org or user deletion reaches it too.
--
-- Deleting the profile cascades to `user_memories` and `user_memory_changes`
-- (their FKs to `user_memory_profiles` are ON DELETE CASCADE). The trigger
-- reads two columns of a Better Auth table and writes only ours, so it does not
-- write a library-owned table.
--
-- No backfill: nothing has written a profile yet — extraction is Phase C,
-- behind `personalMemory`, which defaults to false.

CREATE FUNCTION "user_memory_profiles_delete_for_member"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "user_memory_profiles"
   WHERE "organization_id" = OLD."organization_id"
     AND "user_id" = OLD."user_id";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "members_delete_memory_profile"
  AFTER DELETE ON "members"
  FOR EACH ROW EXECUTE FUNCTION "user_memory_profiles_delete_for_member"();
