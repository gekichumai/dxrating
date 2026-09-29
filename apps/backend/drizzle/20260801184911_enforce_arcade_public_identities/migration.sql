ALTER TABLE "arcade"."venues" DROP CONSTRAINT "venues_public_id_check";--> statement-breakpoint
ALTER TABLE "arcade"."installations" ALTER COLUMN "installation_identity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "arcade"."venues" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "arcade"."venues" ADD CONSTRAINT "venues_public_id_check" CHECK ("arcade"."venues"."public_id" ~ '^dven_[23456789abcdefghjkmnpqrstvwxyz]{10}$');