import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

let db;
let auth;
let firebaseConfig;

// Check authentication state on load
window.addEventListener('load', () => {
    const savedConfig = localStorage.getItem('firebaseConfig');
    if (! savedConfig) {
        initializeFirebase();
    }
    if (savedConfig) {
        firebaseConfig = JSON.parse(savedConfig);
        try {
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getDatabase(app);
            
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    // User is logged in
                    document.getElementById('loginSection').classList.add('hidden');
                    document.getElementById('setupSection').classList.add('hidden');
                    document.getElementById('charactersDisplay').classList.remove('hidden');
                    listenForCharacterUpdates();
                } else {
                    // User is logged out
                    document.getElementById('loginSection').classList.remove('hidden');
                    document.getElementById('setupSection').classList.add('hidden');
                    document.getElementById('charactersDisplay').classList.add('hidden');
                }
            });
        } catch (error) {
            console.error('Error initializing Firebase:', error);
        }
    }
});

window.login = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
        errorDiv.textContent = 'Please enter both email and password';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Check if Firebase is initialized
    if (!auth) {
        errorDiv.textContent = 'Please configure Firebase first';
        errorDiv.classList.remove('hidden');
        // Show setup section
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('setupSection').classList.remove('hidden');
        return;
    }

    try {
        await signInWithEmailAndPassword(auth, email, password);
        errorDiv.classList.add('hidden');
        showStatus('✅ Login successful!', 'success');
    } catch (error) {
        let errorMessage = 'Login failed: ';
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage += 'No user found with this email';
                break;
            case 'auth/wrong-password':
                errorMessage += 'Incorrect password';
                break;
            case 'auth/invalid-email':
                errorMessage += 'Invalid email address';
                break;
            case 'auth/too-many-requests':
                errorMessage += 'Too many failed attempts. Try again later';
                break;
            default:
                errorMessage += error.message;
        }
        errorDiv.textContent = errorMessage;
        errorDiv.classList.remove('hidden');
    }
};

window.logout = async function() {
    try {
        await signOut(auth);
        showStatus('Logged out successfully', 'info');
    } catch (error) {
        showStatus('Error logging out: ' + error.message, 'error');
    }
};

window.initializeFirebase = function() {
    const apiKey = "AIzaSyDs5MMQWHyNLYnPYhrkBIA9d86y6V5GjXk";
    const projectId = "stattracker-93214";
    const databaseURL = "https://stattracker-93214-default-rtdb.firebaseio.com/";

    if (!apiKey || !projectId || !databaseURL) {
        showStatus('Please fill in all Firebase configuration fields', 'error');
        return;
    }

    firebaseConfig = {
        apiKey: apiKey,
        authDomain: `${projectId}.firebaseapp.com`,
        projectId: projectId,
        databaseURL: databaseURL
    };

    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);
        
        // Save config to localStorage
        localStorage.setItem('firebaseConfig', JSON.stringify(firebaseConfig));
        
        showStatus('✅ Connected to Firebase successfully! Now login with your email and password.', 'success');
        
        // Show API endpoint
        const endpoint = `${databaseURL}/characters.json`;
        document.getElementById('apiEndpoint').textContent = `POST ${endpoint}`;
        
        // Show login section
        document.getElementById('setupSection').classList.add('hidden');
        document.getElementById('loginSection').classList.remove('hidden');
        
    } catch (error) {
        showStatus('❌ Error connecting to Firebase: ' + error.message, 'error');
    }
};

function listenForCharacterUpdates() {
    const charactersRef = ref(db, 'characters');
    onValue(charactersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            displayCharacters(data);
        } else {
            showStatus('Waiting for character data... Send a POST request to update.', 'info');
        }
    }, (error) => {
        if (error.code === 'PERMISSION_DENIED') {
            showStatus('❌ Permission denied. Make sure you set the database rules correctly!', 'error');
        } else {
            showStatus('❌ Error reading data: ' + error.message, 'error');
        }
    });
}

// Determine character status priority for sorting
function getStatusPriority(character) {
    const healthPercent = character.Health / character.MaxHealth * 100;
    const spiritPercent = character.Spirit / character.MaxSpirit * 100;
    
    // Check if inactive (no activity in 5 minutes)
    const minutesInactive = ((new Date() - new Date(Date.parse(character.Timestamp))) / 60 / 1000);
    if (minutesInactive > 5) {
        return 4; // Inactive - lowest priority
    }
    
    // Check for danger status
    if (healthPercent <= 25 || spiritPercent <= 25 || 
        character.Experience == 0 || character.Status != "Good") {
        return 1; // Danger - highest priority
    }
    
    // Check for warning status
    if (healthPercent <= 50 || spiritPercent <= 50) {
        return 2; // Warning
    }
    
    return 3; // Normal
}

function displayCharacters(characters) {
    const grid = document.getElementById('charactersGrid');
    grid.innerHTML = '';

    // Convert to array and add status priority
    let characterArray = [];
    if (Array.isArray(characters)) {
        characterArray = characters.map(char => ({
            data: char,
            priority: getStatusPriority(char)
        }));
    } else if (typeof characters === 'object') {
        characterArray = Object.values(characters).map(char => ({
            data: char,
            priority: getStatusPriority(char)
        }));
    }

    // Sort by priority (danger first, inactive last)
    characterArray.sort((a, b) => a.priority - b.priority);

    // Create and append cards in sorted order
    characterArray.forEach(item => {
        const card = createCharacterCard(item.data);
        grid.appendChild(card);
    });

    document.getElementById('lastUpdated').textContent = 
        `Last updated: ${new Date().toLocaleString()}`;
}

function createCharacterCard(character) {
    const card = document.createElement('div');
    
    // Calculate health and spirit percentages
    const healthPercent = character.Health / character.MaxHealth * 100;
    const spiritPercent = character.Spirit / character.MaxSpirit * 100;
    
    // Determine card status
    let cardClass = 'character-card';
    let statusClass = '';
    
    if (healthPercent <= 25 || spiritPercent <= 25) {
        cardClass += ' danger';
        statusClass = 'danger';
    } else if (healthPercent <= 50 || spiritPercent <= 50) {
        cardClass += ' warning';
        statusClass = 'warning';
    }

    if (character.Experience == 0 || character.Status != "Good") {
        cardClass += ' danger';
        statusClass = 'danger';
    }

    if (((new Date() - new Date(Date.parse(character.Timestamp))) / 60 / 1000) > 5) {
        cardClass += ' inactive';
        statusClass = 'inactive';
    }
    
    // Check if this card was previously expanded
    const characterId = character.Name || 'Unknown';
    const wasExpanded = sessionStorage.getItem(`card-${characterId}`) === 'expanded';
    if (wasExpanded) {
        cardClass += ' expanded';
    }
    
    card.className = cardClass;

    const stats = [
        { label: 'Status', value: character.Status },
        { label: 'Location', value: character.Location },
        { label: 'Health', value: character.Health + " / " + character.MaxHealth, highlight: healthPercent <= 50 },
        { label: 'Mana', value: character.Mana + " / " + character.MaxMana },
        { label: 'Stamina', value: character.Stamina + " / " + character.MaxStamina },
        { label: 'Spirit', value: character.Spirit + " / " + character.MaxSpirit, highlight: spiritPercent <= 50 },
        { label: 'Current Experience', value: character.Experience + " / " + character.MaxExperience },
        { label: 'Total Experience', value: character['Total Experience'] },
        { label: 'Wealth', value: character.Wealth },
        { label: 'Stance', value: character.Stance },
        { label: 'Encumbrance', value: character.Encumbrance },
        { label: 'Last Updated', value: new Date(Date.parse(character.Timestamp)).toLocaleTimeString() }
    ];

    let html = `
        <div class="card-header">
            <div class="status-indicator ${statusClass}"></div>
            <div class="character-name">
                <span>${character.Name || 'Unknown'}</span>
                <span class="experience-preview">${character.Experience} / ${character.MaxExperience}</span>
            </div>
        </div>
        <div class="card-body">
    `;
    
    stats.forEach(stat => {
        const highlightClass = stat.highlight ? ' style="font-weight: 700;"' : '';
        html += `
            <div class="stat-row">
                <span class="stat-label">${stat.label}:</span>
                <span class="stat-value"${highlightClass}>${stat.value || 'N/A'}</span>
            </div>
        `;
    });

    html += `</div>`;
    card.innerHTML = html;
    
    // Add click handler for mobile collapse/expand
    const header = card.querySelector('.card-header');
    
    header.addEventListener('click', () => {
        // Only toggle on mobile
        if (window.innerWidth <= 600) {
            card.classList.toggle('expanded');
            
            // Save expansion state
            const isExpanded = card.classList.contains('expanded');
            if (isExpanded) {
                sessionStorage.setItem(`card-${characterId}`, 'expanded');
            } else {
                sessionStorage.removeItem(`card-${characterId}`);
            }
        }
    });
    
    return card;
}

function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}