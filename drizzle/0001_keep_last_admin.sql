CREATE TRIGGER keep_last_admin_role
BEFORE UPDATE OF role ON users
WHEN OLD.role = 'admin' AND NEW.role != 'admin'
  AND (SELECT count(*) FROM users WHERE role = 'admin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin');
END;
--> statement-breakpoint
CREATE TRIGGER keep_last_admin_account
BEFORE DELETE ON users
WHEN OLD.role = 'admin'
  AND (SELECT count(*) FROM users WHERE role = 'admin') <= 1
BEGIN
  SELECT RAISE(ABORT, 'last_admin');
END;
