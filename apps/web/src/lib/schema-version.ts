/**
 * The newest database migration this build of the app expects (supabase/migrations). The admin
 * panel compares it with the database to say when the migration bundle still has to be applied.
 * schema-version.test.ts keeps it in step with the migrations folder.
 */
export const SCHEMA_VERSION = "20261016090000";
