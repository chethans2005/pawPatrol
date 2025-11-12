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
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# Load secret key from environment (.env)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
# Enable CORS and allow cookies (credentials) so session cookie is sent by the browser
CORS(app, supports_credentials=True)

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

def admin_required(f):
    """Decorator to require admin privilege for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Login required'}), 401
        if not session.get('is_admin'):
            return jsonify({'error': 'Admin privilege required'}), 403
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
            # Determine admin flag: prefer an 'is_admin' column if present, otherwise treat username 'admin' as admin
            try:
                cursor.execute("SELECT is_admin FROM User WHERE user_id = %s", (user['user_id'],))
                is_admin_row = cursor.fetchone()
                if is_admin_row and 'is_admin' in is_admin_row:
                    session['is_admin'] = bool(is_admin_row['is_admin'])
                else:
                    session['is_admin'] = (user['username'].lower() == 'admin')
            except Exception:
                session['is_admin'] = (user['username'].lower() == 'admin')
            # Debug: print session info
            print(f"[DEBUG] login: session user_id={session.get('user_id')} username={session.get('username')} is_admin={session.get('is_admin')}")
            # Return is_admin flag to client as well
            return jsonify({'message': 'Login successful', 'user': user, 'is_admin': session.get('is_admin', False)}), 200
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


@app.route('/api/me', methods=['GET'])
def me():
    """Return current session user info"""
    if 'user_id' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    user_info = {
        'user_id': session.get('user_id'),
        'username': session.get('username'),
        'is_admin': bool(session.get('is_admin', False))
    }
    print(f"[DEBUG] /api/me called — session: {dict(session)}")
    return jsonify({'user': user_info}), 200


# Development helper: set a session quickly for testing (only when debug=True)
@app.route('/dev/login-as', methods=['POST'])
def dev_login_as():
    """Dev-only: create a session for a given username and admin flag. Only enabled when app.debug is True."""
    if not app.debug:
        return jsonify({'error': 'Not available'}), 404
    data = request.json or {}
    username = data.get('username', 'devuser')
    is_admin = bool(data.get('is_admin', False))
    # Set a fake user id for dev testing
    session['user_id'] = -999
    session['username'] = username
    session['is_admin'] = is_admin
    print(f"[DEV] created session for {username} is_admin={is_admin}")
    return jsonify({'message': 'dev session created', 'user': {'username': username, 'is_admin': is_admin}}), 200


@app.route('/dev/session-check', methods=['GET'])
def dev_session_check():
    """Dev-only: show current session state for debugging."""
    if not app.debug:
        return jsonify({'error': 'Not available'}), 404
    return jsonify({'session': dict(session), 'session_keys': list(session.keys())}), 200

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
@admin_required
def approve_adoption_application(application_id):
    """Approve an adoption application (admin only)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        # Pre-validate to provide clearer error messages, actual enforcement remains in SP
        c = conn.cursor(dictionary=True)
        c.execute("SELECT user_id, pet_id, status FROM AdopterApplication WHERE application_id = %s", (application_id,))
        app_row = c.fetchone()
        if not app_row:
            return jsonify({'error': 'Application not found'}), 400
        if app_row['status'] != 'pending':
            return jsonify({'error': 'Application is not pending'}), 400

        pet_id = app_row['pet_id']
        user_id = app_row['user_id']

        c.execute("SELECT status, price, shelter_id FROM Pet WHERE pet_id = %s", (pet_id,))
        pet_row = c.fetchone()
        if not pet_row:
            return jsonify({'error': 'Pet not found'}), 400
        if pet_row['status'] != 'Available':
            return jsonify({'error': 'Pet is not available for adoption'}), 400

        # Donor self-adopt check
        c.execute("SELECT 1 FROM DonorApplication WHERE pet_id = %s AND user_id = %s AND status = 'approved' LIMIT 1", (pet_id, user_id))
        if c.fetchone():
            return jsonify({'error': 'Donors cannot adopt their own donated pet'}), 400

        # Vet record check
        c.execute("SELECT COUNT(*) AS cnt FROM VetRecord WHERE pet_id = %s", (pet_id,))
        if (c.fetchone() or {}).get('cnt', 0) == 0:
            return jsonify({'error': 'Pet must have at least one veterinary checkup before adoption'}), 400

        # Wallet check if needed
        price = float(pet_row.get('price') or 0)
        if price > 0:
            c.execute("SELECT wallet FROM User WHERE user_id = %s", (user_id,))
            u = c.fetchone()
            if not u:
                return jsonify({'error': 'User not found'}), 400
            wallet = float(u.get('wallet') or 0)
            if wallet < price:
                return jsonify({'error': 'Insufficient funds in user wallet', 'required': price, 'balance': wallet}), 400

        # Call stored procedure to perform atomic update
        c2 = conn.cursor()
        c2.callproc('approve_adoption', [application_id])
        conn.commit()
        return jsonify({'message': 'Application approved successfully'}), 200
    except Error as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 400
    finally:
        try:
            c.close()
        except Exception:
            pass
        try:
            c2.close()
        except Exception:
            pass
        conn.close()

@app.route('/api/adoptions/<int:application_id>/reject', methods=['POST'])
@admin_required
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
@admin_required
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


@app.route('/api/donors/<int:donor_app_id>/reject', methods=['POST'])
@admin_required
def reject_donor_application(donor_app_id):
    """Reject a donor application (admin only)"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE DonorApplication SET status = 'rejected' WHERE donor_app_id = %s",
            (donor_app_id,)
        )
        conn.commit()
        return jsonify({'message': 'Donor application rejected'}), 200
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

# ============= ADMIN: SHOP ITEMS CRUD =============

@app.route('/api/admin/shop/items', methods=['GET'])
@admin_required
def admin_list_shop_items():
    """List all shop items with shelter info (admin)."""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT si.item_id, si.name, si.description, si.price, si.stock_quantity,
                   si.shelter_id, s.name AS shelter_name
            FROM ShopItem si
            JOIN Shelter s ON si.shelter_id = s.shelter_id
            ORDER BY si.item_id DESC
        """)
        items = cursor.fetchall()
        for it in items:
            it['price'] = float(it.get('price', 0) or 0)
        return jsonify(items), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close(); conn.close()

@app.route('/api/admin/shop/items', methods=['POST'])
@admin_required
def admin_create_shop_item():
    data = request.json or {}
    name = data.get('name')
    description = data.get('description', '')
    price = data.get('price')
    stock_quantity = data.get('stock_quantity', 0)
    shelter_id = data.get('shelter_id')
    if not name or price is None or shelter_id is None:
        return jsonify({'error': 'name, price and shelter_id are required'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO ShopItem (shelter_id, name, description, price, stock_quantity) VALUES (%s, %s, %s, %s, %s)",
            (shelter_id, name, description, price, stock_quantity)
        )
        conn.commit()
        return jsonify({'message': 'Item created', 'item_id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()

@app.route('/api/admin/shop/items/<int:item_id>', methods=['PUT'])
@admin_required
def admin_update_shop_item(item_id):
    data = request.json or {}
    fields = []
    values = []
    for key in ('name','description','price','stock_quantity','shelter_id'):
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data.get(key))
    if not fields:
        return jsonify({'error': 'no fields to update'}), 400
    values.append(item_id)
    sql = f"UPDATE ShopItem SET {', '.join(fields)} WHERE item_id = %s"
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(values))
        conn.commit()
        return jsonify({'message': 'Item updated'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()

@app.route('/api/admin/shop/items/<int:item_id>', methods=['DELETE'])
@admin_required
def admin_delete_shop_item(item_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ShopItem WHERE item_id = %s", (item_id,))
        conn.commit()
        return jsonify({'message': 'Item deleted'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()

@app.route('/api/shop/order/batch', methods=['POST'])
@login_required
def place_order_batch():
    """Place a batch shop order with multiple items and quantities in a single transaction.
    Request JSON: { items: [{item_id: int, quantity: int}, ...] }
    Ensures: sufficient wallet for total, sufficient stock for each item, updates per-shelter revenue.
    """
    data = request.json or {}
    items = data.get('items') or []
    if not isinstance(items, list) or not items:
        return jsonify({'error': 'items array required'}), 400
    # Normalize and validate
    try:
        normalized = []
        for it in items:
            item_id = int(it.get('item_id'))
            qty = int(it.get('quantity'))
            if item_id <= 0 or qty <= 0:
                return jsonify({'error': 'Invalid item_id or quantity'}), 400
            normalized.append({'item_id': item_id, 'quantity': qty})
    except Exception:
        return jsonify({'error': 'Invalid items format'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        # Start explicit transaction
        conn.start_transaction()

        # Lock user wallet row
        cursor.execute("SELECT wallet FROM User WHERE user_id = %s FOR UPDATE", (session['user_id'],))
        row = cursor.fetchone()
        if not row:
            raise Error("User not found")
        wallet = float(row['wallet'] or 0)

        # Validate items, lock each item, accumulate totals
        total = 0.0
        per_shelter = {}  # shelter_id -> revenue sum
        item_rows = []     # cache item info to avoid requery
        for it in normalized:
            cursor.execute(
                "SELECT item_id, price, shelter_id, stock_quantity FROM ShopItem WHERE item_id = %s FOR UPDATE",
                (it['item_id'],)
            )
            item = cursor.fetchone()
            if not item:
                raise Error(f"Item {it['item_id']} not found")
            stock = int(item['stock_quantity'] or 0)
            if stock < it['quantity']:
                raise Error(f"Insufficient stock for item {it['item_id']}")
            price = float(item['price'] or 0)
            line_total = price * it['quantity']
            total += line_total
            sid = int(item['shelter_id'])
            per_shelter[sid] = per_shelter.get(sid, 0.0) + line_total
            item_rows.append({'shelter_id': sid, 'item_id': item['item_id'], 'quantity': it['quantity'], 'line_total': line_total})

        if wallet < total:
            return jsonify({'error': 'Insufficient funds in wallet', 'required': total, 'balance': wallet}), 400

        # Deduct wallet once
        cursor.execute("UPDATE User SET wallet = wallet - %s WHERE user_id = %s", (total, session['user_id']))

        # Update shelter revenues per shelter
        for sid, amount in per_shelter.items():
            cursor.execute("UPDATE Shelter SET revenue = revenue + %s WHERE shelter_id = %s", (amount, sid))

        # Insert orders (triggers will adjust stock)
        for it in item_rows:
            cursor.execute(
                """
                INSERT INTO ShopOrder (user_id, shelter_id, item_id, quantity, price, order_date)
                VALUES (%s, %s, %s, %s, %s, CURDATE())
                """,
                (session['user_id'], it['shelter_id'], it['item_id'], it['quantity'], it['line_total'])
            )

        conn.commit()
        return jsonify({'message': 'Order placed successfully', 'total_charged': round(total, 2), 'items_count': len(item_rows)}), 201
    except Error as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return jsonify({'error': str(e)}), 400
    finally:
        try:
            cursor.close()
        except Exception:
            pass
        conn.close()

# ============= VET ROUTES =============

@app.route('/api/vet/add-record', methods=['POST'])
@admin_required
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


@app.route('/api/admin/applications', methods=['GET'])
@admin_required
def get_all_applications():
    """Get all adoption and donor applications for admin dashboard"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    
    try:
        cursor = conn.cursor(dictionary=True)
        # Get adoption applications
        cursor.execute("""
            SELECT aa.application_id as adoption_app_id, aa.user_id, aa.pet_id, aa.status, aa.date, 
                   u.username, p.name as pet_name, 'adoption' as type
            FROM AdopterApplication aa
            JOIN User u ON aa.user_id = u.user_id
            JOIN Pet p ON aa.pet_id = p.pet_id
            ORDER BY aa.date DESC
        """)
        adoptions = cursor.fetchall()
        
        # Get donor applications
        cursor.execute("""
            SELECT da.donor_app_id, da.user_id, da.pet_id, 
                   da.status as status, da.application_date as date, 
                   u.username, da.pet_name, 'donor' as type
            FROM DonorApplication da
            JOIN User u ON da.user_id = u.user_id
            ORDER BY da.application_date DESC
        """)
        donors = cursor.fetchall()
        
        # Combine both
        applications = adoptions + donors
        return jsonify(applications), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
        conn.close()

# ============= ADMIN: SHELTERS / PETS / CARETAKERS CRUD & ASSIGNMENT =============


@app.route('/api/admin/shelters', methods=['POST'])
@admin_required
def create_shelter():
    data = request.json
    name = data.get('name')
    location = data.get('location', '')
    registration_number = data.get('registration_number', '')

    if not name:
        return jsonify({'error': 'name required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO Shelter (name, address, registration_number) VALUES (%s, %s, %s)", (name, location, registration_number))
        conn.commit()
        return jsonify({'message': 'Shelter created', 'shelter_id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/shelters/<int:shelter_id>', methods=['PUT'])
@admin_required
def update_shelter(shelter_id):
    data = request.json
    name = data.get('name')
    location = data.get('location')
    registration_number = data.get('registration_number')

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500

    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Shelter SET name = %s, address = %s, registration_number = %s WHERE shelter_id = %s", (name, location, registration_number, shelter_id))
        conn.commit()
        return jsonify({'message': 'Shelter updated'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/shelters/<int:shelter_id>', methods=['DELETE'])
@admin_required
def delete_shelter(shelter_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Shelter WHERE shelter_id = %s", (shelter_id,))
        conn.commit()
        return jsonify({'message': 'Shelter deleted'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/pets', methods=['POST'])
@admin_required
def create_pet():
    data = request.json
    name = data.get('name')
    species = data.get('species')
    breed = data.get('breed')
    age = data.get('age')
    price = data.get('price', 0.0)
    shelter_id = data.get('shelter_id')
    health_status = data.get('health_status', '')
    caretaker_id = data.get('caretaker_id')
    status = data.get('status', 'Available')

    if not name:
        return jsonify({'error': 'name required'}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO Pet (name, species, breed, age, price, shelter_id, health_status, caretaker_id, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (name, species, breed, age, price, shelter_id, health_status, caretaker_id, status)
        )
        conn.commit()
        return jsonify({'message': 'Pet created', 'pet_id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/pets/<int:pet_id>', methods=['PUT'])
@admin_required
def update_pet(pet_id):
    data = request.json
    fields = []
    values = []
    for key in ('name','species','breed','age','price','shelter_id','caretaker_id','health_status','status'):
        if key in data:
            fields.append(f"{key} = %s")
            values.append(data.get(key))
    if not fields:
        return jsonify({'error':'no fields to update'}), 400
    values.append(pet_id)
    sql = f"UPDATE Pet SET {', '.join(fields)} WHERE pet_id = %s"
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(values))
        conn.commit()
        return jsonify({'message':'Pet updated'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/pets/<int:pet_id>', methods=['DELETE'])
@admin_required
def delete_pet(pet_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Pet WHERE pet_id = %s", (pet_id,))
        conn.commit()
        return jsonify({'message': 'Pet deleted'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/caretakers', methods=['GET'])
@admin_required
def get_caretakers():
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT caretaker_id, name, contact, shelter_id FROM Caretaker ORDER BY name")
        caretakers = cursor.fetchall()
        return jsonify(caretakers), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/caretakers', methods=['POST'])
@admin_required
def create_caretaker():
    data = request.json
    name = data.get('name')
    contact = data.get('contact', '')
    shelter_id = data.get('shelter_id')
    if not name:
        return jsonify({'error':'name required'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO Caretaker (name, contact, shelter_id) VALUES (%s, %s, %s)", (name, contact, shelter_id))
        conn.commit()
        return jsonify({'message':'Caretaker created', 'caretaker_id': cursor.lastrowid}), 201
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()


@app.route('/api/admin/caretakers/<int:caretaker_id>', methods=['PUT'])
@admin_required
def update_caretaker(caretaker_id):
    data = request.json
    name = data.get('name')
    contact = data.get('contact')
    shelter_id = data.get('shelter_id')
    conn = get_db_connection()
    if not conn:
        return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Caretaker SET name = %s, contact = %s, shelter_id = %s WHERE caretaker_id = %s", (name, contact, shelter_id, caretaker_id))
        conn.commit()
        return jsonify({'message':'Caretaker updated'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()


@app.route('/api/admin/caretakers/<int:caretaker_id>', methods=['DELETE'])
@admin_required
def delete_caretaker(caretaker_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM Caretaker WHERE caretaker_id = %s", (caretaker_id,))
        conn.commit()
        return jsonify({'message':'Caretaker deleted'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()


@app.route('/api/admin/pets/<int:pet_id>/assign-caretaker', methods=['POST'])
@admin_required
def assign_caretaker(pet_id):
    data = request.json
    caretaker_id = data.get('caretaker_id')
    if not caretaker_id:
        return jsonify({'error':'caretaker_id required'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Pet SET caretaker_id = %s WHERE pet_id = %s", (caretaker_id, pet_id))
        conn.commit()
        return jsonify({'message':'Caretaker assigned to pet'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()


@app.route('/api/admin/pets/<int:pet_id>/assign-shelter', methods=['POST'])
@admin_required
def assign_shelter(pet_id):
    data = request.json
    shelter_id = data.get('shelter_id')
    if not shelter_id:
        return jsonify({'error':'shelter_id required'}), 400
    conn = get_db_connection()
    if not conn:
        return jsonify({'error':'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE Pet SET shelter_id = %s WHERE pet_id = %s", (shelter_id, pet_id))
        conn.commit()
        return jsonify({'message':'Pet assigned to shelter'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close(); conn.close()

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


# ============= USER MANAGEMENT ROUTES (ADMIN) =============

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def get_users():
    """Get all users for admin management"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, username, name, contact, is_admin FROM User ORDER BY username")
        users = cursor.fetchall()
        return jsonify(users), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/users/<int:user_id>/promote', methods=['POST'])
@admin_required
def promote_user(user_id):
    """Promote a user to admin"""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE User SET is_admin = 1 WHERE user_id = %s", (user_id,))
        conn.commit()
        return jsonify({'message': 'User promoted to admin'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()


@app.route('/api/admin/users/<int:user_id>/demote', methods=['POST'])
@admin_required
def demote_user(user_id):
    """Demote an admin user to regular user"""
    # Prevent demoting yourself
    if user_id == session.get('user_id'):
        return jsonify({'error': 'Cannot demote yourself'}), 400
    
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE User SET is_admin = 0 WHERE user_id = %s", (user_id,))
        conn.commit()
        return jsonify({'message': 'User demoted from admin'}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 400
    finally:
        cursor.close()
        conn.close()

# ============= ADMIN METRICS & HISTORY =============

@app.route('/api/admin/shelters/revenue', methods=['GET'])
@admin_required
def get_shelter_revenue_metrics():
    """Return revenue and pet counts per shelter for admin dashboard."""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT s.shelter_id, s.name, s.address, s.registration_number, s.revenue,
                   (SELECT COUNT(*) FROM Pet p WHERE p.shelter_id = s.shelter_id AND p.status = 'Adopted') AS adopted_count,
                   (SELECT COUNT(*) FROM Pet p WHERE p.shelter_id = s.shelter_id AND p.status = 'Available') AS available_count
            FROM Shelter s
            ORDER BY s.shelter_id
        """)
        shelters = cursor.fetchall()
        # Ensure numeric types serialized correctly
        for row in shelters:
            row['revenue'] = float(row.get('revenue', 0) or 0)
        return jsonify({'shelters': shelters}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close(); conn.close()

@app.route('/api/admin/adoptions/history', methods=['GET'])
@admin_required
def get_adoption_history():
    """Return adoption history (approved applications) with pet & user details."""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT aa.application_id, aa.date AS adoption_date, u.username, u.user_id,
                   p.pet_id, p.name AS pet_name, p.species, p.breed, p.price, p.shelter_id,
                   s.name AS shelter_name
            FROM AdopterApplication aa
            JOIN User u ON aa.user_id = u.user_id
            JOIN Pet p ON aa.pet_id = p.pet_id
            LEFT JOIN Shelter s ON p.shelter_id = s.shelter_id
            WHERE aa.status = 'approved'
            ORDER BY aa.date DESC, aa.application_id DESC
        """)
        history = cursor.fetchall()
        for row in history:
            row['price'] = float(row.get('price', 0) or 0)
        return jsonify({'adoptions': history}), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close(); conn.close()

# Admin: list all pets (including adopted)
@app.route('/api/admin/pets', methods=['GET'])
@admin_required
def admin_list_all_pets():
    """Return all pets regardless of status for admin management."""
    conn = get_db_connection()
    if not conn:
        return jsonify({'error': 'Database connection failed'}), 500
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT pet_id, name, species, breed, age, health_status, price, status, shelter_id, caretaker_id
            FROM Pet
            ORDER BY pet_id DESC
        """)
        pets = cursor.fetchall()
        # normalize numeric
        for p in pets:
            p['price'] = float(p.get('price', 0) or 0)
        return jsonify(pets), 200
    except Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close(); conn.close()

# NOTE: Wallet & revenue adjustments on adoption are handled inside stored procedure
# approve_adoption in routines_and_triggers.sql (atomic transaction updating User.wallet & Shelter.revenue).

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
