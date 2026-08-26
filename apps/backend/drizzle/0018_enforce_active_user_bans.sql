-- Acquire every trigger target in the runtime's canonical user-first order
-- before creating any catalog object. NOWAIT makes a busy relation abort the
-- whole transactional migration immediately; a later deploy attempt can retry
-- without leaving functions or partially installed triggers behind.
LOCK TABLE
	"public"."user",
	"public"."session",
	"public"."account",
	"public"."passkey",
	"public"."admin_user_ban_state"
IN SHARE ROW EXCLUSIVE MODE NOWAIT;
--> statement-breakpoint
-- Serialize identity mutations with moderation transitions on the immutable
-- user row. This trigger-only migration rewrites no application rows.
CREATE FUNCTION "public"."assert_no_active_user_ban"("checked_user_ids" text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	locked_user_id text;
	evaluated_at timestamptz;
BEGIN
	-- Database identity mutations serialize on the authoritative user row.
	-- Request-wide advisory leases intentionally remain an application-layer
	-- protocol: acquiring another shared advisory lock from a handler's nested
	-- connection could queue behind moderation while the outer connection still
	-- holds the first shared lock. FOR KEY SHARE is the weakest row lock that
	-- still conflicts with moderation's FOR UPDATE.
	FOR locked_user_id IN
		SELECT DISTINCT requested.user_id
		FROM unnest(checked_user_ids) AS requested(user_id)
		WHERE requested.user_id IS NOT NULL
		ORDER BY requested.user_id
	LOOP
		PERFORM 1
		FROM public."user" AS users
		WHERE users.id = locked_user_id
		FOR KEY SHARE;
	END LOOP;

	-- Evaluate after every potentially blocking row lock has been acquired so
	-- temporary expiry is always decided by current PostgreSQL time.
	evaluated_at := clock_timestamp()::timestamptz(3);
	IF EXISTS (
		SELECT 1
		FROM unnest(checked_user_ids) AS requested(user_id)
		JOIN public.admin_user_ban_state AS state
			ON state.subject_user_id = requested.user_id
		WHERE state.established_action = 'ban'
			AND (state.ban_expires_at IS NULL OR state.ban_expires_at > evaluated_at)
	) THEN
		RAISE EXCEPTION 'account mutation is not permitted'
			USING ERRCODE = 'DXB01',
				CONSTRAINT = 'active_user_ban_write_guard';
	END IF;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."assert_no_active_user_ban"(text[]) FROM PUBLIC;
--> statement-breakpoint
-- Make the serialization rule intrinsic to the ban projection as well as the
-- application service. Direct or future state writers cannot bypass the user
-- row lock used by the identity-side guards.
CREATE FUNCTION "public"."lock_admin_user_ban_state_subject"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
	locked_advisory_key bigint;
	locked_user_id text;
BEGIN
	FOR locked_advisory_key IN
		SELECT DISTINCT hashtextextended(requested.user_id, 31520260824) AS lock_key
		FROM unnest(
			CASE
				WHEN TG_OP = 'UPDATE' THEN ARRAY[OLD.subject_user_id, NEW.subject_user_id]
				ELSE ARRAY[NEW.subject_user_id]
			END
		) AS requested(user_id)
		WHERE requested.user_id IS NOT NULL
		ORDER BY lock_key
	LOOP
		-- The exclusive advisory lock gives a queued moderation transition
		-- priority over later shared identity-write leases across all backend
		-- instances. The user row remains the authoritative data lock.
		PERFORM pg_advisory_xact_lock(locked_advisory_key);
	END LOOP;

	FOR locked_user_id IN
		SELECT DISTINCT requested.user_id
		FROM unnest(
			CASE
				WHEN TG_OP = 'UPDATE' THEN ARRAY[OLD.subject_user_id, NEW.subject_user_id]
				ELSE ARRAY[NEW.subject_user_id]
			END
		) AS requested(user_id)
		WHERE requested.user_id IS NOT NULL
		ORDER BY requested.user_id
	LOOP
		PERFORM 1
		FROM public."user" AS users
		WHERE users.id = locked_user_id
		FOR UPDATE;
	END LOOP;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."lock_admin_user_ban_state_subject"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "admin_user_ban_state_00_subject_lock"
BEFORE INSERT OR UPDATE ON "public"."admin_user_ban_state"
FOR EACH ROW
EXECUTE FUNCTION "public"."lock_admin_user_ban_state_subject"();
--> statement-breakpoint
-- Revoke only after PostgreSQL has resolved uniqueness conflicts and persisted
-- the active state. BEFORE INSERT side effects would also run for an
-- INSERT ... ON CONFLICT DO NOTHING candidate that never becomes authoritative.
CREATE FUNCTION "public"."revoke_active_user_ban_sessions"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.established_action = 'ban'
		AND (NEW.ban_expires_at IS NULL OR NEW.ban_expires_at > clock_timestamp())
	THEN
		-- Session-bound primary-auth windows and OAuth attempts cascade with the
		-- session rows. NOWAIT makes this entire state transition yield when a
		-- writer already owns a tuple, avoiding a tuple/advisory deadlock.
		PERFORM 1
		FROM public.session
		WHERE user_id = NEW.subject_user_id
		ORDER BY id
		FOR UPDATE NOWAIT;

		DELETE FROM public.session
		WHERE user_id = NEW.subject_user_id;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."revoke_active_user_ban_sessions"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "admin_user_ban_state_zz_session_revocation"
AFTER INSERT OR UPDATE ON "public"."admin_user_ban_state"
FOR EACH ROW
EXECUTE FUNCTION "public"."revoke_active_user_ban_sessions"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_active_user_ban_session"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[NEW.user_id]);
	ELSE
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.user_id, NEW.user_id]);
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_active_user_ban_session"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "active_user_ban_session_guard"
BEFORE INSERT OR UPDATE ON "public"."session"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_active_user_ban_session"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_active_user_ban_account"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[NEW.user_id]);
	ELSIF TG_OP = 'UPDATE' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.user_id, NEW.user_id]);
	ELSE
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.user_id]);
		RETURN OLD;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_active_user_ban_account"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "active_user_ban_account_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."account"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_active_user_ban_account"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_active_user_ban_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.id]);
		RETURN OLD;
	END IF;

	-- Administrator revocation must remain possible for a banned account. The
	-- only bypass is a non-elevating role transition and/or a monotonic advance
	-- of the administrator authorization floor; all profile and identity fields
	-- must remain byte-for-byte unchanged.
	IF NEW.id IS NOT DISTINCT FROM OLD.id
		AND NEW.name IS NOT DISTINCT FROM OLD.name
		AND NEW.email IS NOT DISTINCT FROM OLD.email
		AND NEW.email_verified IS NOT DISTINCT FROM OLD.email_verified
		AND NEW.image IS NOT DISTINCT FROM OLD.image
		AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
		AND NEW.updated_at >= OLD.updated_at
		AND (NEW.role IS NOT DISTINCT FROM OLD.role OR (OLD.role = 'admin' AND NEW.role = 'user'))
		AND NEW.admin_authorization_not_before >= OLD.admin_authorization_not_before
		AND (
			NEW.role IS DISTINCT FROM OLD.role
			OR NEW.admin_authorization_not_before > OLD.admin_authorization_not_before
		)
	THEN
		RETURN NEW;
	END IF;

	PERFORM public.assert_no_active_user_ban(ARRAY[OLD.id, NEW.id]);
	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_active_user_ban_user"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "active_user_ban_user_guard"
BEFORE UPDATE OR DELETE ON "public"."user"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_active_user_ban_user"();
--> statement-breakpoint
CREATE FUNCTION "public"."guard_active_user_ban_passkey"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[NEW.user_id]);
	ELSIF TG_OP = 'UPDATE' THEN
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.user_id, NEW.user_id]);
	ELSE
		PERFORM public.assert_no_active_user_ban(ARRAY[OLD.user_id]);
		RETURN OLD;
	END IF;

	RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_active_user_ban_passkey"() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER "active_user_ban_passkey_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."passkey"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_active_user_ban_passkey"();
