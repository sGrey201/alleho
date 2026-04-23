CREATE TABLE "invites" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"invite_type" varchar(20) DEFAULT 'patient' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"invited_by_user_id" varchar NOT NULL,
	"accepted_user_id" varchar,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_accepted_user_id_users_id_fk" FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "invites_status_idx" ON "invites" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "invites_invited_by_idx" ON "invites" USING btree ("invited_by_user_id");
--> statement-breakpoint
CREATE INDEX "invites_expires_at_idx" ON "invites" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "invites_accepted_user_idx" ON "invites" USING btree ("accepted_user_id");
