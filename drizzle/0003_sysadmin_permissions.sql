ALTER TABLE users ADD admin_granted_at integer;
--> statement-breakpoint
DROP TRIGGER IF EXISTS keep_last_admin_role;
--> statement-breakpoint
DROP TRIGGER IF EXISTS keep_last_admin_account;
--> statement-breakpoint
-- Legacy versions recorded no promotion time. Preserve creation order as a deterministic fallback.
UPDATE users SET role='sysadmin' WHERE id=(SELECT id FROM users WHERE role='admin' ORDER BY rowid LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role='sysadmin');
--> statement-breakpoint
CREATE UNIQUE INDEX idx_users_single_sysadmin ON users(role) WHERE role='sysadmin';
--> statement-breakpoint
CREATE TRIGGER keep_sysadmin_role BEFORE UPDATE OF role,id ON users
WHEN OLD.role='sysadmin' AND (NEW.role!='sysadmin' OR NEW.id!=OLD.id)
  AND NOT EXISTS (SELECT 1 FROM app_state WHERE id=1 AND restore_token!='')
BEGIN SELECT RAISE(ABORT, 'protected_sysadmin'); END;
--> statement-breakpoint
CREATE TRIGGER keep_sysadmin_account BEFORE DELETE ON users
WHEN OLD.role='sysadmin' AND NOT EXISTS (SELECT 1 FROM app_state WHERE id=1 AND restore_token!='')
BEGIN SELECT RAISE(ABORT, 'protected_sysadmin'); END;
--> statement-breakpoint
CREATE TRIGGER valid_user_role_insert BEFORE INSERT ON users
WHEN NEW.role NOT IN ('student','instructor','admin','sysadmin')
BEGIN SELECT RAISE(ABORT, 'forbidden'); END;
--> statement-breakpoint
CREATE TRIGGER valid_user_role_update BEFORE UPDATE OF role ON users
WHEN NEW.role NOT IN ('student','instructor','admin','sysadmin')
BEGIN SELECT RAISE(ABORT, 'forbidden'); END;
--> statement-breakpoint
CREATE TRIGGER record_admin_grant_insert AFTER INSERT ON users
WHEN NEW.role IN ('admin','sysadmin') AND NEW.admin_granted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM app_state WHERE id=1 AND restore_token!='')
BEGIN UPDATE users SET admin_granted_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER record_admin_grant_update AFTER UPDATE OF role ON users
WHEN NEW.role IN ('admin','sysadmin') AND OLD.role NOT IN ('admin','sysadmin') AND NEW.admin_granted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM app_state WHERE id=1 AND restore_token!='')
BEGIN UPDATE users SET admin_granted_at=CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) WHERE id=NEW.id; END;
