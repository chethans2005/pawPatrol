-- routines_and_triggers.sql
-- Stored procedures, functions and triggers for Pet Adoption and Inventory Management
-- Tailored to the schema defined in pet_centre.sql
-- Assumptions: MySQL 5.7+/8.0. Run in the target database (USE your_db;) before executing.

DELIMITER $$

-- DROP existing routines/triggers if present (safe to re-run)
DROP PROCEDURE IF EXISTS apply_for_adoption$$
DROP PROCEDURE IF EXISTS approve_adoption$$
DROP PROCEDURE IF EXISTS reject_adoption$$
DROP PROCEDURE IF EXISTS accept_donor_application$$
DROP PROCEDURE IF EXISTS list_available_pets$$
DROP PROCEDURE IF EXISTS add_vet_record$$
DROP PROCEDURE IF EXISTS place_shop_order$$
DROP FUNCTION IF EXISTS check_pet_eligibility$$

DROP TRIGGER IF EXISTS shoporder_before_insert$$
DROP TRIGGER IF EXISTS shoporder_after_insert$$
DROP TRIGGER IF EXISTS shoporder_after_delete$$
DROP TRIGGER IF EXISTS shoporder_before_update$$
DROP TRIGGER IF EXISTS shoporder_after_update$$
DROP TRIGGER IF EXISTS donorapplication_after_update$$

-- 1) Procedure: apply_for_adoption (enhanced: prevents duplicate pending applications)
CREATE PROCEDURE apply_for_adoption(IN p_user_id INT, IN p_pet_id INT)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_existing_pending INT;
  
  -- Check if user exists
  IF NOT EXISTS (SELECT 1 FROM User WHERE user_id = p_user_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
  END IF;
  
  SELECT status INTO v_status FROM Pet WHERE pet_id = p_pet_id FOR UPDATE;
  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet not found';
  END IF;
  IF v_status <> 'Available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet is not available for adoption';
  END IF;

  -- Prevent donor from adopting their own donated pet
  IF EXISTS (
      SELECT 1 FROM DonorApplication da
      WHERE da.pet_id = p_pet_id AND da.user_id = p_user_id AND da.status = 'approved'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You cannot adopt a pet you donated';
  END IF;
  
  -- Prevent duplicate pending applications from same user for same pet
  SELECT COUNT(*) INTO v_existing_pending
    FROM AdopterApplication
    WHERE user_id = p_user_id AND pet_id = p_pet_id AND status = 'pending';
  
  IF v_existing_pending > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'You already have a pending application for this pet';
  END IF;
  
  INSERT INTO AdopterApplication (user_id, pet_id, status, date)
    VALUES (p_user_id, p_pet_id, 'pending', CURDATE());
END$$

-- 2) Procedure: approve adoption (enhanced: requires vet record, rejects competing applications)
CREATE PROCEDURE approve_adoption(IN p_application_id INT)
BEGIN
  DECLARE v_user INT;
  DECLARE v_pet INT;
  DECLARE v_app_status VARCHAR(20);
  DECLARE v_pet_status VARCHAR(20);
  DECLARE v_price DECIMAL(10,2);
  DECLARE v_wallet DECIMAL(10,2);
  DECLARE v_shelter INT;
  DECLARE v_vet_count INT;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL; -- preserve original error message for client
  END;

  START TRANSACTION;

  SELECT user_id, pet_id, status INTO v_user, v_pet, v_app_status
    FROM AdopterApplication WHERE application_id = p_application_id FOR UPDATE;

  IF v_app_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application not found';
  END IF;
  IF v_app_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application is not pending';
  END IF;

  SELECT status, price, shelter_id INTO v_pet_status, v_price, v_shelter
    FROM Pet WHERE pet_id = v_pet FOR UPDATE;

  IF v_pet_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet not found';
  END IF;
  IF v_pet_status <> 'Available' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet is not available for adoption';
  END IF;

  -- Prevent donor from adopting their own donated pet
  IF EXISTS (
      SELECT 1 FROM DonorApplication da
      WHERE da.pet_id = v_pet AND da.user_id = v_user AND da.status = 'approved'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donors cannot adopt their own donated pet';
  END IF;

  -- Require at least one vet record before approval
  SELECT COUNT(*) INTO v_vet_count FROM VetRecord WHERE pet_id = v_pet;
  IF v_vet_count = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet must have at least one veterinary checkup before adoption';
  END IF;

  -- check buyer funds if price > 0
  IF v_price > 0 THEN
    SELECT wallet INTO v_wallet FROM User WHERE user_id = v_user FOR UPDATE;
    IF v_wallet IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
    END IF;
    IF v_wallet < v_price THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient funds in user wallet';
    END IF;

    UPDATE User SET wallet = wallet - v_price WHERE user_id = v_user;
    UPDATE Shelter SET revenue = revenue + v_price WHERE shelter_id = v_shelter;
  END IF;

  UPDATE Pet SET status = 'Adopted' WHERE pet_id = v_pet;
  UPDATE AdopterApplication SET status = 'approved' WHERE application_id = p_application_id;
  
  -- Auto-reject all other pending applications for this pet
  UPDATE AdopterApplication
    SET status = 'rejected'
    WHERE pet_id = v_pet AND status = 'pending' AND application_id <> p_application_id;

  COMMIT;
END$$

-- 3) Procedure: reject adoption
CREATE PROCEDURE reject_adoption(IN p_application_id INT, IN p_reason VARCHAR(255))
BEGIN
  UPDATE AdopterApplication
    SET status = 'rejected'
    WHERE application_id = p_application_id AND status = 'pending';
  -- optional: log reason to a separate table if required
END$$

-- 4) Procedure: accept donor application (enhanced: auto-assigns to default shelter, validates data)
CREATE PROCEDURE accept_donor_application(IN p_donor_app_id INT, IN p_shelter_id INT)
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_name VARCHAR(100);
  DECLARE v_species VARCHAR(50);
  DECLARE v_breed VARCHAR(50);
  DECLARE v_age INT;
  DECLARE v_health TEXT;
  DECLARE v_user INT;
  DECLARE v_pet_id INT;
  DECLARE v_default_shelter INT;

  SELECT status, pet_name, species, breed, age, health_status, user_id
    INTO v_status, v_name, v_species, v_breed, v_age, v_health, v_user
    FROM DonorApplication WHERE donor_app_id = p_donor_app_id FOR UPDATE;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor application not found';
  END IF;
  IF v_status <> 'pending' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor application is not pending';
  END IF;
  
  -- Validate required fields
  IF v_name IS NULL OR v_species IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet name and species are required';
  END IF;

  -- Use provided shelter_id or pick the first available shelter
  IF p_shelter_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM Shelter WHERE shelter_id = p_shelter_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Specified shelter not found';
    END IF;
    SET v_default_shelter = p_shelter_id;
  ELSE
    SELECT shelter_id INTO v_default_shelter FROM Shelter ORDER BY shelter_id LIMIT 1;
    IF v_default_shelter IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No shelter available to assign donated pet';
    END IF;
  END IF;

  INSERT INTO Pet (name, species, breed, age, health_status, price, shelter_id, caretaker_id, status)
    VALUES (v_name, v_species, v_breed, v_age, v_health, 0.00, v_default_shelter, NULL, 'Available');

  SET v_pet_id = LAST_INSERT_ID();

  UPDATE DonorApplication SET pet_id = v_pet_id, status = 'approved', application_date = CURDATE()
    WHERE donor_app_id = p_donor_app_id;
END$$

-- 5) Procedure: list available pets for a shelter (returns resultset)
CREATE PROCEDURE list_available_pets(IN p_shelter_id INT)
BEGIN
  SELECT pet_id, name, species, breed, age, health_status, price, shelter_id
    FROM Pet
    WHERE status = 'Available' AND (p_shelter_id IS NULL OR shelter_id = p_shelter_id)
    ORDER BY pet_id;
END$$

-- 6) Function: check if pet is eligible for adoption (has vet record)
CREATE FUNCTION check_pet_eligibility(p_pet_id INT)
RETURNS VARCHAR(20)
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_vet_count INT;
  
  SELECT status INTO v_status FROM Pet WHERE pet_id = p_pet_id;
  
  IF v_status IS NULL THEN
    RETURN 'Not Found';
  END IF;
  
  IF v_status <> 'Available' THEN
    RETURN 'Not Available';
  END IF;
  
  SELECT COUNT(*) INTO v_vet_count FROM VetRecord WHERE pet_id = p_pet_id;
  
  IF v_vet_count = 0 THEN
    RETURN 'No Vet Record';
  END IF;
  
  RETURN 'Eligible';
END$$

-- 7) Procedure: add vet record with validation
CREATE PROCEDURE add_vet_record(
  IN p_pet_id INT,
  IN p_checkup_date DATE,
  IN p_remarks VARCHAR(255),
  IN p_treatment VARCHAR(255)
)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Pet WHERE pet_id = p_pet_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pet not found';
  END IF;
  
  IF p_checkup_date IS NULL THEN
    SET p_checkup_date = CURDATE();
  END IF;
  
  INSERT INTO VetRecord (pet_id, checkup_date, remarks, treatment)
    VALUES (p_pet_id, p_checkup_date, p_remarks, p_treatment);
END$$

-- 8) Procedure: place shop order with transaction handling
CREATE PROCEDURE place_shop_order(
  IN p_user_id INT,
  IN p_item_id INT,
  IN p_quantity INT
)
BEGIN
  DECLARE v_price DECIMAL(10,2);
  DECLARE v_total DECIMAL(10,2);
  DECLARE v_wallet DECIMAL(10,2);
  DECLARE v_shelter_id INT;
  DECLARE v_stock INT;
  
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'place_shop_order: transaction failed';
  END;
  
  START TRANSACTION;
  
  -- Validate user
  SELECT wallet INTO v_wallet FROM User WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User not found';
  END IF;
  
  -- Validate item and check stock
  SELECT price, shelter_id, stock_quantity INTO v_price, v_shelter_id, v_stock
    FROM ShopItem WHERE item_id = p_item_id FOR UPDATE;
    
  IF v_price IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Item not found';
  END IF;
  
  IF p_quantity <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Quantity must be positive';
  END IF;
  
  IF v_stock < p_quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock';
  END IF;
  
  SET v_total = v_price * p_quantity;
  
  IF v_wallet < v_total THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient funds in wallet';
  END IF;
  
  -- Deduct from user wallet
  UPDATE User SET wallet = wallet - v_total WHERE user_id = p_user_id;
  
  -- Add to shelter revenue
  UPDATE Shelter SET revenue = revenue + v_total WHERE shelter_id = v_shelter_id;
  
  -- Insert order (triggers will handle stock adjustment)
  INSERT INTO ShopOrder (user_id, shelter_id, item_id, quantity, price, order_date)
    VALUES (p_user_id, v_shelter_id, p_item_id, p_quantity, v_total, CURDATE());
  
  COMMIT;
END$$

-- 9) Triggers: shop order inventory management
-- BEFORE INSERT: ensure enough stock
CREATE TRIGGER shoporder_before_insert
BEFORE INSERT ON ShopOrder
FOR EACH ROW
BEGIN
  DECLARE v_stock INT;
  SELECT stock_quantity INTO v_stock FROM ShopItem WHERE item_id = NEW.item_id FOR UPDATE;
  IF v_stock IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ShopItem not found';
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid order quantity';
  END IF;
  IF v_stock < NEW.quantity THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock for ShopItem';
  END IF;
END$$

-- AFTER INSERT: decrement stock
CREATE TRIGGER shoporder_after_insert
AFTER INSERT ON ShopOrder
FOR EACH ROW
BEGIN
  UPDATE ShopItem SET stock_quantity = stock_quantity - NEW.quantity WHERE item_id = NEW.item_id;
END$$

-- AFTER DELETE: restock
CREATE TRIGGER shoporder_after_delete
AFTER DELETE ON ShopOrder
FOR EACH ROW
BEGIN
  UPDATE ShopItem SET stock_quantity = stock_quantity + OLD.quantity WHERE item_id = OLD.item_id;
END$$

-- BEFORE UPDATE: when quantity changes, ensure stock is available for increase and adjust on success
CREATE TRIGGER shoporder_before_update
BEFORE UPDATE ON ShopOrder
FOR EACH ROW
BEGIN
  DECLARE v_stock INT;
  DECLARE v_delta INT;
  IF NEW.item_id <> OLD.item_id THEN
    -- for simplicity, disallow changing item_id via update (force insert/delete instead)
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Changing item_id on an order is not allowed';
  END IF;
  SET v_delta = NEW.quantity - OLD.quantity; -- positive => need more stock
  IF v_delta > 0 THEN
    SELECT stock_quantity INTO v_stock FROM ShopItem WHERE item_id = NEW.item_id FOR UPDATE;
    IF v_stock < v_delta THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient stock for order update';
    END IF;
  END IF;
  -- stock adjustment will happen in AFTER UPDATE
END$$

-- AFTER UPDATE: apply the stock delta
CREATE TRIGGER shoporder_after_update
AFTER UPDATE ON ShopOrder
FOR EACH ROW
BEGIN
  DECLARE v_delta INT;
  SET v_delta = NEW.quantity - OLD.quantity;
  IF v_delta <> 0 THEN
    UPDATE ShopItem SET stock_quantity = stock_quantity - v_delta WHERE item_id = NEW.item_id;
  END IF;
END$$

-- 10) DonorApplication AFTER UPDATE: note that manual procedure is preferred for auto-assign shelter
-- This trigger is kept for backwards compatibility but recommend using accept_donor_application procedure
CREATE TRIGGER donorapplication_after_update
AFTER UPDATE ON DonorApplication
FOR EACH ROW
BEGIN
  DECLARE v_default_shelter INT;
  IF OLD.status = 'pending' AND NEW.status = 'approved' THEN
    -- create pet record from donor app if not already linked
    IF NEW.pet_id IS NULL THEN
      -- Try to get first shelter as default
      SELECT shelter_id INTO v_default_shelter FROM Shelter ORDER BY shelter_id LIMIT 1;
      
      INSERT INTO Pet (name, species, breed, age, health_status, price, shelter_id, caretaker_id, status)
        VALUES (NEW.pet_name, NEW.species, NEW.breed, NEW.age, NEW.health_status, 0.00, v_default_shelter, NULL, 'Available');
      UPDATE DonorApplication SET pet_id = LAST_INSERT_ID() WHERE donor_app_id = NEW.donor_app_id;
    END IF;
  END IF;
END$$

DELIMITER ;

-- End of routines_and_triggers.sql
-- Usage: connect to your database and source this file. Example:
-- mysql -u root -p your_db < routines_and_triggers.sql
