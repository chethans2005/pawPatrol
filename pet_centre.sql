CREATE TABLE User (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    name VARCHAR(100),
    contact VARCHAR(50),
    address VARCHAR(255),
    wallet DECIMAL(10,2) DEFAULT 0.00
);

CREATE TABLE Shelter (
    shelter_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    address VARCHAR(255),
    registration_number VARCHAR(50) UNIQUE,
    revenue DECIMAL(10,2) DEFAULT 0.00
);

CREATE TABLE Caretaker (
    caretaker_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    contact VARCHAR(50),
    shelter_id INT,
    FOREIGN KEY (shelter_id) REFERENCES Shelter(shelter_id)
);

CREATE TABLE Pet (
    pet_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100),
    species VARCHAR(50),
    breed VARCHAR(50),
    age INT,
    health_status VARCHAR(100),
    price DECIMAL(10,2),
    shelter_id INT,
    FOREIGN KEY (shelter_id) REFERENCES Shelter(shelter_id),
    caretaker_id INT,
    FOREIGN KEY (caretaker_id) REFERENCES Caretaker(caretaker_id),
    status ENUM('Available', 'Adopted') NOT NULL DEFAULT 'Available'
);

CREATE TABLE VetRecord (
    vet_record_id INT PRIMARY KEY AUTO_INCREMENT,
    pet_id INT,
    checkup_date DATE,
    remarks VARCHAR(255),
    treatment VARCHAR(255),
    FOREIGN KEY (pet_id) REFERENCES Pet(pet_id)
);

CREATE TABLE ShopItem (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    shelter_id INT,
    name VARCHAR(100),
    description VARCHAR(255),
    price DECIMAL(10,2),
    stock_quantity INT,
    FOREIGN KEY (shelter_id) REFERENCES Shelter(shelter_id)
);

CREATE TABLE ShopOrder (
    order_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    shelter_id INT,
    item_id INT,
    quantity INT,
    price DECIMAL(10,2),
    order_date DATE,
    FOREIGN KEY (user_id) REFERENCES User(user_id),
    FOREIGN KEY (shelter_id) REFERENCES Shelter(shelter_id),
    FOREIGN KEY (item_id) REFERENCES ShopItem(item_id)
);

CREATE TABLE CaretakerPet (
    caretaker_id INT,
    pet_id INT,
    PRIMARY KEY (caretaker_id, pet_id),
    FOREIGN KEY (caretaker_id) REFERENCES Caretaker(caretaker_id),
    FOREIGN KEY (pet_id) REFERENCES Pet(pet_id)
);

CREATE TABLE AdopterApplication (
    application_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    pet_id INT,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    date DATE,
    FOREIGN KEY (user_id) REFERENCES User(user_id),
    FOREIGN KEY (pet_id) REFERENCES Pet(pet_id)
);

CREATE TABLE DonorApplication (
    donor_app_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    pet_id INT DEFAULT NULL,         -- Will be NULL until pet is accepted
    pet_name VARCHAR(100),
    species VARCHAR(50),
    breed VARCHAR(50),
    age INT,
    description TEXT,
    health_status TEXT,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',              -- e.g., 'pending', 'accepted', 'rejected'
    application_date DATE,
    FOREIGN KEY (user_id) REFERENCES User(user_id),
    FOREIGN KEY (pet_id) REFERENCES Pet(pet_id)
);
