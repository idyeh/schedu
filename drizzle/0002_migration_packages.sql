CREATE TABLE `app_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`restore_ready` integer DEFAULT 0 NOT NULL,
	`reset_at` integer,
	`restore_token` text DEFAULT '' NOT NULL
);

--> statement-breakpoint
INSERT INTO app_state(id,restore_ready,reset_at,restore_token) VALUES(1,0,NULL,'');
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_users_insert AFTER INSERT ON users
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_users_update AFTER UPDATE ON users
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_users_delete AFTER DELETE ON users
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_bookings_insert AFTER INSERT ON bookings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_bookings_update AFTER UPDATE ON bookings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_bookings_delete AFTER DELETE ON bookings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_settings_insert AFTER INSERT ON settings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_settings_update AFTER UPDATE ON settings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
--> statement-breakpoint
CREATE TRIGGER invalidate_restore_settings_delete AFTER DELETE ON settings
BEGIN
  UPDATE app_state SET restore_ready=0 WHERE id=1 AND restore_ready=1;
END;
