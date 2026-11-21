/* TASK - Uravu cloud sync: one table per kind of data, each row owned by one signed-in user */

-- 1) Shared trigger: stamp server time, keep the newer edit (last write wins by updated_at)

CREATE OR REPLACE FUNCTION public.uravu_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	-- a phone with a wrong clock must not win every edit for years
	IF NEW.updated_at > now() + INTERVAL '1 day' THEN
		NEW.updated_at := now();
	END IF;
	IF TG_OP = 'UPDATE' THEN
		IF NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.id IS DISTINCT FROM OLD.id THEN
			RAISE EXCEPTION 'owner_id and id cannot change';
		END IF;
		-- an older edit arriving late: keep the row as it is
		IF NEW.updated_at < OLD.updated_at THEN
			RETURN NULL;
		END IF;
	END IF;
	NEW.server_at := clock_timestamp();
	RETURN NEW;
END
$$;

-- 2) Tables. Every row: owner_id, id, data, updated_at, deleted (soft delete), server_at (for pulling changes)

CREATE TABLE IF NOT EXISTS public.people
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 3000000)
)
;

CREATE TABLE IF NOT EXISTS public.links
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

CREATE TABLE IF NOT EXISTS public.events
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

CREATE TABLE IF NOT EXISTS public.likes
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

-- Documents: the numbers, notes, names and file names are encrypted on the phone and kept in "secret".
-- The CHECKs refuse any row that tries to store those fields in plain text.
CREATE TABLE IF NOT EXISTS public.docs
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,secret			TEXT
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (NOT (data ?| ARRAY['f', 'note', 'title', 'fileMeta']))
	,CHECK (secret IS NULL OR secret LIKE 'v1:%')
	,CHECK (octet_length(data::TEXT) + coalesce(octet_length(secret), 0) < 200000)
)
;

CREATE TABLE IF NOT EXISTS public.doc_terms
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,secret			TEXT
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (NOT (data ? 'f'))
	,CHECK (secret IS NULL OR secret LIKE 'v1:%')
	,CHECK (octet_length(data::TEXT) + coalesce(octet_length(secret), 0) < 100000)
)
;

CREATE TABLE IF NOT EXISTS public.functions
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

CREATE TABLE IF NOT EXISTS public.guests
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

-- Moi I gave at other people's functions
CREATE TABLE IF NOT EXISTS public.gifts
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 100000)
)
;

-- id 'main': who "me" is, language, view choices, removed links. id 'vault': PIN salt + check value (no PIN, no key).
CREATE TABLE IF NOT EXISTS public.settings
(
	 owner_id		UUID			NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE
	,id				TEXT			NOT NULL
	,data			JSONB			NOT NULL DEFAULT '{}'::JSONB
	,updated_at		TIMESTAMPTZ		NOT NULL
	,deleted		BOOLEAN			NOT NULL DEFAULT FALSE
	,server_at		TIMESTAMPTZ		NOT NULL DEFAULT clock_timestamp()
	,PRIMARY KEY (owner_id, id)
	,CHECK (octet_length(data::TEXT) < 1000000)
)
;

-- 3) For every table: index for pulling, trigger, Row Level Security (own rows only), grants

DO $$
DECLARE
	t TEXT;
BEGIN
	FOREACH t IN ARRAY ARRAY['people', 'links', 'events', 'likes', 'docs', 'doc_terms', 'functions', 'guests', 'gifts', 'settings']
	LOOP
		EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (owner_id, server_at)', t || '_owner_server_at', t);

		EXECUTE format('DROP TRIGGER IF EXISTS uravu_touch ON public.%I', t);
		EXECUTE format('CREATE TRIGGER uravu_touch BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.uravu_touch()', t);

		EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
		EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

		EXECUTE format('DROP POLICY IF EXISTS own_select ON public.%I', t);
		EXECUTE format('DROP POLICY IF EXISTS own_insert ON public.%I', t);
		EXECUTE format('DROP POLICY IF EXISTS own_update ON public.%I', t);
		EXECUTE format('DROP POLICY IF EXISTS own_delete ON public.%I', t);
		EXECUTE format('CREATE POLICY own_select ON public.%I FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id)', t);
		EXECUTE format('CREATE POLICY own_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = owner_id)', t);
		EXECUTE format('CREATE POLICY own_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id)', t);
		EXECUTE format('CREATE POLICY own_delete ON public.%I FOR DELETE TO authenticated USING ((SELECT auth.uid()) = owner_id)', t);

		-- signed-out visitors get nothing at all
		EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
		EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
	END LOOP;
END
$$;
