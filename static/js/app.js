// API Base URL — use same-origin so cookies/session work regardless of host (avoid localhost vs 127.0.0.1 mismatches)
const API_BASE = '/api';

// Current user state
let currentUser = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadPets();
    checkLoginStatus();
});

// Event Listeners
function setupEventListeners() {
    // Auth buttons
    document.getElementById('login-btn')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('register-btn')?.addEventListener('click', () => openModal('register-modal'));
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    document.getElementById('admin-logout-btn')?.addEventListener('click', logout);
    
    // Forms
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
    document.getElementById('donor-form')?.addEventListener('submit', handleDonorApplication);
    document.getElementById('wallet-form')?.addEventListener('submit', handleAddFunds);
    
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.target.getAttribute('href').substring(1);
            showSection(section);
        });
    });
    
    // Wallet display click
    document.getElementById('wallet-display')?.addEventListener('click', () => openModal('wallet-modal'));
}

// Modal Functions
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Section Navigation
function showSection(sectionId) {
    // Hide hero section unless showing pets or before login
    const hero = document.getElementById('hero');
    if (hero) {
        if (sectionId === 'pets' || sectionId === 'shop' || sectionId === 'donate' || sectionId === 'my-applications' || sectionId === 'my-orders') {
            hero.style.display = 'block';
        } else {
            hero.style.display = 'none';
        }
    }
    
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(sectionId);
    if (section) section.style.display = 'block';
    
    // Load section-specific data
    if (sectionId === 'shop') loadShopItems();
    if (sectionId === 'my-applications') loadMyApplications();
    if (sectionId === 'my-orders') loadMyOrders();
    if (sectionId === 'admin') {
        // Automatically load the admin dashboard when admin section is opened
        loadAdminDashboard();
    }
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        
    const data = await response.json();
    console.log('login response', response.status, data);
    if (response.ok) {
            // server returns is_admin separately
            currentUser = data.user || { username };
            currentUser.is_admin = data.is_admin || false;
            updateUIForLoggedInUser();
            closeModal('login-modal');
            showAlert('Login successful!', 'success');
            // If admin, automatically show admin dashboard
            if (currentUser.is_admin) {
                showSection('admin');
                showAdminTab('dashboard');
            }
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Login failed: ' + error.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const userData = {
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-password').value,
        name: document.getElementById('reg-name').value,
        contact: document.getElementById('reg-contact').value,
        address: document.getElementById('reg-address').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        if (response.ok) {
            closeModal('register-modal');
            showAlert('Registration successful! Please login.', 'success');
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Registration failed: ' + error.message, 'error');
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, {method: 'POST', credentials: 'include'});
        currentUser = null;
        updateUIForLoggedOutUser();
        showAlert('Logged out successfully', 'success');
    } catch (error) {
        showAlert('Logout failed', 'error');
    }
}

function checkLoginStatus() {
    // Check if user is logged in via session using /api/me
    fetch(`${API_BASE}/me`, {credentials: 'include'})
        .then(res => {
            console.log('checkLoginStatus /api/me status', res.status);
            if (!res.ok) throw new Error('Not authenticated');
            return res.json();
        })
        .then(data => {
            if (data.user) {
                currentUser = data.user;
                // is_admin is already in data.user from /api/me endpoint
                console.log('checkLoginStatus - currentUser:', currentUser);
                updateUIForLoggedInUser();
                if (!currentUser.is_admin) {
                    loadWalletBalance();
                } else {
                    // If admin, automatically show admin dashboard
                    showSection('admin');
                    showAdminTab('dashboard');
                }
            } else {
                updateUIForLoggedOutUser();
            }
        })
        .catch(() => updateUIForLoggedOutUser());
}

function updateUIForLoggedInUser() {
    console.log('=== updateUIForLoggedInUser called ===');
    console.log('currentUser:', currentUser);
    console.log('currentUser.is_admin:', currentUser?.is_admin);
    
    const userMenu = document.getElementById('user-menu');
    const adminMenu = document.getElementById('admin-menu');
    const authMenu = document.getElementById('auth-menu');
    const userNavLinks = document.querySelectorAll('#user-nav-link');
    
    // Force remove all display styles first
    if (userMenu) userMenu.style.cssText = '';
    if (adminMenu) adminMenu.style.cssText = '';
    if (authMenu) authMenu.style.cssText = '';
    
    if (currentUser && currentUser.is_admin === true) {
        console.log('>>> ADMIN USER - hiding nav links and user menu');
        // Admin user: show admin menu, hide user menu and auth menu
        if (adminMenu) {
            adminMenu.style.display = 'flex !important';
            adminMenu.style.cssText = 'display: flex !important;';
            console.log('adminMenu visible: YES');
        }
        if (userMenu) {
            userMenu.style.display = 'none !important';
            userMenu.style.cssText = 'display: none !important;';
            console.log('userMenu hidden: YES');
        }
        if (authMenu) {
            authMenu.style.display = 'none !important';
            authMenu.style.cssText = 'display: none !important;';
            console.log('authMenu hidden: YES');
        }
        // Hide user nav links for admin
        userNavLinks.forEach((link, index) => {
            link.style.display = 'none !important';
            link.style.cssText = 'display: none !important;';
            console.log(`Nav link ${index} (${link.textContent}) hidden: YES`);
        });
    } else {
        console.log('>>> REGULAR USER - showing nav links and user menu');
        // Regular user: show user menu, hide admin menu and auth menu
        if (userMenu) {
            userMenu.style.display = 'flex';
            console.log('userMenu visible: YES');
        }
        if (adminMenu) {
            adminMenu.style.display = 'none';
            console.log('adminMenu hidden: YES');
        }
        if (authMenu) {
            authMenu.style.display = 'none';
            console.log('authMenu hidden: YES');
        }
        // Show user nav links for regular users
        userNavLinks.forEach((link, index) => {
            link.style.display = 'inline-block';
            console.log(`Nav link ${index} (${link.textContent}) visible: YES`);
        });
        // Set username display
        if (currentUser && currentUser.username) {
            const uname = document.getElementById('username-display');
            if (uname) {
                uname.textContent = currentUser.username;
                uname.style.marginRight = '15px';
                uname.style.fontWeight = 'bold';
                console.log('username displayed:', currentUser.username);
            }
        }
    }
}

function updateUIForLoggedOutUser() {
    const userMenu = document.getElementById('user-menu');
    const adminMenu = document.getElementById('admin-menu');
    const authMenu = document.getElementById('auth-menu');
    const userNavLinks = document.querySelectorAll('#user-nav-link');
    
    if (userMenu) userMenu.style.display = 'none';
    if (adminMenu) adminMenu.style.display = 'none';
    if (authMenu) authMenu.style.display = 'flex';
    
    const uname = document.getElementById('username-display');
    if (uname) uname.textContent = '';
    
    // Show user nav links
    userNavLinks.forEach(link => link.style.display = 'inline-block');
}

// Wallet
async function loadWalletBalance() {
    try {
        const walletDisplay = document.getElementById('wallet-display');
        // Only load if element exists (wallet-display is only for non-admin users)
        if (!walletDisplay) return;
        
        const response = await fetch(`${API_BASE}/wallet/balance`, {credentials: 'include'});
        const data = await response.json();
        if (response.ok) {
            walletDisplay.textContent = `$${data.balance.toFixed(2)}`;
        }
    } catch (error) {
        console.error('Failed to load wallet balance', error);
    }
}

async function handleAddFunds(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('wallet-amount').value);
    
    try {
        const response = await fetch(`${API_BASE}/wallet/add-funds`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({amount})
        });
        
        const data = await response.json();
        if (response.ok) {
            loadWalletBalance();
            closeModal('wallet-modal');
            showAlert('Funds added successfully!', 'success');
            document.getElementById('wallet-form').reset();
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to add funds', 'error');
    }
}

// Shelters
async function loadShelters() {
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        
        const select = document.getElementById('shelter-filter');
        select.innerHTML = '<option value="">All Shelters</option>';
        shelters.forEach(shelter => {
            const option = document.createElement('option');
            option.value = shelter.shelter_id;
            option.textContent = shelter.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load shelters', error);
    }
}

// Pets
async function loadPets() {
    const queryEl = document.getElementById('pet-search');
    const q = queryEl ? queryEl.value.trim() : '';
    let url = `${API_BASE}/pets`;
    if (q) {
        const params = new URLSearchParams({ q });
        url = `${url}?${params.toString()}`;
    }
    
    try {
        const response = await fetch(url, {credentials: 'include'});
        const pets = await response.json();
        displayPets(pets);
    } catch (error) {
        showAlert('Failed to load pets', 'error');
    }
}

function displayPets(pets) {
    const grid = document.getElementById('pets-grid');
    grid.innerHTML = '';
    
    if (pets.length === 0) {
        grid.innerHTML = '<p>No pets available at the moment.</p>';
        return;
    }
    
    pets.forEach(pet => {
        const card = document.createElement('div');
        card.className = 'card';
        const statusBadge = pet.status ? `<span class="badge badge-success">${pet.status}</span>` : '';
        card.innerHTML = `
            <h3 class="card-title">${pet.name}</h3>
            <p class="card-info"><strong>Species:</strong> ${pet.species}</p>
            <p class="card-info"><strong>Breed:</strong> ${pet.breed || 'Mixed'}</p>
            <p class="card-info"><strong>Age:</strong> ${pet.age || 'Unknown'} years</p>
            <p class="card-info"><strong>Price:</strong> $${pet.price}</p>
            ${statusBadge}
            <div class="card-actions">
                <button class="btn btn-primary" onclick="viewPetDetails(${pet.pet_id})">View Details</button>
                <button class="btn btn-success" onclick="applyForAdoption(${pet.pet_id})">Apply to Adopt</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function viewPetDetails(petId) {
    try {
    const response = await fetch(`${API_BASE}/pets/${petId}`, {credentials: 'include'});
        const pet = await response.json();
        
        let vetRecordsHtml = '<h4>Veterinary Records</h4>';
        if (pet.vet_records && pet.vet_records.length > 0) {
            vetRecordsHtml += pet.vet_records.map(record => `
                <div class="card" style="margin: 0.5rem 0;">
                    <p><strong>Date:</strong> ${record.checkup_date}</p>
                    <p><strong>Remarks:</strong> ${record.remarks}</p>
                    <p><strong>Treatment:</strong> ${record.treatment}</p>
                </div>
            `).join('');
        } else {
            vetRecordsHtml += '<p>No vet records available.</p>';
        }
        
        document.getElementById('pet-detail').innerHTML = `
            <h2>${pet.name}</h2>
            <p><strong>Species:</strong> ${pet.species}</p>
            <p><strong>Breed:</strong> ${pet.breed || 'Mixed'}</p>
            <p><strong>Age:</strong> ${pet.age || 'Unknown'} years</p>
            <p><strong>Health Status:</strong> ${pet.health_status || 'Not specified'}</p>
            <p><strong>Price:</strong> $${pet.price}</p>
            <p><strong>Shelter:</strong> ${pet.shelter_name || 'N/A'}</p>
            <p><strong>Caretaker:</strong> ${pet.caretaker_name || 'N/A'}</p>
            ${vetRecordsHtml}
            <button class="btn btn-success" onclick="applyForAdoption(${pet.pet_id}); closeModal('pet-modal');">Apply to Adopt</button>
        `;
        
        openModal('pet-modal');
    } catch (error) {
        showAlert('Failed to load pet details', 'error');
    }
}

async function applyForAdoption(petId) {
    if (!currentUser) {
        showAlert('Please login to apply for adoption', 'error');
        openModal('login-modal');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/adoptions/apply`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({pet_id: petId})
        });
        
        const data = await response.json();
        if (response.ok) {
            showAlert('Application submitted successfully!', 'success');
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to submit application', 'error');
    }
}

// Shop
async function loadShopItems() {
    try {
        const queryEl = document.getElementById('shop-search');
        const q = queryEl ? queryEl.value.trim() : '';
        let url = `${API_BASE}/shop/items`;
        if (q) {
            const params = new URLSearchParams({ q });
            url = `${url}?${params.toString()}`;
        }
        const response = await fetch(url, {credentials: 'include'});
        const items = await response.json();
        displayShopItems(items);
    } catch (error) {
        showAlert('Failed to load shop items', 'error');
    }
}

function displayShopItems(items) {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    
    if (items.length === 0) {
        grid.innerHTML = '<p>No items available.</p>';
        return;
    }
    
    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h3 class="card-title">${item.name}</h3>
            <p class="card-info">${item.description || ''}</p>
            <p class="card-info"><strong>Price:</strong> $${item.price}</p>
            <p class="card-info"><strong>Stock:</strong> ${item.stock_quantity}</p>
            <p class="card-info"><strong>Shelter:</strong> ${item.shelter_name}</p>
            <div class="card-actions">
                <input type="number" id="qty-${item.item_id}" min="1" max="${item.stock_quantity}" value="1" style="width: 60px; padding: 0.3rem;">
                <button class="btn btn-success" onclick="addToCart(${item.item_id}, ${item.price}, ${item.shelter_id}, '${item.name.replace(/'/g, "\'")}')">Add to Cart</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Cart functionality
const cart = new Map(); // item_id -> {name, price, shelter_id, quantity}

function addToCart(itemId, price, shelterId, name) {
    if (!currentUser) {
        showAlert('Please login to add items to cart', 'error');
        openModal('login-modal');
        return;
    }
    const qtyInput = document.getElementById(`qty-${itemId}`);
    const qty = Math.max(1, parseInt(qtyInput?.value || '1'));
    if (cart.has(itemId)) {
        const entry = cart.get(itemId);
        entry.quantity += qty;
        cart.set(itemId, entry);
    } else {
        cart.set(itemId, {name, price: Number(price), shelter_id: shelterId, quantity: qty});
    }
    updateCartDisplay();
}

function updateCartDisplay() {
    const list = document.getElementById('cart-list');
    const totalEl = document.getElementById('cart-total');
    if (!list || !totalEl) return;
    if (cart.size === 0) {
        list.innerHTML = '<p>Your cart is empty.</p>';
        totalEl.textContent = '$0.00';
        return;
    }
    let html = '';
    let total = 0;
    cart.forEach((entry, itemId) => {
        const line = entry.price * entry.quantity;
        total += line;
        html += `<div style="display:flex; justify-content: space-between; align-items:center; gap:10px; margin:4px 0;">
            <div>
                <strong>${entry.name}</strong><br/>
                <small>$${entry.price.toFixed(2)} x </small>
                <input type="number" min="1" value="${entry.quantity}" style="width:60px;" onchange="setCartQty(${itemId}, this.value)">
            </div>
            <div>
                $${line.toFixed(2)}
                <button class="btn btn-danger btn-small" style="margin-left:8px;" onclick="removeFromCart(${itemId})">x</button>
            </div>
        </div>`;
    });
    list.innerHTML = html;
    totalEl.textContent = `$${total.toFixed(2)}`;
}

function setCartQty(itemId, value) {
    const qty = Math.max(1, parseInt(value || '1'));
    if (cart.has(itemId)) {
        const entry = cart.get(itemId);
        entry.quantity = qty;
        cart.set(itemId, entry);
        updateCartDisplay();
    }
}

function removeFromCart(itemId) {
    cart.delete(itemId);
    updateCartDisplay();
}

async function checkoutCart() {
    if (!currentUser) {
        showAlert('Please login to checkout', 'error');
        openModal('login-modal');
        return;
    }
    if (cart.size === 0) {
        showAlert('Your cart is empty', 'error');
        return;
    }
    const items = Array.from(cart.entries()).map(([item_id, e]) => ({item_id, quantity: e.quantity}));
    try {
        const response = await fetch(`${API_BASE}/shop/order/batch`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({items})
        });
        const data = await response.json();
        if (response.ok) {
            showAlert(`Order placed successfully! Charged $${Number(data.total_charged || 0).toFixed(2)}`, 'success');
            cart.clear();
            updateCartDisplay();
            loadWalletBalance();
            loadShopItems();
        } else {
            if (data.error && data.required !== undefined && data.balance !== undefined) {
                showAlert(`${data.error}. Required: $${Number(data.required).toFixed(2)}, Balance: $${Number(data.balance).toFixed(2)}`, 'error');
            } else {
                showAlert(data.error || 'Checkout failed', 'error');
            }
        }
    } catch (err) {
        showAlert('Checkout failed: ' + err.message, 'error');
    }
}

async function loadShopShelterDropdown() {
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        const select = document.getElementById('shop-shelter-filter');
        if (!select) return;
        select.innerHTML = '<option value="">All Shelters</option>';
        shelters.forEach(s => {
            const option = document.createElement('option');
            option.value = s.shelter_id;
            option.textContent = s.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load shop shelters', error);
    }
}

// Donor Application
async function handleDonorApplication(e) {
    e.preventDefault();
    
    if (!currentUser) {
        showAlert('Please login to donate a pet', 'error');
        openModal('login-modal');
        return;
    }
    
    const donorData = {
        pet_name: document.getElementById('donate-name').value,
        species: document.getElementById('donate-species').value,
        breed: document.getElementById('donate-breed').value,
        age: parseInt(document.getElementById('donate-age').value) || null,
        health_status: document.getElementById('donate-health').value,
        description: document.getElementById('donate-description').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/donors/apply`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(donorData)
        });
        
        const data = await response.json();
        if (response.ok) {
            showAlert('Donation application submitted!', 'success');
            document.getElementById('donor-form').reset();
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to submit donation', 'error');
    }
}

// My Applications
async function loadMyApplications() {
    if (!currentUser) {
        document.getElementById('applications-list').innerHTML = '<p>Please login to view your applications.</p>';
        return;
    }
    
    try {
    const response = await fetch(`${API_BASE}/adoptions/my-applications`, {credentials: 'include'});
        const applications = await response.json();
        
        const list = document.getElementById('applications-list');
        list.innerHTML = '';
        
        if (applications.length === 0) {
            list.innerHTML = '<p>No applications yet.</p>';
            return;
        }
        
        applications.forEach(app => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${app.pet_name}</h3>
                <p><strong>Species:</strong> ${app.species}</p>
                <p><strong>Breed:</strong> ${app.breed}</p>
                <p><strong>Price:</strong> $${app.price}</p>
                <p><strong>Status:</strong> <span class="badge ${
                    app.status === 'approved' ? 'badge-success' :
                    app.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                }">${app.status}</span></p>
                <p><strong>Date:</strong> ${app.date}</p>
            `;
            list.appendChild(card);
        });
    } catch (error) {
        showAlert('Failed to load applications', 'error');
    }
}

// My Orders
async function loadMyOrders() {
    if (!currentUser) {
        document.getElementById('orders-list').innerHTML = '<p>Please login to view your orders.</p>';
        return;
    }
    
    try {
    const response = await fetch(`${API_BASE}/shop/my-orders`, {credentials: 'include'});
        const orders = await response.json();
        
        const list = document.getElementById('orders-list');
        list.innerHTML = '';
        
        if (orders.length === 0) {
            list.innerHTML = '<p>No orders yet.</p>';
            return;
        }
        
        orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${order.item_name}</h3>
                <p><strong>Shelter:</strong> ${order.shelter_name}</p>
                <p><strong>Quantity:</strong> ${order.quantity}</p>
                <p><strong>Total Price:</strong> $${order.price}</p>
                <p><strong>Date:</strong> ${order.order_date}</p>
            `;
            list.appendChild(card);
        });
    } catch (error) {
        showAlert('Failed to load orders', 'error');
    }
}

// Alert
function showAlert(message, type) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    document.body.insertBefore(alert, document.body.firstChild);
    
    setTimeout(() => alert.remove(), 5000);
}

// Make functions global
window.showSection = showSection;
window.closeModal = closeModal;
window.viewPetDetails = viewPetDetails;
window.applyForAdoption = applyForAdoption;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.setCartQty = setCartQty;
window.checkoutCart = checkoutCart;
window.loadPets = loadPets;

// Admin Functions
function showAdminTab(tabName) {
    const content = document.getElementById('admin-content');
    if (tabName === 'dashboard') {
        loadAdminDashboard();
    } else if (tabName === 'shelters') {
        loadAdminShelters();
    } else if (tabName === 'pets') {
        loadAdminPets();
    } else if (tabName === 'shopitems') {
        loadAdminShopItems();
    } else if (tabName === 'caretakers') {
        loadAdminCaretakers();
    } else if (tabName === 'users') {
        loadAdminUsers();
    } else if (tabName === 'revenue') {
        loadAdminRevenue();
    } else if (tabName === 'adoptions') {
        loadAdoptionHistory();
    }
}

// Admin Dashboard - show adoption and donor applications
async function loadAdminDashboard() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch('/api/admin/applications', {credentials: 'include'});
        const applications = await response.json();
        console.log('Admin applications data:', applications);
        
        let html = `<h3>Dashboard - Adoption & Donor Applications</h3>`;
        
        if (!applications || applications.length === 0) {
            html += '<p>No applications at this time.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>Type</th><th>User</th><th>Pet</th><th>Status</th><th>Date</th><th>Actions</th></tr>';
            applications.forEach(app => {
                const statusColor = app.status === 'approved' ? 'green' : app.status === 'rejected' ? 'red' : 'orange';
                // Get the application ID - handle both adoption and donor apps
                let appId = app.adoption_app_id || app.donor_app_id;
                // If still undefined, try application_id (in case DB returns it)
                if (appId === undefined) appId = app.application_id;
                const appType = app.type === 'adoption' ? 'adoption' : 'donor';
                console.log(`App: type=${appType}, appId=${appId}, adoption_app_id=${app.adoption_app_id}, donor_app_id=${app.donor_app_id}`);
                html += `<tr>
                    <td><strong>${app.type === 'adoption' ? 'Adoption' : 'Donor'}</strong></td>
                    <td>${app.username}</td>
                    <td>${app.pet_name}</td>
                    <td style="color: ${statusColor}; font-weight: bold;">${app.status}</td>
                    <td>${app.date}</td>
                    <td>
                        ${app.status === 'pending' ? `<button class="btn btn-success btn-small" onclick="updateApplicationStatus(${appId}, '${appType}', 'approved')">Approve</button>` : ''}
                        ${app.status === 'pending' ? `<button class="btn btn-danger btn-small" onclick="updateApplicationStatus(${appId}, '${appType}', 'rejected')">Reject</button>` : ''}
                    </td>
                </tr>`;
            });
            html += '</table>';
        }
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading applications: ${error.message}</p>`;
    }
}

async function updateApplicationStatus(appId, appType, newStatus) {
    if (!confirm(`Update application status to ${newStatus}?`)) return;
    
    try {
        const endpoint = appType === 'adoption' 
            ? `/api/adoptions/${appId}/${newStatus === 'approved' ? 'approve' : 'reject'}`
            : `/api/donors/${appId}/${newStatus === 'approved' ? 'accept' : 'reject'}`;
        
        console.log(`updateApplicationStatus: appId=${appId}, appType=${appType}, newStatus=${newStatus}, endpoint=${endpoint}`);
        
        // Prepare request body based on action
        let requestBody = {};
        if (appType === 'adoption' && newStatus === 'rejected') {
            requestBody = { reason: 'Rejected by admin' };
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        console.log(`Response status: ${response.status}, data:`, data);
        
        if (response.ok) {
            showAlert(`Application ${newStatus}!`, 'success');
            loadAdminDashboard();
        } else {
            alert(`Error: ${data.error || 'Failed to update application'}`);
        }
    } catch (error) {
        alert(`Failed to update application: ${error.message}`);
    }
}

// Load and display all shelters with CRUD
async function loadAdminShelters() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        
        let html = `<h3>Manage Shelters</h3>
            <button class="btn btn-primary" onclick="showShelterForm(null)">+ Add Shelter</button>
            <div id="shelter-form" style="display:none; margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px;">
                <h4>Shelter Form</h4>
                <input type="hidden" id="shelter-id">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="shelter-name" required>
                </div>
                <div class="form-group">
                    <label>Location:</label>
                    <input type="text" id="shelter-location" required>
                </div>
                <div class="form-group">
                    <label>Registration Number:</label>
                    <input type="text" id="shelter-registration">
                </div>
                <button class="btn btn-success" onclick="saveShelter()">Save</button>
                <button class="btn btn-secondary" onclick="showShelterForm(null)">Cancel</button>
            </div>
            <div id="shelters-list" style="margin-top: 20px;">`;
        
        if (shelters.length === 0) {
            html += '<p>No shelters found.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>ID</th><th>Name</th><th>Location</th><th>Reg. Number</th><th>Revenue</th><th>Actions</th></tr>';
            shelters.forEach(s => {
                const nameStyle = !s.name ? 'style="background-color: #ffcccc;"' : '';
                const locStyle = !s.address ? 'style="background-color: #ffcccc;"' : '';
                const regStyle = !s.registration_number ? 'style="background-color: #ffcccc;"' : '';
                html += `<tr>
                    <td>${s.shelter_id}</td>
                    <td ${nameStyle}>${s.name || '(empty)'}</td>
                    <td ${locStyle}>${s.address || '(empty)'}</td>
                    <td ${regStyle}>${s.registration_number || '(empty)'}</td>
                    <td>$${(s.revenue || 0).toFixed ? s.revenue.toFixed(2) : Number(s.revenue || 0).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-small" onclick="showShelterForm(${s.shelter_id}, '${s.name}', '${s.address}', '${s.registration_number}')">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteShelter(${s.shelter_id})">Delete</button>
                    </td>
                </tr>`;
            });
            html += '</table>';
        }
        html += '</div>';
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading shelters: ${error.message}</p>`;
    }
}

// Load and manage shop items (admin)
async function loadAdminShopItems() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/admin/shop/items`, {credentials: 'include'});
        const items = await response.json();

        let html = `<h3>Manage Shop Items</h3>
            <button class="btn btn-primary" onclick="showShopItemForm(null)">+ Add Item</button>
            <div id="shopitem-form" style="display:none; margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px;">
                <h4>Shop Item Form</h4>
                <input type="hidden" id="shopitem-id">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="shopitem-name" required>
                </div>
                <div class="form-group">
                    <label>Description:</label>
                    <input type="text" id="shopitem-description">
                </div>
                <div class="form-group">
                    <label>Price:</label>
                    <input type="number" id="shopitem-price" step="0.01" min="0" required>
                </div>
                <div class="form-group">
                    <label>Stock Quantity:</label>
                    <input type="number" id="shopitem-stock" min="0" required>
                </div>
                <div class="form-group">
                    <label>Shelter:</label>
                    <select id="shopitem-shelter-id"></select>
                </div>
                <button class="btn btn-success" onclick="saveShopItem()">Save</button>
                <button class="btn btn-secondary" onclick="showShopItemForm(null)">Cancel</button>
            </div>
            <div id="shopitems-list" style="margin-top: 20px;">`;

        if (!items || items.length === 0) {
            html += '<p>No shop items found.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>ID</th><th>Name</th><th>Description</th><th>Price</th><th>Stock</th><th>Shelter</th><th>Actions</th></tr>';
            items.forEach(i => {
                const nameEsc = (i.name || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                const descEsc = (i.description || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                html += `<tr>
                    <td>${i.item_id}</td>
                    <td>${i.name || ''}</td>
                    <td>${i.description || ''}</td>
                    <td>$${Number(i.price || 0).toFixed(2)}</td>
                    <td>${i.stock_quantity || 0}</td>
                    <td>${i.shelter_name || ''}</td>
                    <td>
                        <button class="btn btn-small" onclick="showShopItemForm(${i.item_id}, '${nameEsc}', '${descEsc}', ${Number(i.price || 0)}, ${Number(i.stock_quantity || 0)}, ${i.shelter_id})">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteShopItem(${i.item_id})">Delete</button>
                    </td>
                </tr>`;
            });
            html += '</table>';
        }
        html += '</div>';
        content.innerHTML = html;

        // Populate shelter dropdown
        await loadShelterDropdownForShopItem();
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading shop items: ${error.message}</p>`;
    }
}

async function loadShelterDropdownForShopItem() {
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        const select = document.getElementById('shopitem-shelter-id');
        if (!select) return;
        select.innerHTML = '<option value="">Select Shelter</option>';
        shelters.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.shelter_id;
            opt.textContent = s.name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load shelters for shop item', e);
    }
}

function showShopItemForm(id, name = '', description = '', price = '', stock = '', shelter_id = '') {
    document.getElementById('shopitem-id').value = id || '';
    document.getElementById('shopitem-name').value = name || '';
    document.getElementById('shopitem-description').value = description || '';
    document.getElementById('shopitem-price').value = price || '';
    document.getElementById('shopitem-stock').value = stock || '';
    document.getElementById('shopitem-shelter-id').value = shelter_id || '';
    const form = document.getElementById('shopitem-form');
    form.style.display = id ? 'block' : (form.style.display === 'none' ? 'block' : 'none');
}

async function saveShopItem() {
    const id = document.getElementById('shopitem-id').value;
    const name = document.getElementById('shopitem-name').value;
    const description = document.getElementById('shopitem-description').value;
    const price = document.getElementById('shopitem-price').value;
    const stock_quantity = document.getElementById('shopitem-stock').value;
    const shelter_id = document.getElementById('shopitem-shelter-id').value;
    if (!name || shelter_id === '' || price === '') {
        alert('Name, Price and Shelter are required');
        return;
    }
    const url = id ? `/api/admin/shop/items/${id}` : '/api/admin/shop/items';
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, description, price: Number(price), stock_quantity: Number(stock_quantity || 0), shelter_id: Number(shelter_id)})
        });
        const data = await response.json();
        if (response.ok) {
            showAlert(id ? 'Item updated!' : 'Item created!', 'success');
            loadAdminShopItems();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (e) {
        alert('Failed to save item: ' + e.message);
    }
}

async function deleteShopItem(id) {
    if (!confirm('Delete this item?')) return;
    try {
        const response = await fetch(`/api/admin/shop/items/${id}`, { method: 'DELETE', credentials: 'include' });
        const data = await response.json();
        if (response.ok) {
            showAlert('Item deleted!', 'success');
            loadAdminShopItems();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (e) {
        alert('Failed to delete item: ' + e.message);
    }
}
// Admin Finance: show shelter revenues and counts
async function loadAdminRevenue() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/admin/shelters/revenue`, {credentials: 'include'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load revenue');
        const shelters = data.shelters || [];
        const totalRevenue = shelters.reduce((sum, s) => sum + (Number(s.revenue) || 0), 0);
        let html = `<h3>Finance - Shelter Revenues</h3>
            <div class="card"><strong>Total Revenue:</strong> $${totalRevenue.toFixed(2)}</div>
            <table border="1" style="width:100%; border-collapse: collapse; margin-top: 10px;">
                <tr><th>Shelter</th><th>Revenue</th><th>Adopted Pets</th><th>Available Pets</th></tr>`;
        shelters.forEach(s => {
            html += `<tr>
                <td>${s.name} (#${s.shelter_id})</td>
                <td>$${Number(s.revenue || 0).toFixed(2)}</td>
                <td>${s.adopted_count}</td>
                <td>${s.available_count}</td>
            </tr>`;
        });
        html += '</table>';
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading revenue: ${error.message}</p>`;
    }
}

// Admin: Adoption history view
async function loadAdoptionHistory() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/admin/adoptions/history`, {credentials: 'include'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load adoptions');
        const adoptions = data.adoptions || [];
        let html = `<h3>Adoption History</h3>`;
        if (adoptions.length === 0) {
            html += '<p>No adoptions yet.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>Date</th><th>User</th><th>Pet</th><th>Species/Breed</th><th>Price</th><th>Shelter</th></tr>';
            adoptions.forEach(a => {
                html += `<tr>
                    <td>${a.adoption_date}</td>
                    <td>${a.username} (#${a.user_id})</td>
                    <td>${a.pet_name} (#${a.pet_id})</td>
                    <td>${a.species}${a.breed ? ' / ' + a.breed : ''}</td>
                    <td>$${Number(a.price || 0).toFixed(2)}</td>
                    <td>${a.shelter_name || ''}</td>
                </tr>`;
            });
            html += '</table>';
        }
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading adoption history: ${error.message}</p>`;
    }
}

function showShelterForm(id, name = '', location = '', registration = '') {
    document.getElementById('shelter-id').value = id || '';
    document.getElementById('shelter-name').value = name;
    document.getElementById('shelter-location').value = location;
    document.getElementById('shelter-registration').value = registration;
    document.getElementById('shelter-form').style.display = id ? 'block' : (document.getElementById('shelter-form').style.display === 'none' ? 'block' : 'none');
}

async function saveShelter() {
    const id = document.getElementById('shelter-id').value;
    const name = document.getElementById('shelter-name').value;
    const location = document.getElementById('shelter-location').value;
    const registration_number = document.getElementById('shelter-registration').value;
    
    if (!name) {
        alert('Shelter name is required');
        return;
    }
    
    const url = id ? `/api/admin/shelters/${id}` : '/api/admin/shelters';
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, location, registration_number})
        });
        const data = await response.json();
        if (response.ok) {
            showAlert(id ? 'Shelter updated!' : 'Shelter created!', 'success');
            loadAdminShelters();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to save shelter: ${error.message}`);
    }
}

async function deleteShelter(id) {
    if (!confirm('Delete this shelter?')) return;
    try {
        const response = await fetch(`/api/admin/shelters/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Shelter deleted!', 'success');
            loadAdminShelters();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to delete shelter: ${error.message}`);
    }
}

// Load and display all pets with CRUD
async function loadAdminPets() {
    const content = document.getElementById('admin-content');
    try {
        // Fetch all pets (including adopted) via admin endpoint
        const response = await fetch(`${API_BASE}/admin/pets`, {credentials: 'include'});
        const pets = await response.json();
        
        let html = `<h3>Manage Pets</h3>
            <button class="btn btn-primary" onclick="showPetForm(null)">+ Add Pet</button>
            <div id="pet-form" style="display:none; margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px;">
                <h4>Pet Form</h4>
                <input type="hidden" id="pet-id">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="pet-name" required>
                </div>
                <div class="form-group">
                    <label>Species:</label>
                    <input type="text" id="pet-species" required>
                </div>
                <div class="form-group">
                    <label>Breed:</label>
                    <input type="text" id="pet-breed">
                </div>
                <div class="form-group">
                    <label>Age:</label>
                    <input type="number" id="pet-age">
                </div>
                <div class="form-group">
                    <label>Price:</label>
                    <input type="number" id="pet-price" step="0.01">
                </div>
                <div class="form-group">
                    <label>Health Status:</label>
                    <input type="text" id="pet-health-status">
                </div>
                <div class="form-group">
                    <label>Status:</label>
                    <select id="pet-status">
                        <option value="Available">Available</option>
                        <option value="Adopted">Adopted</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Shelter:</label>
                    <select id="pet-shelter-id"></select>
                </div>
                <div class="form-group">
                    <label>Caretaker:</label>
                    <select id="pet-caretaker-id"></select>
                </div>
                <button class="btn btn-success" onclick="savePet()">Save</button>
                <button class="btn btn-secondary" onclick="showPetForm(null)">Cancel</button>
            </div>
            <div id="pets-list" style="margin-top: 20px;">`;
        
        if (pets.length === 0) {
            html += '<p>No pets found.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>ID</th><th>Name</th><th>Species</th><th>Breed</th><th>Age</th><th>Health</th><th>Status</th><th>Price</th><th>Actions</th></tr>';
            pets.forEach(p => {
                const nameStyle = !p.name ? 'style="background-color: #ffcccc;"' : '';
                const specStyle = !p.species ? 'style="background-color: #ffcccc;"' : '';
                const healthStyle = !p.health_status ? 'style="background-color: #ffcccc;"' : '';
                html += `<tr>
                    <td>${p.pet_id}</td>
                    <td ${nameStyle}>${p.name || '(empty)'}</td>
                    <td ${specStyle}>${p.species || '(empty)'}</td>
                    <td>${p.breed || '(empty)'}</td>
                    <td>${p.age || '(empty)'}</td>
                    <td ${healthStyle}>${p.health_status || '(empty)'}</td>
                    <td>${p.status || 'Available'}</td>
                    <td>$${p.price || '0'}</td>
                    <td>
                        <button class="btn btn-small" onclick="showPetForm(${p.pet_id})">Edit</button>
                        <button class="btn btn-small" onclick="openVetModal(${p.pet_id}, '${p.name}')">Vet Records</button>
                        <button class="btn btn-danger btn-small" onclick="deletePet(${p.pet_id})">Delete</button>
                    </td>
                </tr>`;
            });
            html += '</table>';
        }
        html += '</div>';
        content.innerHTML = html;
        
        // Populate shelter and caretaker dropdowns
        loadShelterDropdown();
        loadCaretakerDropdown();
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading pets: ${error.message}</p>`;
    }
}

async function loadShelterDropdown() {
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        const select = document.getElementById('pet-shelter-id');
        select.innerHTML = '<option value="">Select Shelter</option>';
        shelters.forEach(s => {
            select.innerHTML += `<option value="${s.shelter_id}">${s.name}</option>`;
        });
        // Attach change listener to dynamically filter caretakers by selected shelter
        select.addEventListener('change', () => {
            const shelterId = select.value;
            loadCaretakerDropdown(shelterId || null);
        });
    } catch (error) {
        console.error('Failed to load shelters', error);
    }
}

async function loadCaretakerDropdown(shelterId = null) {
    try {
        // If a shelter is chosen, fetch only caretakers from that shelter
        const url = shelterId ? `${API_BASE}/caretakers?shelter_id=${encodeURIComponent(shelterId)}` : `${API_BASE}/caretakers`;
        const response = await fetch(url, {credentials: 'include'});
        const caretakers = await response.json();
        const select = document.getElementById('pet-caretaker-id');
        select.innerHTML = '<option value="">None (No Caretaker)</option>';
        caretakers.forEach(c => {
            select.innerHTML += `<option value="${c.caretaker_id}">${c.name}</option>`;
        });
        // If currently selected caretaker not in filtered list, clear selection
        const currentVal = select.value;
        if (currentVal && !caretakers.some(c => String(c.caretaker_id) === currentVal)) {
            select.value = '';
        }
    } catch (error) {
        console.error('Failed to load caretakers', error);
    }
}

function showPetForm(id) {
    if (id) {
        // Load pet details and populate form
        loadPetDetails(id);
        document.getElementById('pet-form').style.display = 'block';
    } else {
        document.getElementById('pet-id').value = '';
        document.getElementById('pet-name').value = '';
        document.getElementById('pet-species').value = '';
        document.getElementById('pet-breed').value = '';
        document.getElementById('pet-age').value = '';
        document.getElementById('pet-price').value = '';
        document.getElementById('pet-health-status').value = '';
        document.getElementById('pet-status').value = 'Available';
        document.getElementById('pet-shelter-id').value = '';
        document.getElementById('pet-caretaker-id').value = '';
        document.getElementById('pet-form').style.display = document.getElementById('pet-form').style.display === 'none' ? 'block' : 'none';
    }
}

// ===== Vet Record Modal Logic =====
async function openVetModal(petId, petName) {
    // build modal dynamically if not present
    let modal = document.getElementById('vet-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'vet-modal';
        modal.className = 'modal';
        modal.innerHTML = `
        <div class="modal-content modal-large">
            <span class="close" onclick="closeVetModal()">&times;</span>
            <div id="vet-modal-body"></div>
        </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'block';
    const body = document.getElementById('vet-modal-body');
    body.innerHTML = `<h3>Vet Records for ${petName} (ID ${petId})</h3>
        <div id="vet-record-list">Loading...</div>
        <h4 style="margin-top:1rem;">Add New Record</h4>
        <form id="vet-record-form" onsubmit="submitVetRecord(event, ${petId})">
            <div class="form-group"><label>Date:</label><input type="date" id="vet-date" /></div>
            <div class="form-group"><label>Remarks:</label><input type="text" id="vet-remarks" /></div>
            <div class="form-group"><label>Treatment:</label><input type="text" id="vet-treatment" /></div>
            <button class="btn btn-success" type="submit">Add Record</button>
        </form>`;
    loadVetRecords(petId);
}

function closeVetModal() {
    const modal = document.getElementById('vet-modal');
    if (modal) modal.style.display = 'none';
}

async function loadVetRecords(petId) {
    try {
        const response = await fetch(`${API_BASE}/pets/${petId}`, {credentials: 'include'});
        const pet = await response.json();
        const list = document.getElementById('vet-record-list');
        if (!response.ok) {
            list.innerHTML = `<p style='color:red'>Failed to load: ${pet.error || 'Unknown error'}</p>`;
            return;
        }
        const records = pet.vet_records || [];
        if (records.length === 0) {
            list.innerHTML = '<p>No vet records yet.</p>';
        } else {
            list.innerHTML = records.map(r => `<div class='card'><p><strong>Date:</strong> ${r.checkup_date}</p><p><strong>Remarks:</strong> ${r.remarks}</p><p><strong>Treatment:</strong> ${r.treatment}</p></div>`).join('');
        }
    } catch (e) {
        document.getElementById('vet-record-list').innerHTML = `<p style='color:red'>Error: ${e.message}</p>`;
    }
}

async function submitVetRecord(e, petId) {
    e.preventDefault();
    const checkup_date = document.getElementById('vet-date').value || null;
    const remarks = document.getElementById('vet-remarks').value || '';
    const treatment = document.getElementById('vet-treatment').value || '';
    try {
        const response = await fetch(`${API_BASE}/vet/add-record`, {
            method: 'POST',
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({pet_id: petId, checkup_date, remarks, treatment})
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Vet record added!', 'success');
            document.getElementById('vet-record-form').reset();
            loadVetRecords(petId);
        } else {
            showAlert(data.error || 'Failed to add record', 'error');
        }
    } catch (err) {
        showAlert('Error adding vet record: ' + err.message, 'error');
    }
}

window.openVetModal = openVetModal;
window.closeVetModal = closeVetModal;

async function loadPetDetails(petId) {
    try {
        const response = await fetch(`${API_BASE}/pets/${petId}`, {credentials: 'include'});
        const pet = await response.json();
        if (response.ok) {
            document.getElementById('pet-id').value = pet.pet_id;
            document.getElementById('pet-name').value = pet.name || '';
            document.getElementById('pet-species').value = pet.species || '';
            document.getElementById('pet-breed').value = pet.breed || '';
            document.getElementById('pet-age').value = pet.age || '';
            document.getElementById('pet-price').value = pet.price || '';
            document.getElementById('pet-health-status').value = pet.health_status || '';
            document.getElementById('pet-status').value = pet.status || 'Available';
            document.getElementById('pet-shelter-id').value = pet.shelter_id || '';
            document.getElementById('pet-caretaker-id').value = pet.caretaker_id || '';
        }
    } catch (error) {
        console.error('Failed to load pet details:', error);
        alert('Failed to load pet details');
    }
}

async function savePet() {
    const id = document.getElementById('pet-id').value;
    const name = document.getElementById('pet-name').value;
    const species = document.getElementById('pet-species').value;
    const breed = document.getElementById('pet-breed').value;
    const age = document.getElementById('pet-age').value;
    const price = document.getElementById('pet-price').value;
    const health_status = document.getElementById('pet-health-status').value;
    const status = document.getElementById('pet-status').value;
    const shelter_id = document.getElementById('pet-shelter-id').value;
    const caretaker_id = document.getElementById('pet-caretaker-id').value;
    
    if (!name || !species) {
        alert('Pet name and species are required');
        return;
    }
    
    const url = id ? `/api/admin/pets/${id}` : '/api/admin/pets';
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name, 
                species, 
                breed, 
                age: age ? parseInt(age) : null, 
                price: price ? parseFloat(price) : 0, 
                shelter_id: shelter_id ? parseInt(shelter_id) : null,
                health_status: health_status || '',
                status: status || 'Available',
                caretaker_id: caretaker_id ? parseInt(caretaker_id) : null
            })
        });
        const data = await response.json();
        if (response.ok) {
            showAlert(id ? 'Pet updated!' : 'Pet created!', 'success');
            loadAdminPets();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to save pet: ${error.message}`);
    }
}

async function deletePet(id) {
    if (!confirm('Delete this pet?')) return;
    try {
        const response = await fetch(`/api/admin/pets/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Pet deleted!', 'success');
            loadAdminPets();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to delete pet: ${error.message}`);
    }
}

// Load and display all caretakers with CRUD
async function loadAdminCaretakers() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/caretakers`, {credentials: 'include'});
        const caretakers = await response.json() || [];
        
        let html = `<h3>Manage Caretakers</h3>
            <button class="btn btn-primary" onclick="showCaretakerForm(null)">+ Add Caretaker</button>
            <div id="caretaker-form" style="display:none; margin: 20px 0; padding: 15px; border: 1px solid #ccc; border-radius: 5px;">
                <h4>Caretaker Form</h4>
                <input type="hidden" id="caretaker-id">
                <div class="form-group">
                    <label>Name:</label>
                    <input type="text" id="caretaker-name" required>
                </div>
                <div class="form-group">
                    <label>Contact:</label>
                    <input type="text" id="caretaker-contact">
                </div>
                <div class="form-group">
                    <label>Shelter:</label>
                    <select id="caretaker-shelter-id"></select>
                </div>
                <button class="btn btn-success" onclick="saveCaretaker()">Save</button>
                <button class="btn btn-secondary" onclick="showCaretakerForm(null)">Cancel</button>
            </div>
            <div id="caretakers-list" style="margin-top: 20px;">`;
        
        if (!caretakers || caretakers.length === 0) {
            html += '<p>No caretakers found.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>ID</th><th>Name</th><th>Contact</th><th>Shelter ID</th><th>Actions</th></tr>';
            caretakers.forEach(c => {
                const nameStyle = !c.name ? 'style="background-color: #ffcccc;"' : '';
                const contactStyle = !c.contact ? 'style="background-color: #ffcccc;"' : '';
                html += `<tr>
                    <td>${c.caretaker_id}</td>
                    <td ${nameStyle}>${c.name || '(empty)'}</td>
                    <td ${contactStyle}>${c.contact || '(empty)'}</td>
                    <td>${c.shelter_id || '-'}</td>
                    <td>
                        <button class="btn btn-small" onclick="showCaretakerForm(${c.caretaker_id}, '${c.name}', '${c.contact}', ${c.shelter_id || 'null'})">Edit</button>
                        <button class="btn btn-danger btn-small" onclick="deleteCaretaker(${c.caretaker_id})">Delete</button>
                    </td>
                </tr>`;
            });
            html += '</table>';
        }
        html += '</div>';
        content.innerHTML = html;
        
        // Load shelter dropdown
        loadShelterDropdownForCaretaker();
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading caretakers: ${error.message}</p>`;
    }
}

async function loadShelterDropdownForCaretaker() {
    try {
        const response = await fetch(`${API_BASE}/shelters`, {credentials: 'include'});
        const shelters = await response.json();
        const select = document.getElementById('caretaker-shelter-id');
        select.innerHTML = '<option value="">Select Shelter</option>';
        shelters.forEach(s => {
            select.innerHTML += `<option value="${s.shelter_id}">${s.name}</option>`;
        });
    } catch (error) {
        console.error('Error loading shelters for caretaker:', error);
    }
}

function showCaretakerForm(id, name = '', contact = '', shelter_id = null) {
    document.getElementById('caretaker-id').value = id || '';
    document.getElementById('caretaker-name').value = name;
    document.getElementById('caretaker-contact').value = contact;
    document.getElementById('caretaker-shelter-id').value = shelter_id || '';
    document.getElementById('caretaker-form').style.display = id ? 'block' : (document.getElementById('caretaker-form').style.display === 'none' ? 'block' : 'none');
}

async function saveCaretaker() {
    const id = document.getElementById('caretaker-id').value;
    const name = document.getElementById('caretaker-name').value;
    const contact = document.getElementById('caretaker-contact').value;
    const shelter_id = document.getElementById('caretaker-shelter-id').value || null;
    
    if (!name) {
        alert('Caretaker name is required');
        return;
    }
    
    const url = id ? `/api/admin/caretakers/${id}` : '/api/admin/caretakers';
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method,
            credentials: 'include',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, contact, shelter_id})
        });
        const data = await response.json();
        if (response.ok) {
            showAlert(id ? 'Caretaker updated!' : 'Caretaker created!', 'success');
            loadAdminCaretakers();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to save caretaker: ${error.message}`);
    }
}

async function deleteCaretaker(id) {
    if (!confirm('Delete this caretaker?')) return;
    try {
        const response = await fetch(`/api/admin/caretakers/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('Caretaker deleted!', 'success');
            loadAdminCaretakers();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to delete caretaker: ${error.message}`);
    }
}

// Load and display users for admin promotion
async function loadAdminUsers() {
    const content = document.getElementById('admin-content');
    try {
        const response = await fetch(`${API_BASE}/admin/users`, {credentials: 'include'});
        const users = await response.json();
        
        let html = `<h3>Manage Users (Promote to Admin)</h3>
            <div id="users-list" style="margin-top: 20px;">`;
        
        if (!users || users.length === 0) {
            html += '<p>No users found.</p>';
        } else {
            html += '<table border="1" style="width:100%; border-collapse: collapse;"><tr><th>ID</th><th>Username</th><th>Name</th><th>Contact</th><th>Status</th><th>Actions</th></tr>';
            users.forEach(u => {
                const statusBadge = u.is_admin ? '<span style="background-color: #4CAF50; color: white; padding: 5px 10px; border-radius: 3px;">Admin</span>' : '<span style="background-color: #9E9E9E; color: white; padding: 5px 10px; border-radius: 3px;">User</span>';
                html += `<tr>
                    <td>${u.user_id}</td>
                    <td>${u.username}</td>
                    <td>${u.name || '(empty)'}</td>
                    <td>${u.contact || '(empty)'}</td>
                    <td>${statusBadge}</td>
                    <td>`;
                
                if (u.is_admin) {
                    html += `<button class="btn btn-danger btn-small" onclick="demoteUser(${u.user_id}, '${u.username}')">Demote</button>`;
                } else {
                    html += `<button class="btn btn-success btn-small" onclick="promoteUser(${u.user_id}, '${u.username}')">Promote</button>`;
                }
                html += `</td></tr>`;
            });
            html += '</table>';
        }
        html += '</div>';
        content.innerHTML = html;
    } catch (error) {
        content.innerHTML = `<p style="color: red;">Error loading users: ${error.message}</p>`;
    }
}

async function promoteUser(userId, username) {
    if (!confirm(`Promote ${username} to Admin?`)) return;
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}/promote`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('User promoted to admin!', 'success');
            loadAdminUsers();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to promote user: ${error.message}`);
    }
}

async function demoteUser(userId, username) {
    if (!confirm(`Demote ${username} from Admin?`)) return;
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}/demote`, {
            method: 'POST',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showAlert('User demoted from admin!', 'success');
            loadAdminUsers();
        } else {
            alert(`Error: ${data.error}`);
        }
    } catch (error) {
        alert(`Failed to demote user: ${error.message}`);
    }
}

window.showAdminTab = showAdminTab;
