-- Add is_admin column to User table if it doesn't exist
ALTER TABLE User ADD COLUMN is_admin TINYINT(1) DEFAULT 0;

-- Create a default admin user (password is 'admin123' — change this!)
-- If a user with username 'admin' already exists, this will fail; delete the old one first or update it instead
INSERT INTO User (username, password_hash, name, contact, address, wallet, is_admin)
VALUES ('admin', 'admin123', 'System Administrator', '9999999999', 'System', 0.00, 1)
ON DUPLICATE KEY UPDATE is_admin = 1;
