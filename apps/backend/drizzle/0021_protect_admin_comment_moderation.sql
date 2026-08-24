CREATE FUNCTION "public"."guard_admin_comment_moderation_history"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	previous_event public.admin_comment_moderation_history%ROWTYPE;
BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.created_at := clock_timestamp()::timestamptz(3);

		IF NEW.previous_event_id IS NULL THEN
			IF NEW.action IS DISTINCT FROM 'delete' THEN
				RAISE EXCEPTION 'the first comment moderation event must be a deletion'
					USING ERRCODE = '23514',
						CONSTRAINT = 'admin_comment_moderation_history_root_action_guard';
			END IF;

			IF EXISTS (
				SELECT 1
				FROM public.admin_comment_moderation_state
				WHERE comment_id = NEW.comment_id
			) THEN
				RAISE EXCEPTION 'an established comment moderation state requires a predecessor event'
					USING ERRCODE = '23514',
						CONSTRAINT = 'admin_comment_moderation_history_state_version_guard';
			END IF;
		ELSE
			SELECT *
			INTO previous_event
			FROM public.admin_comment_moderation_history
			WHERE id = NEW.previous_event_id
				AND comment_id = NEW.comment_id;

			IF NOT FOUND OR NOT EXISTS (
				SELECT 1
				FROM public.admin_comment_moderation_state
				WHERE comment_id = NEW.comment_id
					AND established_by_event_id = NEW.previous_event_id
			) THEN
				RAISE EXCEPTION 'previous comment moderation event must match the current state version'
					USING ERRCODE = '23514',
						CONSTRAINT = 'admin_comment_moderation_history_state_version_guard';
			END IF;

			IF (previous_event.action = 'delete' AND NEW.action IS DISTINCT FROM 'restore')
				OR (previous_event.action = 'restore' AND NEW.action IS DISTINCT FROM 'delete')
			THEN
				RAISE EXCEPTION 'comment moderation events must alternate between deletion and restoration'
					USING ERRCODE = '23514',
						CONSTRAINT = 'admin_comment_moderation_history_transition_guard';
			END IF;
		END IF;

		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'admin_comment_moderation_history is append-only'
		USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "admin_comment_moderation_history_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."admin_comment_moderation_history"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_admin_comment_moderation_history"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_admin_comment_moderation_state"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	establishing_event public.admin_comment_moderation_history%ROWTYPE;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'admin_comment_moderation_state rows must advance to a restoration event, not be deleted'
			USING ERRCODE = '55000';
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
CREATE TRIGGER "admin_comment_moderation_state_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."admin_comment_moderation_state"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_admin_comment_moderation_state"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_immutable_comment"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	RAISE EXCEPTION 'comments are immutable after insertion'
		USING ERRCODE = '55000',
			CONSTRAINT = 'comments_immutable_guard';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "comments_immutable_guard"
BEFORE UPDATE OR DELETE ON "public"."comments"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_immutable_comment"();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_admin_comment_moderation_history"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_admin_comment_moderation_state"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_immutable_comment"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."admin_comment_moderation_history" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_comment_moderation_history_id_seq" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."admin_comment_moderation_state" FROM PUBLIC;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "public"."comments" FROM PUBLIC;
