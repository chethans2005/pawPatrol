"""
Pet Adoption & Inventory Management System - Flask Backend
"""
from flask import Flask, request, jsonify, render_template, session
from flask_cors import CORS
import mysql.connector
from mysql.connector import Error
from datetime import datetime
import os
from functools import wraps

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
CORS(app)

# Database configuration
DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'pet_center')
}

def get_db_connection():
    """Create and return a database connection"""
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        return conn
    except Error as e:
        print(f"Database connection error: {e}")
        return None

def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated_function

# ============= AUTHENTICATION ROUTES =============

@app.route('/')
def index():
    """Home page"""
    return render_template('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.json
    username = data.get('username')
    password = data.get('password')
    name = data.get('name')
    contact = data.get('contact')
    address = data.get('address', '')
    
    if not all([username, password, name, contact]):
        return jsonify({'error': 'Missing required fields'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        # Simple password hash (use bcrypt in production!)
        password_hash = password  # TODO: Use proper hashing
        
        cursor.execute(
            "INSERT INTO User (username, password_hash, name, contact, address, wallet) VALUES (%s, %s, %s, %s, %s, 0.00)",
            (username, password_hash, name, contact, address)
        )
        conn.commit()
        user_id = cursor.lastrowid
        
        return jsonify({'message': 'User registered successfully', 'user_id': user_id}), 201
    except Error as e:
        return jsonify({'error': f'Registration failed: {str(e)}'}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    """User login"""
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not all([username, password]):
        return jsonify({'error': 'Missing credentials'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT user_id, username, name, wallet FROM User WHERE username = %s AND password_hash = %s",
            (username, password)
        )
        user = cursor.fetchone()
        
        if user:
            session['user_id'] = user['user_id']
            session['username'] = user['username']
            return jsonify({'message': 'Login successful', 'user': user}), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
    finally:
        cursor.close()
        conn.close()

@app.route('/api/logout', methods=['POST'])
def logout():
    """User logout"""
    session.clear()
    return jsonify({'message': 'Logout successful'}), 200

# ============= PET ROUTES =============

@app.route('/api/pets', methods=['GET'])
def get_pets():
    """Get all available pets (optionally filter by shelter)"""
    shelter_id = request.args.get('shelter_id', None)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.callproc('list_available_pets', [shelter_id])
        
        for result in cursor.stored_results():
            pets = result.fetchall()
        
        return jsonify(pets), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/pets/<int:pet_id>', methods=['GET'])
def get_pet_details(pet_id):
    """Get details of a specific pet"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Get pet details
        cursor.execute("""
            SELECT p.*, s.name as shelter_name, c.name as caretaker_name
            FROM Pet p
            LEFT JOIN Shelter s ON p.shelter_id = s.shelter_id
            LEFT JOIN Caretaker c ON p.caretaker_id = c.caretaker_id
            WHERE p.pet_id = %s
        """, (pet_id,))
        pet = cursor.fetchone()
        
        if not pet:
            return jsonify({'error': 'Pet not found'}), 404
        
        # Get vet records
        cursor.execute("""
            SELECT * FROM VetRecord WHERE pet_id = %s ORDER BY checkup_date DESC
        """, (pet_id,))
        vet_records = cursor.fetchall()
        
        # Check eligibility
        cursor.execute("SELECT check_pet_eligibility(%s) as eligibility", (pet_id,))
        eligibility = cursor.fetchone()['eligibility']
        
        pet['vet_records'] = vet_records
        pet['eligibility'] = eligibility
        
        return jsonify(pet), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ============= ADOPTION ROUTES =============

@app.route('/api/adoptions/apply', methods=['POST'])
@login_required
def apply_for_adoption():
    """Apply for pet adoption"""
    data = request.json
    pet_id = data.get('pet_id')
    
    if not pet_id:
        return jsonify({'error': 'pet_id required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('apply_for_adoption', [session['user_id'], pet_id])
        conn.commit()
        
        return jsonify({'message': 'Application submitted successfully'}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/adoptions/my-applications', methods=['GET'])
@login_required
def get_my_applications():
    """Get user's adoption applications"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT aa.*, p.name as pet_name, p.species, p.breed, p.price
            FROM AdopterApplication aa
            JOIN Pet p ON aa.pet_id = p.pet_id
            WHERE aa.user_id = %s
            ORDER BY aa.date DESC
        """, (session['user_id'],))
        applications = cursor.fetchall()
        
        return jsonify(applications), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/adoptions/<int:application_id>/approve', methods=['POST'])
def approve_adoption_application(application_id):
    """Approve an adoption application (admin only)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('approve_adoption', [application_id])
        conn.commit()
        
        return jsonify({'message': 'Application approved successfully'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/adoptions/<int:application_id>/reject', methods=['POST'])
def reject_adoption_application(application_id):
    """Reject an adoption application"""
    data = request.json
    reason = data.get('reason', 'Not specified')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('reject_adoption', [application_id, reason])
        conn.commit()
        
        return jsonify({'message': 'Application rejected'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

# ============= DONOR ROUTES =============

@app.route('/api/donors/apply', methods=['POST'])
@login_required
def submit_donor_application():
    """Submit a donor application"""
    data = request.json
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO DonorApplication 
            (user_id, pet_name, species, breed, age, description, health_status, application_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, CURDATE())
        """, (
            session['user_id'],
            data.get('pet_name'),
            data.get('species'),
            data.get('breed'),
            data.get('age'),
            data.get('description', ''),
            data.get('health_status', 'Unknown')
        ))
        conn.commit()
        
        return jsonify({'message': 'Donor application submitted successfully'}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/donors/<int:donor_app_id>/accept', methods=['POST'])
def accept_donor_application_route(donor_app_id):
    """Accept a donor application (admin only)"""
    data = request.json
    shelter_id = data.get('shelter_id')
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('accept_donor_application', [donor_app_id, shelter_id])
        conn.commit()
        
        return jsonify({'message': 'Donor application accepted successfully'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

# ============= SHOP ROUTES =============

@app.route('/api/shop/items', methods=['GET'])
def get_shop_items():
    """Get all shop items"""
    shelter_id = request.args.get('shelter_id', None)
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        if shelter_id:
            cursor.execute("""
                SELECT si.*, s.name as shelter_name
                FROM ShopItem si
                JOIN Shelter s ON si.shelter_id = s.shelter_id
                WHERE si.shelter_id = %s AND si.stock_quantity > 0
            """, (shelter_id,))
        else:
            cursor.execute("""
                SELECT si.*, s.name as shelter_name
                FROM ShopItem si
                JOIN Shelter s ON si.shelter_id = s.shelter_id
                WHERE si.stock_quantity > 0
            """)
        items = cursor.fetchall()
        
        return jsonify(items), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/shop/order', methods=['POST'])
@login_required
def place_order():
    """Place a shop order"""
    data = request.json
    item_id = data.get('item_id')
    quantity = data.get('quantity')
    
    if not all([item_id, quantity]):
        return jsonify({'error': 'item_id and quantity required'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('place_shop_order', [session['user_id'], item_id, quantity])
        conn.commit()
        
        return jsonify({'message': 'Order placed successfully'}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

@app.route('/api/shop/my-orders', methods=['GET'])
@login_required
def get_my_orders():
    """Get user's shop orders"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT so.*, si.name as item_name, s.name as shelter_name
            FROM ShopOrder so
            JOIN ShopItem si ON so.item_id = si.item_id
            JOIN Shelter s ON so.shelter_id = s.shelter_id
            WHERE so.user_id = %s
            ORDER BY so.order_date DESC
        """, (session['user_id'],))
        orders = cursor.fetchall()
        
        return jsonify(orders), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ============= VET ROUTES =============

@app.route('/api/vet/add-record', methods=['POST'])
def add_vet_record_route():
    """Add a vet record (admin only)"""
    data = request.json
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.callproc('add_vet_record', [
            data.get('pet_id'),
            data.get('checkup_date'),
            data.get('remarks'),
            data.get('treatment')
        ])
        conn.commit()
        
        return jsonify({'message': 'Vet record added successfully'}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

# ============= SHELTER ROUTES =============

@app.route('/api/shelters', methods=['GET'])
def get_shelters():
    """Get all shelters"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM Shelter")
        shelters = cursor.fetchall()
        
        return jsonify(shelters), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ============= USER WALLET ROUTES =============

@app.route('/api/wallet/balance', methods=['GET'])
@login_required
def get_wallet_balance():
    """Get user's wallet balance"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT wallet FROM User WHERE user_id = %s", (session['user_id'],))
        result = cursor.fetchone()
        
        return jsonify({'balance': float(result['wallet']) if result else 0}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

@app.route('/api/wallet/add-funds', methods=['POST'])
@login_required
def add_funds():
    """Add funds to user wallet"""
    data = request.json
    amount = data.get('amount')
    
    if not amount or amount <= 0:
        return jsonify({'error': 'Invalid amount'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE User SET wallet = wallet + %s WHERE user_id = %s",
            (amount, session['user_id'])
        )
        conn.commit()
        
        return jsonify({'message': 'Funds added successfully'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
