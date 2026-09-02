-- Records a platform administrator acting on an account (ban, unban, rename)
-- from apps/admin. Kept distinct from ADMIN_SETTINGS_CHANGED so the incidents
-- view can separate configuration edits from actions taken against a person.
--
-- Adding an enum value is non-breaking: existing rows are untouched and older
-- application versions never produce it.
ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'ADMIN_USER_ACTION';
