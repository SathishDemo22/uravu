/* TASK - Uravu document vault: private bucket, one folder per user, encrypted files only */

-- 1) Private bucket (no public links; files open only through short-lived signed URLs)

INSERT INTO storage.buckets
	(id, name, public, file_size_limit)
VALUES
	('vault', 'vault', FALSE, 26214400)
ON CONFLICT (id) DO UPDATE
SET
	 public = FALSE
	,file_size_limit = 26214400
;

-- 2) Storage RLS: a user can only touch files under vault/<their user id>/

DROP POLICY IF EXISTS uravu_vault_select ON storage.objects;
DROP POLICY IF EXISTS uravu_vault_insert ON storage.objects;
DROP POLICY IF EXISTS uravu_vault_update ON storage.objects;
DROP POLICY IF EXISTS uravu_vault_delete ON storage.objects;

CREATE POLICY uravu_vault_select ON storage.objects FOR SELECT TO authenticated
USING
	(
		bucket_id = 'vault'
		AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
	)
;

CREATE POLICY uravu_vault_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK
	(
		bucket_id = 'vault'
		AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
	)
;

CREATE POLICY uravu_vault_update ON storage.objects FOR UPDATE TO authenticated
USING
	(
		bucket_id = 'vault'
		AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
	)
WITH CHECK
	(
		bucket_id = 'vault'
		AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
	)
;

CREATE POLICY uravu_vault_delete ON storage.objects FOR DELETE TO authenticated
USING
	(
		bucket_id = 'vault'
		AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
	)
;
