/* TASK - Uravu: "Delete my account and all data" (the app removes the vault files first, then calls this) */

-- 1) Deletes the signed-in user. Every table row goes with it (ON DELETE CASCADE on owner_id).

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_uid UUID := auth.uid();
BEGIN
	IF v_uid IS NULL THEN
		RAISE EXCEPTION 'not signed in';
	END IF;
	DELETE FROM
		auth.users AS U
	WHERE
		U.id = v_uid
	;
END
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
