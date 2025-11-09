CREATE PROCEDURE AddNewPet (IN name VARCHAR(100), IN species VARCHAR(50), IN breed VARCHAR(50), IN age INT, IN shelterID INT, IN price DECIMAL(10,2), IN health_status VARCHAR(100))
BEGIN
  INSERT INTO Pet (name, species, breed, age, shelter_id, price, health_status)
  VALUES (name, species, breed, age, shelterID, price, health_status);
END;



CREATE VIEW ViewAvailablePets AS
SELECT pet_id, name, species, breed, age FROM Pet WHERE status = 'Available';
SELECT * FROM ViewAvailablePets;



CREATE PROCEDURE UpdateAdoptionApplicationStatusAndPet(
    IN app_id INT,
    IN new_status ENUM('pending','approved','rejected')
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

    -- If new status is 'approved', process the adoption
    IF new_status = 'approved' THEN
        -- Get pet_id and user_id from the application
        SELECT pet_id, user_id 
        INTO petId, userId 
        FROM AdopterApplication 
        WHERE application_id = app_id;

        -- Get pet price and shelter_id
        SELECT price, shelter_id 
        INTO petPrice, shelterId 
        FROM Pet 
        WHERE pet_id = petId;

        -- Get user's wallet balance
        SELECT wallet 
        INTO userWallet 
        FROM User 
        WHERE user_id = userId;

        -- Check if user has sufficient funds
        IF userWallet < petPrice THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient funds in user wallet. Adoption cannot be approved.';
        END IF;

        -- Deduct price from user's wallet
        UPDATE User
        SET wallet = wallet - petPrice
        WHERE user_id = userId;

        -- Add price to shelter's inventory
        UPDATE Shelter
        SET inventory = inventory + petPrice
        WHERE shelter_id = shelterId;

        -- Update pet status to 'Adopted'
        UPDATE Pet
        SET status = 'Adopted' 
        WHERE pet_id = petId;

        -- Remove pet from caretaker assignments
        DELETE FROM CaretakerPet
        WHERE pet_id = petId;

    END IF;
END;

-- DROP PROCEDURE IF EXISTS UpdateAdoptionApplicationStatusAndPet;

CALL UpdateAdoptionApplicationStatusAndPet(3, 'approved');



DELIMITER //
CREATE PROCEDURE ViewPendingApplications(IN app_type VARCHAR(20))
BEGIN
    IF app_type = 'adoption' THEN
        SELECT 
            application_id,
            user_id,
            pet_id,
            status,
            date
        FROM 
            AdopterApplication
        WHERE 
            status = 'pending';
    
    ELSEIF app_type = 'donation' THEN
        SELECT 
            donor_app_id,
            user_id,
            pet_name,
            species,
            breed,
            age,
            health_status,
            application_date,
            status
        FROM 
            DonorApplication
        WHERE 
            status = 'pending';

    ELSE
        SELECT 'Invalid application type. Use "adoption" or "donation".' AS message;
    END IF;
END //
DELIMITER ;
-- DROP PROCEDURE IF EXISTS ViewPendingApplications;
CALL ViewPendingApplications('donation');



DELIMITER //
CREATE PROCEDURE ApproveRejectDonorApplication(
    IN p_donor_app_id INT,
    IN p_status VARCHAR(10),  -- accepts approve/approved or reject/rejected
    IN p_shelter_id INT,      -- optional, only needed for approval
    IN p_caretaker_id INT     -- optional, only needed for approval
)
BEGIN
    proc_block: BEGIN
        DECLARE v_pet_name VARCHAR(100);
        DECLARE v_species VARCHAR(50);
        DECLARE v_breed VARCHAR(50);
        DECLARE v_age INT;
        DECLARE v_health_status TEXT;
        DECLARE v_new_pet_id INT;
        DECLARE v_target_status VARCHAR(10);

        -- Normalize input status to enum values
        SET v_target_status = CASE 
            WHEN LOWER(p_status) IN ('approve','approved') THEN 'approved'
            WHEN LOWER(p_status) IN ('reject','rejected') THEN 'rejected'
            ELSE NULL
        END;

        -- If invalid status, exit
        IF v_target_status IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid status. Use approve/approved or reject/rejected.';
        END IF;

        -- If rejected, just update status and exit
        IF v_target_status = 'rejected' THEN
            UPDATE DonorApplication 
            SET status = v_target_status
            WHERE donor_app_id = p_donor_app_id;
            
            LEAVE proc_block;
        END IF;

        -- For approval, validate required parameters
        IF p_shelter_id IS NULL OR p_caretaker_id IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Shelter ID and Caretaker ID are required for approval.';
        END IF;

        -- Update DonorApplication status to approved
        UPDATE DonorApplication 
        SET status = v_target_status
        WHERE donor_app_id = p_donor_app_id;

        -- Get pet details from DonorApplication
        SELECT pet_name, species, breed, age, health_status
        INTO v_pet_name, v_species, v_breed, v_age, v_health_status
        FROM DonorApplication 
        WHERE donor_app_id = p_donor_app_id;

        -- Insert new pet into Pet table
        INSERT INTO Pet (name, species, breed, age, shelter_id, health_status, status)
        VALUES (v_pet_name, v_species, v_breed, v_age, p_shelter_id, v_health_status, 'Available');

        -- Get the newly created pet_id
        SET v_new_pet_id = LAST_INSERT_ID();

        -- Update DonorApplication with the new pet_id
        UPDATE DonorApplication
        SET pet_id = v_new_pet_id
        WHERE donor_app_id = p_donor_app_id;

        -- Insert caretaker-pet assignment
        INSERT INTO CaretakerPet (caretaker_id, pet_id)
        VALUES (p_caretaker_id, v_new_pet_id);

    END;
END //
DELIMITER ;
-- DROP PROCEDURE IF EXISTS ApproveRejectDonorApplication;
-- Example calls:
-- For approval (requires shelter_id and caretaker_id):
CALL ApproveRejectDonorApplication(1, 'approved', 1, 1);
-- For rejection (shelter_id and caretaker_id can be NULL):
CALL ApproveRejectDonorApplication(2, 'rejected', NULL, NULL);



-- Function to check the inventory of a shelter
-- DROP FUNCTION IF EXISTS GetShelterInventory;
DELIMITER //
CREATE FUNCTION GetShelterInventory(p_shelter_id INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE shelter_inventory DECIMAL(10,2);
    
    SELECT inventory INTO shelter_inventory
    FROM Shelter
    WHERE shelter_id = p_shelter_id;
    
    RETURN IFNULL(shelter_inventory, 0.00);
END //
DELIMITER ;

-- Example usage:
SELECT GetShelterInventory(1) AS shelter_inventory;
SELECT shelter_id, name, GetShelterInventory(shelter_id) AS inventory FROM Shelter;



-- Function to check the wallet balance of a user
-- DROP FUNCTION IF EXISTS GetUserWallet;
DELIMITER //
CREATE FUNCTION GetUserWallet(p_user_id INT)
RETURNS DECIMAL(10,2)
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE user_wallet DECIMAL(10,2);
    
    SELECT wallet INTO user_wallet
    FROM User
    WHERE user_id = p_user_id;
    
    RETURN IFNULL(user_wallet, 0.00);
END //
DELIMITER ;
-- Example usage:
SELECT GetUserWallet(1) AS wallet_balance;
SELECT user_id, name, GetUserWallet(user_id) AS wallet_balance FROM User;



-- Function to count total caretakers in a shelter
-- DROP FUNCTION IF EXISTS GetShelterCaretakerCount;
DELIMITER //
CREATE FUNCTION GetShelterCaretakerCount(p_shelter_id INT)
RETURNS INT
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE caretaker_count INT;
    
    SELECT COUNT(*) INTO caretaker_count
    FROM Caretaker
    WHERE shelter_id = p_shelter_id;
    
    RETURN caretaker_count;
END //
DELIMITER ;
-- Example usage:
SELECT GetShelterCaretakerCount(1) AS total_caretakers;



-- Function to count total available pets in a shelter
-- DROP FUNCTION IF EXISTS GetShelterPetCount;
DELIMITER //
CREATE FUNCTION GetShelterPetCount(p_shelter_id INT)
RETURNS INT
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE pet_count INT;
    
    SELECT COUNT(*) INTO pet_count
    FROM Pet
    WHERE shelter_id = p_shelter_id AND status = 'Available';
    
    RETURN pet_count;
END //
DELIMITER ;

-- Example usage:
SELECT GetShelterPetCount(1) AS available_pets;
-- Complete shelter statistics:
SELECT 
    shelter_id, 
    name,
    GetShelterInventory(shelter_id) AS inventory,
    GetShelterCaretakerCount(shelter_id) AS caretakers,
    GetShelterPetCount(shelter_id) AS available_pets
FROM Shelter;



-- Trigger to validate Pet fields before INSERT
DROP TRIGGER IF EXISTS before_pet_insert;
DELIMITER //
CREATE TRIGGER before_pet_insert
BEFORE INSERT ON Pet
FOR EACH ROW
BEGIN
    DECLARE error_message VARCHAR(255);
    SET error_message = '';

    -- Check required fields
    IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN
        SET error_message = CONCAT(error_message, 'Pet name is required. ');
    END IF;

    IF NEW.species IS NULL OR TRIM(NEW.species) = '' THEN
        SET error_message = CONCAT(error_message, 'Species is required. ');
    END IF;

    IF NEW.breed IS NULL OR TRIM(NEW.breed) = '' THEN
        SET error_message = CONCAT(error_message, 'Breed is required. ');
    END IF;

    IF NEW.age IS NULL THEN
        SET error_message = CONCAT(error_message, 'Age is required. ');
    END IF;

    IF NEW.shelter_id IS NULL THEN
        SET error_message = CONCAT(error_message, 'Shelter ID is required. ');
    END IF;

    IF NEW.health_status IS NULL OR TRIM(NEW.health_status) = '' THEN
        SET error_message = CONCAT(error_message, 'Health status is required. ');
    END IF;

    IF NEW.price IS NULL THEN
        SET error_message = CONCAT(error_message, 'Price is required. ');
    END IF;

    -- If there are any errors, signal them
    IF error_message != '' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = error_message;
    END IF;
END //
DELIMITER ;
-- Trigger to validate Pet fields before UPDATE
DROP TRIGGER IF EXISTS before_pet_update;
DELIMITER //
CREATE TRIGGER before_pet_update
BEFORE UPDATE ON Pet
FOR EACH ROW
BEGIN
    DECLARE error_message VARCHAR(255);
    SET error_message = '';

    -- Check required fields
    IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN
        SET error_message = CONCAT(error_message, 'Pet name is required. ');
    END IF;

    IF NEW.species IS NULL OR TRIM(NEW.species) = '' THEN
        SET error_message = CONCAT(error_message, 'Species is required. ');
    END IF;

    IF NEW.breed IS NULL OR TRIM(NEW.breed) = '' THEN
        SET error_message = CONCAT(error_message, 'Breed is required. ');
    END IF;

    IF NEW.age IS NULL THEN
        SET error_message = CONCAT(error_message, 'Age is required. ');
    END IF;

    IF NEW.shelter_id IS NULL THEN
        SET error_message = CONCAT(error_message, 'Shelter ID is required. ');
    END IF;

    IF NEW.health_status IS NULL OR TRIM(NEW.health_status) = '' THEN
        SET error_message = CONCAT(error_message, 'Health status is required. ');
    END IF;

    IF NEW.price IS NULL THEN
        SET error_message = CONCAT(error_message, 'Price is required. ');
    END IF;

    -- If there are any errors, signal them
    IF error_message != '' THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = error_message;
    END IF;
END //
DELIMITER ;