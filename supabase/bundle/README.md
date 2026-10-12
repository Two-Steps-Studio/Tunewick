# One-paste migrations

`tunewick-migracje.sql` applies every migration in `supabase/migrations` that the database has not
recorded yet. It is for the Supabase SQL Editor when the CLI or the "Database migrations" workflow
cannot be used: open the file on GitHub, press **Copy raw file**, paste into SQL Editor, **Run**.

Safe to run more than once; one transaction (a failure changes nothing). Regenerate after adding a
migration: `node scripts/build-migration-bundle.mjs > supabase/bundle/tunewick-migracje.sql`
(CI checks that it is current).
