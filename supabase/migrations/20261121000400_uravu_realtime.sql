/* TASK - Uravu realtime: tell signed-in devices the moment one of their rows changes */

-- 1) Add the tables to Supabase's realtime publication (safe to run again).
--    Row Level Security still applies: a device only hears about its own user's rows.

DO $$
DECLARE
	t TEXT;
BEGIN
	FOREACH t IN ARRAY ARRAY['people', 'links', 'events', 'likes', 'docs', 'doc_terms', 'functions', 'guests', 'gifts', 'settings']
	LOOP
		IF NOT EXISTS
			(
				SELECT
					1
				FROM
					pg_publication_tables		AS PT
				WHERE
					PT.pubname = 'supabase_realtime'
					AND PT.schemaname = 'public'
					AND PT.tablename = t
			)
		THEN
			EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
		END IF;
	END LOOP;
END
$$;

-- Check: should list all 10 tables
SELECT
	PT.tablename		AS "Table"
FROM
	pg_publication_tables	AS PT
WHERE
	PT.pubname = 'supabase_realtime'
	AND PT.schemaname = 'public'
ORDER BY
	PT.tablename
;
