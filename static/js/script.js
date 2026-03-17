// ===== Firebase Configuration =====
const firebaseConfig = {
    apiKey: "AIzaSyDsqneb8imZFwcQf5EcIRYTZMhfcGCv184",
    authDomain: "automate-outbounds.firebaseapp.com",
    projectId: "automate-outbounds",
    storageBucket: "automate-outbounds.firebasestorage.app",
    messagingSenderId: "778759891509",
    appId: "1:778759891509:web:9e64fde0e3b136d80c9f7c",
    measurementId: "G-MFB2W354GK"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ===== DOM Elements =====
const tabBtns = document.querySelectorAll('.tab-btn');
const tabIndicator = document.querySelector('.tab-indicator');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const togglePasswordBtns = document.querySelectorAll('.toggle-password');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const signupPassword = document.getElementById('signup-password');
const confirmPassword = document.getElementById('confirm-password');
const strengthFill = document.querySelector('.strength-fill');
const strengthText = document.querySelector('.strength-text');

// ===== Tab Switching =====
tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
        // Update active tab button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Move indicator
        if (index === 1) {
            tabIndicator.classList.add('right');
        } else {
            tabIndicator.classList.remove('right');
        }

        // Show corresponding form
        const tab = btn.dataset.tab;
        if (tab === 'login') {
            loginForm.classList.add('active');
            signupForm.classList.remove('active');
        } else {
            signupForm.classList.add('active');
            loginForm.classList.remove('active');
        }
    });
});

// ===== Toggle Password Visibility =====
togglePasswordBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const input = btn.parentElement.querySelector('input');
        const icon = btn.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });
});

// ===== Password Strength Checker =====
function checkPasswordStrength(password) {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 1) return { level: 'weak', text: 'Weak' };
    if (score <= 2) return { level: 'fair', text: 'Fair' };
    if (score <= 3) return { level: 'good', text: 'Good' };
    return { level: 'strong', text: 'Strong' };
}

if (signupPassword) {
    const passwordStrengthEl = document.querySelector('.password-strength');
    signupPassword.addEventListener('input', () => {
        const val = signupPassword.value;

        if (val.length === 0) {
            strengthFill.className = 'strength-fill';
            strengthText.className = 'strength-text';
            strengthText.textContent = '';
            if (passwordStrengthEl) passwordStrengthEl.classList.remove('visible');
            return;
        }

        if (passwordStrengthEl) passwordStrengthEl.classList.add('visible');
        const result = checkPasswordStrength(val);
        strengthFill.className = `strength-fill ${result.level}`;
        strengthText.className = `strength-text ${result.level}`;
        strengthText.textContent = result.text;
    });
}

// ===== Form Validation =====
function clearErrors(form) {
    form.querySelectorAll('.input-wrapper.error').forEach(el => {
        el.classList.remove('error');
    });
    form.querySelectorAll('.error-message').forEach(el => el.remove());
}

function showError(inputWrapper, message) {
    inputWrapper.classList.add('error');
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    inputWrapper.parentElement.appendChild(errorEl);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// ===== Toast Notification =====
function showToast(message, isError = false) {
    toastMessage.textContent = message;
    toast.classList.toggle('error', isError);
    toast.querySelector('i').className = isError
        ? 'fas fa-exclamation-circle'
        : 'fas fa-check-circle';
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3500);
}

// ===== Login Form Submission =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(loginForm);

    const email = document.getElementById('login-email');
    const password = document.getElementById('login-password');
    let valid = true;

    if (!validateEmail(email.value.trim())) {
        showError(email.closest('.input-wrapper'), 'Please enter a valid email');
        valid = false;
    }

    if (password.value.length < 6) {
        showError(password.closest('.input-wrapper'), 'Password must be at least 6 characters');
        valid = false;
    }

    if (!valid) {
        loginForm.classList.add('shake');
        setTimeout(() => loginForm.classList.remove('shake'), 500);
        return;
    }

    // Firebase Login
    const btn = loginForm.querySelector('.btn-primary');
    btn.classList.add('loading');

    try {
        const userCredential = await auth.signInWithEmailAndPassword(
            email.value.trim(),
            password.value
        );
        const user = userCredential.user;

        // Get Firebase ID token and verify with backend
        const idToken = await user.getIdToken();
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });
        const data = await res.json();

        if (res.ok && data.verified) {
            showToast(`Welcome back, ${user.displayName || user.email}!`);
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1200);
        } else {
            showToast(data.error || 'Backend verification failed', true);
        }
    } catch (error) {
        const errorMsg = getFirebaseErrorMessage(error.code);
        showToast(errorMsg, true);
        loginForm.classList.add('shake');
        setTimeout(() => loginForm.classList.remove('shake'), 500);
    } finally {
        btn.classList.remove('loading');
    }
});

// ===== Signup Form Submission =====
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(signupForm);

    const firstName = document.getElementById('first-name');
    const lastName = document.getElementById('last-name');
    const email = document.getElementById('signup-email');
    const password = document.getElementById('signup-password');
    const confirm = document.getElementById('confirm-password');
    const terms = document.getElementById('agree-terms');

    let valid = true;

    if (firstName.value.trim().length < 2) {
        showError(firstName.closest('.input-wrapper'), 'First name is required');
        valid = false;
    }

    if (lastName.value.trim().length < 2) {
        showError(lastName.closest('.input-wrapper'), 'Last name is required');
        valid = false;
    }

    if (!validateEmail(email.value.trim())) {
        showError(email.closest('.input-wrapper'), 'Please enter a valid email');
        valid = false;
    }

    if (password.value.length < 8) {
        showError(password.closest('.input-wrapper'), 'Password must be at least 8 characters');
        valid = false;
    }

    if (password.value !== confirm.value) {
        showError(confirm.closest('.input-wrapper'), 'Passwords do not match');
        valid = false;
    }

    if (!terms.checked) {
        showToast('Please agree to the Terms of Service', true);
        valid = false;
    }

    if (!valid) {
        signupForm.classList.add('shake');
        setTimeout(() => signupForm.classList.remove('shake'), 500);
        return;
    }

    // Firebase Signup
    const btn = signupForm.querySelector('.btn-primary');
    btn.classList.add('loading');

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(
            email.value.trim(),
            password.value
        );
        const user = userCredential.user;

        // Set display name and send verification email
        await user.updateProfile({
            displayName: `${firstName.value.trim()} ${lastName.value.trim()}`
        });
        await user.sendEmailVerification();

        // Get Firebase ID token and verify with backend
        const idToken = await user.getIdToken(true);
        const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        });
        const data = await res.json();

        if (res.ok && data.verified) {
            showToast('Account created! Redirecting to dashboard...');
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1200);
        } else {
            showToast(data.error || 'Backend verification failed', true);
        }
    } catch (error) {
        const errorMsg = getFirebaseErrorMessage(error.code);
        showToast(errorMsg, true);
        signupForm.classList.add('shake');
        setTimeout(() => signupForm.classList.remove('shake'), 500);
    } finally {
        btn.classList.remove('loading');
    }
});

// ===== Firebase Error Messages =====
function getFirebaseErrorMessage(errorCode) {
    const messages = {
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password. Please try again',
        'auth/invalid-credential': 'Invalid email or password',
        'auth/email-already-in-use': 'An account with this email already exists',
        'auth/weak-password': 'Password is too weak. Use at least 6 characters',
        'auth/invalid-email': 'Please enter a valid email address',
        'auth/too-many-requests': 'Too many attempts. Please try again later',
        'auth/network-request-failed': 'Network error. Check your connection',
        'auth/popup-closed-by-user': 'Sign-in popup was closed',
        'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method',
        'auth/popup-blocked': 'Sign-in popup was blocked. Please allow popups',
        'auth/cancelled-popup-request': 'Sign-in was cancelled',
        'auth/operation-not-allowed': 'This sign-in method is not enabled. Contact support',
    };
    return messages[errorCode] || 'Something went wrong. Please try again';
}

// ===== Forgot Password =====
document.querySelector('.forgot-link').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();

    if (!email || !validateEmail(email)) {
        showToast('Enter your email above, then click Forgot Password', true);
        document.getElementById('login-email').focus();
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        showToast('Password reset email sent! Check your inbox.');
    } catch (error) {
        const errorMsg = getFirebaseErrorMessage(error.code);
        showToast(errorMsg, true);
    }
});

// ===== Auth State Listener =====
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // Verify token with backend before redirecting
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            if (res.ok) {
                window.location.href = '/dashboard';
            }
        } catch (err) {
            console.error('Auto-login backend verify failed:', err);
        }
    }
});

// ===== Input Focus Animation =====
document.querySelectorAll('.input-wrapper input').forEach(input => {
    input.addEventListener('focus', () => {
        const icon = input.parentElement.querySelector('i:first-child');
        if (icon) icon.style.color = 'var(--primary-light)';
    });

    input.addEventListener('blur', () => {
        const icon = input.parentElement.querySelector('i:first-child');
        if (icon) icon.style.color = 'var(--text-muted)';
    });

    // Clear error on input
    input.addEventListener('input', () => {
        const wrapper = input.closest('.input-wrapper');
        if (wrapper.classList.contains('error')) {
            wrapper.classList.remove('error');
            const errorMsg = wrapper.parentElement.querySelector('.error-message');
            if (errorMsg) errorMsg.remove();
        }
    });
});

// ===== Keyboard Navigation =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        document.body.classList.add('keyboard-nav');
    }
});

document.addEventListener('mousedown', () => {
    document.body.classList.remove('keyboard-nav');
});
