CREATE FUNCTION "public"."guard_chart_report"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	source_url text;
	authority text;
	resource_path text;
	snapshot jsonb;
	entry record;
	numeric_value numeric;
	compact_bytes integer;
	entry_count integer;
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'chart reports are retained indefinitely'
			USING ERRCODE = '55000',
				CONSTRAINT = 'chart_reports_retention_guard';
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF NEW.state IS DISTINCT FROM 'open'
			OR NEW.closed_by_user_id IS NOT NULL
			OR NEW.closed_at IS NOT NULL
			OR NEW.close_note IS NOT NULL
		THEN
			RAISE EXCEPTION 'new chart reports must start open without closure metadata'
				USING ERRCODE = '23514',
					CONSTRAINT = 'chart_reports_initial_state_guard';
		END IF;

		IF NEW.target_field_key = 'chart.multiver_internal_levels' THEN
			FOR snapshot IN
				SELECT candidate
				FROM (VALUES (NEW.current_value), (NEW.proposed_value)) AS snapshots(candidate)
			LOOP
				IF jsonb_typeof(snapshot) = 'null' THEN
					CONTINUE;
				END IF;
				IF jsonb_typeof(snapshot) IS DISTINCT FROM 'object' THEN
					RAISE EXCEPTION 'chart report number-map snapshots are invalid'
						USING ERRCODE = '23514',
							CONSTRAINT = 'chart_reports_number_map_guard';
				END IF;
				compact_bytes := 2;
				entry_count := 0;
				FOR entry IN SELECT key, value FROM jsonb_each(snapshot)
				LOOP
					IF length(entry.key) NOT BETWEEN 1 AND 255
						OR jsonb_typeof(entry.value) IS DISTINCT FROM 'number'
					THEN
						RAISE EXCEPTION 'chart report number-map snapshots are invalid'
							USING ERRCODE = '23514',
								CONSTRAINT = 'chart_reports_number_map_guard';
					END IF;

					numeric_value := (entry.value #>> '{}')::numeric;
					IF numeric_value NOT BETWEEN 0 AND 100
						OR scale(numeric_value) > 3
						OR trunc(numeric_value * 1000) IS DISTINCT FROM numeric_value * 1000
					THEN
						RAISE EXCEPTION 'chart report number-map snapshots are invalid'
							USING ERRCODE = '23514',
								CONSTRAINT = 'chart_reports_number_map_guard';
					END IF;

					entry_count := entry_count + 1;
					IF entry_count > 100 THEN
						RAISE EXCEPTION 'chart report number-map snapshots are invalid'
							USING ERRCODE = '23514',
								CONSTRAINT = 'chart_reports_number_map_guard';
					END IF;
					compact_bytes := compact_bytes
						+ CASE WHEN entry_count = 1 THEN 0 ELSE 1 END
						+ octet_length(to_jsonb(entry.key)::text)
						+ 1
						+ octet_length(entry.value::text);
				END LOOP;

				IF compact_bytes > 4096 THEN
					RAISE EXCEPTION 'chart report number-map snapshots are invalid'
						USING ERRCODE = '23514',
							CONSTRAINT = 'chart_reports_number_map_guard';
				END IF;
			END LOOP;
		END IF;

		FOREACH source_url IN ARRAY NEW.source_urls
		LOOP
			authority := substring(source_url FROM '^https?://([^/?#]+)');
			resource_path := substring(source_url FROM '^https?://[^/?#]+([^?#]*)');
			IF source_url IS NULL
				OR length(source_url) NOT BETWEEN 1 AND 2048
				OR source_url IS DISTINCT FROM btrim(source_url)
				OR source_url !~ '^https?://[^/?#]+/'
				OR source_url ~ '[[:space:]]'
				OR source_url ~ '[^ -~]'
				OR position(chr(92) IN source_url) > 0
				OR authority IS NULL
				OR authority IS DISTINCT FROM lower(authority)
				OR position('@' IN authority) > 0
				OR authority !~ '^([^:\[\]]+|\[[0-9a-f:.]+\])(:[1-9][0-9]{0,4})?$'
				OR COALESCE(substring(authority FROM ':([1-9][0-9]{0,4})$')::integer > 65535, FALSE)
				OR (source_url LIKE 'http://%' AND authority ~ ':80$')
				OR (source_url LIKE 'https://%' AND authority ~ ':443$')
				OR lower(resource_path) ~ '/(\.|%2e)(\.|%2e)?(/|$)'
			THEN
				RAISE EXCEPTION 'chart report source URLs must be normalized credential-free HTTP(S) references'
					USING ERRCODE = '23514',
						CONSTRAINT = 'chart_reports_source_url_guard';
			END IF;
		END LOOP;

		NEW.created_at := clock_timestamp()::timestamptz(3);
		RETURN NEW;
	END IF;

	IF OLD.state IS DISTINCT FROM 'open' THEN
		RAISE EXCEPTION 'closed chart reports cannot be changed'
			USING ERRCODE = '55000',
				CONSTRAINT = 'chart_reports_closed_immutable_guard';
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.reporter_user_id IS DISTINCT FROM OLD.reporter_user_id
		OR NEW.stable_song_id IS DISTINCT FROM OLD.stable_song_id
		OR NEW.stable_chart_id IS DISTINCT FROM OLD.stable_chart_id
		OR NEW.publication_channel IS DISTINCT FROM OLD.publication_channel
		OR NEW.publication_catalog_run_id IS DISTINCT FROM OLD.publication_catalog_run_id
		OR NEW.publication_revision IS DISTINCT FROM OLD.publication_revision
		OR NEW.publication_fingerprint_sha256 IS DISTINCT FROM OLD.publication_fingerprint_sha256
		OR NEW.target_field_key IS DISTINCT FROM OLD.target_field_key
		OR NEW.category IS DISTINCT FROM OLD.category
		OR NEW.current_value IS DISTINCT FROM OLD.current_value
		OR NEW.proposed_value IS DISTINCT FROM OLD.proposed_value
		OR NEW.explanation IS DISTINCT FROM OLD.explanation
		OR NEW.source_urls IS DISTINCT FROM OLD.source_urls
		OR NEW.created_at IS DISTINCT FROM OLD.created_at
	THEN
		RAISE EXCEPTION 'chart report submission content is immutable'
			USING ERRCODE = '55000',
				CONSTRAINT = 'chart_reports_submission_immutable_guard';
	END IF;

	IF NEW.state IS DISTINCT FROM 'closed'
		OR NEW.closed_by_user_id IS NULL
	THEN
		RAISE EXCEPTION 'an open chart report may only transition once to a complete closure'
			USING ERRCODE = '23514',
				CONSTRAINT = 'chart_reports_close_transition_guard';
	END IF;

	NEW.closed_at := clock_timestamp()::timestamptz(3);
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "chart_reports_guard"
BEFORE INSERT OR UPDATE OR DELETE ON "public"."chart_reports"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_chart_report"();
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON FUNCTION "public"."guard_chart_report"() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON TABLE "public"."chart_reports" FROM PUBLIC;
