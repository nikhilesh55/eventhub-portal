/**
 * EventHub - Core Application Logic
 * Native Modern JavaScript (ES6+) · Zero External Framework Bottlenecks
 * Loads instantaneously with 0ms compilation overhead.
 */

// Purge any legacy mock token if present
try {
  if (localStorage.getItem("eh_token") === "demo_attendee_token") {
    localStorage.removeItem("eh_token");
    localStorage.removeItem("eh_user");
  }
} catch (e) {}

// Application State Store
// The FIRST page displayed when visiting EventHub is strictly the Login Page
const state = {
  activeTab: "login", // 'login' | 'events' | 'my-tickets' | 'checkin' | 'organizer'
  currentUser: null,
  token: null,
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
  // UI State Controls
  showPassword: false,
  mobileSidebarOpen: false,
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
  let email = (overrideEmail || "").trim();
  let password = overridePass || "";

  // Check DOM inputs directly if not passed as override
  if (!email) {
    const domEmail = document.getElementById("login-email-input") || (e && e.target ? e.target.querySelector('input[type="email"]') : null);
    if (domEmail && domEmail.value) email = domEmail.value.trim();
  }
  if (!password) {
    const domPass = document.getElementById("login-password-input") || (e && e.target ? e.target.querySelector('input[type="password"]') : null);
    if (domPass && domPass.value) password = domPass.value;
  }

  // Fallback to internal state
  if (!email) email = (state.loginForm.email || "").trim();
  if (!password) password = state.loginForm.password || "";

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
  const domEmail = document.getElementById("login-email-input");
  const domPass = document.getElementById("login-password-input");
  if (domEmail) domEmail.value = email;
  if (domPass) domPass.value = password;
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
    state.activeTab = "login";
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

  // Dedicated Full-Screen Login Page View
  if (state.activeTab === "login") {
    root.innerHTML = `
      ${renderLoginView()}
      ${renderGoogleModal()}
      ${state.toast ? `
        <div class="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2.5 text-white font-medium text-xs transition-all ${
          state.toast.type === "success" ? "bg-emerald-600" : state.toast.type === "warning" ? "bg-amber-600" : "bg-rose-600"
        }">
          <span>${state.toast.type === "success" ? "✓" : state.toast.type === "warning" ? "!" : "✕"}</span>
          <span>${state.toast.message}</span>
        </div>
      ` : ""}
    `;
    attachPostRenderLogic();
    return;
  }

  // Admin SaaS Dashboard Layout (Explore Events, My Tickets, Check-In Gate, Organizer Hub)
  const pageTitles = {
    "events": { title: "Explore Events", desc: "Discover upcoming technology conferences, workshops, and symposiums." },
    "my-tickets": { title: "My Tickets", desc: "Review your active digital passes, venue locations, and QR codes." },
    "checkin": { title: "Gate Scanner Console", desc: "Fast attendee check-in with real-time database validation." },
    "organizer": { title: "Organizer Hub", desc: "Monitor registrations, manage event capacity, and audit security logs." }
  };
  const currentPage = pageTitles[state.activeTab] || { title: "Dashboard", desc: "EventHub Management Portal" };

  root.innerHTML = `
    <div class="min-h-screen flex bg-slate-50 text-slate-900">
      <!-- Desktop Sidebar -->
      <aside class="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-screen sticky top-0 shrink-0 z-30 justify-between">
        <div>
          <!-- Sidebar Brand -->
          <div class="h-16 px-6 border-b border-slate-200 flex items-center justify-between">
            <div class="flex items-center gap-2.5 cursor-pointer" onclick="setTab('events')">
              <div class="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-base shadow-xs">
                🎟️
              </div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-900 text-base tracking-tight">EventHub</span>
                <span class="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-orange-50 text-orange-700 border border-orange-200">SaaS</span>
              </div>
            </div>
          </div>

          <!-- Navigation Links -->
          <div class="p-4 space-y-6">
            <div>
              <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 block mb-2">
                WORKSPACE
              </span>
              <nav class="space-y-1 text-xs font-medium">
                <button
                  onclick="setTab('events')"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left cursor-pointer ${
                    state.activeTab === "events"
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }"
                >
                  <span class="text-sm">🎪</span>
                  <span>Explore Events</span>
                </button>

                <button
                  onclick="setTab('my-tickets')"
                  class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left cursor-pointer ${
                    state.activeTab === "my-tickets"
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-sm">🎟️</span>
                    <span>My Tickets</span>
                  </div>
                  ${state.myTickets.length > 0 ? `
                    <span class="bg-orange-100 text-orange-800 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      ${state.myTickets.length}
                    </span>
                  ` : ""}
                </button>

                <button
                  onclick="setTab('checkin')"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left cursor-pointer ${
                    state.activeTab === "checkin"
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }"
                >
                  <span class="text-sm">⚡</span>
                  <span>Gate Scanner</span>
                </button>

                <button
                  onclick="setTab('organizer')"
                  class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left cursor-pointer ${
                    state.activeTab === "organizer"
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }"
                >
                  <span class="text-sm">📊</span>
                  <span>Organizer Hub</span>
                </button>
              </nav>
            </div>
          </div>
        </div>

        <!-- Sidebar Footer / User Profile Card -->
        <div class="p-4 border-t border-slate-200 bg-slate-50/50">
          ${state.currentUser ? `
            <div class="space-y-3">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-full bg-orange-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                  ${state.currentUser.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="font-bold text-slate-900 text-xs truncate">${state.currentUser.name}</div>
                  <div class="flex items-center gap-1.5 mt-0.5">
                    <span class="text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                      state.currentUser.role === 'organizer' ? 'bg-orange-100 text-orange-800' :
                      state.currentUser.role === 'operator' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                    }">
                      ${state.currentUser.role === 'organizer' ? '👑 Organizer' : state.currentUser.role === 'operator' ? '🛡️ Operator' : '👤 Attendee'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onclick="handleLogout()"
                class="w-full py-1.5 px-3 rounded-lg border border-slate-200 hover:border-rose-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <span>Sign Out</span>
                <span class="text-xs">🚪</span>
              </button>
            </div>
          ` : `
            <button
              onclick="setTab('login')"
              class="w-full py-2 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🔑</span>
              <span>Sign In / Demo Login</span>
            </button>
          `}
        </div>
      </aside>

      <!-- Mobile Sidebar Drawer -->
      ${state.mobileSidebarOpen ? `
        <div class="fixed inset-0 z-50 lg:hidden">
          <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-xs" onclick="toggleMobileSidebar(false)"></div>
          <div class="fixed inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col justify-between p-5 z-10">
            <div>
              <div class="flex items-center justify-between pb-4 border-b border-slate-200">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-base">
                    🎟️
                  </div>
                  <span class="font-bold text-slate-900 text-base">EventHub</span>
                </div>
                <button onclick="toggleMobileSidebar(false)" class="p-1 rounded-md text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>

              <nav class="mt-5 space-y-1 text-xs font-medium">
                <button onclick="setTab('events'); toggleMobileSidebar(false);" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${state.activeTab === 'events' ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-600'}">
                  <span>🎪</span>
                  <span>Explore Events</span>
                </button>
                <button onclick="setTab('my-tickets'); toggleMobileSidebar(false);" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${state.activeTab === 'my-tickets' ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-600'}">
                  <span>🎟️</span>
                  <span>My Tickets (${state.myTickets.length})</span>
                </button>
                <button onclick="setTab('checkin'); toggleMobileSidebar(false);" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${state.activeTab === 'checkin' ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-600'}">
                  <span>⚡</span>
                  <span>Gate Scanner</span>
                </button>
                <button onclick="setTab('organizer'); toggleMobileSidebar(false);" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${state.activeTab === 'organizer' ? 'bg-orange-50 text-orange-700 font-semibold' : 'text-slate-600'}">
                  <span>📊</span>
                  <span>Organizer Hub</span>
                </button>
              </nav>
            </div>

            <div class="pt-4 border-t border-slate-200">
              ${state.currentUser ? `
                <div class="text-xs font-medium text-slate-800 mb-2 truncate">${state.currentUser.name} (${state.currentUser.role})</div>
                <button onclick="handleLogout()" class="w-full py-2 rounded-lg bg-rose-50 text-rose-700 font-medium text-xs">Sign Out</button>
              ` : `
                <button onclick="setTab('login')" class="w-full py-2 rounded-lg bg-orange-600 text-white font-medium text-xs">Sign In</button>
              `}
            </div>
          </div>
        </div>
      ` : ""}

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col min-w-0">
        <!-- Top App Bar -->
        <header class="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-20">
          <div class="flex items-center gap-3">
            <button
              onclick="toggleMobileSidebar(true)"
              class="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            >
              ☰
            </button>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
                  ${currentPage.title}
                </h1>
              </div>
              <p class="text-xs text-slate-500 hidden sm:block leading-tight">
                ${currentPage.desc}
              </p>
            </div>
          </div>

          <!-- Top Bar Right: Presentation Role Switcher & Profile -->
          <div class="flex items-center gap-2 sm:gap-3">
            ${state.currentUser ? `
              <!-- 1-Click Role Switcher for Live Demo -->
              <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1.5 hidden md:inline">ROLE:</span>
                <button
                  onclick="switchRole('attendee')"
                  class="px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    state.currentUser.role === "attendee"
                      ? "bg-white text-orange-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }"
                >
                  Attendee
                </button>
                <button
                  onclick="switchRole('operator')"
                  class="px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    state.currentUser.role === "operator"
                      ? "bg-white text-orange-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }"
                >
                  Operator
                </button>
                <button
                  onclick="switchRole('organizer')"
                  class="px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    state.currentUser.role === "organizer"
                      ? "bg-white text-orange-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }"
                >
                  Organizer
                </button>
              </div>

              <!-- Compact Role Badge -->
              <div class="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                <div class="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                  ${state.currentUser.name.charAt(0)}
                </div>
              </div>
            ` : `
              <button
                onclick="setTab('login')"
                class="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors"
              >
                Sign In
              </button>
            `}
          </div>
        </header>

        <!-- Global Toast Notification -->
        ${state.toast ? `
          <div class="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2.5 text-white font-medium text-xs transition-all ${
            state.toast.type === "success" ? "bg-emerald-600" : state.toast.type === "warning" ? "bg-amber-600" : "bg-rose-600"
          }">
            <span>${state.toast.type === "success" ? "✓" : state.toast.type === "warning" ? "!" : "✕"}</span>
            <span>${state.toast.message}</span>
          </div>
        ` : ""}

        <!-- Main View Container -->
        <main class="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          ${renderActiveTab(filteredEvents)}
        </main>

        <!-- Modals -->
        ${state.selectedEvent ? renderEventModal(state.selectedEvent) : ""}
        ${state.showCreateModal ? renderCreateEventModal() : ""}
        ${renderGoogleModal()}

        <!-- SaaS Minimal Footer -->
        <footer class="bg-white border-t border-slate-200 py-4 px-6 sm:px-8 text-xs text-slate-500">
          <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>EventHub · Modern SaaS Event Management Platform · Project 08</span>
            <span class="text-slate-400 font-mono text-[11px]">REST API • SQLite Relational DB • OpenStreetMap</span>
          </div>
        </footer>
      </div>
    </div>
  `;

  attachPostRenderLogic();
}

// Render dedicated login & authentication view (Modern SaaS Split Layout)
function renderLoginView() {
  return `
    <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div class="max-w-5xl w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:flex-row">
        <!-- Left Hero Panel (Desktop) -->
        <div class="hidden lg:flex flex-col justify-between w-5/12 bg-slate-900 text-white p-10 relative overflow-hidden">
          <div class="relative z-10">
            <!-- Brand -->
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
                🎟️
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xl font-bold tracking-tight text-white">EventHub</span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Enterprise</span>
                </div>
                <p class="text-xs text-slate-400">Event Operations Platform</p>
              </div>
            </div>

            <!-- Value Proposition -->
            <div class="mt-14 space-y-4">
              <h2 class="text-2xl font-bold tracking-tight text-white leading-snug">
                Event ticketing & instant QR gate verification at scale.
              </h2>
              <p class="text-xs text-slate-400 leading-relaxed">
                Streamline registration, enforce live capacity limits, and accelerate attendee gate throughput with sub-second validation.
              </p>
            </div>

            <!-- Key Features -->
            <div class="mt-8 space-y-3 text-xs text-slate-300">
              <div class="flex items-center gap-2.5">
                <span class="text-orange-400 font-bold">✓</span>
                <span>Sub-second QR gate check-in & duplicate pass detection</span>
              </div>
              <div class="flex items-center gap-2.5">
                <span class="text-orange-400 font-bold">✓</span>
                <span>Live capacity orchestration & attendance turnout metrics</span>
              </div>
              <div class="flex items-center gap-2.5">
                <span class="text-orange-400 font-bold">✓</span>
                <span>Role-based permissions for Organizers, Operators, & Attendees</span>
              </div>
            </div>
          </div>

          <!-- Bottom Status Pill -->
          <div class="relative z-10 pt-8 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>REST API & Relational Database Online</span>
            </div>
            <span>v2.2</span>
          </div>
        </div>

        <!-- Right Form Panel -->
        <div class="w-full lg:w-7/12 p-6 sm:p-10 flex flex-col justify-center bg-white">
          <div class="max-w-md w-full mx-auto space-y-6">
            <!-- Header for Mobile / Tablet -->
            <div class="flex items-center justify-between lg:hidden pb-4 border-b border-slate-100">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold text-base">
                  🎟️
                </div>
                <span class="font-bold text-slate-900 text-lg">EventHub</span>
              </div>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">SaaS</span>
            </div>

            <div>
              <h1 class="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
              <p class="text-xs text-slate-500 mt-1">Sign in to your EventHub dashboard to manage events and check-ins</p>
            </div>

            <!-- Sign in with Google Button -->
            <div>
              <button
                type="button"
                onclick="openGoogleSignInModal()"
                class="w-full py-2.5 px-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs shadow-xs flex items-center justify-center gap-3 transition-colors cursor-pointer"
              >
                <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>Sign in with Google</span>
              </button>

              <div class="relative flex items-center justify-center my-4">
                <div class="flex-grow border-t border-slate-200"></div>
                <span class="flex-shrink mx-3 text-slate-400 font-medium text-[11px]">or continue with email</span>
                <div class="flex-grow border-t border-slate-200"></div>
              </div>
            </div>

            <!-- Auth Mode Toggle -->
            <div class="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onclick="setAuthMode('login')"
                class="flex-1 py-1.5 rounded-md transition-all ${
                  state.authMode === "login" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }"
              >
                Sign In
              </button>
              <button
                type="button"
                onclick="setAuthMode('register')"
                class="flex-1 py-1.5 rounded-md transition-all ${
                  state.authMode === "register" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }"
              >
                Create Account
              </button>
            </div>

            <!-- Error Banner -->
            ${state.loginError ? `
              <div class="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2.5">
                <span class="text-sm">⚠️</span>
                <span class="flex-1">${state.loginError}</span>
              </div>
            ` : ""}

            ${state.authMode === "login" ? `
              <!-- Login Form -->
              <form id="eventhub-login-form" onsubmit="handleLoginFormSubmit(event)" class="space-y-4">
                <div>
                  <label class="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <div class="relative">
                    <input
                      type="email"
                      required
                      placeholder="name@company.com"
                      value="${state.loginForm.email}"
                      id="login-email-input"
                      oninput="state.loginForm.email = this.value"
                      class="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                    <span class="absolute left-3 top-2.5 text-slate-400 text-xs">✉️</span>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1">
                    <label class="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onclick="togglePasswordVisibility()"
                      id="eye-toggle-btn"
                      class="text-[11px] text-slate-500 hover:text-orange-600 font-medium cursor-pointer"
                    >
                      ${state.showPassword ? "Hide password" : "Show password"}
                    </button>
                  </div>
                  <div class="relative">
                    <input
                      type="${state.showPassword ? "text" : "password"}"
                      required
                      placeholder="••••••••"
                      value="${state.loginForm.password}"
                      id="login-password-input"
                      oninput="state.loginForm.password = this.value"
                      class="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                    />
                    <span class="absolute left-3 top-2.5 text-slate-400 text-xs">🔒</span>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs text-slate-600 pt-0.5">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked class="rounded border-slate-300 text-orange-600 focus:ring-orange-500 w-3.5 h-3.5">
                    <span>Remember this device</span>
                  </label>
                  <a href="javascript:void(0)" onclick="fillCredentials('organizer@eventhub.io', 'pass123')" class="text-orange-600 hover:text-orange-700 font-medium">
                    Use demo credentials
                  </a>
                </div>

                <button
                  type="submit"
                  ${state.loginLoading ? "disabled" : ""}
                  class="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    state.loginLoading ? "opacity-75 cursor-not-allowed" : ""
                  }"
                >
                  ${state.loginLoading ? `
                    <div class="inline-block animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></div>
                    <span>Verifying Credentials...</span>
                  ` : `
                    <span>Sign In to EventHub</span>
                    <span>→</span>
                  `}
                </button>
              </form>

              <!-- 1-Click Presentation Accounts -->
              <div class="pt-4 border-t border-slate-100">
                <div class="flex items-center justify-between mb-2.5">
                  <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    💡 Presentation Test Accounts
                  </span>
                  <span class="text-[10px] text-orange-700 font-semibold bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                    1-Click Login
                  </span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <!-- Organizer -->
                  <div class="p-2.5 rounded-lg border border-slate-200 hover:border-orange-300 bg-slate-50/60 flex flex-col justify-between transition-all">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800 text-xs">Organizer</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-800">Admin</span>
                      </div>
                      <p class="text-[10px] text-slate-500 font-mono mt-0.5 truncate">organizer@eventhub.io</p>
                    </div>
                    <div class="mt-2 flex gap-1">
                      <button
                        type="button"
                        onclick="fillCredentials('organizer@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Fill
                      </button>
                      <button
                        type="button"
                        onclick="instantLogin('organizer@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Login ⚡
                      </button>
                    </div>
                  </div>

                  <!-- Operator -->
                  <div class="p-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 bg-slate-50/60 flex flex-col justify-between transition-all">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800 text-xs">Gate Operator</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">Gate</span>
                      </div>
                      <p class="text-[10px] text-slate-500 font-mono mt-0.5 truncate">operator@eventhub.io</p>
                    </div>
                    <div class="mt-2 flex gap-1">
                      <button
                        type="button"
                        onclick="fillCredentials('operator@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Fill
                      </button>
                      <button
                        type="button"
                        onclick="instantLogin('operator@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Login ⚡
                      </button>
                    </div>
                  </div>

                  <!-- Attendee -->
                  <div class="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/60 flex flex-col justify-between transition-all">
                    <div>
                      <div class="flex items-center justify-between">
                        <span class="font-bold text-slate-800 text-xs">Attendee</span>
                        <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">User</span>
                      </div>
                      <p class="text-[10px] text-slate-500 font-mono mt-0.5 truncate">attendee@eventhub.io</p>
                    </div>
                    <div class="mt-2 flex gap-1">
                      <button
                        type="button"
                        onclick="fillCredentials('attendee@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Fill
                      </button>
                      <button
                        type="button"
                        onclick="instantLogin('attendee@eventhub.io', 'pass123')"
                        class="flex-1 py-1 rounded bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-semibold transition-colors cursor-pointer"
                      >
                        Login ⚡
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Guest Link -->
              <div class="text-center pt-2">
                <button
                  type="button"
                  onclick="setTab('events')"
                  class="text-xs font-medium text-slate-500 hover:text-orange-600 transition-colors cursor-pointer"
                >
                  Want to preview public events first? <span class="text-orange-600 underline font-semibold">Browse Events as Guest →</span>
                </button>
              </div>
            ` : `
              <!-- Register Form -->
              <form onsubmit="handleRegisterSubmit(event)" class="space-y-3 text-xs">
                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maya Lin"
                    value="${state.registerForm.name}"
                    oninput="state.registerForm.name = this.value"
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label class="block font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="maya@example.com"
                    value="${state.registerForm.email}"
                    oninput="state.registerForm.email = this.value"
                    class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block font-semibold text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value="${state.registerForm.password}"
                      oninput="state.registerForm.password = this.value"
                      class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label class="block font-semibold text-slate-700 mb-1">Account Role</label>
                    <select
                      onchange="state.registerForm.role = this.value"
                      class="w-full px-2.5 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none bg-white"
                    >
                      <option value="attendee">Attendee</option>
                      <option value="operator">Gate Operator</option>
                      <option value="organizer">Event Organizer</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  class="w-full mt-2 py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Create Account & Sign In</span>
                  <span>→</span>
                </button>

                <div class="text-center pt-2">
                  <button
                    type="button"
                    onclick="setAuthMode('login')"
                    class="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Already have an account? <span class="text-orange-600 font-semibold underline">Sign In</span>
                  </button>
                </div>
              </form>
            `}
          </div>
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

  // 1. Events Catalog View
  if (state.activeTab === "events") {
    return `
      <div class="space-y-6">
        <!-- Minimal SaaS Banner -->
        <div class="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-2xs">
          <div class="max-w-2xl space-y-2">
            <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-semibold">
              <span>🎟️</span>
              <span>Public Events Catalog</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Find & Register for Premier Technical & Industry Events
            </h2>
            <p class="text-xs sm:text-sm text-slate-500 leading-relaxed">
              Real-time capacity tracking, instant cryptographic QR boarding passes, and interactive venue maps.
            </p>
          </div>
          <div class="flex flex-wrap gap-2.5 shrink-0">
            <button
              onclick="setTab('checkin')"
              class="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚡ Gate Scanner</span>
            </button>
            <button
              onclick="switchRole('organizer')"
              class="px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>👑 Organizer Console</span>
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div class="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            ${["All", "Technology", "Workshop", "Cultural", "Career"].map(cat => `
              <button
                onclick="setCategory('${cat}')"
                class="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  state.selectedCategory === cat
                    ? "bg-orange-600 text-white font-semibold shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }"
              >
                ${cat}
              </button>
            `).join("")}
          </div>

          <div class="relative min-w-[260px]">
            <input
              type="text"
              placeholder="Search events, venues, topics..."
              value="${state.searchQuery}"
              oninput="handleSearch(this.value)"
              class="w-full pl-8 pr-3.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
            <span class="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
          </div>
        </div>

        <!-- Events Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          ${filteredEvents.map(event => {
            const isFull = event.registered_count >= event.capacity;
            const percentFilled = Math.min(100, Math.round((event.registered_count / event.capacity) * 100));

            return `
              <div class="bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden">
                <div class="p-5">
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      event.category === "Technology" ? "badge-tech" :
                      event.category === "Workshop" ? "badge-workshop" :
                      event.category === "Cultural" ? "badge-cultural" : "badge-career"
                    }">
                      ${event.category}
                    </span>
                    <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                      ${event.ticket_price === 0 ? "FREE" : `₹${event.ticket_price}`}
                    </span>
                  </div>

                  <h3
                    class="text-base font-bold text-slate-900 leading-snug line-clamp-2 hover:text-orange-600 cursor-pointer transition-colors"
                    onclick="openEventModal(${event.id})"
                  >
                    ${event.title}
                  </h3>

                  <p class="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    ${event.description}
                  </p>

                  <div class="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div class="flex items-center gap-2">
                      <span class="text-slate-400 text-xs">📅</span>
                      <span class="font-medium text-slate-800">${event.date_time}</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span class="text-slate-400 text-xs">📍</span>
                      <span class="truncate">${event.venue_name}</span>
                    </div>
                  </div>

                  <div class="mt-4 pt-2">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-[11px] font-medium text-slate-500">Capacity</span>
                      <span class="text-[11px] font-semibold ${isFull ? "text-rose-600" : "text-slate-700"}">
                        ${event.registered_count} / ${event.capacity} spots filled
                      </span>
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div class="h-full rounded-full transition-all duration-300 ${
                        isFull ? "bg-rose-500" : percentFilled > 80 ? "bg-amber-500" : "bg-orange-600"
                      }" style="width: ${percentFilled}%"></div>
                    </div>
                  </div>
                </div>

                <div class="p-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onclick="openEventModal(${event.id})"
                    class="text-xs font-semibold text-slate-600 hover:text-orange-600 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>🗺️ Map</span>
                  </button>

                  ${isFull ? `
                    <button disabled class="bg-slate-200 text-slate-400 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-not-allowed">
                      Sold Out
                    </button>
                  ` : `
                    <button
                      onclick="registerForEvent(${event.id})"
                      class="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Book Pass</span>
                      <span>→</span>
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

  // 2. My Tickets View
  if (state.activeTab === "my-tickets") {
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">My Registered Tickets</h2>
            <p class="text-xs text-slate-500 mt-0.5">Show your digital QR code at the entrance gate for instant sub-second verification.</p>
          </div>
          <button
            onclick="window.print()"
            class="self-start sm:self-auto bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-3.5 py-2 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <span>🖨️ Print Passes</span>
          </button>
        </div>

        ${state.myTickets.length === 0 ? `
          <div class="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-md mx-auto shadow-2xs">
            <div class="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center text-2xl mx-auto mb-3">
              🎟️
            </div>
            <h3 class="text-base font-bold text-slate-900">No Tickets Issued Yet</h3>
            <p class="text-xs text-slate-500 mt-1 mb-5">
              You have not registered for any events yet. Browse the public events catalog to secure your pass!
            </p>
            <button
              onclick="setTab('events')"
              class="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              Explore Available Events
            </button>
          </div>
        ` : `
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            ${state.myTickets.map(ticket => `
              <div class="ticket-card p-6 flex flex-col justify-between">
                <div class="ticket-cutout-left"></div>
                <div class="ticket-cutout-right"></div>

                <div>
                  <div class="flex items-center justify-between pb-3.5 border-b border-slate-100">
                    <div>
                      <span class="text-[9px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
                        OFFICIAL ENTRY PASS
                      </span>
                      <h4 class="text-base font-bold text-slate-900 mt-1">${ticket.event_title}</h4>
                    </div>
                    <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      ticket.checkin_time ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"
                    }">
                      ${ticket.checkin_time ? "✓ CHECKED IN" : "VALID PASS"}
                    </span>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-3 gap-5 py-5 items-center">
                    <div class="sm:col-span-2 space-y-2.5 text-xs">
                      <div>
                        <span class="text-slate-400 block font-semibold text-[10px] uppercase">ATTENDEE NAME</span>
                        <span class="text-sm font-bold text-slate-900">${state.currentUser ? state.currentUser.name : (ticket.attendee_name || "Guest Attendee")}</span>
                      </div>
                      <div>
                        <span class="text-slate-400 block font-semibold text-[10px] uppercase">DATE & VENUE</span>
                        <span class="font-medium text-slate-800 block">${ticket.date_time}</span>
                        <span class="text-slate-500 block truncate text-[11px]">${ticket.venue_name}</span>
                      </div>
                      <div>
                        <span class="text-slate-400 block font-semibold text-[10px] uppercase">TICKET TOKEN</span>
                        <span class="font-mono text-xs font-bold text-orange-700 bg-slate-100 px-2 py-0.5 rounded inline-block">
                          ${ticket.ticket_token}
                        </span>
                      </div>
                    </div>

                    <div class="flex flex-col items-center justify-center p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div id="qr-${ticket.id}" data-token="${ticket.ticket_token}" class="qr-target p-1 bg-white rounded-lg shadow-2xs"></div>
                      <span class="text-[9px] text-slate-400 font-mono mt-1.5 uppercase">Scan to Verify</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div class="ticket-perforation"></div>
                  <div class="pt-2 flex items-center justify-between text-xs">
                    <span class="text-slate-400 text-[11px]">Issued via EventHub Security</span>
                    <button
                      onclick="testScanPass('${ticket.ticket_token}', ${ticket.event_id})"
                      class="bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold px-2.5 py-1 rounded-lg text-xs transition-colors cursor-pointer"
                    >
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

  // 3. Gate Scanner View
  if (state.activeTab === "checkin") {
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-bold text-slate-900 tracking-tight">Entrance Gate Check-In Console</h2>
              <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                LIVE GATE
              </span>
            </div>
            <p class="text-xs text-slate-500 mt-0.5">Validate digital tickets via token or simulated scanner in real time.</p>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-xs font-semibold text-slate-600">Active Event:</label>
            <select
              onchange="handleSelectGateEvent(this.value)"
              class="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            >
              ${state.events.map(e => `
                <option value="${e.id}" ${e.id === state.checkinEventId ? "selected" : ""}>
                  ${e.title}
                </option>
              `).join("")}
            </select>
          </div>
        </div>

        <!-- Checkin Statistics Cards -->
        ${state.checkinStats ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Total Registered</span>
              <div class="text-2xl font-bold text-slate-900 mt-1">${state.checkinStats.registered_count}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Checked In</span>
              <div class="text-2xl font-bold text-emerald-600 mt-1">${state.checkinStats.checked_in_count}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Gate Turnout</span>
              <div class="text-2xl font-bold text-orange-600 mt-1">${state.checkinStats.attendance_rate}%</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Remaining Spots</span>
              <div class="text-2xl font-bold text-slate-700 mt-1">${state.checkinStats.remaining_spots}</div>
            </div>
          </div>
        ` : ""}

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-5">
            <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-4">
              <h3 class="text-sm font-bold text-slate-900">⚡ Ticket Token / QR Code Validation</h3>
              <div class="flex gap-2">
                <input
                  type="text"
                  id="gateTokenInput"
                  placeholder="e.g. EH-2026-T84A-9102 or scan pass..."
                  value="${state.checkinInput}"
                  oninput="state.checkinInput = this.value"
                  onkeydown="if(event.key==='Enter') handleValidateCheckin()"
                  class="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <button
                  onclick="handleValidateCheckin()"
                  class="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Verify
                </button>
              </div>

              <!-- 1-Click Fast Scenarios for Viva -->
              <div class="pt-2">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  💡 1-Click Presentation Scenarios:
                </span>
                <div class="flex flex-wrap gap-2">
                  <button
                    onclick="handleValidateCheckin('EH-2026-T84A-9102')"
                    class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer"
                  >
                    🟢 Valid Pass (David Chen)
                  </button>
                  <button
                    onclick="handleValidateCheckin('EH-2026-K19F-4418')"
                    class="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer"
                  >
                    🟡 Duplicate Scan (Elena)
                  </button>
                  <button
                    onclick="handleValidateCheckin('EH-2026-FAKE-0000')"
                    class="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 px-2.5 py-1.5 rounded-md text-xs font-mono font-medium transition-colors cursor-pointer"
                  >
                    🔴 Invalid Token (Fake)
                  </button>
                </div>
              </div>
            </div>

            <!-- Validation Result Card -->
            ${state.checkinResult ? `
              <div class="p-5 rounded-xl border shadow-xs transition-all ${
                state.checkinResult.status_code === "SUCCESS"
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                  : state.checkinResult.status_code === "ALREADY_CHECKED_IN"
                  ? "bg-amber-50/70 border-amber-200 text-amber-900"
                  : "bg-rose-50/70 border-rose-200 text-rose-900"
              }">
                <div class="flex items-start gap-3.5">
                  <div class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0 ${
                    state.checkinResult.status_code === "SUCCESS"
                      ? "bg-emerald-600 text-white"
                      : state.checkinResult.status_code === "ALREADY_CHECKED_IN"
                      ? "bg-amber-500 text-white"
                      : "bg-rose-600 text-white"
                  }">
                    ${state.checkinResult.status_code === "SUCCESS" ? "✓" : state.checkinResult.status_code === "ALREADY_CHECKED_IN" ? "!" : "✕"}
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-bold tracking-wider uppercase opacity-80">
                        ${state.checkinResult.status_code}
                      </span>
                      <span class="text-[10px] font-mono opacity-60">
                        ${new Date().toLocaleTimeString()}
                      </span>
                    </div>
                    <h4 class="text-base font-bold mt-0.5">
                      ${state.checkinResult.message}
                    </h4>

                    ${state.checkinResult.details ? `
                      <div class="mt-3 grid grid-cols-2 gap-2 text-xs bg-white/80 p-3 rounded-lg border border-black/5">
                        <div>
                          <span class="text-slate-500 block text-[10px]">Attendee:</span>
                          <span class="font-bold text-slate-800">${state.checkinResult.details.attendee_name}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block text-[10px]">Ticket Token:</span>
                          <span class="font-mono font-medium text-slate-800">${state.checkinResult.details.ticket_token}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block text-[10px]">Event:</span>
                          <span class="font-medium text-slate-800">${state.checkinResult.details.event_title}</span>
                        </div>
                        <div>
                          <span class="text-slate-500 block text-[10px]">Status:</span>
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
          <div class="bg-white rounded-xl p-5 border border-slate-200 shadow-2xs space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-900">Live Gate Activity</h3>
              <span class="text-[11px] text-slate-400">Recent entries</span>
            </div>

            <div class="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              ${state.recentCheckins.length === 0 ? `
                <div class="text-center py-8 text-slate-400 text-xs">
                  No gate scans logged yet. Test a ticket above to see live updates.
                </div>
              ` : state.recentCheckins.map(item => `
                <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <div class="font-bold text-slate-800">${item.attendee_name}</div>
                    <div class="text-[10px] font-mono text-slate-500">${item.ticket_token}</div>
                  </div>
                  <div class="text-right">
                    <span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded text-[9px]">
                      ADMITTED
                    </span>
                    <div class="text-[9px] text-slate-400 mt-0.5">${item.checkin_time ? item.checkin_time.split(" ")[1] : "Just now"}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Organizer Console View
  if (state.activeTab === "organizer") {
    return `
      <div class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-bold text-slate-900 tracking-tight">Organizer Management Hub</h2>
            <p class="text-xs text-slate-500 mt-0.5">Review capacity, inspect attendee rosters, export CSV reports, and observe audit logs.</p>
          </div>
          <button
            onclick="openCreateModal()"
            class="bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
          >
            <span>+ Publish New Event</span>
          </button>
        </div>

        <!-- 4 Statistics KPIs -->
        ${state.organizerMetrics ? `
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Total Events</span>
              <div class="text-2xl font-bold text-slate-900 mt-1">${state.organizerMetrics.total_events}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Total Registrations</span>
              <div class="text-2xl font-bold text-orange-600 mt-1">${state.organizerMetrics.total_registrations}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Attendees Checked In</span>
              <div class="text-2xl font-bold text-emerald-600 mt-1">${state.organizerMetrics.total_checked_in}</div>
            </div>
            <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span class="text-xs font-medium text-slate-400">Overall Turnout</span>
              <div class="text-2xl font-bold text-slate-800 mt-1">${state.organizerMetrics.checkin_rate}%</div>
            </div>
          </div>
        ` : ""}

        <!-- Events Table -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div class="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-900">Managed Events Roster</h3>
            <span class="text-xs text-slate-500 font-medium">${state.events.length} active events</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase">
                <tr>
                  <th class="py-3 px-4">Event Title</th>
                  <th class="py-3 px-3">Category</th>
                  <th class="py-3 px-3">Date & Time</th>
                  <th class="py-3 px-3">Capacity</th>
                  <th class="py-3 px-3">Status</th>
                  <th class="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${state.events.map(e => `
                  <tr class="hover:bg-slate-50 transition-colors">
                    <td class="py-3.5 px-4 font-bold text-slate-800">${e.title}</td>
                    <td class="py-3.5 px-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-50 text-orange-700 border border-orange-200">
                        ${e.category}
                      </span>
                    </td>
                    <td class="py-3.5 px-3 text-slate-600">${e.date_time}</td>
                    <td class="py-3.5 px-3 font-semibold text-slate-700">${e.registered_count} / ${e.capacity}</td>
                    <td class="py-3.5 px-3">
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        e.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
                      }">
                        ${e.status.toUpperCase()}
                      </span>
                    </td>
                    <td class="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onclick="handleViewAttendees(${e.id})"
                        class="bg-orange-50 hover:bg-orange-100 text-orange-700 font-semibold px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer"
                      >
                        Attendees (${e.registered_count})
                      </button>
                      <a
                        href="/api/organizer/export/${e.id}?token=${encodeURIComponent(state.token || '')}"
                        class="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded-md text-xs transition-colors inline-block"
                      >
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
          <div class="bg-white rounded-xl border border-orange-200 p-5 shadow-xs space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 class="text-sm font-bold text-slate-900">
                  Attendee Roster: ${state.selectedEventForAttendees.title}
                </h3>
                <p class="text-xs text-slate-500 mt-0.5">
                  Total: ${state.selectedEventAttendees.length} | Checked In: ${state.selectedEventAttendees.filter(a => a.is_checked_in).length}
                </p>
              </div>
              <button
                onclick="state.selectedEventForAttendees = null; render();"
                class="text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1 rounded-md font-semibold cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px]">
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
                      <td class="py-2.5 px-3 font-semibold text-slate-800">${a.attendee_name}</td>
                      <td class="py-2.5 px-3 text-slate-500">${a.attendee_email}</td>
                      <td class="py-2.5 px-3 font-mono font-medium text-orange-700">${a.ticket_token}</td>
                      <td class="py-2.5 px-3">
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.is_checked_in ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                        }">
                          ${a.is_checked_in ? "CHECKED IN" : "PENDING"}
                        </span>
                      </td>
                      <td class="py-2.5 px-3 text-slate-500">${a.checkin_time || "—"}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}

        <!-- Audit Trail -->
        ${state.organizerMetrics && state.organizerMetrics.recent_logs ? `
          <div class="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span>🛡️ Security & Observability Audit Trail (\`organizer_logs\`)</span>
              </h3>
              <span class="text-[11px] text-slate-400 font-mono">Live SQLite Audit Log</span>
            </div>

            <div class="space-y-1.5 max-h-64 overflow-y-auto">
              ${state.organizerMetrics.recent_logs.map(log => `
                <div class="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2.5">
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      log.action.includes("CHECKED_IN") ? "bg-emerald-100 text-emerald-800" :
                      log.action.includes("REGISTERED") ? "bg-orange-100 text-orange-800" : "bg-slate-200 text-slate-700"
                    }">
                      ${log.action}
                    </span>
                    <span class="font-medium text-slate-700">${log.details}</span>
                  </div>
                  <span class="text-[10px] font-mono text-slate-400">${log.timestamp}</span>
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
    <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl space-y-5 border border-slate-200">
        <div class="flex items-start justify-between">
          <div>
            <span class="text-[10px] font-bold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded">
              ${event.category}
            </span>
            <h3 class="text-xl font-bold text-slate-900 mt-2">${event.title}</h3>
          </div>
          <button
            onclick="state.selectedEvent = null; render();"
            class="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        <p class="text-xs text-slate-600 leading-relaxed">${event.description}</p>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <div>
            <span class="text-slate-400 block font-semibold text-[10px]">DATE & TIME</span>
            <span class="font-bold text-slate-800">${event.date_time}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-semibold text-[10px]">VENUE</span>
            <span class="font-bold text-slate-800">${event.venue_name}</span>
          </div>
          <div>
            <span class="text-slate-400 block font-semibold text-[10px]">CAPACITY</span>
            <span class="font-bold text-orange-700">${event.registered_count} / ${event.capacity} spots</span>
          </div>
        </div>

        <!-- OpenStreetMap Canvas -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-700">📍 Venue Map (OpenStreetMap & Leaflet)</span>
            <span class="text-slate-400 truncate text-[11px]">${event.venue_address}</span>
          </div>
          <div id="modalLeafletMap" class="h-52 w-full rounded-xl border border-slate-200"></div>
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
          <button
            onclick="state.selectedEvent = null; render();"
            class="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Back
          </button>
          ${isFull ? `
            <button disabled class="bg-slate-200 text-slate-400 text-xs font-semibold px-4 py-2 rounded-lg cursor-not-allowed">
              Sold Out
            </button>
          ` : `
            <button
              onclick="handleRegister(${event.id})"
              class="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Confirm Booking</span>
              <span>→</span>
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
    <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 border border-slate-200">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 class="text-lg font-bold text-slate-900">Publish New Event</h3>
          <button
            onclick="state.showCreateModal = false; render();"
            class="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center cursor-pointer text-xs"
          >
            ✕
          </button>
        </div>

        <form onsubmit="handleCreateEvent(event)" class="space-y-3.5 text-xs">
          <div>
            <label class="font-semibold text-slate-700 block mb-1">Event Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. AI Autonomous Agents & Cloud Expo"
              value="${state.newEvent.title}"
              oninput="state.newEvent.title = this.value"
              class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="font-semibold text-slate-700 block mb-1">Category *</label>
              <select
                onchange="state.newEvent.category = this.value"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none bg-white"
              >
                <option value="Technology">Technology</option>
                <option value="Workshop">Workshop</option>
                <option value="Cultural">Cultural</option>
                <option value="Career">Career</option>
              </select>
            </div>
            <div>
              <label class="font-semibold text-slate-700 block mb-1">Date & Time *</label>
              <input
                type="text"
                required
                value="${state.newEvent.date_time}"
                oninput="state.newEvent.date_time = this.value"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="font-semibold text-slate-700 block mb-1">Capacity (Max Attendees) *</label>
              <input
                type="number"
                min="1"
                required
                value="${state.newEvent.capacity}"
                oninput="state.newEvent.capacity = parseInt(this.value)"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label class="font-semibold text-slate-700 block mb-1">Ticket Price (₹)</label>
              <input
                type="number"
                min="0"
                value="${state.newEvent.ticket_price}"
                oninput="state.newEvent.ticket_price = parseFloat(this.value)"
                class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="font-semibold text-slate-700 block mb-1">Venue Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Science Auditorium, Campus East"
              value="${state.newEvent.venue_name}"
              oninput="state.newEvent.venue_name = this.value"
              class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-slate-700">Venue Address (OpenStreetMap Geocoding) *</label>
              <button
                type="button"
                onclick="handleGeocodeVenue()"
                class="text-[11px] font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                ${state.geocodingLoading ? "Geocoding..." : "⚡ Validate & Geocode"}
              </button>
            </div>
            <input
              type="text"
              required
              placeholder="e.g. 100 Innovation Way, San Francisco, CA"
              value="${state.newEvent.venue_address}"
              oninput="state.newEvent.venue_address = this.value"
              class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
            />
          </div>

          <div>
            <label class="font-semibold text-slate-700 block mb-1">Event Description *</label>
            <textarea
              required
              rows="3"
              placeholder="Describe event schedule, speakers, topics..."
              oninput="state.newEvent.description = this.value"
              class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
            >${state.newEvent.description}</textarea>
          </div>

          <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onclick="state.showCreateModal = false; render();"
              class="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
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
    <div class="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5 relative border border-slate-200">
        <!-- Close button -->
        <button
          onclick="state.showGoogleModal = false; render();"
          class="absolute top-4 right-4 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition-all cursor-pointer text-xs"
        >
          ✕
        </button>

        <!-- Google Header -->
        <div class="text-center space-y-1.5">
          <div class="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 mb-1">
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
          </div>
          <h3 class="text-lg font-bold text-slate-900">Sign in with Google</h3>
          <p class="text-xs text-slate-500">Choose an account to continue to EventHub</p>
        </div>

        <!-- Role Assignment Selector -->
        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Sign in as Role:
          </label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onclick="setGoogleRole('attendee')"
              class="py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                state.googleSelectedRole === 'attendee' ? 'bg-orange-600 text-white shadow-2xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              👤 Attendee
            </button>
            <button
              type="button"
              onclick="setGoogleRole('operator')"
              class="py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                state.googleSelectedRole === 'operator' ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              🛡️ Operator
            </button>
            <button
              type="button"
              onclick="setGoogleRole('organizer')"
              class="py-1 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                state.googleSelectedRole === 'organizer' ? 'bg-slate-900 text-white shadow-2xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }"
            >
              👑 Organizer
            </button>
          </div>
        </div>

        <!-- Pre-configured Demo Google Accounts -->
        <div class="space-y-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
            Choose an account
          </span>

          <!-- Account 1: Sarah Jenkins (Organizer) -->
          <div
            onclick="submitGoogleSignIn('Sarah Jenkins', 'sarah.jenkins@gmail.com', 'organizer')"
            class="p-2.5 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50/40 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-orange-600 text-white font-bold text-xs flex items-center justify-center">
                SJ
              </div>
              <div class="text-left">
                <div class="font-bold text-slate-800 text-xs group-hover:text-orange-600 transition-colors">Sarah Jenkins</div>
                <div class="text-[10px] text-slate-400 font-mono">sarah.jenkins@gmail.com</div>
              </div>
            </div>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-orange-100 text-orange-800">👑 Organizer</span>
          </div>

          <!-- Account 2: Alex Rivera (Operator) -->
          <div
            onclick="submitGoogleSignIn('Alex Rivera', 'alex.rivera@gmail.com', 'operator')"
            class="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                AR
              </div>
              <div class="text-left">
                <div class="font-bold text-slate-800 text-xs group-hover:text-emerald-600 transition-colors">Alex Rivera</div>
                <div class="text-[10px] text-slate-400 font-mono">alex.rivera@gmail.com</div>
              </div>
            </div>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">🛡️ Operator</span>
          </div>

          <!-- Account 3: David Chen (Attendee) -->
          <div
            onclick="submitGoogleSignIn('David Chen', 'david.chen@gmail.com', 'attendee')"
            class="p-2.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 cursor-pointer transition-all flex items-center justify-between group"
          >
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center">
                DC
              </div>
              <div class="text-left">
                <div class="font-bold text-slate-800 text-xs group-hover:text-slate-900 transition-colors">David Chen</div>
                <div class="text-[10px] text-slate-400 font-mono">david.chen@gmail.com</div>
              </div>
            </div>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">👤 Attendee</span>
          </div>
        </div>

        <!-- Custom Account Option -->
        <div class="pt-2.5 border-t border-slate-100">
          <form onsubmit="handleCustomGoogleSubmit(event)" class="space-y-2.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400 block px-1">
              Or use custom Google email
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Name (e.g. Maya Lin)"
                value="${state.customGoogleName}"
                oninput="state.customGoogleName = this.value"
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
              />
              <input
                type="email"
                required
                placeholder="yourname@gmail.com"
                value="${state.customGoogleEmail}"
                oninput="state.customGoogleEmail = this.value"
                class="px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              class="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Continue with this account</span>
              <span>→</span>
            </button>
          </form>
        </div>

        <div class="text-center pt-0.5 text-[10px] text-slate-400">
          Protected by Google Identity OAuth 2.0
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
        width: 130,
        height: 130,
        colorDark: "#0f172a",
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
window.togglePasswordVisibility = function() {
  state.showPassword = !state.showPassword;
  const passInput = document.getElementById("login-password-input");
  const eyeBtn = document.getElementById("eye-toggle-btn");
  if (passInput) {
    passInput.type = state.showPassword ? "text" : "password";
  }
  if (eyeBtn) {
    eyeBtn.textContent = state.showPassword ? "Hide password" : "Show password";
  }
};

window.toggleMobileSidebar = function(open) {
  state.mobileSidebarOpen = open !== undefined ? open : !state.mobileSidebarOpen;
  render();
};

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
function bootstrapApp() {
  render(); // Render active view (login page by default) immediately
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}
