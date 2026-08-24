CREATE FUNCTION "public"."guard_admin_user_ban_history"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	previous_event public.admin_user_ban_history%ROWTYPE;
BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.created_at := clock_timestamp()::timestamptz(3);

		IF NEW.previous_event_id IS NULL THEN
			IF NEW.action IS DISTINCT FROM 'ban' THEN
				RAISE EXCEPTION 'the first event in a ban history must be a ban'
					USING ERRCODE = '23514',
						CONSTRAINT = 'admin_user_ban_history_root_action_guard';
			END IF;

			IF EXISTS (
				SELECT 1
				FROM public.admin_user_ban_state
				WHERE subject_user_id = NEW.subject_user_id
			) THEN
				RAISE EXCEPTION 'an established ban state requires a predecessor event'
					USING ERRCODE = '23514';
			END IF;

			NEW.ban_started_at := NEW.created_at;
		ELSE
			SELECT *
			INTO previous_event
			FROM public.admin_user_ban_history
			WHERE id = NEW.previous_event_id
				AND subject_user_id = NEW.subject_user_id;

			IF NOT FOUND THEN
				RAISE EXCEPTION 'previous ban event must belong to the same subject'
					USING ERRCODE = '23514';
			END IF;

			IF NOT EXISTS (
				SELECT 1
				FROM public.admin_user_ban_state
				WHERE subject_user_id = NEW.subject_user_id
					AND established_by_event_id = NEW.previous_event_id
			) THEN
				RAISE EXCEPTION 'previous ban event must match the current state version'
					USING ERRCODE = '23514';
			END IF;

			IF NEW.action = 'unban' THEN
				IF previous_event.action IS DISTINCT FROM 'ban'
					OR (previous_event.expires_at IS NOT NULL AND previous_event.expires_at <= NEW.created_at)
				THEN
					RAISE EXCEPTION 'only a currently active ban can be followed by an unban'
						USING ERRCODE = '23514',
							CONSTRAINT = 'admin_user_ban_history_active_unban_guard';
				END IF;
			ELSIF NEW.action = 'ban' THEN
				IF previous_event.action = 'ban'
					AND (previous_event.expires_at IS NULL OR previous_event.expires_at > NEW.created_at)
				THEN
					NEW.ban_started_at := previous_event.ban_started_at;
				ELSE
					NEW.ban_started_at := NEW.created_at;
				END IF;
			END IF;
		END IF;

		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'admin_user_ban_history is append-only'
		USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "admin_user_ban_history_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."admin_user_ban_history"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_admin_user_ban_history"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_admin_user_ban_state"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	establishing_event public.admin_user_ban_history%ROWTYPE;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'admin_user_ban_state rows must be advanced to an unban event, not deleted'
			USING ERRCODE = '55000';
	END IF;

	SELECT *
	INTO establishing_event
	FROM public.admin_user_ban_history
	WHERE id = NEW.established_by_event_id;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'establishing ban event does not exist'
			USING ERRCODE = '23503';
	END IF;

	IF NEW.subject_user_id IS DISTINCT FROM establishing_event.subject_user_id
		OR NEW.actor_user_id IS DISTINCT FROM establishing_event.actor_user_id
		OR NEW.established_action IS DISTINCT FROM establishing_event.action
	THEN
		RAISE EXCEPTION 'ban state must reference the same subject, actor, and action as its establishing event'
			USING ERRCODE = '23514';
	END IF;

	IF TG_OP = 'INSERT' AND establishing_event.previous_event_id IS NOT NULL THEN
		RAISE EXCEPTION 'the first ban state event cannot have a predecessor'
			USING ERRCODE = '23514';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.subject_user_id IS DISTINCT FROM OLD.subject_user_id
			OR NEW.established_by_event_id IS NOT DISTINCT FROM OLD.established_by_event_id
			OR establishing_event.previous_event_id IS DISTINCT FROM OLD.established_by_event_id
		THEN
			RAISE EXCEPTION 'ban state updates must advance exactly one event in the same subject chain'
				USING ERRCODE = '23514';
		END IF;
	END IF;

	IF establishing_event.action = 'ban' THEN
		IF NEW.ban_started_at IS DISTINCT FROM establishing_event.ban_started_at
			OR NEW.ban_expires_at IS DISTINCT FROM establishing_event.expires_at
			OR NEW.ban_reason IS DISTINCT FROM establishing_event.reason
		THEN
			RAISE EXCEPTION 'active ban state must exactly match its establishing event snapshot'
				USING ERRCODE = '23514';
		END IF;
	ELSIF NEW.ban_started_at IS NOT NULL
		OR NEW.ban_expires_at IS NOT NULL
		OR NEW.ban_reason IS NOT NULL
	THEN
		RAISE EXCEPTION 'unbanned state cannot retain an active-ban snapshot'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "admin_user_ban_state_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."admin_user_ban_state"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_admin_user_ban_state"();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."admin_user_ban_history" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_user_ban_history_id_seq" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."admin_user_ban_state" FROM PUBLIC;
