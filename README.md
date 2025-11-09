# Pet Adoption & Inventory Management System

A full-stack web application for managing pet adoptions, donor applications, and pet supply shop with inventory tracking.

## Features

✅ **User Authentication** - Register, login, and manage wallet
✅ **Pet Adoption** - Browse available pets, view details, apply for adoption
✅ **Donor System** - Submit applications to donate pets to shelters
✅ **Shop System** - Purchase pet supplies with automatic inventory management
✅ **Vet Records** - Track pet health checkups and treatments
✅ **Wallet System** - Manage funds for adoptions and purchases
✅ **Admin Procedures** - Approve/reject applications, manage inventory

## Tech Stack

### Backend
- **Python Flask** - Web framework
- **MySQL** - Database with stored procedures, triggers, and functions
- **flask-cors** - CORS support for API

### Frontend
- **HTML5/CSS3** - Modern, responsive UI
- **Vanilla JavaScript** - No framework dependencies
- **REST API** - Clean separation of concerns

## Project Structure

```
project/
├── app.py                      # Flask backend with REST API
├── requirements.txt            # Python dependencies
├── .env.example               # Environment variables template
├── pet_centre.sql             # Database schema (DDL)
├── inserts.sql                # Sample data
├── routines_and_triggers.sql  # Stored procedures & triggers
├── templates/
│   └── index.html             # Main HTML template
├── static/
│   ├── css/
│   │   └── style.css          # Styling
│   └── js/
│       └── app.js             # Frontend logic
```

## Setup Instructions

### 1. Database Setup

```powershell
# Import schema
Get-Content "pet_centre.sql" -Raw | mysql -u root -p pet_center

# Import procedures and triggers
Get-Content "routines_and_triggers.sql" -Raw | mysql -u root -p pet_center

# Optional: Import sample data
Get-Content "inserts.sql" -Raw | mysql -u root -p pet_center
```

### 2. Backend Setup

```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create .env file (copy from .env.example and edit)
Copy-Item .env.example .env
notepad .env
```

Edit `.env` file:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=pet_center
SECRET_KEY=generate-random-secret-key-here
```

### 3. Run the Application

```powershell
python app.py
```

The application will be available at `http://localhost:5000`

## API Endpoints

### Authentication
- `POST /api/register` - Register new user
- `POST /api/login` - User login
- `POST /api/logout` - User logout

### Pets
- `GET /api/pets` - Get all available pets (optional: `?shelter_id=X`)
- `GET /api/pets/<id>` - Get pet details with vet records

### Adoptions
- `POST /api/adoptions/apply` - Apply for adoption
- `GET /api/adoptions/my-applications` - Get user's applications
- `POST /api/adoptions/<id>/approve` - Approve application (admin)
- `POST /api/adoptions/<id>/reject` - Reject application

### Donors
- `POST /api/donors/apply` - Submit donor application
- `POST /api/donors/<id>/accept` - Accept donor application (admin)

### Shop
- `GET /api/shop/items` - Get shop items
- `POST /api/shop/order` - Place an order
- `GET /api/shop/my-orders` - Get user's orders

### Wallet
- `GET /api/wallet/balance` - Get wallet balance
- `POST /api/wallet/add-funds` - Add funds to wallet

### Other
- `GET /api/shelters` - Get all shelters
- `POST /api/vet/add-record` - Add vet record (admin)

## Frontend Features

### User Interface
- **Responsive Design** - Works on desktop and mobile
- **Modal Dialogs** - Login, register, pet details
- **Real-time Updates** - Dynamic content loading
- **Wallet Management** - Click wallet balance to add funds

### Pages/Sections
- **Home** - Hero section with call-to-action
- **Browse Pets** - Grid view with filters
- **Shop** - Pet supplies with stock tracking
- **Donate** - Form to submit donor applications
- **My Applications** - Track adoption applications
- **My Orders** - View purchase history

## Business Rules (Enforced by Backend)

✅ Pet must have vet record before adoption approval
✅ User must have sufficient wallet balance for purchases
✅ Stock validation before placing orders
✅ Automatic rejection of competing adoption applications
✅ Prevention of duplicate pending applications
✅ Transactional safety with rollback on errors
✅ Donor pets auto-assigned to shelters

## Security Notes

⚠️ **Production Recommendations:**
1. Replace password storage with bcrypt/argon2 hashing
2. Add CSRF protection
3. Implement rate limiting
4. Use HTTPS/SSL
5. Add input validation and sanitization
6. Implement proper session management
7. Add admin role-based access control

## Development

### Add Sample Data

```sql
-- Add a shelter
INSERT INTO Shelter (name, address, registration_number) 
VALUES ('Happy Paws Shelter', '123 Main St', 'REG001');

-- Add a user with funds
INSERT INTO User (username, password_hash, name, contact, wallet) 
VALUES ('testuser', 'password123', 'Test User', '555-1234', 500.00);

-- Add a pet
INSERT INTO Pet (name, species, breed, age, health_status, price, shelter_id, status)
VALUES ('Buddy', 'Dog', 'Golden Retriever', 3, 'Healthy', 200.00, 1, 'Available');

-- Add vet record (required for adoption)
CALL add_vet_record(1, CURDATE(), 'Healthy, all vaccinations current', 'Routine checkup');

-- Add shop item
INSERT INTO ShopItem (shelter_id, name, description, price, stock_quantity)
VALUES (1, 'Dog Food 5kg', 'Premium dog food', 25.00, 100);
```

### Testing Procedures

```sql
-- Test adoption flow
CALL apply_for_adoption(1, 1);  -- user_id=1, pet_id=1
CALL approve_adoption(1);        -- application_id=1

-- Test shop order
CALL place_shop_order(1, 1, 2);  -- user_id=1, item_id=1, quantity=2

-- Test donor application
CALL accept_donor_application(1, 1);  -- donor_app_id=1, shelter_id=1

-- Check eligibility
SELECT check_pet_eligibility(1);  -- pet_id=1
```

## Troubleshooting

### Database Connection Failed
- Check `.env` file has correct credentials
- Verify MySQL service is running
- Test connection: `mysql -u root -p pet_center`

### Import Errors
- Ensure database exists: `CREATE DATABASE IF NOT EXISTS pet_center;`
- Check file encoding (UTF-8)
- Run files in order: schema → routines → sample data

### Frontend Not Loading
- Check Flask is running on port 5000
- Open browser console for JavaScript errors
- Verify API_BASE URL in `app.js` matches Flask host

## Future Enhancements

- Admin dashboard with analytics
- Email notifications for application status
- Image upload for pets
- Advanced search and filtering
- Review/rating system for adopted pets
- Payment gateway integration
- Real-time chat support

## License

This is a student project for educational purposes.
