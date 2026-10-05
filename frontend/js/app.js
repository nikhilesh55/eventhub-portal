/**
 * EventHub - Core Application Logic
 * Native Modern JavaScript (ES6+) · Zero External Framework Bottlenecks
 * Loads instantaneously with 0ms compilation overhead.
 */

// Application State Store
function getInitialUser() {
  if (localStorage.getItem("eh_logged_out") === "true") {
    return null;
  }
  const storedUser = localStorage.getItem("eh_user");
  if (storedUser) {
    try {
      return JSON.parse(storedUser);
    } catch (e) {
      return null;
    }
  }
  return {
    id: 3,
    name: "David Chen",
    email: "attendee@eventhub.io",
    role: "attendee"
  };
}

function getInitialToken() {
  if (localStorage.getItem("eh_logged_out") === "true") {
    return null;
  }
  return localStorage.getItem("eh_token") || "demo_attendee_token";
}

const state = {
  activeTab: "events", // 'events' | 'my-tickets' | 'checkin' | 'organizer' | 'login'
  currentUser: getInitialUser(),
  token: getInitialToken(),
  events: [],
  myTickets: [],
  selectedEvent: null,
  organizerMetrics: null,
  selectedEventAttendees: [],
  selectedEventForAttendees: null,
  searchQuery: "",
  selectedCategory: "All",
  checkinEventId: 1,
  checkinInput: "",
  checkinResult: null,
  checkinStats: null,
  recentCheckins: [],
  showCreateModal: false,
  newEvent: {
    title: "",
    category: "Technology",
    description: "",
    venue_name: "",
    venue_address: "",
    date_time: "2026-10-20 10:00",
    capacity: 25,
    ticket_price: 0.0,
    latitude: 37.7749,
    longitude: -122.4194
  },
  geocodingLoading: false,
  toast: null,
  // Login & Authentication View State
  authMode: "login", // 'login' | 'register'
  loginForm: {
    email: "",
    password: ""
  },
  registerForm: {
    name: "",
    email: "",
    password: "",
    role: "attendee",
    phone: ""
  },
  loginLoading: false,
  loginError: null,
  // Google Sign-In State
  showGoogleModal: false,
  googleSelectedRole: "attendee",
  customGoogleEmail: "",
  customGoogleName: ""
};

// Web Audio API Synthesizer for instant audible gate feedback
function playTone(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "success") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === "warning") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === "error") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Audio synthesis not permitted before first user gesture
  }
}

// Global Toast Banner
function showToast(message, type = "success") {
  state.toast = { message, type };
  render();
  setTimeout(() => {
    state.toast = null;
    render();
  }, 4000);
}

// API Fetch Helpers
async function loadEvents() {
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    if (data.success) {
      state.events = data.events;
      render();
    }
  } catch (e) {
    console.error("Error loading events", e);
  }
}

async function loadMyTickets() {
  try {
    const res = await fetch("/api/registrations/my", {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (data.success) {
      state.myTickets = data.registrations;
      render();
    }
  } catch (e) {
    console.error("Error loading tickets", e);
  }
}

async function loadOrganizerDashboard() {
  try {
    const res = await fetch("/api/organizer/dashboard", {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (data.success) {
      state.organizerMetrics = data.metrics;
      render();
    }
  } catch (e) {
    console.error("Error loading organizer dashboard", e);
  }
}

async function loadCheckinStats(eventId) {
  if (!eventId) return;
  try {
    const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
    const res = await fetch(`/api/checkin/stats/${eventId}`, { headers });
    const data = await res.json();
    if (data.success) {
      state.checkinStats = data.stats;
      render();
    }
  } catch (e) {
    console.error("Error loading checkin stats", e);
  }
}

// 1-Click Role Switcher for Presentations
async function handleRoleSwitch(targetRole) {
  try {
    const res = await fetch("/api/auth/demo-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: targetRole })
    });
    const data = await res.json();
    if (data.success) {
      state.currentUser = data.user;
      state.token = data.token;
      localStorage.setItem("eh_token", data.token);
      localStorage.setItem("eh_user", JSON.stringify(data.user));
      localStorage.removeItem("eh_logged_out");

      if (targetRole === "operator") {
        state.activeTab = "checkin";
        loadCheckinStats(state.checkinEventId);
      } else if (targetRole === "organizer") {
        state.activeTab = "organizer";
        loadOrganizerDashboard();
      } else {
        state.activeTab = "events";
        loadMyTickets();
      }

      showToast(`Switched to: ${data.user.name} (${data.user.role.toUpperCase()})`);
      loadEvents();
    }
  } catch (e) {
    showToast("Error switching role", "error");
  }
}

// Backend Login Authentication
async function handleLogin(e, overrideEmail, overridePass) {
  if (e) e.preventDefault();
  const email = (overrideEmail || state.loginForm.email || "").trim();
  const password = overridePass || state.loginForm.password || "";

  if (!email || !password) {
    state.loginError = "Please enter both email and password.";
    render();
    return;
  }

  state.loginLoading = true;
  state.loginError = null;
  render();

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem("eh_token", data.token);
      localStorage.setItem("eh_user", JSON.stringify(data.user));
      localStorage.removeItem("eh_logged_out");

      state.loginForm.password = "";
      playTone("success");
      showToast(data.message || `Welcome back, ${data.user.name}!`, "success");

      // Role-based automatic redirect
      if (data.user.role === "organizer") {
        state.activeTab = "organizer";
        loadOrganizerDashboard();
      } else if (data.user.role === "operator") {
        state.activeTab = "checkin";
        loadCheckinStats(state.checkinEventId);
      } else {
        state.activeTab = "my-tickets";
        loadMyTickets();
      }
      loadEvents();
    } else {
      state.loginError = data.error || "Invalid email or password.";
      playTone("error");
    }
  } catch (err) {
    state.loginError = "Unable to connect to authentication server.";
    playTone("error");
  } finally {
    state.loginLoading = false;
    render();
  }
}

// Autofill helper for viva demonstration
function fillLoginForm(email, password) {
  state.loginForm.email = email;
  state.loginForm.password = password;
  state.loginError = null;
  render();
}

// Backend User Registration
async function handleRegisterUser(e) {
  if (e) e.preventDefault();
  const { name, email, password, role, phone } = state.registerForm;

  if (!name.trim() || !email.trim() || !password) {
    state.loginError = "Name, email, and password are required.";
    render();
    return;
  }

  state.loginLoading = true;
  state.loginError = null;
  render();

  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        phone: phone.trim()
      })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem("eh_token", data.token);
      localStorage.setItem("eh_user", JSON.stringify(data.user));
      localStorage.removeItem("eh_logged_out");

      state.registerForm.password = "";
      playTone("success");
      showToast(data.message || `Welcome, ${data.user.name}!`, "success");

      if (data.user.role === "organizer") {
        state.activeTab = "organizer";
        loadOrganizerDashboard();
      } else if (data.user.role === "operator") {
        state.activeTab = "checkin";
        loadCheckinStats(state.checkinEventId);
      } else {
        state.activeTab = "events";
      }
      loadEvents();
    } else {
      state.loginError = data.error || "Registration failed.";
      playTone("error");
    }
  } catch (err) {
    state.loginError = "Unable to connect to server.";
    playTone("error");
  } finally {
    state.loginLoading = false;
    render();
  }
}

// Backend Logout & Invalidate Session
async function handleLogout() {
  try {
    if (state.token) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.token}`
        }
      });
    }
  } catch (err) {
    console.warn("Logout notification failed", err);
  } finally {
    state.token = null;
    state.currentUser = null;
    localStorage.removeItem("eh_token");
    localStorage.removeItem("eh_user");
    localStorage.setItem("eh_logged_out", "true");

    state.myTickets = [];
    state.organizerMetrics = null;
    state.selectedEventAttendees = [];
    state.activeTab = "events";
    showToast("Signed out successfully.", "success");
    render();
  }
}

// Google OAuth Sign-In Handler
async function handleGoogleSignIn(payload) {
  state.loginLoading = true;
  state.loginError = null;
  render();

  try {
    const res = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok && data.success) {
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem("eh_token", data.token);
      localStorage.setItem("eh_user", JSON.stringify(data.user));
      localStorage.removeItem("eh_logged_out");
      state.showGoogleModal = false;

      playTone("success");
      showToast(data.message || `Welcome, ${data.user.name}!`, "success");

      // Role-based automatic redirect
      if (data.user.role === "organizer") {
        state.activeTab = "organizer";
        loadOrganizerDashboard();
      } else if (data.user.role === "operator") {
        state.activeTab = "checkin";
        loadCheckinStats(state.checkinEventId);
      } else {
        state.activeTab = "my-tickets";
        loadMyTickets();
      }
      loadEvents();
    } else {
      state.loginError = data.error || "Google Sign-In failed.";
      playTone("error");
    }
  } catch (err) {
    state.loginError = "Unable to connect to Google authentication service.";
    playTone("error");
  } finally {
    state.loginLoading = false;
    render();
  }
}

// Attendee Event Booking
async function handleRegister(eventId) {
  try {
    const res = await fetch("/api/registrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({ event_id: eventId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, "success");
      playTone("success");
      state.selectedEvent = null;
      state.activeTab = "my-tickets";
      await loadEvents();
      await loadMyTickets();
    } else {
      showToast(data.error || "Registration failed", "error");
      playTone("error");
    }
  } catch (e) {
    showToast("Network error registering for event", "error");
  }
}

// Gate Check-in Verification
async function handleValidateCheckin(tokenToValidate) {
  const code = tokenToValidate || state.checkinInput;
  if (!code) {
    showToast("Please enter or scan a ticket token", "warning");
    return;
  }

  try {
    const res = await fetch("/api/checkin/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify({
        token: code,
        event_id: state.checkinEventId
      })
    });
    const data = await res.json();
    state.checkinResult = data;

    if (data.status_code === "SUCCESS") {
      playTone("success");
      showToast(`Verified! Welcome ${data.details.attendee_name}`, "success");
      state.recentCheckins = [data.details, ...state.recentCheckins.slice(0, 9)];
      loadCheckinStats(state.checkinEventId);
      loadEvents();
    } else if (data.status_code === "ALREADY_CHECKED_IN") {
      playTone("warning");
      showToast("Duplicate scan rejected!", "warning");
    } else {
      playTone("error");
      showToast(data.message || "Invalid ticket", "error");
    }

    state.checkinInput = "";
    render();
  } catch (e) {
    showToast("Error validating ticket", "error");
  }
}

// Geocode Venue Address via OpenStreetMap Nominatim
async function handleGeocodeVenue() {
  const address = state.newEvent.venue_address;
  if (!address) {
    showToast("Please type a venue address first", "warning");
    return;
  }
  state.geocodingLoading = true;
  render();

  try {
    const res = await fetch(`/api/external/geocode?q=${encodeURIComponent(address)}`);
    const data = await res.json();
    if (data.success) {
      state.newEvent.latitude = data.data.lat;
      state.newEvent.longitude = data.data.lon;
      if (!state.newEvent.venue_name) {
        state.newEvent.venue_name = data.data.display_name.split(",")[0];
      }
      showToast("Address geocoded via OpenStreetMap!", "success");
    }
  } catch (e) {
    showToast("Geocoding service unavailable", "warning");
  } finally {
    state.geocodingLoading = false;
    render();
  }
}

// Create Event
async function handleCreateEvent(e) {
  if (e) e.preventDefault();
  try {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`
      },
      body: JSON.stringify(state.newEvent)
    });
    const data = await res.json();
    if (data.success) {
      showToast("Event published successfully!", "success");
      state.showCreateModal = false;
      loadEvents();
      loadOrganizerDashboard();
    } else {
      showToast(data.error || "Failed to create event", "error");
    }
  } catch (e) {
    showToast("Error creating event", "error");
  }
}

// View Attendees Roster
async function handleViewAttendees(eventId) {
  try {
    const res = await fetch(`/api/organizer/attendees/${eventId}`, {
      headers: { Authorization: `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (data.success) {
      state.selectedEventAttendees = data.attendees;
      state.selectedEventForAttendees = state.events.find(e => e.id === eventId);
      render();
    }
  } catch (e) {
    showToast("Error loading attendees", "error");
  }
}

// ==========================================================
// Main UI Rendering Engine
// ==========================================================
function render() {
  const root = document.getElementById("root");
  if (!root) return;

  const filteredEvents = state.events.filter(e => {
    const matchesCat = state.selectedCategory === "All" || e.category.toLowerCase() === state.selectedCategory.toLowerCase();
    const q = state.searchQuery.toLowerCase();
    const matchesSearch = !q || e.title.toLowerCase().includes(q) || e.venue_name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  root.innerHTML = `
    <!-- Top Header -->
    <header class="glass-header sticky top-0 z-40 px-4 lg:px-8 py-3.5 shadow-sm">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <!-- Logo -->
        <div class="flex items-center gap-3 cursor-pointer" onclick="setTab('events')">
          <div class="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md font-bold text-xl">
            🎟️
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-extrabold tracking-tight text-slate-900">EventHub</h1>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Project 08</span>
            </div>
            <p class="text-xs text-slate-500 hidden sm:block">Event Booking & QR Check-In Portal</p>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="flex items-center bg-slate-100 p-1 rounded-xl text-sm font-medium">
          <button onclick="setTab('events')" class="px-3.5 py-1.5 rounded-lg transition-all ${
            state.activeTab === "events" ? "bg-white text-indigo-600 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
          }">
            🎪 Explore
          </button>
          <button onclick="setTab('my-tickets')" class="px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
            state.activeTab === "my-tickets" ? "bg-white text-indigo-600 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
          }">
            <span>🎟️ My Tickets</span>
            ${state.myTickets.length > 0 ? `<span class="bg-indigo-600 text-white text-xs px-1.5 py-0.2 rounded-full">${state.myTickets.length}</span>` : ""}
          </button>
          <button onclick="setTab('checkin')" class="px-3.5 py-1.5 rounded-lg transition-all ${
            state.activeTab === "checkin" ? "bg-white text-indigo-600 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
          }">
            ⚡ Check-In Gate
          </button>
          <button onclick="setTab('organizer')" class="px-3.5 py-1.5 rounded-lg transition-all ${
            state.activeTab === "organizer" ? "bg-white text-indigo-600 shadow-sm font-semibold" : "text-slate-600 hover:text-slate-900"
          }">
            📊 Organizer Hub
          </button>
          ${!state.currentUser ? `
            <button onclick="setTab('login')" class="px-3.5 py-1.5 rounded-lg transition-all ${
              state.activeTab === "login" ? "bg-indigo-600 text-white shadow-sm font-semibold" : "text-indigo-600 hover:text-indigo-800"
            }">
              🔑 Sign In
            </button>
          ` : ""}
        </nav>

        <!-- Right Side: User Profile & Role Switcher or Sign In Button -->
        ${state.currentUser ? `
          <div class="flex flex-wrap items-center gap-2">
            <!-- 1-Click Role Switcher for Presentations -->
            <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <span class="text-slate-400 font-semibold uppercase tracking-wider text-[10px] hidden sm:inline">Role:</span>
              <div class="flex items-center gap-1">
                <button onclick="switchRole('attendee')" class="px-2 py-1 rounded font-medium transition-all ${
                  state.currentUser.role === "attendee" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"
                }">
                  Attendee
                </button>
                <button onclick="switchRole('organizer')" class="px-2 py-1 rounded font-medium transition-all ${
                  state.currentUser.role === "organizer" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"
                }">
                  Organizer
                </button>
                <button onclick="switchRole('operator')" class="px-2 py-1 rounded font-medium transition-all ${
                  state.currentUser.role === "operator" ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"
                }">
                  Operator
                </button>
              </div>
              <div class="h-4 w-px bg-slate-200 mx-1"></div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-800 hidden md:inline">${state.currentUser.name}</span>
                <span class="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                  state.currentUser.role === 'organizer' ? 'bg-indigo-100 text-indigo-700' :
                  state.currentUser.role === 'operator' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }">
                  ${state.currentUser.role === 'organizer' ? '👑 Organizer' : state.currentUser.role === 'operator' ? '🛡️ Operator' : '👤 Attendee'}
                </span>
              </div>
            </div>

            <!-- Sign Out Button -->
            <button
              onclick="handleLogout()"
              title="Sign out of EventHub"
              class="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <span>🚪</span>
              <span class="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ` : `
          <div class="flex items-center gap-2">
            <button
              onclick="setTab('login')"
              class="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5"
            >
              <span>🔑</span>
              <span>Sign In / Demo Login</span>
            </button>
          </div>
        `}
      </div>
    </header>

    <!-- Global Toast Banner -->
    ${state.toast ? `
      <div class="fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-white font-medium text-sm transition-all animate-bounce ${
        state.toast.type === "success" ? "bg-emerald-600" : state.toast.type === "warning" ? "bg-amber-600" : "bg-rose-600"
      }">
        <span>${state.toast.type === "success" ? "✅" : state.toast.type === "warning" ? "⚠️" : "❌"}</span>
        <span>${state.toast.message}</span>
      </div>
    ` : ""}

    <!-- Main Content Area -->
    <main class="flex-1 max-w-7xl w-full mx-auto p-4 lg:p-8">
      ${renderActiveTab(filteredEvents)}
    </main>

    <!-- Event Details Modal -->
    ${state.selectedEvent ? renderEventModal(state.selectedEvent) : ""}

    <!-- Create Event Modal -->
    ${state.showCreateModal ? renderCreateEventModal() : ""}

    <!-- Google Sign-In Account Selector Modal -->
    ${renderGoogleModal()}

    <!-- Footer -->
    <footer class="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
      <div class="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>EventHub · Industry Full-Stack Challenge · Project 08</span>
        <span class="font-mono text-slate-400">REST API • SQLite Relational DB • OpenStreetMap Nominatim</span>
      </div>
    </footer>
  `;

  // Post-render attachments: Leaflet Maps & QR Codes
  attachPostRenderLogic();
}

// Render dedicated login & authentication view
function renderLoginView() {
  return `
    <div class="max-w-xl mx-auto py-4 sm:py-8">
      <!-- Main Auth Card -->
      <div class="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
        <!-- Hero Header -->
        <div class="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 p-8 text-white text-center relative overflow-hidden">
          <div class="inline-flex w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md items-center justify-center text-3xl mb-3 shadow-inner">
            🎟️
          </div>
          <h2 class="text-2xl font-black tracking-tight">EventHub Access Portal</h2>
          <p class="text-xs text-indigo-100 mt-1">Multi-Role Authentication & Session Management</p>
        </div>

        <div class="p-6 sm:p-8 space-y-6">
          <!-- Sign in with Google Button -->
          <div class="space-y-3">
            <button
              type="button"
              onclick="openGoogleSignInModal()"
              class="w-full py-3.5 px-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-xs shadow-xs flex items-center justify-center gap-3 transition-all active:scale-[0.99] cursor-pointer"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Sign in with Google</span>
            </button>

            <!-- Divider -->
            <div class="relative flex items-center justify-center">
              <div class="flex-grow border-t border-slate-200"></div>
              <span class="flex-shrink mx-3 text-slate-400 font-bold text-[10px] uppercase tracking-wider">or continue with credentials</span>
              <div class="flex-grow border-t border-slate-200"></div>
            </div>
          </div>

          <!-- Auth Mode Toggle -->
          <div class="flex bg-slate-100 p-1.5 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onclick="setAuthMode('login')"
              class="flex-1 py-2.5 rounded-xl transition-all ${
                state.authMode === "login" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }"
            >
              🔑 Sign In
            </button>
            <button
              type="button"
              onclick="setAuthMode('register')"
              class="flex-1 py-2.5 rounded-xl transition-all ${
                state.authMode === "register" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }"
            >
              📝 Create Account
            </button>
          </div>

          <!-- Error Alert Banner -->
          ${state.loginError ? `
            <div class="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-3 animate-pulse">
              <span class="text-base">⚠️</span>
              <span class="flex-1">${state.loginError}</span>
            </div>
          ` : ""}

          ${state.authMode === "login" ? `
            <!-- Login Form -->
            <form onsubmit="handleLoginFormSubmit(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address *
                </label>
                <div class="relative">
                  <input
                    type="email"
                    required
                    placeholder="e.g. organizer@eventhub.io"
                    value="${state.loginForm.email}"
                    oninput="state.loginForm.email = this.value"
                    class="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span class="absolute left-3.5 top-3.5 text-slate-400 text-sm">✉️</span>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <div class="relative">
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value="${state.loginForm.password}"
                    oninput="state.loginForm.password = this.value"
                    class="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span class="absolute left-3.5 top-3.5 text-slate-400 text-sm">🔒</span>
                </div>
              </div>

              <button
                type="submit"
                ${state.loginLoading ? "disabled" : ""}
                class="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                  state.loginLoading ? "opacity-75 cursor-not-allowed" : ""
                }"
              >
                ${state.loginLoading ? `
                  <div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Verifying Credentials...</span>
                ` : `
                  <span>Sign In to EventHub</span>
                  <span>→</span>
                `}
              </button>
            </form>

            <!-- 1-Click Demo Credentials for Live Viva / Faculty Presentation -->
            <div class="pt-5 border-t border-slate-100">
              <div class="flex items-center justify-between mb-3">
                <span class="text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  💡 Presentation Test Accounts
                </span>
                <span class="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full">
                  1-Click Autofill
                </span>
              </div>

              <div class="space-y-2.5">
                <!-- Organizer Card -->
                <div class="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 hover:border-indigo-300 transition-all flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-base">👑</span>
                      <span class="font-extrabold text-slate-900 text-xs">Event Organizer</span>
                      <span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-indigo-200/60 text-indigo-800">organizer</span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      organizer@eventhub.io · pass123
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onclick="fillCredentials('organizer@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-[11px] font-bold shadow-xs transition-all"
                      title="Fill into form inputs"
                    >
                      Autofill
                    </button>
                    <button
                      type="button"
                      onclick="instantLogin('organizer@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-[11px] font-bold shadow-sm transition-all"
                      title="Direct login via backend API"
                    >
                      Login ⚡
                    </button>
                  </div>
                </div>

                <!-- Gate Operator Card -->
                <div class="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 hover:border-emerald-300 transition-all flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-base">🛡️</span>
                      <span class="font-extrabold text-slate-900 text-xs">Gate Operator</span>
                      <span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-200/60 text-emerald-800">operator</span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      operator@eventhub.io · pass123
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onclick="fillCredentials('operator@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[11px] font-bold shadow-xs transition-all"
                      title="Fill into form inputs"
                    >
                      Autofill
                    </button>
                    <button
                      type="button"
                      onclick="instantLogin('operator@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-bold shadow-sm transition-all"
                      title="Direct login via backend API"
                    >
                      Login ⚡
                    </button>
                  </div>
                </div>

                <!-- Attendee Card -->
                <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-base">👤</span>
                      <span class="font-extrabold text-slate-900 text-xs">Event Attendee</span>
                      <span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-200 text-slate-700">attendee</span>
                    </div>
                    <div class="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                      attendee@eventhub.io · pass123
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onclick="fillCredentials('attendee@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-[11px] font-bold shadow-xs transition-all"
                      title="Fill into form inputs"
                    >
                      Autofill
                    </button>
                    <button
                      type="button"
                      onclick="instantLogin('attendee@eventhub.io', 'pass123')"
                      class="px-2.5 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-900 text-[11px] font-bold shadow-sm transition-all"
                      title="Direct login via backend API"
                    >
                      Login ⚡
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ` : `
            <!-- Registration Form -->
            <form onsubmit="handleRegisterSubmit(event)" class="space-y-4">
              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Lin"
                  value="${state.registerForm.name}"
                  oninput="state.registerForm.name = this.value"
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. maya@example.com"
                  value="${state.registerForm.email}"
                  oninput="state.registerForm.email = this.value"
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Create a strong password"
                  value="${state.registerForm.password}"
                  oninput="state.registerForm.password = this.value"
                  class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Account Role *
                  </label>
                  <select
                    value="${state.registerForm.role}"
                    onchange="state.registerForm.role = this.value"
                    class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none font-semibold"
                  >
                    <option value="attendee">👤 Attendee</option>
                    <option value="operator">🛡️ Gate Operator</option>
                    <option value="organizer">👑 Event Organizer</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 555-0199"
                    value="${state.registerForm.phone}"
                    oninput="state.registerForm.phone = this.value"
                    class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                ${state.loginLoading ? "disabled" : ""}
                class="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 ${
                  state.loginLoading ? "opacity-75 cursor-not-allowed" : ""
                }"
              >
                ${state.loginLoading ? `
                  <div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Creating Account...</span>
                ` : `
                  <span>Register & Sign In</span>
                  <span>→</span>
                `}
              </button>
            </form>
          `}
        </div>
      </div>
    </div>
  `;
}

// Render active tab view
function renderActiveTab(filteredEvents) {
  if (state.activeTab === "login") {
    return renderLoginView();
  }

  if (state.activeTab === "events") {
    return `
      <div class="space-y-6">
        <!-- Hero Banner -->
        <div class="bg-gradient-to-r from-indigo-700 via-indigo-600 to-purple-600 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
          <div class="relative z-10 max-w-2xl">
            <span class="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase mb-3">
              Campus & Professional Events Portal
            </span>
            <h2 class="text-3xl sm:text-4xl font-black tracking-tight leading-tight">
              Seamless Booking with Digital QR Validation
            </h2>
            <p class="mt-3 text-indigo-100 text-sm sm:text-base leading-relaxed">
              Register in seconds, receive unique cryptographic ticket passes, and enjoy lightning-fast gate check-in with capacity enforcement and OpenStreetMap geocoding.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <button onclick="setTab('checkin')" class="bg-white text-indigo-700 hover:bg-indigo-50 font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2">
                <span>⚡ Try Live Gate Scanner</span>
              </button>
              <button onclick="switchRole('organizer')" class="bg-indigo-800/60 hover:bg-indigo-800 border border-indigo-400/40 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-all flex items-center gap-2">
                <span>👑 Switch to Organizer</span>
              </button>
            </div>
          </div>
          <div class="absolute right-6 -bottom-8 opacity-10 text-[200px] select-none pointer-events-none hidden lg:block font-black">
            EH
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
            ${["All", "Technology", "Workshop", "Cultural", "Career"].map(cat => `
              <button onclick="setCategory('${cat}')" class="px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                state.selectedCategory === cat ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }">
                ${cat}
              </button>
            `).join("")}
          </div>

          <div class="relative min-w-[280px]">
            <input
              type="text"
              placeholder="Search events, venues, topics..."
              value="${state.searchQuery}"
              oninput="handleSearch(this.value)"
              class="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span class="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
          </div>
        </div>

        <!-- Events Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${filteredEvents.map(event => {
            const isFull = event.registered_count >= event.capacity;
            const percentFilled = Math.min(100, Math.round((event.registered_count / event.capacity) * 100));

            return `
              <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between">
                <div class="p-6">
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <span class="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                      event.category === "Technology" ? "badge-tech" :
                      event.category === "Workshop" ? "badge-workshop" :
                      event.category === "Cultural" ? "badge-cultural" : "badge-career"
                    }">
                      ${event.category}
                    </span>
                    <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      ${event.ticket_price === 0 ? "FREE" : `₹${event.ticket_price}`}
                    </span>
                  </div>

                  <h3 class="text-lg font-bold text-slate-900 leading-snug line-clamp-2 hover:text-indigo-600 cursor-pointer" onclick="openEventModal(${event.id})">
                    ${event.title}
                  </h3>

                  <p class="mt-2 text-xs text-slate-500 line-clamp-3 leading-relaxed">
                    ${event.description}
                  </p>

                  <div class="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div class="flex items-center gap-2">
                      <span class="text-slate-400">📅</span>
                      <span class="font-semibold text-slate-800">${event.date_time}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-slate-400">📍</span>
                      <span class="truncate">${event.venue_name}</span>
                    </div>
                  </div>

                  <div class="mt-4 pt-3">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="font-medium text-slate-500">Capacity</span>
                      <span class="font-bold ${isFull ? "text-rose-600" : "text-indigo-600"}">
                        ${event.registered_count} / ${event.capacity} spots filled
                      </span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-500 ${
                        isFull ? "bg-rose-500" : percentFilled > 80 ? "bg-amber-500" : "bg-indigo-600"
                      }" style="width: ${percentFilled}%"></div>
                    </div>
                  </div>
                </div>

                <div class="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <button onclick="openEventModal(${event.id})" class="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1">
                    <span>🗺️ View Venue Map</span>
                  </button>

                  ${isFull ? `
                    <button disabled class="bg-slate-200 text-slate-500 text-xs font-bold px-4 py-2 rounded-xl cursor-not-allowed">
                      Sold Out
                    </button>
                  ` : `
                    <button onclick="registerForEvent(${event.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm transition-all flex items-center gap-1.5">
                      <span>🎟️ Book Ticket</span>
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  if (state.activeTab === "my-tickets") {
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-2xl font-extrabold text-slate-900">My Registered Tickets</h2>
            <p className="text-sm text-slate-500">Present your digital QR boarding pass at the entrance gate for instant check-in.</p>
          </div>
          <button onclick="window.print()" class="self-start sm:self-auto bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-2">
            <span>🖨️ Print Passes</span>
          </button>
        </div>

        ${state.myTickets.length === 0 ? `
          <div class="bg-white rounded-3xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm">
            <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
              🎟️
            </div>
            <h3 class="text-lg font-bold text-slate-900">No Tickets Yet</h3>
            <p class="text-sm text-slate-500 mt-1 mb-6">
              You haven't registered for any events yet. Explore available events and claim your spot!
            </p>
            <button onclick="setTab('events')" class="bg-indigo-600 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md hover:bg-indigo-700 transition-all">
              Explore Events Now
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            ${state.myTickets.map(ticket => `
              <div class="ticket-card p-6 flex flex-col justify-between">
                <div class="ticket-cutout-left"></div>
                <div class="ticket-cutout-right"></div>

                <div>
                  <div class="flex items-center justify-between pb-4 border-b border-slate-100">
                    <div>
                      <span class="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        OFFICIAL ENTRY PASS
                      </span>
                      <h4 class="text-lg font-black text-slate-900 mt-1">${ticket.event_title}</h4>
                    </div>
                    <span class="text-xs font-bold px-2.5 py-1 rounded-full ${
                      ticket.checkin_time ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                    }">
                      ${ticket.checkin_time ? "✓ CHECKED IN" : "VALID PASS"}
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 py-6 items-center">
                    <div class="sm:col-span-2 space-y-3 text-xs">
                      <div>
                        <span class="text-slate-400 block font-semibold">ATTENDEE NAME</span>
                        <span class="text-base font-extrabold text-slate-900">${state.currentUser ? state.currentUser.name : (ticket.attendee_name || "Guest Attendee")}</span>
                      </div>
                      <div>
                        <span class="text-slate-400 block font-semibold">DATE & VENUE</span>
                        <span class="font-bold text-slate-800 block">${ticket.date_time}</span>
                        <span class="text-slate-500 block truncate">${ticket.venue_name}</span>
                      </div>
                      <div>
                        <span class="text-slate-400 block font-semibold">TICKET TOKEN</span>
                        <span class="font-mono text-sm font-black text-indigo-700 bg-slate-100 px-2.5 py-1 rounded-lg inline-block">
                          ${ticket.ticket_token}
                        </span>
                      </div>
                    </div>

                    <div class="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-2xl border border-slate-200">
                      <div id="qr-${ticket.id}" data-token="${ticket.ticket_token}" class="qr-target p-1 bg-white rounded-xl shadow-sm"></div>
                      <span class="text-[10px] text-slate-400 font-mono mt-2 uppercase">Scan to Verify</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="ticket-perforation"></div>
                  <div class="pt-3 flex items-center justify-between text-xs">
                    <span class="text-slate-400">Issued via EventHub Security</span>
                    <button onclick="testScanPass('${ticket.ticket_token}', ${ticket.event_id})" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-xl transition-all">
                      ⚡ Test Scan Gate
                    </button>
                  </div>
                </div>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    `;
  }

  if (state.activeTab === "checkin") {
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-2xl font-black text-slate-900">Entrance Gate Check-In Console</h2>
              <span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">
                LIVE GATE
              </span>
            </div>
            <p class="text-sm text-slate-500">Scan QR codes or enter ticket tokens to validate attendees in real time.</p>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-xs font-bold text-slate-600">Active Event:</label>
            <select onchange="handleSelectGateEvent(this.value)" class="bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500">
              ${state.events.map(e => `
                <option value="${e.id}" ${e.id === state.checkinEventId ? "selected" : ""}>
                  ${e.title}
                </option>
              `).join("")}
            </select>
          </div>
        </div>

        ${state.checkinStats ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Total Registered</span>
              <div class="text-2xl font-black text-slate-900 mt-1">${state.checkinStats.registered_count}</div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Checked In</span>
              <div class="text-2xl font-black text-emerald-600 mt-1">${state.checkinStats.checked_in_count}</div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Gate Turnout</span>
              <div class="text-2xl font-black text-indigo-600 mt-1">${state.checkinStats.attendance_rate}%</div>
            </div>
            <div class="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Available Spots</span>
              <div class="text-2xl font-black text-slate-700 mt-1">${state.checkinStats.remaining_spots}</div>
            </div>
          </div>
        ` : ""}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
              <h3 class="text-base font-bold text-slate-900">⚡ Ticket Token / QR Code Scanner</h3>
              <div class="flex gap-2">
                <input
                  type="text"
                  id="gateTokenInput"
                  placeholder="e.g. EH-2026-T84A-9102 or scan QR..."
                  value="${state.checkinInput}"
                  oninput="state.checkinInput = this.value"
                  onkeydown="if(event.key==='Enter') handleValidateCheckin()"
                  class="flex-1 px-4 py-3 rounded-2xl border border-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button onclick="handleValidateCheckin()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-md transition-all">
                  Verify
                </button>
              </div>

              <!-- 1-Click Fast Demonstration Buttons -->
              <div class="pt-2">
                <span class="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  💡 1-Click Demo Scenarios (For Live Presentation):
                </span>
                <div class="flex flex-wrap gap-2">
                  <button onclick="handleValidateCheckin('EH-2026-T84A-9102')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all">
                    🟢 Valid Ticket (David Chen)
                  </button>
                  <button onclick="handleValidateCheckin('EH-2026-K19F-4418')" class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all">
                    🟡 Duplicate Scan (Elena Rostova)
                  </button>
                  <button onclick="handleValidateCheckin('EH-2026-FAKE-0000')" class="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all">
                    🔴 Invalid Token (Fake Pass)
                  </button>
                </div>
              </div>
            </div>

            <!-- Validation Result Banner -->
            ${state.checkinResult ? `
              <div class="p-6 rounded-3xl border shadow-lg transition-all ${
                state.checkinResult.status_code === "SUCCESS"
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                  : state.checkinResult.status_code === "ALREADY_CHECKED_IN"
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : "bg-rose-50 border-rose-300 text-rose-900"
              }">
                <div class="flex items-start gap-4">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl font-bold ${
                    state.checkinResult.status_code === "SUCCESS"
                      ? "bg-emerald-500 text-white"
                      : state.checkinResult.status_code === "ALREADY_CHECKED_IN"
                      ? "bg-amber-500 text-white"
                      : "bg-rose-500 text-white"
                  }">
                    ${state.checkinResult.status_code === "SUCCESS" ? "✓" : state.checkinResult.status_code === "ALREADY_CHECKED_IN" ? "!" : "✕"}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-black tracking-widest uppercase opacity-80">
                        ${state.checkinResult.status_code}
                      </span>
                      <span class="text-xs font-mono opacity-60">
                        ${new Date().toLocaleTimeString()}
                      </span>
                    </div>
                    <h4 class="text-lg font-black mt-0.5">
                      ${state.checkinResult.message}
                    </h4>

                    ${state.checkinResult.details ? `
                      <div class="mt-3 grid grid-cols-2 gap-2 text-xs bg-white/70 p-3 rounded-xl border border-black/5">
                        <div>
                          <span class="text-slate-500 block">Attendee:</span>
                          <span class="font-bold text-slate-800">${state.checkinResult.details.attendee_name}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block">Ticket Token:</span>
                          <span class="font-mono font-semibold text-slate-800">${state.checkinResult.details.ticket_token}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block">Event:</span>
                          <span class="font-medium text-slate-800">${state.checkinResult.details.event_title}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block">Gate Status:</span>
                          <span class="font-bold text-emerald-700">Verified & Admitted</span>
                        </div>
                      </div>
                    ` : ""}
                  </div>
                </div>
              </div>
            ` : ""}
          </div>

          <!-- Activity Feed -->
          <div class="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 class="text-base font-bold text-slate-900 flex items-center justify-between">
              <span>Gate Activity Feed</span>
              <span class="text-xs font-normal text-slate-500">Last 10 entries</span>
            </h3>

            <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              ${state.recentCheckins.length === 0 ? `
                <div class="text-center py-10 text-slate-400 text-xs">
                  No recent check-ins yet. Verify a ticket above to see live updates.
                </div>
              ` : state.recentCheckins.map(item => `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div class="font-bold text-slate-800">${item.attendee_name}</div>
                    <div class="text-[11px] font-mono text-slate-500">${item.ticket_token}</div>
                  </div>
                  <div class="text-right">
                    <span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                      ADMITTED
                    </span>
                    <div class="text-[10px] text-slate-400 mt-1">${item.checkin_time ? item.checkin_time.split(" ")[1] : "Just now"}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (state.activeTab === "organizer") {
    return `
      <div class="space-y-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-2xl font-black text-slate-900">Organizer Management Console</h2>
            <p class="text-sm text-slate-500">Track registrations, manage capacity, export attendee lists, and inspect system audit logs.</p>
          </div>
          <button onclick="openCreateModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2 self-start sm:self-auto">
            <span>➕ Publish New Event</span>
          </button>
        </div>

        <!-- KPIs -->
        ${state.organizerMetrics ? `
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Published Events</span>
              <div class="text-3xl font-black text-slate-900 mt-1">${state.organizerMetrics.total_events}</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Total Registrations</span>
              <div class="text-3xl font-black text-indigo-600 mt-1">${state.organizerMetrics.total_registrations}</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Total Checked In</span>
              <div class="text-3xl font-black text-emerald-600 mt-1">${state.organizerMetrics.total_checked_in}</div>
            </div>
            <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span class="text-xs font-semibold text-slate-400">Overall Turnout</span>
              <div class="text-3xl font-black text-purple-600 mt-1">${state.organizerMetrics.checkin_rate}%</div>
            </div>
          </div>
        ` : ""}

        <!-- Events Table -->
        <div class="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-900">Manage Your Events</h3>
            <span class="text-xs text-slate-500">${state.events.length} active events</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th class="py-3.5 px-6">Event Title</th>
                  <th class="py-3.5 px-4">Category</th>
                  <th class="py-3.5 px-4">Date & Time</th>
                  <th class="py-3.5 px-4">Capacity</th>
                  <th class="py-3.5 px-4">Status</th>
                  <th class="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 text-xs font-medium">
                ${state.events.map(e => `
                  <tr class="hover:bg-slate-50 transition-all">
                    <td class="py-4 px-6 font-bold text-slate-800">${e.title}</td>
                    <td class="py-4 px-4">
                      <span class="px-2.5 py-1 rounded-lg font-bold uppercase text-[10px] bg-indigo-50 text-indigo-700">
                        ${e.category}
                      </span>
                    </td>
                    <td class="py-4 px-4 text-slate-600">${e.date_time}</td>
                    <td class="py-4 px-4 font-semibold">${e.registered_count} / ${e.capacity}</td>
                    <td class="py-4 px-4">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                      }">
                        ${e.status.toUpperCase()}
                      </span>
                    </td>
                    <td class="py-4 px-6 text-right space-x-2">
                      <button onclick="handleViewAttendees(${e.id})" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg transition-all">
                        Attendees (${e.registered_count})
                      </button>
                      <a href="/api/organizer/export/${e.id}?token=${encodeURIComponent(state.token || '')}" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition-all inline-block">
                        CSV 📥
                      </a>
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Attendees Roster Drawer -->
        ${state.selectedEventForAttendees ? `
          <div class="bg-white rounded-3xl border border-indigo-200 p-6 shadow-md space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 class="text-base font-bold text-slate-900">
                  Attendee Roster: ${state.selectedEventForAttendees.title}
                </h3>
                <p class="text-xs text-slate-500">
                  Total Registered: ${state.selectedEventAttendees.length} | Checked In: ${state.selectedEventAttendees.filter(a => a.is_checked_in).length}
                </p>
              </div>
              <button onclick="state.selectedEventForAttendees = null; render();" class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-xl font-bold">
                Close Roster ✕
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th class="py-2 px-3">Name</th>
                    <th class="py-2 px-3">Email</th>
                    <th class="py-2 px-3">Ticket Token</th>
                    <th class="py-2 px-3">Status</th>
                    <th class="py-2 px-3">Gate Scan Time</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${state.selectedEventAttendees.map(a => `
                    <tr class="hover:bg-slate-50">
                      <td class="py-3 px-3 font-bold text-slate-800">${a.attendee_name}</td>
                      <td class="py-3 px-3 text-slate-500">${a.attendee_email}</td>
                      <td class="py-3 px-3 font-mono font-semibold text-indigo-600">${a.ticket_token}</td>
                      <td class="py-3 px-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.is_checked_in ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }">
                          ${a.is_checked_in ? "CHECKED IN" : "PENDING"}
                        </span>
                      </td>
                      <td class="py-3 px-3 text-slate-500">${a.checkin_time || "—"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}

        <!-- Audit Trail -->
        ${state.organizerMetrics && state.organizerMetrics.recent_logs ? `
          <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>🛡️ Security & Observability Audit Trail (\`organizer_logs\`)</span>
              </h3>
              <span class="text-xs text-slate-400 font-mono">Real-time DB Events</span>
            </div>

            <div class="space-y-2 max-h-72 overflow-y-auto">
              ${state.organizerMetrics.recent_logs.map(log => `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      log.action.includes("CHECKED_IN") ? "bg-emerald-100 text-emerald-800" :
                      log.action.includes("REGISTERED") ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"
                    }">
                      ${log.action}
                    </span>
                    <span class="font-medium text-slate-700">${log.details}</span>
                  </div>
                  <span class="text-[11px] font-mono text-slate-400">${log.timestamp}</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  return "";
}

// Render Event Details Modal
function renderEventModal(event) {
  const isFull = event.registered_count >= event.capacity;
  return `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6">
        <div class="flex items-start justify-between">
          <div>
            <span class="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
              ${event.category}
            </span>
            <h3 class="text-2xl font-black text-slate-900 mt-2">${event.title}</h3>
          </div>
          <button onclick="state.selectedEvent = null; render();" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center">
            ✕
          </button>
        </div>

        <p class="text-sm text-slate-600 leading-relaxed">${event.description}</p>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span class="text-slate-400 block font-semibold">DATE & TIME</span>
            <span class="font-bold text-slate-800">${event.date_time}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-semibold">VENUE</span>
            <span class="font-bold text-slate-800">${event.venue_name}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-semibold">CAPACITY</span>
            <span class="font-bold text-indigo-700">${event.registered_count} / ${event.capacity} spots</span>
          </div>
        </div>

        <!-- OpenStreetMap Canvas -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-bold text-slate-700">📍 Venue Map (OpenStreetMap & Leaflet)</span>
            <span class="text-slate-400 truncate">${event.venue_address}</span>
          </div>
          <div id="modalLeafletMap" class="h-60 w-full rounded-2xl border border-slate-200"></div>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button onclick="state.selectedEvent = null; render();" class="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
            Back
          </button>
          ${isFull ? `
            <button disabled class="bg-slate-200 text-slate-400 text-xs font-bold px-6 py-2.5 rounded-xl cursor-not-allowed">
              Sold Out
            </button>
          ` : `
            <button onclick="handleRegister(${event.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all flex items-center gap-2">
              <span>🎟️ Confirm Booking</span>
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

// Render Create Event Modal
function renderCreateEventModal() {
  return `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6">
        <div class="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 class="text-xl font-black text-slate-900">Publish New Event</h3>
          <button onclick="state.showCreateModal = false; render();" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center">
            ✕
          </button>
        </div>

        <form onsubmit="handleCreateEvent(event)" class="space-y-4 text-xs">
          <div>
            <label class="font-bold text-slate-700 block mb-1">Event Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. AI Autonomous Agents & Cloud Expo"
              value="${state.newEvent.title}"
              oninput="state.newEvent.title = this.value"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="font-bold text-slate-700 block mb-1">Category *</label>
              <select onchange="state.newEvent.category = this.value" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                <option value="Technology">Technology</option>
                <option value="Workshop">Workshop</option>
                <option value="Cultural">Cultural</option>
                <option value="Career">Career</option>
              </select>
            </div>
            <div>
              <label class="font-bold text-slate-700 block mb-1">Date & Time *</label>
              <input
                type="text"
                required
                value="${state.newEvent.date_time}"
                oninput="state.newEvent.date_time = this.value"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="font-bold text-slate-700 block mb-1">Capacity (Max Attendees) *</label>
              <input
                type="number"
                min="1"
                required
                value="${state.newEvent.capacity}"
                oninput="state.newEvent.capacity = parseInt(this.value)"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label class="font-bold text-slate-700 block mb-1">Ticket Price (₹)</label>
              <input
                type="number"
                min="0"
                value="${state.newEvent.ticket_price}"
                oninput="state.newEvent.ticket_price = parseFloat(this.value)"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="font-bold text-slate-700 block mb-1">Venue Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Science Auditorium, Campus East"
              value="${state.newEvent.venue_name}"
              oninput="state.newEvent.venue_name = this.value"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-bold text-slate-700">Venue Address (OpenStreetMap Geocoding) *</label>
              <button type="button" onclick="handleGeocodeVenue()" class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800">
                ${state.geocodingLoading ? "Geocoding..." : "⚡ Validate & Geocode"}
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. 100 Innovation Way, San Francisco, CA"
              value="${state.newEvent.venue_address}"
              oninput="state.newEvent.venue_address = this.value"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label class="font-bold text-slate-700 block mb-1">Event Description *</label>
            <textarea
              required
              rows="3"
              placeholder="Describe event schedule, speakers, topics..."
              oninput="state.newEvent.description = this.value"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >${state.newEvent.description}</textarea>
          </div>

          <div class="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button type="button" onclick="state.showCreateModal = false; render();" class="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-md transition-all">
              Publish Event
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Render Google Account Selector Modal
function renderGoogleModal() {
  if (!state.showGoogleModal) return "";

  return `
    <div class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 relative border border-slate-100 animate-in fade-in zoom-in duration-200">
        <!-- Close button -->
        <button
          onclick="state.showGoogleModal = false; render();"
          class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer"
        >
          ✕
        </button>

        <!-- Google Header -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 shadow-xs mb-1">
            <svg class="w-6 h-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
          </div>
          <h3 class="text-xl font-black text-slate-900">Sign in with Google</h3>
          <p class="text-xs text-slate-500">Choose an account to continue to EventHub</p>
        </div>

        <!-- Role Assignment Selector -->
        <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <label class="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">
            Sign in as Role:
          </label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onclick="setGoogleRole('attendee')"
              class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                state.googleSelectedRole === 'attendee' ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              👤 Attendee
            </button>
            <button
              type="button"
              onclick="setGoogleRole('operator')"
              class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                state.googleSelectedRole === 'operator' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              🛡️ Operator
            </button>
            <button
              type="button"
              onclick="setGoogleRole('organizer')"
              class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                state.googleSelectedRole === 'organizer' ? 'bg-purple-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              👑 Organizer
            </button>
          </div>
        </div>

        <!-- Pre-configured Demo Google Accounts -->
        <div class="space-y-2">
          <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
            Choose an account
          </span>

          <!-- Account 1: Sarah Jenkins (Organizer) -->
          <div
            onclick="submitGoogleSignIn('Sarah Jenkins', 'sarah.jenkins@gmail.com', 'organizer')"
            class="p-3 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                SJ
              </div>
              <div class="text-left">
                <div class="font-extrabold text-slate-800 text-xs group-hover:text-indigo-600 transition-colors">Sarah Jenkins</div>
                <div class="text-[11px] text-slate-400 font-mono">sarah.jenkins@gmail.com</div>
              </div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">👑 Organizer</span>
          </div>

          <!-- Account 2: Alex Rivera (Operator) -->
          <div
            onclick="submitGoogleSignIn('Alex Rivera', 'alex.rivera@gmail.com', 'operator')"
            class="p-3 rounded-2xl border border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/40 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                AR
              </div>
              <div class="text-left">
                <div class="font-extrabold text-slate-800 text-xs group-hover:text-emerald-600 transition-colors">Alex Rivera</div>
                <div class="text-[11px] text-slate-400 font-mono">alex.rivera@gmail.com</div>
              </div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">🛡️ Operator</span>
          </div>

          <!-- Account 3: David Chen (Attendee) -->
          <div
            onclick="submitGoogleSignIn('David Chen', 'david.chen@gmail.com', 'attendee')"
            class="p-3 rounded-2xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-sm flex items-center justify-center shadow-xs">
                DC
              </div>
              <div class="text-left">
                <div class="font-extrabold text-slate-800 text-xs group-hover:text-slate-900 transition-colors">David Chen</div>
                <div class="text-[11px] text-slate-400 font-mono">david.chen@gmail.com</div>
              </div>
            </div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">👤 Attendee</span>
          </div>
        </div>

        <!-- Custom Account Option -->
        <div class="pt-3 border-t border-slate-100">
          <form onsubmit="handleCustomGoogleSubmit(event)" class="space-y-3">
            <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 block px-1">
              Or use your own Google email
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Name (e.g. Maya Lin)"
                value="${state.customGoogleName}"
                oninput="state.customGoogleName = this.value"
                class="px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <input
                type="email"
                required
                placeholder="yourname@gmail.com"
                value="${state.customGoogleEmail}"
                oninput="state.customGoogleEmail = this.value"
                class="px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              class="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue with this account</span>
              <span>→</span>
            </button>
          </form>
        </div>

        <div class="text-center pt-1 text-[11px] text-slate-400">
          Protected by Google OAuth 2.0 Identity Protocol
        </div>
      </div>
    </div>
  `;
}

// Post-Render Logic: Leaflet Maps & Dynamic Canvas QR Codes
function attachPostRenderLogic() {
  // Render Canvas QR codes for tickets
  const qrTargets = document.querySelectorAll(".qr-target");
  qrTargets.forEach(el => {
    const token = el.getAttribute("data-token");
    if (token && window.QRCode) {
      el.innerHTML = "";
      new window.QRCode(el, {
        text: token,
        width: 140,
        height: 140,
        colorDark: "#1e1b4b",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }
  });

  // Render Leaflet Map in Event Details Modal
  const mapEl = document.getElementById("modalLeafletMap");
  if (mapEl && window.L && state.selectedEvent) {
    const lat = state.selectedEvent.latitude || 37.7749;
    const lon = state.selectedEvent.longitude || -122.4194;

    try {
      const map = window.L.map(mapEl).setView([lat, lon], 14);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors"
      }).addTo(map);

      window.L.marker([lat, lon])
        .addTo(map)
        .bindPopup(`<b>${state.selectedEvent.venue_name}</b><br>${state.selectedEvent.venue_address}`)
        .openPopup();
    } catch (e) {
      console.warn("Leaflet map init warning", e);
    }
  }
}

// Global Event Dispatches
window.setTab = function(tabName) {
  // If user clicks a protected tab without being logged in:
  if (!state.currentUser && (tabName === "my-tickets" || tabName === "organizer" || tabName === "checkin")) {
    state.activeTab = "login";
    state.loginError = `Please sign in to access ${tabName === "my-tickets" ? "your tickets" : tabName === "organizer" ? "the Organizer Hub" : "the Check-In Gate"}.`;
    showToast("Authentication required", "warning");
    render();
    return;
  }

  // If attendee attempts to access organizer hub or checkin gate
  if (state.currentUser && tabName === "organizer" && state.currentUser.role !== "organizer") {
    showToast("Access restricted: Organizer role required. You can switch demo roles in the header.", "warning");
    return;
  }
  if (state.currentUser && tabName === "checkin" && state.currentUser.role !== "operator" && state.currentUser.role !== "organizer") {
    showToast("Access restricted: Gate Operator or Organizer role required.", "warning");
    return;
  }

  state.activeTab = tabName;
  if (tabName === "my-tickets") loadMyTickets();
  if (tabName === "organizer") loadOrganizerDashboard();
  if (tabName === "checkin") loadCheckinStats(state.checkinEventId);
  render();
};

window.setCategory = function(cat) {
  state.selectedCategory = cat;
  render();
};

window.handleSearch = function(query) {
  state.searchQuery = query;
  render();
};

window.switchRole = function(role) {
  handleRoleSwitch(role);
};

window.openEventModal = function(id) {
  state.selectedEvent = state.events.find(e => e.id === id);
  render();
};

window.openCreateModal = function() {
  state.showCreateModal = true;
  render();
};

window.registerForEvent = function(id) {
  if (!state.currentUser) {
    state.activeTab = "login";
    state.loginError = "Please sign in or select a demo account to book event passes.";
    showToast("Sign in required to register", "warning");
    render();
    return;
  }
  handleRegister(id);
};

window.testScanPass = function(token, eventId) {
  state.checkinEventId = eventId;
  state.activeTab = "checkin";
  handleValidateCheckin(token);
};

window.handleSelectGateEvent = function(eventId) {
  state.checkinEventId = parseInt(eventId);
  loadCheckinStats(state.checkinEventId);
};

// Auth & Session Global Handlers
window.fillCredentials = function(email, pass) {
  fillLoginForm(email, pass);
};

window.instantLogin = function(email, pass) {
  handleLogin(null, email, pass);
};

window.handleLoginFormSubmit = function(e) {
  handleLogin(e);
};

window.handleRegisterSubmit = function(e) {
  handleRegisterUser(e);
};

window.handleLogout = function() {
  handleLogout();
};

window.setAuthMode = function(mode) {
  state.authMode = mode;
  state.loginError = null;
  render();
};

// Google OAuth Global Handlers
window.openGoogleSignInModal = function() {
  state.showGoogleModal = true;
  render();
};

window.setGoogleRole = function(role) {
  state.googleSelectedRole = role;
  render();
};

window.submitGoogleSignIn = function(name, email, role) {
  handleGoogleSignIn({ name, email, role: role || state.googleSelectedRole });
};

window.handleCustomGoogleSubmit = function(e) {
  if (e) e.preventDefault();
  if (!state.customGoogleEmail) return;
  const email = state.customGoogleEmail.trim();
  const name = state.customGoogleName.trim() || email.split("@")[0];
  handleGoogleSignIn({ name, email, role: state.googleSelectedRole });
};

window.triggerGoogleSignIn = function() {
  openGoogleSignInModal();
};

// Initial Bootstrap on Page Load
document.addEventListener("DOMContentLoaded", () => {
  loadEvents();
  if (state.token && state.currentUser) {
    loadMyTickets();
    if (state.currentUser.role === "operator" || state.currentUser.role === "organizer") {
      loadCheckinStats(state.checkinEventId);
    }
  }

  // Initialize Google Identity Services if available and configured
  if (window.google?.accounts?.id) {
    try {
      window.google.accounts.id.initialize({
        client_id: window.GOOGLE_CLIENT_ID || "demo-eventhub-client-id.apps.googleusercontent.com",
        callback: (response) => {
          if (response.credential) {
            handleGoogleSignIn({ credential: response.credential, role: state.googleSelectedRole });
          }
        }
      });
    } catch (e) {
      console.warn("Google Identity init warning", e);
    }
  }
});
