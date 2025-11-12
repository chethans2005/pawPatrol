-- Ensure procedures/functions/triggers can be re-created
DROP PROCEDURE IF EXISTS AddNewPet;
DROP PROCEDURE IF EXISTS UpdateAdoptionApplicationStatusAndPet;
DROP PROCEDURE IF EXISTS ViewPendingApplications;
DROP PROCEDURE IF EXISTS ApproveRejectDonorApplication;
DROP FUNCTION IF EXISTS GetShelterInventory;
DROP FUNCTION IF EXISTS GetUserWallet;
DROP FUNCTION IF EXISTS GetShelterCaretakerCount;
DROP FUNCTION IF EXISTS GetShelterPetCount;
DROP TRIGGER IF EXISTS before_pet_insert;
DROP TRIGGER IF EXISTS before_pet_update;
DROP VIEW IF EXISTS ViewAvailablePets;

-- AddNewPet procedure
DELIMITER $$
CREATE PROCEDURE AddNewPet (
  IN p_name VARCHAR(100),
  IN p_species VARCHAR(50),
  IN p_breed VARCHAR(50),
  IN p_age INT,
  IN p_shelterID INT,
  IN p_price DECIMAL(10,2),
  IN p_health_status VARCHAR(100)
)
BEGIN
  INSERT INTO Pet (name, species, breed, age, shelter_id, price, health_status)
  VALUES (p_name, p_species, p_breed, p_age, p_shelterID, p_price, p_health_status);
END $$
DELIMITER ;

-- View for available pets
CREATE VIEW ViewAvailablePets AS
SELECT pet_id, name, species, breed, age FROM Pet WHERE status = 'Available';

-- UpdateAdoptionApplicationStatusAndPet
DELIMITER $$
CREATE PROCEDURE UpdateAdoptionApplicationStatusAndPet(
    IN app_id INT,
    IN new_status VARCHAR(10)
)
BEGIN
    DECLARE petId INT;
    DECLARE userId INT;
    DECLARE shelterId INT;
    DECLARE petPrice DECIMAL(10,2);
    DECLARE userWallet DECIMAL(10,2);

    -- Update adoption application status
    UPDATE AdopterApplication
    SET status = new_status
    WHERE application_id = app_id;

    IF new_status = 'approved' THEN
        SELECT pet_id, user_id INTO petId, userId FROM AdopterApplication WHERE application_id = app_id;
        SELECT price, shelter_id INTO petPrice, shelterId FROM Pet WHERE pet_id = petId;
        SELECT wallet INTO userWallet FROM User WHERE user_id = userId;

        IF userWallet < petPrice THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient funds in user wallet. Adoption cannot be approved.';
        END IF;

        UPDATE User SET wallet = wallet - petPrice WHERE user_id = userId;
        UPDATE Shelter SET inventory = inventory + petPrice WHERE shelter_id = shelterId;
        UPDATE Pet SET status = 'Adopted' WHERE pet_id = petId;
        DELETE FROM CaretakerPet WHERE pet_id = petId;
    END IF;
END $$
DELIMITER ;

-- Example call (remove or adjust as needed)
-- CALL UpdateAdoptionApplicationStatusAndPet(3, 'approved');

-- ViewPendingApplications
DELIMITER $$
CREATE PROCEDURE ViewPendingApplications(IN app_type VARCHAR(20))
BEGIN
    IF app_type = 'adoption' THEN
        SELECT application_id, user_id, pet_id, status, date
        FROM AdopterApplication
        WHERE status = 'pending';
    ELSEIF app_type = 'donation' THEN
        SELECT donor_app_id, user_id, pet_name, species, breed, age, health_status, application_date, status
        FROM DonorApplication
        WHERE status = 'pending';
    ELSE
        SELECT 'Invalid application type. Use \"adoption\" or \"donation\".' AS message;
    END IF;
END $$
DELIMITER ;

-- ApproveRejectDonorApplication
DELIMITER $$
CREATE PROCEDURE ApproveRejectDonorApplication(
    IN p_donor_app_id INT,
    IN p_status VARCHAR(10),
    IN p_shelter_id INT,
    IN p_caretaker_id INT
)
BEGIN
    -- wrap the procedure's executable statements in a labeled block so
    -- LEAVE proc_done; has a matching label
    proc_done: BEGIN
        DECLARE v_pet_name VARCHAR(100);
        DECLARE v_species VARCHAR(50);
        DECLARE v_breed VARCHAR(50);
        DECLARE v_age INT;
        DECLARE v_health_status TEXT;
        DECLARE v_new_pet_id INT;
        DECLARE v_target_status VARCHAR(10);

        SET v_target_status = CASE 
            WHEN LOWER(p_status) IN ('approve','approved') THEN 'approved'
            WHEN LOWER(p_status) IN ('reject','rejected') THEN 'rejected'
            ELSE NULL
        END;

        IF v_target_status IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid status. Use approve/approved or reject/rejected.';
        END IF;

        IF v_target_status = 'rejected' THEN
            UPDATE DonorApplication SET status = v_target_status WHERE donor_app_id = p_donor_app_id;
            LEAVE proc_done;
        END IF;

        IF p_shelter_id IS NULL OR p_caretaker_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Shelter ID and Caretaker ID are required for approval.';
        END IF;

        UPDATE DonorApplication SET status = v_target_status WHERE donor_app_id = p_donor_app_id;

        SELECT pet_name, species, breed, age, health_status
        INTO v_pet_name, v_species, v_breed, v_age, v_health_status
        FROM DonorApplication WHERE donor_app_id = p_donor_app_id;

        INSERT INTO Pet (name, species, breed, age, shelter_id, health_status, status)
        VALUES (v_pet_name, v_species, v_breed, v_age, p_shelter_id, v_health_status, 'Available');

        SET v_new_pet_id = LAST_INSERT_ID();

        UPDATE DonorApplication SET pet_id = v_new_pet_id WHERE donor_app_id = p_donor_app_id;
        INSERT INTO CaretakerPet (caretaker_id, pet_id) VALUES (p_caretaker_id, v_new_pet_id);

    END proc_done;
END $$
DELIMITER ;

-- Utility functions (GetShelterInventory, GetUserWallet, etc.)
DELIMITER $$
CREATE FUNCTION GetShelterInventory(p_shelter_id INT) RETURNS DECIMAL(10,2) DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE shelter_inventory DECIMAL(10,2);
    SELECT inventory INTO shelter_inventory FROM Shelter WHERE shelter_id = p_shelter_id;
    RETURN IFNULL(shelter_inventory, 0.00);
END $$
DELIMITER ;

DELIMITER $$
CREATE FUNCTION GetUserWallet(p_user_id INT) RETURNS DECIMAL(10,2) DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE user_wallet DECIMAL(10,2);
    SELECT wallet INTO user_wallet FROM User WHERE user_id = p_user_id;
    RETURN IFNULL(user_wallet, 0.00);
END $$
DELIMITER ;

DELIMITER $$
CREATE FUNCTION GetShelterCaretakerCount(p_shelter_id INT) RETURNS INT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE caretaker_count INT;
    SELECT COUNT(*) INTO caretaker_count FROM Caretaker WHERE shelter_id = p_shelter_id;
    RETURN caretaker_count;
END $$
DELIMITER ;

DELIMITER $$
CREATE FUNCTION GetShelterPetCount(p_shelter_id INT) RETURNS INT DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE pet_count INT;
    SELECT COUNT(*) INTO pet_count FROM Pet WHERE shelter_id = p_shelter_id AND status = 'Available';
    RETURN pet_count;
END $$
DELIMITER ;

-- Triggers
DELIMITER $$
CREATE TRIGGER before_pet_insert
BEFORE INSERT ON Pet
FOR EACH ROW
BEGIN
    DECLARE error_message VARCHAR(255) DEFAULT '';
    IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN SET error_message = CONCAT(error_message, 'Pet name is required. '); END IF;
    IF NEW.species IS NULL OR TRIM(NEW.species) = '' THEN SET error_message = CONCAT(error_message, 'Species is required. '); END IF;
    IF NEW.breed IS NULL OR TRIM(NEW.breed) = '' THEN SET error_message = CONCAT(error_message, 'Breed is required. '); END IF;
    IF NEW.age IS NULL THEN SET error_message = CONCAT(error_message, 'Age is required. '); END IF;
    IF NEW.shelter_id IS NULL THEN SET error_message = CONCAT(error_message, 'Shelter ID is required. '); END IF;
    IF NEW.health_status IS NULL OR TRIM(NEW.health_status) = '' THEN SET error_message = CONCAT(error_message, 'Health status is required. '); END IF;
    IF NEW.price IS NULL THEN SET error_message = CONCAT(error_message, 'Price is required. '); END IF;
    IF error_message != '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = error_message; END IF;
END $$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER before_pet_update
BEFORE UPDATE ON Pet
FOR EACH ROW
BEGIN
    DECLARE error_message VARCHAR(255) DEFAULT '';
    IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN SET error_message = CONCAT(error_message, 'Pet name is required. '); END IF;
    IF NEW.species IS NULL OR TRIM(NEW.species) = '' THEN SET error_message = CONCAT(error_message, 'Species is required. '); END IF;
    IF NEW.breed IS NULL OR TRIM(NEW.breed) = '' THEN SET error_message = CONCAT(error_message, 'Breed is required. '); END IF;
    IF NEW.age IS NULL THEN SET error_message = CONCAT(error_message, 'Age is required. '); END IF;
    IF NEW.shelter_id IS NULL THEN SET error_message = CONCAT(error_message, 'Shelter ID is required. '); END IF;
    IF NEW.health_status IS NULL OR TRIM(NEW.health_status) = '' THEN SET error_message = CONCAT(error_message, 'Health status is required. '); END IF;
    IF NEW.price IS NULL THEN SET error_message = CONCAT(error_message, 'Price is required. '); END IF;
    IF error_message != '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = error_message; END IF;
END $$
DELIMITER ;

-- Example calls (remove if not needed)
-- CALL UpdateAdoptionApplicationStatusAndPet(3, 'approved');
-- CALL ViewPendingApplications('donation');
-- CALL ApproveRejectDonorApplication(1, 'approved', 1, 1);