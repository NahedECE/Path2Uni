// ==================== API CONFIGURATION ====================
// IMPORTANT: Replace this with your actual Render URL
const API_URL = 'https://path2uni-236v.onrender.com//api';

let authToken = localStorage.getItem('path2uni_token');

// ==================== API HELPER ====================
async function apiCall(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401) {
      localStorage.removeItem('path2uni_token');
      localStorage.removeItem('path2uni_user');
      authToken = null;
      if (!window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
      }
    }
    return response;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// ==================== AUTH FUNCTIONS ====================
async function handleLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email')?.value;
  const password = document.getElementById('login-password')?.value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  try {
    const response = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.token;
      localStorage.setItem('path2uni_token', data.token);
      localStorage.setItem('path2uni_user', JSON.stringify(data.user));
      updateAuthUI();
      window.location.href = 'dashboard.html';
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  }
}

async function handleRegister(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('reg-name')?.value;
  const email = document.getElementById('reg-email')?.value;
  const password = document.getElementById('reg-password')?.value;
  const confirm = document.getElementById('reg-confirm')?.value;
  const hscRoll = document.getElementById('reg-roll')?.value;
  
  if (password !== confirm) {
    alert('Passwords do not match!');
    return;
  }
  
  try {
    const response = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, hscRoll })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.token;
      localStorage.setItem('path2uni_token', data.token);
      localStorage.setItem('path2uni_user', JSON.stringify(data.user));
      updateAuthUI();
      window.location.href = 'dashboard.html';
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  }
}

async function handleLogout(e) {
  if (e) e.preventDefault();
  try {
    await apiCall('/auth/logout', { method: 'POST' });
  } catch (error) {}
  
  localStorage.removeItem('path2uni_token');
  localStorage.removeItem('path2uni_user');
  authToken = null;
  updateAuthUI();
  window.location.href = 'index.html';
}

function isLoggedIn() { return !!authToken; }

function getCurrentUser() {
  const user = localStorage.getItem('path2uni_user');
  return user ? JSON.parse(user) : null;
}

function redirectToAuth(event, page) {
  if (event) event.preventDefault();
  if (page === 'contact') {
    showContactAlert(event);
    return;
  }
  if (isLoggedIn()) {
    window.location.href = `${page}.html`;
  } else {
    alert('Please login or register first');
    window.location.href = 'index.html';
  }
}

function showContactAlert(event) {
  if (event) event.preventDefault();
  alert('Contact Us:\n\nEmail: support@path2uni.com\nPhone: +880 1234 567890');
}

function updateAuthUI() {
  const logoutBtn = document.getElementById('logoutBtn');
  const loggedInUserDiv = document.getElementById('loggedInUser');
  const userEmailSpan = document.getElementById('userEmailDisplay');
  const currentUser = getCurrentUser();
  const isUserLoggedIn = isLoggedIn();
  
  if (isUserLoggedIn && currentUser) {
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (loggedInUserDiv) {
      loggedInUserDiv.style.display = 'flex';
      if (userEmailSpan) userEmailSpan.textContent = currentUser.email;
    }
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm) loginForm.classList.add('logged-in');
    if (registerForm) registerForm.classList.add('logged-in');
  } else {
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (loggedInUserDiv) loggedInUserDiv.style.display = 'none';
    
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    if (loginForm) loginForm.classList.remove('logged-in');
    if (registerForm) registerForm.classList.remove('logged-in');
  }
}

function switchAuth(type) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabs = document.querySelectorAll('.auth-tab');
  
  tabs.forEach(tab => tab.classList.remove('active'));
  
  if (type === 'login') {
    if (loginForm) loginForm.classList.add('active');
    if (registerForm) registerForm.classList.remove('active');
    if (tabs[0]) tabs[0].classList.add('active');
  } else {
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.add('active');
    if (tabs[1]) tabs[1].classList.add('active');
  }
}

// ==================== CAROUSEL ====================
let currentSlide = 0;
let carouselInterval;

function showSlide(index) {
  const slides = document.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('.dot');
  slides.forEach((s, i) => s.classList.remove('active'));
  dots.forEach(d => d.classList.remove('active'));
  currentSlide = (index + slides.length) % slides.length;
  if (slides[currentSlide]) slides[currentSlide].classList.add('active');
  if (dots[currentSlide]) dots[currentSlide].classList.add('active');
}

function nextSlide() { showSlide(currentSlide + 1); }
function goToSlide(index) { showSlide(index); resetInterval(); }
function resetInterval() { clearInterval(carouselInterval); carouselInterval = setInterval(nextSlide, 5000); }

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  resetInterval();
  
  // Secret admin access - triple click on logo
  let clickCount = 0;
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.addEventListener('click', () => {
      clickCount++;
      setTimeout(() => { clickCount = 0; }, 500);
      if (clickCount === 3) window.location.href = 'admin.html';
    });
  }
  
  // Close modal when clicking outside
  window.onclick = function(event) {
    const modal = document.getElementById('loginModal');
    if (event.target === modal) closeModal();
  };
});

function showModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'flex';
}

function closeModal() {
  const modal = document.getElementById('loginModal');
  if (modal) modal.style.display = 'none';
}

function switchModalAuth(type) {
  const loginForm = document.getElementById('modalLoginForm');
  const registerForm = document.getElementById('modalRegisterForm');
  const tabs = document.querySelectorAll('.modal-tabs .auth-tab');
  
  tabs.forEach(tab => tab.classList.remove('active'));
  
  if (type === 'login') {
    if (loginForm) loginForm.classList.add('active');
    if (registerForm) registerForm.classList.remove('active');
    if (tabs[0]) tabs[0].classList.add('active');
  } else {
    if (loginForm) loginForm.classList.remove('active');
    if (registerForm) registerForm.classList.add('active');
    if (tabs[1]) tabs[1].classList.add('active');
  }
}
