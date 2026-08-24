CREATE FUNCTION "public"."guard_admin_role_change_history"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		NEW.created_at := clock_timestamp()::timestamptz(3);
		RETURN NEW;
	END IF;

	RAISE EXCEPTION 'admin_role_change_history is append-only'
		USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "admin_role_change_history_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."admin_role_change_history"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_admin_role_change_history"();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."admin_role_change_history" FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SEQUENCE "public"."admin_role_change_history_id_seq" FROM PUBLIC;
