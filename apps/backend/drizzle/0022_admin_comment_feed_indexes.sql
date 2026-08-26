ALTER TABLE "admin_comment_moderation_state" ADD COLUMN "comment_created_at" timestamp;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."guard_admin_comment_moderation_state"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	establishing_event public.admin_comment_moderation_history%ROWTYPE;
	immutable_comment_created_at public.comments.created_at%TYPE;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'admin_comment_moderation_state rows must advance to a restoration event, not be deleted'
			USING ERRCODE = '55000';
	END IF;

	SELECT created_at
	INTO immutable_comment_created_at
	FROM public.comments
	WHERE id = NEW.comment_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'comment moderation state references a missing comment'
			USING ERRCODE = '23503',
				CONSTRAINT = 'admin_comment_moderation_state_comment_created_at_guard';
	END IF;

	IF NEW.comment_created_at IS NULL THEN
		NEW.comment_created_at := immutable_comment_created_at;
	ELSIF NEW.comment_created_at IS DISTINCT FROM immutable_comment_created_at THEN
		RAISE EXCEPTION 'comment moderation state creation time must match its immutable comment'
			USING ERRCODE = '23514',
				CONSTRAINT = 'admin_comment_moderation_state_comment_created_at_guard';
	END IF;

	SELECT *
	INTO establishing_event
	FROM public.admin_comment_moderation_history
	WHERE id = NEW.established_by_event_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'establishing comment moderation event does not exist'
			USING ERRCODE = '23503';
	END IF;

	IF NEW.comment_id IS DISTINCT FROM establishing_event.comment_id
		OR NEW.actor_user_id IS DISTINCT FROM establishing_event.actor_user_id
		OR NEW.established_action IS DISTINCT FROM establishing_event.action
		OR NEW.moderated_at IS DISTINCT FROM establishing_event.created_at
		OR NEW.deletion_reason IS DISTINCT FROM (
			CASE WHEN establishing_event.action = 'delete' THEN establishing_event.reason ELSE NULL END
		)
	THEN
		RAISE EXCEPTION 'comment moderation state must exactly match its establishing event snapshot'
			USING ERRCODE = '23514',
				CONSTRAINT = 'admin_comment_moderation_state_projection_guard';
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF establishing_event.previous_event_id IS NOT NULL
			OR establishing_event.action IS DISTINCT FROM 'delete'
		THEN
			RAISE EXCEPTION 'the first comment moderation state must be established by a root deletion event'
				USING ERRCODE = '23514',
					CONSTRAINT = 'admin_comment_moderation_state_advance_guard';
		END IF;
	ELSIF OLD.comment_created_at IS NULL
		AND NEW.comment_created_at IS NOT NULL
		AND NEW.comment_id IS NOT DISTINCT FROM OLD.comment_id
		AND NEW.established_action IS NOT DISTINCT FROM OLD.established_action
		AND NEW.deletion_reason IS NOT DISTINCT FROM OLD.deletion_reason
		AND NEW.actor_user_id IS NOT DISTINCT FROM OLD.actor_user_id
		AND NEW.established_by_event_id IS NOT DISTINCT FROM OLD.established_by_event_id
		AND NEW.moderated_at IS NOT DISTINCT FROM OLD.moderated_at
	THEN
		-- The resumable backfill may populate only this derived value. Every
		-- authoritative moderation field and its version must remain unchanged.
		NULL;
	ELSIF NEW.comment_id IS DISTINCT FROM OLD.comment_id
		OR NEW.established_by_event_id IS NOT DISTINCT FROM OLD.established_by_event_id
		OR establishing_event.previous_event_id IS DISTINCT FROM OLD.established_by_event_id
	THEN
		RAISE EXCEPTION 'comment moderation state updates must advance exactly one event in the same comment chain'
			USING ERRCODE = '23514',
				CONSTRAINT = 'admin_comment_moderation_state_advance_guard';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
-- The five reviewed CREATE INDEX CONCURRENTLY operations are recorded in
-- non-transactional-migrations. This generated entry owns only the nullable
-- expansion and mixed-version database guard; its snapshot records the final
-- intended index metadata without running index DDL in this transaction.
