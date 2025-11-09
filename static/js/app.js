// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Current user state
let currentUser = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadShelters();
    loadPets();
    checkLoginStatus();
});

// Event Listeners
function setupEventListeners() {
    // Auth buttons
    document.getElementById('login-btn')?.addEventListener('click', () => openModal('login-modal'));
    document.getElementById('register-btn')?.addEventListener('click', () => openModal('register-modal'));
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
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
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const section = document.getElementById(sectionId);
    if (section) section.style.display = 'block';
    
    // Load section-specific data
    if (sectionId === 'shop') loadShopItems();
    if (sectionId === 'my-applications') loadMyApplications();
    if (sectionId === 'my-orders') loadMyOrders();
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        
        const data = await response.json();
        if (response.ok) {
            currentUser = data.user;
            updateUIForLoggedInUser();
            closeModal('login-modal');
            showAlert('Login successful!', 'success');
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
        await fetch(`${API_BASE}/logout`, {method: 'POST'});
        currentUser = null;
        updateUIForLoggedOutUser();
        showAlert('Logged out successfully', 'success');
    } catch (error) {
        showAlert('Logout failed', 'error');
    }
}

function checkLoginStatus() {
    // Check if user is logged in via session
    fetch(`${API_BASE}/wallet/balance`)
        .then(res => res.json())
        .then(data => {
            if (data.balance !== undefined) {
                updateUIForLoggedInUser();
                loadWalletBalance();
            }
        })
        .catch(() => updateUIForLoggedOutUser());
}

function updateUIForLoggedInUser() {
    document.getElementById('user-menu').style.display = 'flex';
    document.getElementById('auth-menu').style.display = 'none';
    loadWalletBalance();
}

function updateUIForLoggedOutUser() {
    document.getElementById('user-menu').style.display = 'none';
    document.getElementById('auth-menu').style.display = 'flex';
}

// Wallet
async function loadWalletBalance() {
    try {
        const response = await fetch(`${API_BASE}/wallet/balance`);
        const data = await response.json();
        if (response.ok) {
            document.getElementById('wallet-display').textContent = `$${data.balance.toFixed(2)}`;
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
        const response = await fetch(`${API_BASE}/shelters`);
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
    const shelterId = document.getElementById('shelter-filter').value;
    const url = shelterId ? `${API_BASE}/pets?shelter_id=${shelterId}` : `${API_BASE}/pets`;
    
    try {
        const response = await fetch(url);
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
        card.innerHTML = `
            <h3 class="card-title">${pet.name}</h3>
            <p class="card-info"><strong>Species:</strong> ${pet.species}</p>
            <p class="card-info"><strong>Breed:</strong> ${pet.breed || 'Mixed'}</p>
            <p class="card-info"><strong>Age:</strong> ${pet.age || 'Unknown'} years</p>
            <p class="card-info"><strong>Price:</strong> $${pet.price}</p>
            <span class="badge badge-success">${pet.status}</span>
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
        const response = await fetch(`${API_BASE}/pets/${petId}`);
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
            <p><strong>Health Status:</strong> ${pet.health_status}</p>
            <p><strong>Price:</strong> $${pet.price}</p>
            <p><strong>Shelter:</strong> ${pet.shelter_name || 'N/A'}</p>
            <p><strong>Caretaker:</strong> ${pet.caretaker_name || 'N/A'}</p>
            <p><strong>Eligibility:</strong> <span class="badge ${pet.eligibility === 'Eligible' ? 'badge-success' : 'badge-warning'}">${pet.eligibility}</span></p>
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
        const response = await fetch(`${API_BASE}/shop/items`);
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
                <button class="btn btn-success" onclick="placeOrder(${item.item_id})">Buy</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function placeOrder(itemId) {
    if (!currentUser) {
        showAlert('Please login to place an order', 'error');
        openModal('login-modal');
        return;
    }
    
    const quantity = parseInt(document.getElementById(`qty-${itemId}`).value);
    
    try {
        const response = await fetch(`${API_BASE}/shop/order`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({item_id: itemId, quantity})
        });
        
        const data = await response.json();
        if (response.ok) {
            showAlert('Order placed successfully!', 'success');
            loadWalletBalance();
            loadShopItems();
        } else {
            showAlert(data.error, 'error');
        }
    } catch (error) {
        showAlert('Failed to place order', 'error');
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
        const response = await fetch(`${API_BASE}/adoptions/my-applications`);
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
        const response = await fetch(`${API_BASE}/shop/my-orders`);
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
window.placeOrder = placeOrder;
window.loadPets = loadPets;
