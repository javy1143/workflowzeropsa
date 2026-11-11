# Workflow Zero IT - PSA Client

A modern, high-density Professional Services Automation (PSA) web application tailored for Managed Service Providers (MSPs) and IT service teams. Built with a clean, light-mode interface inspired by Workflow Zero IT's brand palette (crisp slate `#F8FAFC`, dark navy `#0F172A`, and electric cyan/teal accents).

![Workflow Zero IT Logo](logo.png)

---

## ⚡ Key Highlights

- **Condensed Ticket Queue**: Multi-column 1-row view highlighting ticket ID, client, subject, status, priority, technician, SLA countdown, and last activity.
- **Ticket Detail & Resolution**:
  - Live technician work timer with automatic billable hours tracking.
  - Manual time entry with billable rate categorization.
  - Internal and client-facing notes with instant email notification preview.
  - Ticket merging capability to consolidate duplicate customer requests.
- **Dispatch Board**: Interactive calendar for scheduling technician dispatches, ticket time blocks, and on-site visits.
- **MSP Client Dossier**:
  - Complete operational profile per client (contacts, SLA tiers, billing rates).
  - Infrastructure documentation: Domain, M365 tenant, firewall/gateways, subnet/VLAN topology, servers, backups, and critical credentials.
  - Full inline editing for every card in the dossier.
- **Client-Scoped Knowledge Base**: Per-client documentation repository with client dropdown filter, category tags, search, and full reader mode.
- **Dedicated Billing Center**: Separate ledger view tracking hours, billable rates, unbilled tickets, and total invoiced balances.
- **Firebase Cloud Auth & Firestore**:
  - Secure technician login & account registration.
  - Real-time cloud sync across devices with Google Cloud Firestore.
  - Offline-first resilience with automatic local persistence.
- **Zero Mock Data**: Starts in a clean, production-ready state with intuitive quick-action prompts.

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/javy1143/workflowzeropsa.git
cd workflowzeropsa
```

### 2. Run the Local Server
No complex build steps or dependencies required. Start the built-in Node.js static server:
```bash
node server.js
```

Then navigate to:
```
http://localhost:4173
```

---

## ☁️ Firebase Cloud Database & Authentication

Workflow Zero PSA comes pre-configured with the official Firebase project:
- **Project ID**: `workflowzero-psa-app`
- **Console URL**: [https://console.firebase.google.com/project/workflowzero-psa-app/overview](https://console.firebase.google.com/project/workflowzero-psa-app/overview)

### To activate Authentication and Firestore in your Firebase Console:
1. **Enable Authentication**:
   - Go to [Authentication](https://console.firebase.google.com/project/workflowzero-psa-app/authentication) -> Click **Get Started**.
   - Under Sign-in method, click **Email/Password** and toggle **Enable**, then click Save.
2. **Enable Firestore Database**:
   - Go to [Firestore Database](https://console.firebase.google.com/project/workflowzero-psa-app/firestore) -> Click **Create Database**.
   - Select Location (e.g. `nam5` / United States) and start in **Test mode** (or configure standard security rules).

The PSA is already pre-wired with your project credentials:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyDrNUzZEEAYPYcv3gq06tdnpgQl-StsvYQ",
  authDomain: "workflowzero-psa-app.firebaseapp.com",
  projectId: "workflowzero-psa-app",
  storageBucket: "workflowzero-psa-app.firebasestorage.app",
  messagingSenderId: "1097325805120",
  appId: "1:1097325805120:web:e478edd4565f8eee4be9a5"
};
```
All technician accounts, client profiles, tickets, time logs, and KB articles will automatically synchronize with Firestore in real-time.

---

## 📂 Project Structure

```
.
├── index.html           # Full PSA single-page layout & UI modals
├── styles.css           # Modern light-mode styling & responsive design
├── app.js               # Application state controller, UI events, timers & dispatch board
├── data.js              # State initialization, storage management & cloud sync bridge
├── firebase-config.js   # Firebase Auth & Firestore client manager
├── server.js            # Lightweight Node.js local development server
├── logo.png             # Workflow Zero IT official brand mark
└── README.md            # Project documentation & setup instructions
```

---

## 🛡️ License

Proprietary © Workflow Zero IT. All rights reserved.
