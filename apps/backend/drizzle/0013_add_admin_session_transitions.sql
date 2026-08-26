ALTER TABLE "user" ADD COLUMN "admin_authorization_not_before" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "admin_authorization_issued_at" timestamp with time zone DEFAULT now() NOT NULL;
