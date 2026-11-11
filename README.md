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

## ☁️ Firebase Cloud Database & Authentication Setup

Workflow Zero PSA works seamlessly offline or connected to your live Google Firebase project.

### Quick 3-Minute Setup:
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project (e.g., `workflow-zero-psa`).
2. **Enable Authentication**:
   - Navigate to **Build > Authentication > Sign-in method**.
   - Enable **Email/Password**.
3. **Enable Firestore Database**:
   - Navigate to **Build > Firestore Database > Create Database**.
   - Start in **Test mode** (or configure standard security rules).
4. **Register a Web App**:
   - In Project Settings, click the **Web (`</>`)** icon to create an app.
   - Copy the `firebaseConfig` object snippet:
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "workflow-zero-psa.firebaseapp.com",
       projectId: "workflow-zero-psa",
       storageBucket: "workflow-zero-psa.appspot.com",
       messagingSenderId: "...",
       appId: "..."
     };
     ```
5. **Paste into Workflow Zero PSA**:
   - Open the PSA in your browser.
   - Click the **Cloud Status Pill** in the top navigation bar (or open the Firebase modal).
   - Paste the config directly into the quick-paste box and click **Save & Connect**.
   - All client records, tickets, notes, time logs, and KB articles will automatically synchronize with Firestore in real-time.

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
