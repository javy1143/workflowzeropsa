/* ==========================================================================
   WORKFLOW ZERO IT — CLEAN MSP PSA CONTROLLER (SEPARATE CLIENTS & BILLING,
   MERGE TICKETS, SORT BY UPDATE, FULL-WIDTH MSP DOSSIER)
   ========================================================================== */

(function () {
  'use strict';

  let state = loadPsaState();
  let activeTab = 'dashboard';
  let selectedTicketId = state.tickets[0]?.id || null;
  let selectedClientId = state.clients[0]?.id || null;
  let selectedKbId = state.kbArticles[0]?.id || null;

  let ticketFilter = {
    search: '',
    status: 'all',
    clientId: 'all',
    sortBy: 'updated'
  };

  let clientSearchQuery = '';
  let dispatchTechFilter = 'all';

  let kbFilter = {
    clientId: 'all',
    search: ''
  };

  let activeInvoiceClientId = null;

  // Client Profile Card Edit State (Every card in the client profile is editable)
  let clientCardEditState = {
    hero: false,
    network: false,
    subnets: false,
    cloud: false,
    assets: false
  };

  let editingSubnets = [];

  // Live Billable Timer State
  let timerState = {
    running: false,
    ticketId: null,
    elapsedSeconds: 0,
    intervalId: null
  };

  const WEEK_DAYS = [
    { key: '2026-11-09', label: 'Mon, Nov 9', short: 'Mon 11/9' },
    { key: '2026-11-10', label: 'Tue, Nov 10 (Today)', short: 'Tue 11/10', isToday: true },
    { key: '2026-11-11', label: 'Wed, Nov 11', short: 'Wed 11/11' },
    { key: '2026-11-12', label: 'Thu, Nov 12', short: 'Thu 11/12' },
    { key: '2026-11-13', label: 'Fri, Nov 13', short: 'Fri 11/13' }
  ];

  const CALENDAR_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

  // =========================================================================
  // HELPERS
  // =========================================================================

  function getClientById(clientId) {
    return state.clients.find(c => c.id === clientId) || {
      id: 'unknown',
      name: 'Unknown Client',
      industry: 'General Enterprise',
      contactName: 'Client Contact',
      contactEmail: 'contact@client.com',
      phone: '—',
      mrr: 5000,
      hourlyRate: 175,
      slaTier: 'Standard Managed'
    };
  }

  function getTicketById(ticketId) {
    return state.tickets.find(t => t.id === ticketId);
  }

  function getTicketHours(ticketId) {
    return state.timeEntries
      .filter(te => te.ticketId === ticketId)
      .reduce((sum, te) => sum + Number(te.hours || 0), 0);
  }

  function formatCurrency(val) {
    return '$' + Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatClock(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
  }

  function formatHourLabel(hour24) {
    if (hour24 === 12) return '12:00 PM';
    return hour24 > 12 ? `${hour24 - 12}:00 PM` : `${hour24}:00 AM`;
  }

  function getPriorityBadge(priority) {
    const p = (priority || 'Medium').toLowerCase();
    const cls = p === 'high' ? 'badge-high' : (p === 'low' ? 'badge-low' : 'badge-medium');
    return `<span class="badge ${cls}">${escapeHtml(priority)}</span>`;
  }

  function getStatusBadge(status) {
    let cls = 'badge-open';
    if (status === 'In Progress') cls = 'badge-progress';
    else if (status === 'Waiting') cls = 'badge-waiting';
    else if (status === 'Resolved') cls = 'badge-resolved';
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3400);
  }

  // =========================================================================
  // NAVIGATION & TAB SWITCHING
  // =========================================================================

  function switchTab(tabName, options = {}) {
    activeTab = tabName;
    if (window.location.hash !== `#${tabName}`) {
      try { history.replaceState(null, '', `#${tabName}`); } catch (e) {}
    }
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.view').forEach(sec => {
      sec.classList.toggle('active', sec.id === `view-${tabName}`);
    });

    if (tabName === 'tickets') {
      const queueSubview = document.getElementById('ticketQueueSubview');
      const detailSubview = document.getElementById('ticketDetailSubview');
      if (options.openTicketId) {
        selectedTicketId = options.openTicketId;
        queueSubview.classList.add('hidden');
        detailSubview.classList.remove('hidden');
        renderTicketDetail(selectedTicketId);
      } else {
        queueSubview.classList.remove('hidden');
        detailSubview.classList.add('hidden');
        renderTicketsList();
      }
    }

    if (tabName === 'clients') {
      const listSubview = document.getElementById('clientsListSubview');
      const detailSubview = document.getElementById('clientDetailSubview');
      if (options.openClientId) {
        selectedClientId = options.openClientId;
        listSubview.classList.add('hidden');
        detailSubview.classList.remove('hidden');
        renderClientProfile(selectedClientId);
      } else {
        listSubview.classList.remove('hidden');
        detailSubview.classList.add('hidden');
        renderClientsList();
      }
    }

    if (tabName === 'knowledge') {
      if (options.clientId) {
        kbFilter.clientId = options.clientId;
        const firstMatch = state.kbArticles.find(a => a.clientId === options.clientId);
        if (firstMatch) selectedKbId = firstMatch.id;
      }
      renderKnowledgeBase();
    }

    renderAll();
  }

  window.switchTab = switchTab;
  window.openClientProfile = openClientProfile;

  function openTicketDetail(ticketId) {
    if (window.location.hash !== `#ticket/${ticketId}`) {
      try { history.replaceState(null, '', `#ticket/${ticketId}`); } catch (e) {}
    }
    switchTab('tickets', { openTicketId: ticketId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openClientProfile(clientId) {
    if (selectedClientId !== clientId) {
      clientCardEditState = { hero: false, network: false, subnets: false, cloud: false, assets: false };
      editingSubnets = [];
    }
    if (window.location.hash !== `#client/${clientId}`) {
      try { history.replaceState(null, '', `#client/${clientId}`); } catch (e) {}
    }
    switchTab('clients', { openClientId: clientId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // LIVE BILLABLE TIMER
  // =========================================================================

  function toggleTimer(targetTicketId) {
    if (targetTicketId && timerState.ticketId !== targetTicketId) {
      timerState.ticketId = targetTicketId;
      timerState.elapsedSeconds = 0;
      timerState.running = true;
    } else {
      timerState.running = !timerState.running;
    }

    if (timerState.running) {
      if (!timerState.intervalId) {
        timerState.intervalId = setInterval(() => {
          timerState.elapsedSeconds += 1;
          updateTimerUI();
        }, 1000);
      }
      showToast(`Timer started for #${timerState.ticketId}`);
    } else {
      if (timerState.intervalId) {
        clearInterval(timerState.intervalId);
        timerState.intervalId = null;
      }
      showToast(`Timer paused at ${formatClock(timerState.elapsedSeconds)}`);
    }

    updateTimerUI();
  }

  function stopAndLogTimer() {
    if (!timerState.running && timerState.elapsedSeconds === 0) return;

    if (timerState.intervalId) {
      clearInterval(timerState.intervalId);
      timerState.intervalId = null;
    }
    timerState.running = false;

    const ticket = getTicketById(timerState.ticketId) || state.tickets[0];
    if (!ticket) {
      timerState.elapsedSeconds = 0;
      updateTimerUI();
      return;
    }
    const loggedHours = Math.max(0.25, Math.round((timerState.elapsedSeconds / 3600) * 100) / 100);

    state.timeEntries.unshift({
      id: 'te-' + Date.now(),
      ticketId: ticket.id,
      clientId: ticket.clientId,
      tech: ticket.assignedTech || 'Javier M.',
      date: 'Nov 10, 2026',
      hours: loggedHours,
      summary: `Timer session (${formatClock(timerState.elapsedSeconds)}) on #${ticket.id}`,
      billed: false
    });

    ticket.updatedAt = 'Nov 10, Just now';
    ticket.updatedEpoch = Date.now();

    timerState.elapsedSeconds = 0;
    savePsaState(state);
    updateTimerUI();
    renderAll();
    showToast(`Logged ${loggedHours.toFixed(2)} billable hours to #${ticket.id}`);
  }

  function updateTimerUI() {
    const hasTime = timerState.running || timerState.elapsedSeconds > 0;
    const bar = document.getElementById('globalTimerBar');
    const toggleBtn = document.getElementById('globalTimerToggleBtn');
    const stopBtn = document.getElementById('globalTimerStopBtn');

    bar.classList.toggle('running', timerState.running);
    document.getElementById('globalTimerTicketId').textContent = timerState.ticketId ? `#${timerState.ticketId}` : 'No Active Ticket';
    document.getElementById('globalTimerDisplay').textContent = formatClock(timerState.elapsedSeconds);
    toggleBtn.textContent = timerState.running ? 'Pause' : 'Start';
    stopBtn.disabled = !hasTime;

    // Update inside Ticket Detail view if open
    const detailPanel = document.getElementById('detailLiveTimerPanel');
    const detailClock = document.getElementById('detailTimerClock');
    if (detailClock && selectedTicketId) {
      const isCurrent = timerState.ticketId === selectedTicketId;
      const secs = isCurrent ? timerState.elapsedSeconds : 0;
      const ticket = getTicketById(selectedTicketId);
      const client = ticket ? getClientById(ticket.clientId) : { hourlyRate: 175 };
      const hrs = secs > 0 ? Math.max(secs / 3600, 0.25) : 0;

      detailClock.textContent = formatClock(secs);
      document.getElementById('detailLiveCostReadout').textContent =
        `${formatCurrency(hrs * client.hourlyRate)} (@ $${client.hourlyRate}/hr)`;

      const runningHere = isCurrent && timerState.running;
      detailPanel.classList.toggle('timer-active', runningHere);
      document.getElementById('detailStartPauseTimerBtn').textContent =
        runningHere ? 'Pause Timer' : (isCurrent && secs > 0 ? 'Resume Timer' : 'Start Timer');
      document.getElementById('detailStopAndLogBtn').disabled = !(isCurrent && (timerState.running || secs > 0));
    }
  }

  // =========================================================================
  // 1. DASHBOARD
  // =========================================================================

  function renderDashboard() {
    const openTickets = state.tickets.filter(t => t.status !== 'Resolved');
    const navCount = document.getElementById('navTicketCount');
    if (navCount) navCount.textContent = openTickets.length;

    const scheduledToday = state.tickets.filter(t => t.dispatch && t.dispatch.day === '2026-11-10');
    const unbilledEntries = state.timeEntries.filter(te => !te.billed);
    const unbilledHours = unbilledEntries.reduce((s, te) => s + Number(te.hours), 0);
    const unbilledAmount = unbilledEntries.reduce((s, te) => {
      const c = getClientById(te.clientId);
      return s + Number(te.hours) * c.hourlyRate;
    }, 0);

    document.getElementById('dashboardStats').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Active Tickets</div>
        <div class="stat-value">${openTickets.length} <span style="font-size:13px;font-weight:normal;color:var(--text-muted);">in queue</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Scheduled Today</div>
        <div class="stat-value">${scheduledToday.length} <span style="font-size:13px;font-weight:normal;color:var(--text-muted);">calendar blocks</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unbilled Work Hours</div>
        <div class="stat-value">${unbilledHours.toFixed(2)}h <span style="font-size:13px;font-weight:normal;color:var(--text-muted);">logged</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unbilled Time Revenue</div>
        <div class="stat-value" style="color:var(--teal);">${formatCurrency(unbilledAmount)}</div>
      </div>
    `;

    // Active Tickets List
    const ticketsList = document.getElementById('dashboardTicketsList');
    if (openTickets.length === 0) {
      ticketsList.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <div class="empty-icon">🎫</div>
          <div class="empty-title">No Active Tickets</div>
          <div class="empty-desc">Your ticket triage queue is clear. Click below to create a service ticket.</div>
          <button class="btn btn-primary btn-sm" id="emptyDashNewTicketBtn">+ New Ticket</button>
        </div>
      `;
    } else {
      ticketsList.innerHTML = openTickets.slice(0, 6).map(t => {
        const client = getClientById(t.clientId);
        return `
          <div class="simple-row" data-open-ticket="${escapeHtml(t.id)}">
            <div class="row-left">
              <span class="mono-id">#${escapeHtml(t.id)}</span>
              <span class="row-title">${escapeHtml(t.subject)}</span>
            </div>
            <div class="row-left" style="flex-shrink: 0;">
              <span class="row-sub clickable-link" data-open-client="${escapeHtml(t.clientId)}" onclick="event.stopPropagation();">${escapeHtml(client.name)}</span>
              ${getPriorityBadge(t.priority)}
              ${getStatusBadge(t.status)}
            </div>
          </div>
        `;
      }).join('');
    }

    // Today's Dispatch Schedule List
    const schedList = document.getElementById('dashboardScheduleList');
    if (scheduledToday.length === 0) {
      schedList.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <div class="empty-icon">📅</div>
          <div class="empty-title">Nothing Scheduled for Today</div>
          <div class="empty-desc">No technician time blocks on the schedule for today.</div>
          <button class="btn btn-secondary btn-sm" data-goto-tab="dispatch">Open Dispatch Board &rarr;</button>
        </div>
      `;
    } else {
      schedList.innerHTML = scheduledToday
        .sort((a, b) => a.dispatch.startHour - b.dispatch.startHour)
        .map(t => {
          const client = getClientById(t.clientId);
          return `
            <div class="simple-row" data-open-ticket="${escapeHtml(t.id)}">
              <div class="row-left">
                <span class="mono-id">${formatHourLabel(t.dispatch.startHour)}</span>
                <span class="row-title">${escapeHtml(t.subject)}</span>
              </div>
              <div class="row-left" style="flex-shrink: 0;">
                <span class="row-sub">${escapeHtml(client.name)} &bull; ${escapeHtml(t.dispatch.tech)}</span>
              </div>
            </div>
          `;
        }).join('');
    }
  }

  // =========================================================================
  // 2. TICKETS (Condensed List + Sorting + Merge Feature)
  // =========================================================================

  function populateSelectDropdowns() {
    const clientOptions = `<option value="all">All Clients</option>` +
      state.clients.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');

    const ticketClientFilter = document.getElementById('ticketClientFilter');
    if (ticketClientFilter) {
      const val = ticketClientFilter.value || 'all';
      ticketClientFilter.innerHTML = clientOptions;
      ticketClientFilter.value = val;
    }

    const ledgerClientFilter = document.getElementById('ledgerClientFilter');
    if (ledgerClientFilter) {
      const val = ledgerClientFilter.value || 'all';
      ledgerClientFilter.innerHTML = clientOptions;
      ledgerClientFilter.value = val;
    }

    const kbClientSelect = document.getElementById('kbClientSelect');
    if (kbClientSelect) {
      let kbOpts = `<option value="all">All Clients</option>`;
      state.clients.forEach(c => {
        const count = state.kbArticles.filter(a => a.clientId === c.id).length;
        kbOpts += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${count})</option>`;
      });
      const curVal = kbClientSelect.value || kbFilter.clientId || 'all';
      kbClientSelect.innerHTML = kbOpts;
      kbClientSelect.value = curVal;
    }

    const clientSelectOnly = state.clients.length > 0
      ? state.clients.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')
      : `<option value="">-- No Clients Yet (Add a Client First) --</option>`;

    const newTicketClient = document.getElementById('newTicketClient');
    if (newTicketClient) newTicketClient.innerHTML = clientSelectOnly;

    const newKbClient = document.getElementById('newKbClient');
    if (newKbClient) {
      newKbClient.innerHTML = clientSelectOnly;
      if (kbFilter.clientId !== 'all') newKbClient.value = kbFilter.clientId;
    }

    const scheduleTicketSelect = document.getElementById('scheduleModalTicketSelect');
    if (scheduleTicketSelect) {
      const openSchedulable = state.tickets.filter(t => t.status !== 'Resolved');
      scheduleTicketSelect.innerHTML = openSchedulable.length > 0
        ? openSchedulable.map(t => `<option value="${escapeHtml(t.id)}">#${escapeHtml(t.id)} — ${escapeHtml(t.subject)}</option>`).join('')
        : `<option value="">-- No Active Tickets to Schedule --</option>`;
    }
  }

  function renderTicketsList() {
    populateSelectDropdowns();
    const tbody = document.getElementById('fullTicketQueueTbody');
    if (!tbody) return;

    let filtered = state.tickets.filter(t => {
      const client = getClientById(t.clientId);
      const q = ticketFilter.search.trim().toLowerCase();
      if (q) {
        const hay = `${t.id} ${t.subject} ${client.name} ${t.assignedTech}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (ticketFilter.status !== 'all' && t.status !== ticketFilter.status) return false;
      if (ticketFilter.clientId !== 'all' && t.clientId !== ticketFilter.clientId) return false;
      return true;
    });

    // Sorting functionality (Sort by Last Update feature)
    const sortBy = ticketFilter.sortBy || 'updated';
    filtered.sort((a, b) => {
      if (sortBy === 'updated') {
        const aEpoch = a.updatedEpoch || (new Date(a.updatedAt || a.createdAt)).getTime() || 0;
        const bEpoch = b.updatedEpoch || (new Date(b.updatedAt || b.createdAt)).getTime() || 0;
        return bEpoch - aEpoch;
      } else if (sortBy === 'created') {
        return (b.id > a.id ? 1 : -1);
      } else if (sortBy === 'priority') {
        const priWeights = { Critical: 4, High: 3, Medium: 2, Low: 1 };
        return (priWeights[b.priority] || 1) - (priWeights[a.priority] || 1);
      } else if (sortBy === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 20px;">
            <div class="empty-state">
              <div class="empty-icon">📥</div>
              <div class="empty-title">No Service Tickets Found</div>
              <div class="empty-desc">Create your first ticket to begin tracking issues, technician time, and client updates.</div>
              <button class="btn btn-primary btn-sm" id="emptyQueueNewTicketBtn">+ Create Ticket</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const client = getClientById(t.clientId);
      const hrs = getTicketHours(t.id);
      let schedText = `<span class="text-muted">Unscheduled</span>`;
      if (t.dispatch) {
        const d = WEEK_DAYS.find(day => day.key === t.dispatch.day);
        schedText = `${d ? d.short : t.dispatch.day}, ${formatHourLabel(t.dispatch.startHour)}`;
      }

      return `
        <tr class="clickable-row" data-open-ticket="${escapeHtml(t.id)}">
          <td class="mono-id">#${escapeHtml(t.id)}</td>
          <td style="font-weight: 500;">${escapeHtml(t.subject)}</td>
          <td><span class="clickable-link" data-open-client="${escapeHtml(t.clientId)}" onclick="event.stopPropagation();">${escapeHtml(client.name)}</span></td>
          <td>${getPriorityBadge(t.priority)}</td>
          <td>${getStatusBadge(t.status)}</td>
          <td style="font-size: 12.5px; color: var(--text-secondary);">${escapeHtml(t.updatedAt || t.createdAt)}</td>
          <td style="font-size: 12.5px;">${schedText}</td>
          <td>${escapeHtml(t.assignedTech)}</td>
          <td style="text-align: right; font-family: var(--font-mono); font-size: 12.5px;">${hrs.toFixed(2)}h</td>
        </tr>
      `;
    }).join('');
  }

  function renderTicketDetail(ticketId) {
    const ticket = getTicketById(ticketId) || state.tickets[0];
    if (!ticket) return;
    selectedTicketId = ticket.id;

    const client = getClientById(ticket.clientId);

    document.getElementById('detailTicketId').textContent = `#${ticket.id}`;
    const priBadge = document.getElementById('detailPriorityBadge');
    priBadge.className = `badge badge-${ticket.priority.toLowerCase()}`;
    priBadge.textContent = ticket.priority;

    document.getElementById('detailCategoryChip').textContent = ticket.category;
    document.getElementById('detailLastUpdatedMeta').textContent = `Updated: ${ticket.updatedAt || ticket.createdAt}`;
    document.getElementById('detailTicketSubject').textContent = ticket.subject;

    const clientNameEl = document.getElementById('detailClientName');
    clientNameEl.textContent = client.name;
    clientNameEl.onclick = () => openClientProfile(client.id);

    document.getElementById('detailContactEmail').textContent = client.contactEmail;
    document.getElementById('detailClientRate').textContent = `$${client.hourlyRate}/hr`;

    document.getElementById('detailStatusSelect').value = ticket.status;
    document.getElementById('detailPrioritySelect').value = ticket.priority;
    document.getElementById('detailTechSelect').value = ticket.assignedTech;

    document.getElementById('detailInitialDescription').textContent = ticket.description;
    document.getElementById('composerRecipientEmail').textContent = client.contactEmail;

    // Populate KB dropdown with articles belonging to THIS client
    const clientKbs = state.kbArticles.filter(kb => kb.clientId === ticket.clientId);
    const kbSelect = document.getElementById('insertKbSelect');
    kbSelect.innerHTML = `<option value="">+ Insert ${escapeHtml(client.name)} KB...</option>` +
      clientKbs.map(kb => `<option value="${escapeHtml(kb.id)}">${escapeHtml(kb.title)}</option>`).join('');

    // Notes History
    const notes = ticket.notes || [];
    const notesContainer = document.getElementById('detailTimelineList');
    if (notes.length === 0) {
      notesContainer.innerHTML = `<div class="text-muted">No notes yet. Type a note above to update or auto-email ${escapeHtml(client.contactEmail)}.</div>`;
    } else {
      notesContainer.innerHTML = notes.map(n => `
        <div class="note-item">
          <div class="note-item-top">
            <strong>${escapeHtml(n.author)}</strong>
            <span>
              ${n.emailedTo ? `<span class="badge badge-teal">Emailed to ${escapeHtml(n.emailedTo)}</span>` : `<span class="badge badge-low">Internal Note</span>`}
              &bull; ${escapeHtml(n.timestamp)}
            </span>
          </div>
          <div style="white-space: pre-line;">${escapeHtml(n.text)}</div>
        </div>
      `).join('');
    }

    // Billable Time Entries for this Ticket
    const entries = state.timeEntries.filter(te => te.ticketId === ticket.id);
    const totalHrs = entries.reduce((s, te) => s + Number(te.hours), 0);
    document.getElementById('detailTotalBillableBadge').textContent =
      `${totalHrs.toFixed(2)} hrs (${formatCurrency(totalHrs * client.hourlyRate)})`;

    const entriesEl = document.getElementById('detailTimeEntriesList');
    if (entries.length === 0) {
      entriesEl.innerHTML = `<div class="text-muted">No time logged yet.</div>`;
    } else {
      entriesEl.innerHTML = entries.map(te => `
        <div class="time-log-row">
          <span><strong>${Number(te.hours).toFixed(2)}h</strong> — ${escapeHtml(te.summary)}</span>
          <span class="text-muted">${escapeHtml(te.date)}</span>
        </div>
      `).join('');
    }

    // Dispatch Status
    const schedBox = document.getElementById('detailDispatchStatusBox');
    if (ticket.dispatch) {
      const d = WEEK_DAYS.find(day => day.key === ticket.dispatch.day);
      schedBox.innerHTML = `Scheduled: <strong>${escapeHtml(d ? d.label : ticket.dispatch.day)} at ${formatHourLabel(ticket.dispatch.startHour)}</strong> (${ticket.dispatch.duration}h)`;
      document.getElementById('detailDispatchDaySelect').value = ticket.dispatch.day;
      document.getElementById('detailDispatchHourSelect').value = String(ticket.dispatch.startHour);
    } else {
      schedBox.textContent = 'Not currently scheduled on the dispatch calendar.';
    }

    updateTimerUI();
  }

  // =========================================================================
  // 3. DISPATCH BOARD (Simple Calendar)
  // =========================================================================

  function renderDispatchBoard() {
    populateSelectDropdowns();
    const unscheduled = state.tickets.filter(t => !t.dispatch && t.status !== 'Resolved');
    document.getElementById('unscheduledCountBadge').textContent = unscheduled.length;

    const backlogEl = document.getElementById('dispatchBacklogList');
    if (unscheduled.length === 0) {
      backlogEl.innerHTML = `<div class="text-muted">All open tickets are scheduled.</div>`;
    } else {
      backlogEl.innerHTML = unscheduled.map(t => {
        const client = getClientById(t.clientId);
        return `
          <div class="unscheduled-item" draggable="true" data-drag-ticket="${escapeHtml(t.id)}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span class="mono-id">#${escapeHtml(t.id)}</span>
              ${getPriorityBadge(t.priority)}
            </div>
            <div style="font-weight:500;font-size:13px;margin-bottom:4px;">${escapeHtml(t.subject)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--text-muted);">
              <span class="clickable-link" data-open-client="${escapeHtml(t.clientId)}">${escapeHtml(client.name)}</span>
              <button class="btn-link" data-schedule-ticket="${escapeHtml(t.id)}">Schedule</button>
            </div>
          </div>
        `;
      }).join('');
    }

    // Calendar Grid
    const calContainer = document.getElementById('dispatchCalendarGrid');
    let html = `<div class="calendar-grid">`;
    html += `<div class="cal-head">Time</div>`;
    WEEK_DAYS.forEach(d => {
      html += `<div class="cal-head ${d.isToday ? 'today' : ''}">${escapeHtml(d.label)}</div>`;
    });

    CALENDAR_HOURS.forEach(hour => {
      html += `<div class="cal-time">${formatHourLabel(hour)}</div>`;
      WEEK_DAYS.forEach(d => {
        const matches = state.tickets.filter(t => {
          if (!t.dispatch) return false;
          if (dispatchTechFilter !== 'all' && t.dispatch.tech !== dispatchTechFilter) return false;
          return t.dispatch.day === d.key && Number(t.dispatch.startHour) === hour;
        });

        const eventsHtml = matches.map(t => {
          const client = getClientById(t.clientId);
          return `
            <div class="cal-event" data-open-ticket="${escapeHtml(t.id)}">
              <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--primary);font-weight:600;">
                <span>#${escapeHtml(t.id)}</span>
                <span>${escapeHtml(t.dispatch.tech)}</span>
              </div>
              <div class="cal-event-title">${escapeHtml(t.subject)}</div>
              <div class="text-muted" style="font-size:10.5px;">${escapeHtml(client.name)}</div>
            </div>
          `;
        }).join('');

        html += `<div class="cal-slot" data-slot-day="${d.key}" data-slot-hour="${hour}">${eventsHtml}</div>`;
      });
    });

    html += `</div>`;
    calContainer.innerHTML = html;

    bindCalendarDragDrop();
  }

  function bindCalendarDragDrop() {
    let draggedId = null;

    document.querySelectorAll('[data-drag-ticket]').forEach(el => {
      el.addEventListener('dragstart', e => {
        draggedId = el.dataset.dragTicket;
        e.dataTransfer.setData('text/plain', draggedId);
      });
    });

    document.querySelectorAll('.cal-slot').forEach(slot => {
      slot.addEventListener('dragover', e => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        const tId = e.dataTransfer.getData('text/plain') || draggedId;
        const ticket = getTicketById(tId);
        if (!ticket) return;

        const day = slot.dataset.slotDay;
        const hour = Number(slot.dataset.slotHour);
        ticket.dispatch = {
          day,
          startHour: hour,
          duration: 2,
          tech: ticket.assignedTech || 'Javier M.'
        };
        ticket.updatedAt = 'Nov 10, Just now';
        ticket.updatedEpoch = Date.now();

        savePsaState(state);
        renderAll();
        showToast(`Scheduled #${ticket.id} on ${day} at ${formatHourLabel(hour)}`);
      });

      slot.addEventListener('click', e => {
        if (e.target.closest('[data-open-ticket]')) return;
        document.getElementById('scheduleModalDaySelect').value = slot.dataset.slotDay;
        document.getElementById('scheduleModalHourSelect').value = slot.dataset.slotHour;
        openModal('scheduleDispatchModal');
      });
    });
  }

  // =========================================================================
  // 4. CLIENTS (Clean List View + Clickable Comprehensive MSP Dossier)
  // =========================================================================

  function renderClientsList() {
    populateSelectDropdowns();
    const tbody = document.getElementById('clientsListTbody');
    if (!tbody) return;

    const filtered = state.clients.filter(c => {
      if (!clientSearchQuery) return true;
      const q = clientSearchQuery.toLowerCase();
      const hay = `${c.name} ${c.industry || ''} ${c.contactName} ${c.contactEmail} ${c.phone}`.toLowerCase();
      return hay.includes(q);
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 20px;">
            <div class="empty-state">
              <div class="empty-icon">🏢</div>
              <div class="empty-title">No Managed Clients</div>
              <div class="empty-desc">Add your first client organization to document their network, subnets, cloud security, and SLA.</div>
              <button class="btn btn-primary btn-sm" id="emptyClientsAddBtn">+ Add Client</button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(c => {
      const openCount = state.tickets.filter(t => t.clientId === c.id && t.status !== 'Resolved').length;
      const totalEndpoints = c.assets ? (c.assets.servers + c.assets.workstations + c.assets.networkDevices) : '—';
      const firewallName = c.network ? c.network.firewall.split(' ')[0] : 'FortiGate';

      return `
        <tr class="clickable-row" data-open-client="${escapeHtml(c.id)}">
          <td>
            <div style="font-weight: 600; color: var(--primary);">${escapeHtml(c.name)}</div>
            <div class="text-muted" style="font-size: 11.5px;">${escapeHtml(c.address || '')}</div>
          </td>
          <td>${escapeHtml(c.industry || 'Managed Core')}</td>
          <td>
            <div>${escapeHtml(c.contactName)}</div>
            <div class="text-muted" style="font-size: 12px;">${escapeHtml(c.contactEmail)}</div>
          </td>
          <td class="text-muted">${escapeHtml(c.phone || '—')}</td>
          <td><span class="badge badge-open">${escapeHtml(c.slaTier || '24/7 Managed')}</span></td>
          <td style="font-family: var(--font-mono); font-size: 12.5px;">${totalEndpoints} devices</td>
          <td>
            <span class="badge ${openCount > 0 ? 'badge-medium' : 'badge-low'}">${openCount} open</span>
          </td>
          <td style="font-family: var(--font-mono); font-weight: 600;">$${(c.mrr || 7500).toLocaleString()}/mo</td>
          <td style="text-align: right;" onclick="event.stopPropagation();">
            <button class="btn btn-secondary btn-sm" data-open-client="${escapeHtml(c.id)}">View Profile</button>
            <button class="btn btn-secondary btn-sm" data-new-ticket-for="${escapeHtml(c.id)}">+ Ticket</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderClientHero(client) {
    const container = document.getElementById('clientHeroSummary');
    if (!container) return;

    if (clientCardEditState.hero) {
      container.innerHTML = `
        <form id="clientHeroForm" class="card-edit-form" style="width: 100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h2 style="font-size:16px;">Edit Client Overview &amp; Agreement</h2>
            <span class="badge badge-open">Editing Overview</span>
          </div>
          <div class="edit-grid-3">
            <div class="form-group">
              <label>Organization Name</label>
              <input type="text" id="editHeroName" class="input" value="${escapeHtml(client.name)}" required />
            </div>
            <div class="form-group">
              <label>Industry</label>
              <input type="text" id="editHeroIndustry" class="input" value="${escapeHtml(client.industry || '')}" />
            </div>
            <div class="form-group">
              <label>SLA Agreement Tier</label>
              <select id="editHeroSlaTier" class="select full-width">
                <option value="24/7 Zero-Trust Enterprise" ${client.slaTier === '24/7 Zero-Trust Enterprise' ? 'selected' : ''}>24/7 Zero-Trust Enterprise</option>
                <option value="Managed Core Plus" ${client.slaTier === 'Managed Core Plus' ? 'selected' : ''}>Managed Core Plus</option>
                <option value="Co-Managed Infrastructure" ${client.slaTier === 'Co-Managed Infrastructure' ? 'selected' : ''}>Co-Managed Infrastructure</option>
                <option value="Standard Managed" ${client.slaTier === 'Standard Managed' ? 'selected' : ''}>Standard Managed</option>
              </select>
            </div>
          </div>
          <div class="edit-grid-3">
            <div class="form-group">
              <label>Primary Contact Name &amp; Title</label>
              <input type="text" id="editHeroContactName" class="input" value="${escapeHtml(client.contactName || (client.primaryContact && client.primaryContact.name) || '')}" required />
            </div>
            <div class="form-group">
              <label>Primary Contact Email</label>
              <input type="email" id="editHeroContactEmail" class="input" value="${escapeHtml(client.contactEmail || (client.primaryContact && client.primaryContact.email) || '')}" required />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="text" id="editHeroPhone" class="input" value="${escapeHtml(client.phone || '')}" />
            </div>
          </div>
          <div class="form-group">
            <label>Office Address</label>
            <input type="text" id="editHeroAddress" class="input" value="${escapeHtml(client.address || '')}" />
          </div>
          <div class="edit-grid-3">
            <div class="form-group">
              <label>Monthly Retainer ($ MRR)</label>
              <input type="number" id="editHeroMrr" class="input" value="${client.mrr || 7500}" required />
            </div>
            <div class="form-group">
              <label>Billable Hourly Rate ($/hr)</label>
              <input type="number" id="editHeroRate" class="input" value="${client.hourlyRate || 175}" required />
            </div>
            <div class="form-group">
              <label>Contract Renewal Date</label>
              <input type="text" id="editHeroRenewal" class="input" value="${escapeHtml(client.contractRenewal || 'Oct 31, 2027')}" />
            </div>
          </div>
          <div class="card-edit-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelHeroEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Overview</button>
          </div>
        </form>
      `;
    } else {
      container.innerHTML = `
        <div style="flex: 1; min-width: 320px;">
          <div class="client-hero-title-row">
            <span class="client-hero-title">${escapeHtml(client.name)}</span>
            <span class="badge badge-open">${escapeHtml(client.slaTier || '24/7 Managed')}</span>
            <span class="badge badge-teal">${escapeHtml(client.industry || 'Enterprise')}</span>
          </div>
          <div class="text-muted" style="font-size: 13.5px;">${escapeHtml(client.address || 'Corporate Headquarters')}</div>

          <div class="client-hero-meta-grid">
            <div><strong>Primary Contact:</strong> ${escapeHtml(client.contactName)} (${escapeHtml(client.contactEmail)})</div>
            <div><strong>Phone:</strong> ${escapeHtml(client.phone || '—')}</div>
            <div><strong>Retainer:</strong> $${(client.mrr || 7500).toLocaleString()}/mo</div>
            <div><strong>Hourly Rate:</strong> $${client.hourlyRate}/hr</div>
            <div><strong>Renewal:</strong> ${escapeHtml(client.contractRenewal || 'Oct 2027')}</div>
          </div>
        </div>
        <div>
          <button class="btn btn-secondary btn-sm" id="editClientHeroBtn">Edit Details</button>
        </div>
      `;
    }
  }

  function renderClientNetwork(client) {
    const container = document.getElementById('clientNetworkContainer');
    const btn = document.getElementById('editClientNetworkBtn');
    if (!container || !btn) return;
    const net = client.network || {};

    if (clientCardEditState.network) {
      btn.textContent = 'Editing';
      container.innerHTML = `
        <form id="clientNetworkForm" class="card-edit-form">
          <div class="edit-grid-2">
            <div class="form-group">
              <label>Primary Firewall &amp; HA Mode</label>
              <input type="text" id="editNetFirewall" class="input" value="${escapeHtml(net.firewall || '')}" />
            </div>
            <div class="form-group">
              <label>Firewall Management IP &amp; OS</label>
              <input type="text" id="editNetMgmtIp" class="input" value="${escapeHtml(net.firewallMgmtIp || '')}" />
            </div>
          </div>
          <div class="edit-grid-2">
            <div class="form-group">
              <label>WAN 1 Primary ISP</label>
              <input type="text" id="editNetWan1Isp" class="input" value="${escapeHtml(net.wan1Isp || '')}" />
            </div>
            <div class="form-group">
              <label>WAN 1 Circuit ID &amp; Static IP</label>
              <input type="text" id="editNetWan1Circuit" class="input" value="${escapeHtml(net.wan1Circuit || '')}" />
            </div>
          </div>
          <div class="edit-grid-2">
            <div class="form-group">
              <label>WAN 2 Backup ISP</label>
              <input type="text" id="editNetWan2Isp" class="input" value="${escapeHtml(net.wan2Isp || '')}" />
            </div>
            <div class="form-group">
              <label>WAN 2 Circuit ID &amp; Static IP</label>
              <input type="text" id="editNetWan2Circuit" class="input" value="${escapeHtml(net.wan2Circuit || '')}" />
            </div>
          </div>
          <div class="edit-grid-3">
            <div class="form-group">
              <label>Core Switch Fabric</label>
              <input type="text" id="editNetSwitches" class="input" value="${escapeHtml(net.coreSwitches || '')}" />
            </div>
            <div class="form-group">
              <label>Corporate &amp; Guest Wi-Fi</label>
              <input type="text" id="editNetWifi" class="input" value="${escapeHtml(net.wifi || '')}" />
            </div>
            <div class="form-group">
              <label>VPN Gateway &amp; MFA</label>
              <input type="text" id="editNetVpn" class="input" value="${escapeHtml(net.vpn || '')}" />
            </div>
          </div>
          <div class="card-edit-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelNetworkEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Network</button>
          </div>
        </form>
      `;
    } else {
      btn.textContent = 'Edit';
      container.innerHTML = `
        <div class="info-table-wrap">
          <table class="key-value-table" id="clientNetworkTable">
            <tr><td>Primary Firewall</td><td><strong>${escapeHtml(net.firewall || 'FortiGate HA Cluster')}</strong></td></tr>
            <tr><td>Firewall MGMT IP</td><td>${escapeHtml(net.firewallMgmtIp || '10.42.0.1')}</td></tr>
            <tr><td>WAN 1 Primary ISP</td><td>${escapeHtml(net.wan1Isp || 'Comcast Business Dedicated Fiber (1 Gbps)')}</td></tr>
            <tr><td>WAN 1 Circuit &amp; IP</td><td>${escapeHtml(net.wan1Circuit || 'CKT-BOS-98214 (Static IP: 50.210.42.18)')}</td></tr>
            <tr><td>WAN 2 Backup ISP</td><td>${escapeHtml(net.wan2Isp || 'Crown Castle Backup Fiber (500 Mbps)')}</td></tr>
            <tr><td>WAN 2 Circuit &amp; IP</td><td>${escapeHtml(net.wan2Circuit || 'CKT-CC-40112 (Static IP: 64.104.88.22)')}</td></tr>
            <tr><td>Core Switch Fabric</td><td>${escapeHtml(net.coreSwitches || 'Aruba CX 6300M 48-port Stack')}</td></tr>
            <tr><td>Corporate Wi-Fi</td><td>${escapeHtml(net.wifi || '802.1X WPA3 Enterprise')}</td></tr>
            <tr><td>VPN Gateway</td><td>${escapeHtml(net.vpn || 'IPSec AWS Cloud Tunnel + SAML MFA SSL-VPN')}</td></tr>
          </table>
        </div>
      `;
    }
  }

  function renderClientSubnets(client) {
    const container = document.getElementById('clientSubnetsContainer');
    const btn = document.getElementById('editClientSubnetsBtn');
    const countBadge = document.getElementById('clientSubnetCount');
    if (!container || !btn) return;

    client.network = client.network || {};
    client.network.subnets = client.network.subnets || [
      { vlan: '10', name: 'Corporate LAN', cidr: '10.42.10.0/24', dhcp: 'Windows Server DHCP' },
      { vlan: '20', name: 'VoIP Telephony', cidr: '10.42.20.0/24', dhcp: 'FortiGate DHCP' },
      { vlan: '50', name: 'Guest Wi-Fi', cidr: '172.16.50.0/24', dhcp: 'Captive Portal' }
    ];

    if (countBadge) countBadge.textContent = `${client.network.subnets.length} documented subnets`;

    if (clientCardEditState.subnets) {
      btn.textContent = 'Editing';
      const rowsHtml = editingSubnets.map((s, idx) => `
        <div class="subnets-edit-row" data-subnet-idx="${idx}">
          <input type="text" class="input subnet-input-vlan" placeholder="VLAN #" value="${escapeHtml(s.vlan)}" required />
          <input type="text" class="input subnet-input-name" placeholder="Subnet Name" value="${escapeHtml(s.name)}" required />
          <input type="text" class="input subnet-input-cidr" placeholder="Subnet CIDR (10.x.x.x/24)" value="${escapeHtml(s.cidr)}" required />
          <input type="text" class="input subnet-input-dhcp" placeholder="DHCP / Service" value="${escapeHtml(s.dhcp || '')}" />
          <button type="button" class="btn-icon-del btn-del-subnet" data-del-subnet="${idx}" title="Delete Subnet">&times;</button>
        </div>
      `).join('');

      container.innerHTML = `
        <form id="clientSubnetsForm" class="card-edit-form">
          <div style="font-size:12px; color:var(--text-secondary); margin-bottom:4px;">
            Edit internal VLANs, IP address blocks, and DHCP allocation:
          </div>
          <div class="subnets-edit-list" id="subnetsEditListContainer">
            ${rowsHtml || '<div class="text-muted" style="padding:8px 0;">No subnets defined. Click "+ Add Subnet Row" below.</div>'}
          </div>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" id="addSubnetRowBtn">+ Add Subnet Row</button>
          </div>
          <div class="card-edit-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelSubnetsEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Subnets</button>
          </div>
        </form>
      `;
    } else {
      btn.textContent = 'Edit';
      const subnets = client.network.subnets;
      container.innerHTML = `
        <table class="clean-list-table subnets-table">
          <thead>
            <tr>
              <th style="width: 70px;">VLAN</th>
              <th>Name</th>
              <th>Subnet CIDR</th>
              <th>DHCP / Service</th>
            </tr>
          </thead>
          <tbody id="clientSubnetsTbody">
            ${subnets.map(s => `
              <tr>
                <td style="font-weight: 600;">VLAN ${escapeHtml(s.vlan)}</td>
                <td style="font-weight: 500;">${escapeHtml(s.name)}</td>
                <td style="color: var(--primary);">${escapeHtml(s.cidr)}</td>
                <td class="text-muted">${escapeHtml(s.dhcp)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  function renderClientCloudSec(client) {
    const container = document.getElementById('clientCloudSecContainer');
    const btn = document.getElementById('editClientCloudSecBtn');
    if (!container || !btn) return;
    const sec = client.cloudAndSecurity || {};

    if (clientCardEditState.cloud) {
      btn.textContent = 'Editing';
      container.innerHTML = `
        <form id="clientCloudSecForm" class="card-edit-form">
          <div class="edit-grid-2">
            <div class="form-group">
              <label>Microsoft 365 Domain</label>
              <input type="text" id="editSecDomain" class="input" value="${escapeHtml(sec.m365Domain || '')}" />
            </div>
            <div class="form-group">
              <label>M365 Tenant ID</label>
              <input type="text" id="editSecTenant" class="input" value="${escapeHtml(sec.m365TenantId || '')}" />
            </div>
          </div>
          <div class="edit-grid-2">
            <div class="form-group">
              <label>Directory Identity / Sync</label>
              <input type="text" id="editSecIdentity" class="input" value="${escapeHtml(sec.identity || '')}" />
            </div>
            <div class="form-group">
              <label>EDR &amp; Endpoint Protection</label>
              <input type="text" id="editSecEdr" class="input" value="${escapeHtml(sec.edr || '')}" />
            </div>
          </div>
          <div class="edit-grid-3">
            <div class="form-group">
              <label>Backup &amp; Disaster Recovery</label>
              <input type="text" id="editSecBackup" class="input" value="${escapeHtml(sec.backup || '')}" />
            </div>
            <div class="form-group">
              <label>Authoritative DNS Registrar</label>
              <input type="text" id="editSecDns" class="input" value="${escapeHtml(sec.dns || '')}" />
            </div>
            <div class="form-group">
              <label>RMM Health Status</label>
              <input type="text" id="editSecRmm" class="input" value="${escapeHtml(sec.rmm || '')}" />
            </div>
          </div>
          <div class="card-edit-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelCloudSecEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Cloud &amp; Security</button>
          </div>
        </form>
      `;
    } else {
      btn.textContent = 'Edit';
      container.innerHTML = `
        <div class="info-table-wrap">
          <table class="key-value-table" id="clientCloudSecTable">
            <tr><td>Microsoft 365 Domain</td><td><strong>${escapeHtml(sec.m365Domain || client.name.toLowerCase().replace(/\s+/g, '') + '.com')}</strong></td></tr>
            <tr><td>M365 Tenant ID</td><td>${escapeHtml(sec.m365TenantId || '3b7f214a-89a1-42e1-9543-aegis90214b')}</td></tr>
            <tr><td>Directory Identity</td><td>${escapeHtml(sec.identity || 'Hybrid Microsoft Entra ID Sync')}</td></tr>
            <tr><td>EDR / Endpoint Sec</td><td><span class="badge badge-teal">${escapeHtml(sec.edr || 'CrowdStrike Falcon Complete')}</span></td></tr>
            <tr><td>Backup &amp; DR Strategy</td><td>${escapeHtml(sec.backup || 'Immutable BCDR (Hourly snapshots, Cloud Mirror)')}</td></tr>
            <tr><td>DNS Registrar &amp; Zone</td><td>${escapeHtml(sec.dns || 'Cloudflare Enterprise with Zero-Trust DNS')}</td></tr>
            <tr><td>RMM Health Status</td><td><span class="badge badge-open">${escapeHtml(sec.rmm || 'Workflow Zero Agent (Compliant)')}</span></td></tr>
          </table>
        </div>
      `;
    }
  }

  function renderClientAssets(client) {
    const container = document.getElementById('clientAssetsContainer');
    const btn = document.getElementById('editClientAssetsBtn');
    const totalBadge = document.getElementById('clientTotalEndpointsBadge');
    if (!container || !btn) return;
    const ast = client.assets || { servers: 6, workstations: 120, networkDevices: 12, mobileDevices: 40 };
    const total = (Number(ast.servers) || 0) + (Number(ast.workstations) || 0) + (Number(ast.networkDevices) || 0) + (Number(ast.mobileDevices) || 0);

    if (totalBadge) totalBadge.textContent = `${total} total managed assets`;

    if (clientCardEditState.assets) {
      btn.textContent = 'Editing';
      container.innerHTML = `
        <form id="clientAssetsForm" class="card-edit-form">
          <div class="edit-grid-2">
            <div class="form-group">
              <label>Servers (Physical &amp; Virtual VMs)</label>
              <input type="number" id="editAssetServers" class="input" value="${ast.servers || 0}" min="0" required />
            </div>
            <div class="form-group">
              <label>Workstations (Laptops &amp; Desktops)</label>
              <input type="number" id="editAssetWorkstations" class="input" value="${ast.workstations || 0}" min="0" required />
            </div>
          </div>
          <div class="edit-grid-2">
            <div class="form-group">
              <label>Network Devices (Firewalls, Switches, APs)</label>
              <input type="number" id="editAssetNetwork" class="input" value="${ast.networkDevices || 0}" min="0" required />
            </div>
            <div class="form-group">
              <label>Mobile &amp; MDM Devices</label>
              <input type="number" id="editAssetMobile" class="input" value="${ast.mobileDevices || 0}" min="0" required />
            </div>
          </div>
          <div class="card-edit-actions">
            <button type="button" class="btn btn-secondary btn-sm" id="cancelAssetsEditBtn">Cancel</button>
            <button type="submit" class="btn btn-primary btn-sm">Save Assets</button>
          </div>
        </form>
      `;
    } else {
      btn.textContent = 'Edit';
      container.innerHTML = `
        <div class="assets-metric-row" id="clientAssetsMetrics">
          <div class="asset-pill-box">
            <div class="asset-pill-val">${ast.servers}</div>
            <div class="asset-pill-lbl">Servers</div>
          </div>
          <div class="asset-pill-box">
            <div class="asset-pill-val">${ast.workstations}</div>
            <div class="asset-pill-lbl">Workstations</div>
          </div>
          <div class="asset-pill-box">
            <div class="asset-pill-val">${ast.networkDevices}</div>
            <div class="asset-pill-lbl">Network</div>
          </div>
          <div class="asset-pill-box">
            <div class="asset-pill-val">${ast.mobileDevices}</div>
            <div class="asset-pill-lbl">Mobile</div>
          </div>
        </div>
      `;
    }
  }

  function renderClientProfile(clientId) {
    const client = getClientById(clientId);
    if (!client) return;
    selectedClientId = client.id;

    renderClientHero(client);
    renderClientNetwork(client);
    renderClientSubnets(client);
    renderClientCloudSec(client);
    renderClientAssets(client);

    // Client Tickets List
    const allClientTickets = state.tickets.filter(t => t.clientId === client.id);
    const openTickets = allClientTickets.filter(t => t.status !== 'Resolved');
    const ticketListEl = document.getElementById('clientDossierTicketsList');
    const ticketCountBadge = document.getElementById('clientTicketCountBadge');
    if (ticketCountBadge) ticketCountBadge.textContent = `${allClientTickets.length} tickets (${openTickets.length} open)`;
    if (ticketListEl) {
      if (allClientTickets.length === 0) {
        ticketListEl.innerHTML = `<div class="text-muted">No tickets logged for this client yet.</div>`;
      } else {
        ticketListEl.innerHTML = allClientTickets.slice(0, 5).map(t => `
          <div class="compact-item-row" data-open-ticket="${escapeHtml(t.id)}">
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="mono-id">#${escapeHtml(t.id)}</span>
              <span style="font-weight: 500;">${escapeHtml(t.subject)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${getPriorityBadge(t.priority)}
              ${getStatusBadge(t.status)}
            </div>
          </div>
        `).join('');
      }
    }

    // Client Knowledge Runbooks List
    const clientKbs = state.kbArticles.filter(kb => kb.clientId === client.id);
    const kbListEl = document.getElementById('clientDossierKbList');
    if (kbListEl) {
      if (clientKbs.length === 0) {
        kbListEl.innerHTML = `<div class="text-muted">No knowledge articles documented yet. Click "+ New KB Article" above to add one.</div>`;
      } else {
        kbListEl.innerHTML = clientKbs.map(kb => `
          <div class="compact-item-row" data-view-client-kb="${escapeHtml(client.id)}" data-select-kb="${escapeHtml(kb.id)}">
            <div>
              <div style="font-weight: 600; color: var(--primary);">${escapeHtml(kb.title)}</div>
              <div class="text-muted" style="font-size: 11.5px;">${escapeHtml(kb.category)} &bull; Updated ${escapeHtml(kb.updatedAt)}</div>
            </div>
            <span class="btn-link">View Runbook &rarr;</span>
          </div>
        `).join('');
      }
    }
  }

  // =========================================================================
  // 5. BILLING (Dedicated Center & Time Ledger)
  // =========================================================================

  function renderBillingCenter() {
    populateSelectDropdowns();

    const totalMrr = state.clients.reduce((s, c) => s + Number(c.mrr || 0), 0);
    const unbilledEntries = state.timeEntries.filter(te => !te.billed);
    const unbilledHours = unbilledEntries.reduce((s, te) => s + Number(te.hours || 0), 0);
    const unbilledRevenue = unbilledEntries.reduce((s, te) => {
      const c = getClientById(te.clientId);
      return s + Number(te.hours) * c.hourlyRate;
    }, 0);
    const billedRevenue = state.timeEntries
      .filter(te => te.billed)
      .reduce((s, te) => {
        const c = getClientById(te.clientId);
        return s + Number(te.hours) * c.hourlyRate;
      }, 0);

    // 4 Stat Cards
    document.getElementById('billingStatsRow').innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Active Retainer Agreements (MRR)</div>
        <div class="stat-value" style="color:var(--primary);">${formatCurrency(totalMrr)}<span style="font-size:13px;font-weight:normal;color:var(--text-muted);">/mo</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unbilled Work-in-Progress Hours</div>
        <div class="stat-value">${unbilledHours.toFixed(2)}h</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Unbilled Work-in-Progress Revenue</div>
        <div class="stat-value" style="color:var(--teal);">${formatCurrency(unbilledRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Billed Through Current Cycle</div>
        <div class="stat-value">${formatCurrency(billedRevenue)}</div>
      </div>
    `;

    // Client Accounts Invoicing Summary Table
    const clientBillingTbody = document.getElementById('billingClientsTbody');
    if (clientBillingTbody) {
      if (state.clients.length === 0) {
        clientBillingTbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 36px 20px;">
              <div class="empty-state">
                <div class="empty-title">No Client Accounts</div>
                <div class="empty-desc">Add clients with monthly retainers and hourly rates to track billing and generate invoices.</div>
              </div>
            </td>
          </tr>
        `;
      } else {
        clientBillingTbody.innerHTML = state.clients.map(c => {
          const clientEntries = state.timeEntries.filter(te => te.clientId === c.id && !te.billed);
          const unbilledHrs = clientEntries.reduce((s, te) => s + Number(te.hours), 0);
          const unbilledTot = unbilledHrs * c.hourlyRate;

          return `
            <tr>
              <td style="font-weight: 600;"><span class="clickable-link" data-open-client="${escapeHtml(c.id)}">${escapeHtml(c.name)}</span></td>
              <td>${escapeHtml(c.contactName)} &lt;${escapeHtml(c.contactEmail)}&gt;</td>
              <td style="font-family: var(--font-mono);">$${c.hourlyRate}/hr</td>
              <td style="font-family: var(--font-mono); font-weight: 600;">$${(c.mrr || 7500).toLocaleString()}/mo</td>
              <td style="font-family: var(--font-mono);">${unbilledHrs.toFixed(2)}h</td>
              <td style="font-family: var(--font-mono); font-weight: 600; color: var(--teal);">${formatCurrency(unbilledTot)}</td>
              <td style="text-align: right;">
                <button class="btn btn-secondary btn-sm" data-invoice-client="${escapeHtml(c.id)}">Generate Invoice</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // Full Billable Time Ledger
    const ledgerTbody = document.getElementById('billingLedgerTbody');
    const filterClient = document.getElementById('ledgerClientFilter')?.value || 'all';
    if (ledgerTbody) {
      const entries = state.timeEntries.filter(te => filterClient === 'all' || te.clientId === filterClient);
      if (entries.length === 0) {
        ledgerTbody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 36px 20px;">
              <div class="empty-state">
                <div class="empty-title">No Time Entries Logged</div>
                <div class="empty-desc">Billable time logged on service tickets will appear here in the ledger.</div>
              </div>
            </td>
          </tr>
        `;
      } else {
        ledgerTbody.innerHTML = entries.map(te => {
          const client = getClientById(te.clientId);
          return `
            <tr class="clickable-row" data-open-ticket="${escapeHtml(te.ticketId)}">
              <td>${escapeHtml(te.date)}</td>
              <td class="mono-id">#${escapeHtml(te.ticketId)}</td>
              <td>${escapeHtml(client.name)}</td>
              <td>${escapeHtml(te.tech)}</td>
              <td>${escapeHtml(te.summary)}</td>
              <td style="font-family: var(--font-mono);">${Number(te.hours).toFixed(2)}h</td>
              <td style="font-family: var(--font-mono);">$${client.hourlyRate}/hr</td>
              <td style="font-family: var(--font-mono); font-weight: 600;">${formatCurrency(te.hours * client.hourlyRate)}</td>
              <td>
                <span class="badge ${te.billed ? 'badge-resolved' : 'badge-teal'}">${te.billed ? 'Billed' : 'Unbilled'}</span>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  function openInvoiceModal(clientId) {
    activeInvoiceClientId = clientId;
    const client = getClientById(clientId);
    const entries = state.timeEntries.filter(te => te.clientId === clientId);
    const unbilledTotal = entries
      .filter(te => !te.billed)
      .reduce((s, te) => s + Number(te.hours) * client.hourlyRate, 0);

    document.getElementById('invoiceModalTitle').textContent = `Client Invoice Preview — ${client.name}`;
    document.getElementById('invoiceModalBody').innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid var(--border);flex-wrap:wrap;gap:12px;">
        <div style="display:flex;gap:14px;align-items:center;">
          <img src="logo.png" alt="Workflow Zero IT" style="height:44px;width:auto;object-fit:contain;" />
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--text);">${escapeHtml(client.name)}</div>
            <div class="text-muted">${escapeHtml(client.contactName)} &bull; ${escapeHtml(client.contactEmail)}</div>
            <div class="text-muted" style="font-size:12px;">${escapeHtml(client.address || '')}</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div class="text-muted" style="font-size:12px;">Current Balance Due (Retainer + Unbilled Hours)</div>
          <div style="font-size:22px;font-weight:700;color:var(--teal);">${formatCurrency(unbilledTotal + (client.mrr || 0))}</div>
          <div style="font-size:11.5px;color:var(--text-muted);">$${(client.mrr || 0).toLocaleString()} Monthly Retainer + ${formatCurrency(unbilledTotal)} Ticket WIP</div>
        </div>
      </div>
      <table class="clean-list-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticket</th>
            <th>Summary</th>
            <th>Hours</th>
            <th>Rate</th>
            <th>Total</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(te => `
            <tr>
              <td>${escapeHtml(te.date)}</td>
              <td class="mono-id">#${escapeHtml(te.ticketId)}</td>
              <td>${escapeHtml(te.summary)}</td>
              <td>${Number(te.hours).toFixed(2)}h</td>
              <td>$${client.hourlyRate}/hr</td>
              <td>${formatCurrency(te.hours * client.hourlyRate)}</td>
              <td><span class="badge ${te.billed ? 'badge-resolved' : 'badge-teal'}">${te.billed ? 'Billed' : 'Unbilled'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    openModal('invoicePreviewModal');
  }

  // =========================================================================
  // 6. KNOWLEDGE BASE (Client Dropdown Filter)
  // =========================================================================

  function renderKnowledgeBase() {
    populateSelectDropdowns();

    const filtered = state.kbArticles.filter(kb => {
      if (kbFilter.clientId !== 'all' && kb.clientId !== kbFilter.clientId) return false;
      const q = kbFilter.search.trim().toLowerCase();
      if (q) {
        const client = getClientById(kb.clientId);
        const hay = `${kb.title} ${client.name} ${kb.category} ${kb.content}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const tbody = document.getElementById('kbArticleListTbody');
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 36px 16px;">
            <div class="empty-state">
              <div class="empty-title">No Knowledge Articles</div>
              <div class="empty-desc">Document client runbooks, SOPs, and perimeter configs.</div>
              <button class="btn btn-primary btn-sm" id="emptyKbNewArticleBtn">+ New Article</button>
            </div>
          </td>
        </tr>
      `;
    } else {
      if (!filtered.some(a => a.id === selectedKbId)) {
        selectedKbId = filtered[0].id;
      }
      tbody.innerHTML = filtered.map(kb => {
        const client = getClientById(kb.clientId);
        return `
          <tr class="clickable-row ${kb.id === selectedKbId ? 'selected-row' : ''}" data-select-kb="${escapeHtml(kb.id)}">
            <td style="font-weight: 500;">${escapeHtml(kb.title)}</td>
            <td><span class="badge badge-open">${escapeHtml(client.name)}</span></td>
            <td class="text-muted">${escapeHtml(kb.category)}</td>
          </tr>
        `;
      }).join('');
    }

    const reader = document.getElementById('kbArticleDetailContent');
    const activeArticle = state.kbArticles.find(a => a.id === selectedKbId) || filtered[0];
    if (!activeArticle) {
      reader.innerHTML = `
        <div class="empty-state" style="padding: 48px 20px;">
          <div class="empty-icon">📖</div>
          <div class="empty-title">Knowledge Base Reader</div>
          <div class="empty-desc">Select an article on the left or create a new client runbook.</div>
          <button class="btn btn-primary btn-sm" id="readerNewArticleBtn">+ Write New Article</button>
        </div>
      `;
      return;
    }

    const articleClient = getClientById(activeArticle.clientId);
    reader.innerHTML = `
      <div style="margin-bottom: 14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span class="badge badge-open clickable-link" data-open-client="${escapeHtml(articleClient.id)}">${escapeHtml(articleClient.name)}</span>
          <span class="badge badge-low">${escapeHtml(activeArticle.category)}</span>
          <span class="text-muted">Updated ${escapeHtml(activeArticle.updatedAt)} by ${escapeHtml(activeArticle.author)}</span>
        </div>
        <h2>${escapeHtml(activeArticle.title)}</h2>
      </div>
      <div style="white-space: pre-line; color: var(--text-secondary); line-height: 1.7; font-size: 13.5px;">${escapeHtml(activeArticle.content)}</div>
      ${activeArticle.commands ? `<pre class="kb-pre">${escapeHtml(activeArticle.commands)}</pre>` : ''}
    `;
  }

  // =========================================================================
  // MERGE TICKETS FEATURE
  // =========================================================================

  function openMergeTicketModal(sourceTicketId) {
    const sourceTicket = getTicketById(sourceTicketId);
    if (!sourceTicket) return;

    document.getElementById('mergeSourceTicketId').textContent = `#${sourceTicket.id} (${sourceTicket.subject.slice(0, 36)}...)`;

    const select = document.getElementById('mergeTargetTicketSelect');
    const eligibleTargets = state.tickets.filter(t => t.id !== sourceTicket.id && t.status !== 'Resolved');

    if (eligibleTargets.length === 0) {
      showToast('No eligible open target tickets found to merge into.');
      return;
    }

    select.innerHTML = eligibleTargets.map(t => {
      const c = getClientById(t.clientId);
      return `<option value="${escapeHtml(t.id)}">#${escapeHtml(t.id)} [${escapeHtml(c.name)}] — ${escapeHtml(t.subject)}</option>`;
    }).join('');

    openModal('mergeTicketModal');
  }

  function executeTicketMerge() {
    const sourceTicket = getTicketById(selectedTicketId);
    const targetTicketId = document.getElementById('mergeTargetTicketSelect').value;
    const targetTicket = getTicketById(targetTicketId);

    if (!sourceTicket || !targetTicket) return;

    const copyNotes = document.getElementById('mergeCopyNotesCheck').checked;
    const copyTime = document.getElementById('mergeCopyTimeCheck').checked;
    const notifyClient = document.getElementById('mergeNotifyClientCheck').checked;

    const sourceClient = getClientById(sourceTicket.clientId);

    // Copy notes over
    if (copyNotes && sourceTicket.notes && sourceTicket.notes.length > 0) {
      targetTicket.notes = targetTicket.notes || [];
      sourceTicket.notes.forEach(n => {
        targetTicket.notes.push({
          id: 'n-merge-' + Date.now() + Math.random(),
          author: n.author,
          timestamp: n.timestamp,
          emailedTo: null,
          text: `[Merged from #${sourceTicket.id}]: ${n.text}`
        });
      });
    }

    // Transfer time entries
    if (copyTime) {
      state.timeEntries.forEach(te => {
        if (te.ticketId === sourceTicket.id) {
          te.ticketId = targetTicket.id;
          te.summary = `[From #${sourceTicket.id}] ${te.summary}`;
        }
      });
    }

    // Add consolidation note on target ticket
    targetTicket.notes = targetTicket.notes || [];
    targetTicket.notes.unshift({
      id: 'n-merge-sys-' + Date.now(),
      author: 'Workflow Zero PSA',
      timestamp: 'Just now',
      emailedTo: notifyClient ? sourceClient.contactEmail : null,
      text: `Ticket #${sourceTicket.id} ("${sourceTicket.subject}") was merged into this ticket #${targetTicket.id}.${notifyClient ? ` Client notification sent to ${sourceClient.contactEmail}.` : ''}`
    });

    // Mark source ticket as Resolved / Merged
    sourceTicket.status = 'Resolved';
    sourceTicket.notes = sourceTicket.notes || [];
    sourceTicket.notes.unshift({
      id: 'n-merged-' + Date.now(),
      author: 'Workflow Zero PSA',
      timestamp: 'Just now',
      emailedTo: null,
      text: `Merged into Ticket #${targetTicket.id}.`
    });

    targetTicket.updatedAt = 'Nov 10, Just now';
    targetTicket.updatedEpoch = Date.now();
    sourceTicket.updatedAt = 'Nov 10, Just now';
    sourceTicket.updatedEpoch = Date.now();

    savePsaState(state);
    closeModal('mergeTicketModal');
    renderAll();
    openTicketDetail(targetTicket.id);
    showToast(`Ticket #${sourceTicket.id} successfully merged into #${targetTicket.id}`);
  }

  // =========================================================================
  // MODALS & EVENT BINDINGS
  // =========================================================================

  function openModal(id) {
    populateSelectDropdowns();
    document.getElementById(id)?.classList.remove('hidden');
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  function renderAll() {
    renderDashboard();
    renderTicketsList();
    if (selectedTicketId && !document.getElementById('ticketDetailSubview')?.classList.contains('hidden')) {
      renderTicketDetail(selectedTicketId);
    }
    renderDispatchBoard();
    renderClientsList();
    if (selectedClientId && !document.getElementById('clientDetailSubview')?.classList.contains('hidden')) {
      renderClientProfile(selectedClientId);
    }
    renderBillingCenter();
    renderKnowledgeBase();
    updateTimerUI();
  }

  function bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    document.getElementById('brandHomeLink')?.addEventListener('click', e => {
      e.preventDefault();
      switchTab('dashboard');
    });

    // Expose helpers globally for testing/debugging
    window.switchTab = switchTab;
    window.openClientProfile = openClientProfile;

    // Delegated click routing
    document.body.addEventListener('click', e => {
      const navBtn = e.target.closest('.nav-tab');
      if (navBtn && navBtn.dataset.tab) {
        switchTab(navBtn.dataset.tab);
        return;
      }

      const gotoBtn = e.target.closest('[data-goto-tab]');
      if (gotoBtn) {
        switchTab(gotoBtn.dataset.gotoTab);
        return;
      }

      const openClientEl = e.target.closest('[data-open-client]');
      if (openClientEl) {
        openClientProfile(openClientEl.dataset.openClient);
        return;
      }

      const openTicketEl = e.target.closest('[data-open-ticket]');
      if (openTicketEl) {
        openTicketDetail(openTicketEl.dataset.openTicket);
        return;
      }

      const schedBtn = e.target.closest('[data-schedule-ticket]');
      if (schedBtn) {
        e.stopPropagation();
        openModal('scheduleDispatchModal');
        document.getElementById('scheduleModalTicketSelect').value = schedBtn.dataset.scheduleTicket;
        return;
      }

      const selectKbRow = e.target.closest('[data-select-kb]');
      if (selectKbRow) {
        selectedKbId = selectKbRow.dataset.selectKb;
        if (activeTab !== 'knowledge') {
          switchTab('knowledge');
        } else {
          renderKnowledgeBase();
        }
        return;
      }

      const viewClientKbBtn = e.target.closest('[data-view-client-kb]');
      if (viewClientKbBtn) {
        switchTab('knowledge', { clientId: viewClientKbBtn.dataset.viewClientKb });
        return;
      }

      const invoiceBtn = e.target.closest('[data-invoice-client]');
      if (invoiceBtn) {
        openInvoiceModal(invoiceBtn.dataset.invoiceClient);
        return;
      }

      const newTicketForBtn = e.target.closest('[data-new-ticket-for]');
      if (newTicketForBtn) {
        openModal('newTicketModal');
        document.getElementById('newTicketClient').value = newTicketForBtn.dataset.newTicketFor;
        return;
      }

      const closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        closeModal(closeBtn.dataset.closeModal);
        return;
      }

      // =========================================================================
      // CLIENT CARD EDIT TRIGGERS (Editable MSP Dossier)
      // =========================================================================
      if (e.target.closest('#editClientHeroBtn')) {
        clientCardEditState.hero = true;
        const c = getClientById(selectedClientId);
        if (c) renderClientHero(c);
        return;
      }
      if (e.target.closest('#cancelHeroEditBtn')) {
        clientCardEditState.hero = false;
        const c = getClientById(selectedClientId);
        if (c) renderClientHero(c);
        return;
      }

      if (e.target.closest('#editClientNetworkBtn')) {
        clientCardEditState.network = !clientCardEditState.network;
        const c = getClientById(selectedClientId);
        if (c) renderClientNetwork(c);
        return;
      }
      if (e.target.closest('#cancelNetworkEditBtn')) {
        clientCardEditState.network = false;
        const c = getClientById(selectedClientId);
        if (c) renderClientNetwork(c);
        return;
      }

      if (e.target.closest('#editClientSubnetsBtn')) {
        const c = getClientById(selectedClientId);
        if (!c) return;
        clientCardEditState.subnets = !clientCardEditState.subnets;
        if (clientCardEditState.subnets) {
          editingSubnets = (c.network && c.network.subnets ? c.network.subnets : []).map(s => ({ ...s }));
        }
        renderClientSubnets(c);
        return;
      }
      if (e.target.closest('#cancelSubnetsEditBtn')) {
        clientCardEditState.subnets = false;
        const c = getClientById(selectedClientId);
        if (c) renderClientSubnets(c);
        return;
      }
      if (e.target.closest('#addSubnetRowBtn')) {
        syncSubnetsFromInputs();
        editingSubnets.push({ vlan: '', name: '', cidr: '', dhcp: '' });
        const c = getClientById(selectedClientId);
        if (c) renderClientSubnets(c);
        return;
      }
      const delSubnetBtn = e.target.closest('.btn-del-subnet');
      if (delSubnetBtn) {
        syncSubnetsFromInputs();
        const idx = parseInt(delSubnetBtn.dataset.delSubnet, 10);
        if (!isNaN(idx)) {
          editingSubnets.splice(idx, 1);
          const c = getClientById(selectedClientId);
          if (c) renderClientSubnets(c);
        }
        return;
      }

      if (e.target.closest('#editClientCloudSecBtn')) {
        clientCardEditState.cloud = !clientCardEditState.cloud;
        const c = getClientById(selectedClientId);
        if (c) renderClientCloudSec(c);
        return;
      }
      if (e.target.closest('#cancelCloudSecEditBtn')) {
        clientCardEditState.cloud = false;
        const c = getClientById(selectedClientId);
        if (c) renderClientCloudSec(c);
        return;
      }

      if (e.target.closest('#editClientAssetsBtn')) {
        clientCardEditState.assets = !clientCardEditState.assets;
        const c = getClientById(selectedClientId);
        if (c) renderClientAssets(c);
        return;
      }
      if (e.target.closest('#cancelAssetsEditBtn')) {
        clientCardEditState.assets = false;
        const c = getClientById(selectedClientId);
        if (c) renderClientAssets(c);
        return;
      }
    });

    function syncSubnetsFromInputs() {
      const container = document.getElementById('subnetsEditListContainer');
      if (!container) return;
      const rows = container.querySelectorAll('.subnets-edit-row');
      editingSubnets = [];
      rows.forEach(r => {
        const vlan = r.querySelector('.subnet-input-vlan')?.value.trim() || '';
        const name = r.querySelector('.subnet-input-name')?.value.trim() || '';
        const cidr = r.querySelector('.subnet-input-cidr')?.value.trim() || '';
        const dhcp = r.querySelector('.subnet-input-dhcp')?.value.trim() || '';
        editingSubnets.push({ vlan, name, cidr, dhcp });
      });
    }

    // Submit handler for Client Card Editing forms
    document.body.addEventListener('submit', e => {
      // 1. Hero Overview Form Submit
      if (e.target.id === 'clientHeroForm') {
        e.preventDefault();
        const client = getClientById(selectedClientId);
        if (!client) return;

        client.name = document.getElementById('editHeroName').value.trim() || client.name;
        client.slaTier = document.getElementById('editHeroSlaTier').value;
        client.industry = document.getElementById('editHeroIndustry').value.trim() || client.industry;
        client.contactName = document.getElementById('editHeroContactName').value.trim();
        client.contactEmail = document.getElementById('editHeroContactEmail').value.trim();
        if (!client.primaryContact) client.primaryContact = {};
        client.primaryContact.name = client.contactName;
        client.primaryContact.email = client.contactEmail;
        client.phone = document.getElementById('editHeroPhone').value.trim();
        client.primaryContact.phone = client.phone;
        client.address = document.getElementById('editHeroAddress').value.trim();
        client.mrr = Number(document.getElementById('editHeroMrr').value) || 0;
        client.hourlyRate = Number(document.getElementById('editHeroRate').value) || 0;
        client.contractRenewal = document.getElementById('editHeroRenewal').value.trim();

        clientCardEditState.hero = false;
        savePsaState(state);
        renderAll();
        showToast('Client Overview saved');
        return;
      }

      // 2. Network Form Submit
      if (e.target.id === 'clientNetworkForm') {
        e.preventDefault();
        const client = getClientById(selectedClientId);
        if (!client) return;

        client.network = client.network || {};
        client.network.firewall = document.getElementById('editNetFirewall').value.trim();
        client.network.firewallMgmtIp = document.getElementById('editNetMgmtIp').value.trim();
        client.network.wan1Isp = document.getElementById('editNetWan1Isp').value.trim();
        client.network.wan1Circuit = document.getElementById('editNetWan1Circuit').value.trim();
        client.network.wan2Isp = document.getElementById('editNetWan2Isp').value.trim();
        client.network.wan2Circuit = document.getElementById('editNetWan2Circuit').value.trim();
        client.network.coreSwitches = document.getElementById('editNetSwitches').value.trim();
        client.network.wifi = document.getElementById('editNetWifi').value.trim();
        client.network.vpn = document.getElementById('editNetVpn').value.trim();

        clientCardEditState.network = false;
        savePsaState(state);
        renderClientNetwork(client);
        showToast('Network gateway updated');
        return;
      }

      // 3. Subnets Form Submit
      if (e.target.id === 'clientSubnetsForm') {
        e.preventDefault();
        syncSubnetsFromInputs();
        const client = getClientById(selectedClientId);
        if (!client) return;

        client.network = client.network || {};
        client.network.subnets = editingSubnets.filter(s => s.vlan || s.name || s.cidr);
        clientCardEditState.subnets = false;
        savePsaState(state);
        renderClientSubnets(client);
        showToast('VLANs & Subnets saved');
        return;
      }

      // 4. Cloud & Security Form Submit
      if (e.target.id === 'clientCloudSecForm') {
        e.preventDefault();
        const client = getClientById(selectedClientId);
        if (!client) return;

        client.cloudAndSecurity = client.cloudAndSecurity || {};
        client.cloudAndSecurity.m365Domain = document.getElementById('editSecDomain').value.trim();
        client.cloudAndSecurity.m365TenantId = document.getElementById('editSecTenant').value.trim();
        client.cloudAndSecurity.identity = document.getElementById('editSecIdentity').value.trim();
        client.cloudAndSecurity.edr = document.getElementById('editSecEdr').value.trim();
        client.cloudAndSecurity.backup = document.getElementById('editSecBackup').value.trim();
        client.cloudAndSecurity.dns = document.getElementById('editSecDns').value.trim();
        client.cloudAndSecurity.rmm = document.getElementById('editSecRmm').value.trim();

        clientCardEditState.cloud = false;
        savePsaState(state);
        renderClientCloudSec(client);
        showToast('Cloud & Security updated');
        return;
      }

      // 5. Assets Form Submit
      if (e.target.id === 'clientAssetsForm') {
        e.preventDefault();
        const client = getClientById(selectedClientId);
        if (!client) return;

        client.assets = client.assets || {};
        client.assets.servers = Number(document.getElementById('editAssetServers').value) || 0;
        client.assets.workstations = Number(document.getElementById('editAssetWorkstations').value) || 0;
        client.assets.networkDevices = Number(document.getElementById('editAssetNetwork').value) || 0;
        client.assets.mobileDevices = Number(document.getElementById('editAssetMobile').value) || 0;

        clientCardEditState.assets = false;
        savePsaState(state);
        renderClientAssets(client);
        renderClientsList();
        showToast('Endpoint asset inventory saved');
        return;
      }
    });

    // Header & Ticket Timer Buttons
    document.getElementById('globalTimerToggleBtn')?.addEventListener('click', () => {
      toggleTimer(timerState.ticketId || selectedTicketId);
    });
    document.getElementById('globalTimerStopBtn')?.addEventListener('click', () => {
      stopAndLogTimer();
    });
    document.getElementById('globalTimerTicketId')?.addEventListener('click', () => {
      openTicketDetail(timerState.ticketId);
    });

    document.getElementById('detailStartPauseTimerBtn')?.addEventListener('click', () => {
      toggleTimer(selectedTicketId);
    });
    document.getElementById('detailStopAndLogBtn')?.addEventListener('click', () => {
      stopAndLogTimer();
    });

    // Merge Ticket Trigger Button
    document.getElementById('detailMergeTicketBtn')?.addEventListener('click', () => {
      openMergeTicketModal(selectedTicketId);
    });

    document.getElementById('mergeTicketForm')?.addEventListener('submit', e => {
      e.preventDefault();
      executeTicketMerge();
    });

    // Ticket Queue Filters & Sort
    document.getElementById('ticketSearchInput')?.addEventListener('input', e => {
      ticketFilter.search = e.target.value;
      renderTicketsList();
    });

    document.querySelectorAll('#ticketStatusFilterGroup .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#ticketStatusFilterGroup .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ticketFilter.status = btn.dataset.status;
        renderTicketsList();
      });
    });

    document.getElementById('ticketClientFilter')?.addEventListener('change', e => {
      ticketFilter.clientId = e.target.value;
      renderTicketsList();
    });

    document.getElementById('ticketSortSelect')?.addEventListener('change', e => {
      ticketFilter.sortBy = e.target.value;
      renderTicketsList();
    });

    // Back Buttons
    document.getElementById('backToQueueBtn')?.addEventListener('click', () => {
      document.getElementById('ticketDetailSubview').classList.add('hidden');
      document.getElementById('ticketQueueSubview').classList.remove('hidden');
      renderTicketsList();
    });

    document.getElementById('backToClientsListBtn')?.addEventListener('click', () => {
      document.getElementById('clientDetailSubview').classList.add('hidden');
      document.getElementById('clientsListSubview').classList.remove('hidden');
      renderClientsList();
    });

    // Client Profile Quick Actions
    document.getElementById('clientProfileNewTicketBtn')?.addEventListener('click', () => {
      openModal('newTicketModal');
      document.getElementById('newTicketClient').value = selectedClientId;
    });

    document.getElementById('clientProfileNewKbBtn')?.addEventListener('click', () => {
      openModal('newKbModal');
      document.getElementById('newKbClient').value = selectedClientId;
    });

    document.getElementById('clientProfileInvoiceBtn')?.addEventListener('click', () => {
      openInvoiceModal(selectedClientId);
    });

    document.getElementById('clientJumpToKbBtn')?.addEventListener('click', () => {
      switchTab('knowledge', { clientId: selectedClientId });
    });

    // Client Search Filter
    document.getElementById('clientSearchInput')?.addEventListener('input', e => {
      clientSearchQuery = e.target.value;
      renderClientsList();
    });

    // Ticket Status / Priority / Tech updates
    document.getElementById('detailStatusSelect')?.addEventListener('change', e => {
      const t = getTicketById(selectedTicketId);
      if (t) {
        t.status = e.target.value;
        t.updatedAt = 'Nov 10, Just now';
        t.updatedEpoch = Date.now();
        savePsaState(state);
        renderAll();
        showToast(`Status updated to ${t.status}`);
      }
    });

    document.getElementById('detailPrioritySelect')?.addEventListener('change', e => {
      const t = getTicketById(selectedTicketId);
      if (t) {
        t.priority = e.target.value;
        t.updatedAt = 'Nov 10, Just now';
        t.updatedEpoch = Date.now();
        savePsaState(state);
        renderAll();
        showToast(`Priority updated to ${t.priority}`);
      }
    });

    document.getElementById('detailTechSelect')?.addEventListener('change', e => {
      const t = getTicketById(selectedTicketId);
      if (t) {
        t.assignedTech = e.target.value;
        if (t.dispatch) t.dispatch.tech = e.target.value;
        t.updatedAt = 'Nov 10, Just now';
        t.updatedEpoch = Date.now();
        savePsaState(state);
        renderAll();
        showToast(`Assigned to ${t.assignedTech}`);
      }
    });

    // Insert Client KB Article into Ticket Note
    document.getElementById('insertKbSelect')?.addEventListener('change', e => {
      const kb = state.kbArticles.find(a => a.id === e.target.value);
      if (kb) {
        const ta = document.getElementById('ticketNoteTextarea');
        ta.value = (ta.value ? ta.value + '\n\n' : '') + `Reference [${kb.title}]:\n${kb.content}`;
      }
      e.target.value = '';
    });

    // Save Note & Auto-Email Client
    document.getElementById('submitTicketNoteBtn')?.addEventListener('click', () => {
      const ta = document.getElementById('ticketNoteTextarea');
      const text = ta.value.trim();
      if (!text) return;

      const ticket = getTicketById(selectedTicketId);
      if (!ticket) return;
      const client = getClientById(ticket.clientId);
      const sendEmail = document.getElementById('autoEmailToggleCheckbox').checked;

      ticket.notes = ticket.notes || [];
      ticket.notes.unshift({
        id: 'n-' + Date.now(),
        author: ticket.assignedTech || 'Javier M.',
        timestamp: 'Just now',
        emailedTo: sendEmail ? client.contactEmail : null,
        text
      });

      ticket.updatedAt = 'Nov 10, Just now';
      ticket.updatedEpoch = Date.now();

      ta.value = '';
      savePsaState(state);
      renderTicketDetail(ticket.id);
      showToast(sendEmail ? `Note saved and emailed to ${client.contactEmail}` : 'Internal note saved');
    });

    // Manual Time Entry inside Ticket View
    document.getElementById('detailManualTimeForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const ticket = getTicketById(selectedTicketId);
      if (!ticket) return;

      const hours = parseFloat(document.getElementById('manualHoursInput').value);
      const summary = document.getElementById('manualNoteInput').value.trim();
      if (!hours || !summary) return;

      state.timeEntries.unshift({
        id: 'te-' + Date.now(),
        ticketId: ticket.id,
        clientId: ticket.clientId,
        tech: ticket.assignedTech || 'Javier M.',
        date: 'Nov 10, 2026',
        hours,
        summary,
        billed: false
      });

      ticket.updatedAt = 'Nov 10, Just now';
      ticket.updatedEpoch = Date.now();

      document.getElementById('manualHoursInput').value = '';
      document.getElementById('manualNoteInput').value = '';
      savePsaState(state);
      renderAll();
      showToast(`Added ${hours.toFixed(2)}h to #${ticket.id}`);
    });

    // Quick Schedule inside Ticket View
    document.getElementById('detailQuickDispatchForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const ticket = getTicketById(selectedTicketId);
      if (!ticket) return;
      const day = document.getElementById('detailDispatchDaySelect').value;
      const startHour = Number(document.getElementById('detailDispatchHourSelect').value);

      ticket.dispatch = {
        day,
        startHour,
        duration: 2,
        tech: ticket.assignedTech || 'Javier M.'
      };
      ticket.updatedAt = 'Nov 10, Just now';
      ticket.updatedEpoch = Date.now();

      savePsaState(state);
      renderAll();
      showToast(`Scheduled #${ticket.id} on ${day} at ${formatHourLabel(startHour)}`);
    });

    // Dispatch Tech Filter
    document.getElementById('dispatchTechFilter')?.addEventListener('change', e => {
      dispatchTechFilter = e.target.value;
      renderDispatchBoard();
    });

    // Billing Ledger Client Filter
    document.getElementById('ledgerClientFilter')?.addEventListener('change', () => {
      renderBillingCenter();
    });

    // Knowledge Dropdown Selector (Feature requested)
    document.getElementById('kbClientSelect')?.addEventListener('change', e => {
      kbFilter.clientId = e.target.value;
      const firstMatch = state.kbArticles.find(a => kbFilter.clientId === 'all' || a.clientId === kbFilter.clientId);
      if (firstMatch) selectedKbId = firstMatch.id;
      renderKnowledgeBase();
    });

    document.getElementById('kbSearchInput')?.addEventListener('input', e => {
      kbFilter.search = e.target.value;
      renderKnowledgeBase();
    });

    // Modal Triggers
    document.getElementById('headerNewTicketBtn')?.addEventListener('click', () => openModal('newTicketModal'));
    document.getElementById('queueNewTicketBtn')?.addEventListener('click', () => openModal('newTicketModal'));
    document.getElementById('newKbArticleBtn')?.addEventListener('click', () => openModal('newKbModal'));
    document.getElementById('newClientBtn')?.addEventListener('click', () => openModal('newClientModal'));

    // Create Ticket Submit
    document.getElementById('newTicketForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const clientId = document.getElementById('newTicketClient').value;
      if (!clientId) {
        showToast('Please add a client first before creating tickets.');
        closeModal('newTicketModal');
        openModal('newClientModal');
        return;
      }

      let maxNum = 1000;
      state.tickets.forEach(t => {
        const m = t.id && t.id.match(/\d+/);
        if (m) {
          const n = parseInt(m[0], 10);
          if (n > maxNum) maxNum = n;
        }
      });
      const nextNum = maxNum + 1;
      const currentTech = (window.FirebaseService?.getCurrentUser()?.displayName) || 'Lead Tech';

      const newTicket = {
        id: `WZ-${nextNum}`,
        clientId,
        priority: document.getElementById('newTicketPriority').value,
        category: document.getElementById('newTicketCategory').value,
        subject: document.getElementById('newTicketSubject').value.trim(),
        description: document.getElementById('newTicketDesc').value.trim(),
        status: 'Open',
        assignedTech: currentTech,
        createdAt: 'Just now',
        updatedAt: 'Just now',
        updatedEpoch: Date.now(),
        dispatch: null,
        notes: []
      };
      state.tickets.unshift(newTicket);
      savePsaState(state);
      closeModal('newTicketModal');
      e.target.reset();
      openTicketDetail(newTicket.id);
      showToast(`Created Ticket #${newTicket.id}`);
    });

    // Schedule Ticket Modal Submit
    document.getElementById('scheduleDispatchForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const ticket = getTicketById(document.getElementById('scheduleModalTicketSelect').value);
      if (!ticket) return;
      const day = document.getElementById('scheduleModalDaySelect').value;
      const startHour = Number(document.getElementById('scheduleModalHourSelect').value);
      const tech = document.getElementById('scheduleModalTechSelect').value;
      const duration = Number(document.getElementById('scheduleModalDurationSelect').value);

      ticket.assignedTech = tech;
      ticket.dispatch = { day, startHour, duration, tech };
      ticket.updatedAt = 'Nov 10, Just now';
      ticket.updatedEpoch = Date.now();

      savePsaState(state);
      closeModal('scheduleDispatchModal');
      renderAll();
      showToast(`Scheduled #${ticket.id} on calendar`);
    });

    // New Client Knowledge Article Submit
    document.getElementById('newKbForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const clientId = document.getElementById('newKbClient').value;
      if (!clientId) {
        showToast('Please add a client first before creating articles.');
        closeModal('newKbModal');
        openModal('newClientModal');
        return;
      }
      const category = document.getElementById('newKbCategory').value;
      const title = document.getElementById('newKbTitle').value.trim();
      const content = document.getElementById('newKbBody').value.trim();
      const commands = document.getElementById('newKbCommands').value.trim();

      const newArt = {
        id: 'kb-' + Date.now(),
        clientId,
        title,
        category,
        updatedAt: 'Nov 10, 2026',
        author: 'Javier M.',
        content,
        commands
      };

      state.kbArticles.unshift(newArt);
      selectedKbId = newArt.id;
      kbFilter.clientId = clientId;
      savePsaState(state);
      closeModal('newKbModal');
      e.target.reset();
      renderAll();
      showToast('Client knowledge article saved');
    });

    // New Client Submit
    document.getElementById('newClientForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('newClientName').value.trim();
      const industry = document.getElementById('newClientIndustry').value.trim() || 'General Enterprise';
      const contactName = document.getElementById('newClientContact').value.trim();
      const contactEmail = document.getElementById('newClientEmail').value.trim();
      const phone = document.getElementById('newClientPhone').value.trim() || '—';
      const address = document.getElementById('newClientAddress').value.trim() || '';
      const hourlyRate = Number(document.getElementById('newClientRate').value || 175);
      const mrr = Number(document.getElementById('newClientMrr').value || 7500);
      const firewall = document.getElementById('newClientFirewall').value.trim() || 'FortiGate HA Cluster';
      const domain = document.getElementById('newClientDomain').value.trim() || name.toLowerCase().replace(/\s+/g, '') + '.com';

      const newCli = {
        id: 'cli-' + Date.now(),
        name,
        industry,
        address,
        phone,
        primaryContact: { name: contactName, title: 'Primary Contact', email: contactEmail, phone },
        contactName,
        contactEmail,
        slaTier: '24/7 Managed Core',
        mrr,
        hourlyRate,
        contractRenewal: 'Nov 30, 2027',
        network: {
          firewall,
          firewallMgmtIp: '10.10.0.1',
          wan1Isp: 'Dedicated Fiber Internet (1 Gbps)',
          wan1Circuit: 'CKT-FIBER-01 (Static IP)',
          wan2Isp: 'Backup Broadband (300 Mbps)',
          wan2Circuit: 'CKT-BACKUP-02',
          coreSwitches: 'Managed PoE+ Switch Stack',
          subnets: [
            { vlan: '10', name: 'Corporate Workstations', cidr: '10.10.10.0/24', dhcp: 'DHCP' },
            { vlan: '50', name: 'Guest Wi-Fi', cidr: '172.16.50.0/24', dhcp: 'Isolated' }
          ],
          wifi: 'Corporate 802.1X + Guest Wi-Fi',
          vpn: 'SSL-VPN with MFA'
        },
        cloudAndSecurity: {
          m365Domain: domain,
          m365TenantId: 'tenant-' + Date.now(),
          identity: 'Microsoft Entra ID Sync',
          edr: 'EDR Managed Antivirus',
          backup: 'Automated Immutable Cloud Backup',
          dns: 'Cloudflare Protected DNS',
          rmm: 'Workflow Zero Agent Active'
        },
        assets: {
          servers: 4,
          workstations: 45,
          networkDevices: 6,
          mobileDevices: 20
        }
      };

      state.clients.push(newCli);
      savePsaState(state);
      closeModal('newClientModal');
      e.target.reset();
      renderAll();
      openClientProfile(newCli.id);
      showToast(`Added client: ${name}`);
    });

    // Mark Invoice Sent
    document.getElementById('markInvoiceSentBtn')?.addEventListener('click', () => {
      if (!activeInvoiceClientId) return;
      const client = getClientById(activeInvoiceClientId);
      state.timeEntries.forEach(te => {
        if (te.clientId === activeInvoiceClientId) te.billed = true;
      });
      savePsaState(state);
      closeModal('invoicePreviewModal');
      renderAll();
      showToast(`Invoice sent to ${client.contactEmail}`);
    });

    // -----------------------------------------------------------------------
    // FIREBASE AUTHENTICATION & LOGIN UI
    // -----------------------------------------------------------------------
    let isRegisterMode = false;

    const authTabSignIn = document.getElementById('authTabSignIn');
    const authTabRegister = document.getElementById('authTabRegister');
    const authNameGroup = document.getElementById('authNameGroup');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authError = document.getElementById('authErrorMessage');

    authTabSignIn?.addEventListener('click', () => {
      isRegisterMode = false;
      authTabSignIn.classList.add('active');
      authTabRegister.classList.remove('active');
      authNameGroup.classList.add('hidden');
      authSubmitBtn.textContent = 'Sign In to PSA';
      if (authError) { authError.className = 'auth-error'; authError.textContent = ''; }
    });

    authTabRegister?.addEventListener('click', () => {
      isRegisterMode = true;
      authTabRegister.classList.add('active');
      authTabSignIn.classList.remove('active');
      authNameGroup.classList.remove('hidden');
      authSubmitBtn.textContent = 'Create Technician Account';
      if (authError) { authError.className = 'auth-error'; authError.textContent = ''; }
    });

    document.getElementById('authForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('authEmailInput')?.value.trim();
      const password = document.getElementById('authPasswordInput')?.value;
      const displayName = document.getElementById('authNameInput')?.value.trim();

      if (authError) { authError.className = 'auth-error'; authError.textContent = ''; }
      authSubmitBtn.disabled = true;
      authSubmitBtn.textContent = isRegisterMode ? 'Creating Account...' : 'Signing In...';

      try {
        if (isRegisterMode) {
          await window.FirebaseService.signUp(email, password, displayName);
          showToast(`Technician account registered: ${email}`);
        } else {
          await window.FirebaseService.signIn(email, password);
          showToast(`Welcome back, ${email}`);
        }
      } catch (err) {
        if (authError) {
          authError.textContent = err.message || 'Authentication error. Please check your credentials.';
          authError.classList.add('visible');
        }
      } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isRegisterMode ? 'Create Technician Account' : 'Sign In to PSA';
      }
    });

    document.getElementById('authQuickDemoBtn')?.addEventListener('click', async () => {
      try {
        await window.FirebaseService.signIn('tech@workflowzero.it', 'demo1234');
        showToast('Signed in in local / offline mode.');
      } catch (e) {
        console.error(e);
      }
    });

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await window.FirebaseService.signOut();
      showToast('Signed out of PSA.');
    });

    // -----------------------------------------------------------------------
    // FIREBASE CLOUD SETUP MODAL
    // -----------------------------------------------------------------------
    const openFbModal = () => {
      const cfg = window.FirebaseService.loadConfig();
      document.getElementById('fbApiKeyInput').value = cfg.apiKey || '';
      document.getElementById('fbProjectIdInput').value = cfg.projectId || '';
      document.getElementById('fbAuthDomainInput').value = cfg.authDomain || '';
      document.getElementById('fbStorageBucketInput').value = cfg.storageBucket || '';
      const feedback = document.getElementById('fbSetupFeedback');
      if (feedback) feedback.style.display = 'none';
      openModal('firebaseModal');
    };

    document.getElementById('cloudStatusBtn')?.addEventListener('click', openFbModal);
    document.getElementById('authCloudSettingsLink')?.addEventListener('click', openFbModal);

    // Auto-parse pasted config
    document.getElementById('firebaseConfigPasteInput')?.addEventListener('input', e => {
      const text = e.target.value;
      const parsed = window.FirebaseService.parseConfigString(text);
      if (parsed) {
        if (parsed.apiKey) document.getElementById('fbApiKeyInput').value = parsed.apiKey;
        if (parsed.projectId) document.getElementById('fbProjectIdInput').value = parsed.projectId;
        if (parsed.authDomain) document.getElementById('fbAuthDomainInput').value = parsed.authDomain;
        if (parsed.storageBucket) document.getElementById('fbStorageBucketInput').value = parsed.storageBucket;

        const feedback = document.getElementById('fbSetupFeedback');
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = 'var(--teal-soft)';
          feedback.style.color = 'var(--teal)';
          feedback.textContent = '✓ Configuration parsed! Click "Save & Connect Cloud" to initialize.';
        }
      }
    });

    document.getElementById('fbSaveBtn')?.addEventListener('click', async () => {
      const config = {
        apiKey: document.getElementById('fbApiKeyInput').value.trim(),
        projectId: document.getElementById('fbProjectIdInput').value.trim(),
        authDomain: document.getElementById('fbAuthDomainInput').value.trim(),
        storageBucket: document.getElementById('fbStorageBucketInput').value.trim()
      };

      if (!config.apiKey || !config.projectId) {
        const feedback = document.getElementById('fbSetupFeedback');
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = 'var(--danger-soft)';
          feedback.style.color = 'var(--danger)';
          feedback.textContent = 'Please enter at least the API Key and Project ID.';
        }
        return;
      }

      const ok = window.FirebaseService.saveConfig(config);
      const feedback = document.getElementById('fbSetupFeedback');
      if (feedback) {
        feedback.style.display = 'block';
        if (ok) {
          feedback.style.background = 'var(--teal-soft)';
          feedback.style.color = 'var(--teal)';
          feedback.textContent = '✓ Connected to Firebase Project "' + config.projectId + '"!';
          showToast(`Firebase Cloud Database connected (${config.projectId})`);
          setTimeout(() => closeModal('firebaseModal'), 1200);
        } else {
          feedback.style.background = 'var(--danger-soft)';
          feedback.style.color = 'var(--danger)';
          feedback.textContent = 'Unable to initialize Firebase with these credentials. Check console for details.';
        }
      }
    });

    document.getElementById('fbResetBtn')?.addEventListener('click', () => {
      window.FirebaseService.clearConfig();
      document.getElementById('fbApiKeyInput').value = '';
      document.getElementById('fbProjectIdInput').value = '';
      document.getElementById('fbAuthDomainInput').value = '';
      document.getElementById('fbStorageBucketInput').value = '';
      document.getElementById('firebaseConfigPasteInput').value = '';
      const feedback = document.getElementById('fbSetupFeedback');
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.background = 'var(--surface-subtle)';
        feedback.style.color = 'var(--text-muted)';
        feedback.textContent = 'Firebase config cleared. Running in local mode.';
      }
      showToast('Firebase connection reset.');
    });

    // Delegated actions for empty states
    document.body.addEventListener('click', e => {
      if (e.target.closest('#emptyDashNewTicketBtn') || e.target.closest('#emptyQueueNewTicketBtn')) {
        openModal('newTicketModal');
      } else if (e.target.closest('#emptyClientsAddBtn')) {
        openModal('newClientModal');
      } else if (e.target.closest('#emptyKbNewArticleBtn') || e.target.closest('#readerNewArticleBtn')) {
        openModal('newKbModal');
      }
    });
  }

  function handleHashRoute() {
    const rawHash = (window.location.hash || '').replace(/^#/, '');
    const urlParams = new URLSearchParams(window.location.search);
    const editParam = urlParams.get('edit');

    if (urlParams.get('login') === 'demo') {
      window.FirebaseService.signIn('javier@workflowzero.it', 'demo1234');
    }

    if (rawHash.startsWith('client/')) {
      const clientId = rawHash.split('/')[1];
      if (clientId) {
        openClientProfile(clientId);
        if (editParam === 'all' || editParam === 'cards') {
          clientCardEditState = { hero: true, network: true, subnets: true, cloud: true, assets: true };
          const client = getClientById(selectedClientId);
          editingSubnets = client.network?.subnets ? JSON.parse(JSON.stringify(client.network.subnets)) : [];
          renderClientProfile(selectedClientId);
        }
        return;
      }
    }
    if (rawHash === 'firebase' || rawHash === 'cloud') {
      openModal('firebaseModal');
      return;
    }
    if (rawHash.startsWith('invoice/')) {
      const clientId = rawHash.split('/')[1] || selectedClientId;
      openInvoiceModal(clientId);
      return;
    }
    if (rawHash.startsWith('merge/')) {
      const ticketId = rawHash.split('/')[1] || selectedTicketId;
      selectedTicketId = ticketId;
      openModal('mergeTicketModal');
      return;
    }
    if (rawHash.startsWith('ticket/')) {
      const ticketId = rawHash.split('/')[1];
      if (ticketId) {
        openTicketDetail(ticketId);
        return;
      }
    }
    const validTabs = ['dashboard', 'tickets', 'dispatch', 'clients', 'billing', 'knowledge'];
    if (rawHash && validTabs.includes(rawHash)) {
      switchTab(rawHash);
    }
  }

  function initApp() {
    bindEvents();
    renderAll();
    handleHashRoute();
    window.addEventListener('hashchange', handleHashRoute);

    // Initialize Firebase Auth & Cloud Sync listener
    if (window.FirebaseService) {
      window.FirebaseService.onAuthStateChanged(user => {
        const authScreen = document.getElementById('authScreen');
        const cloudDot = document.getElementById('cloudStatusDot');
        const cloudText = document.getElementById('cloudStatusText');
        const authCloudDot = document.getElementById('authCloudDot');
        const authCloudText = document.getElementById('authCloudStatusText');

        const isCfg = window.FirebaseService.isConfigured();
        const isReady = window.FirebaseService.isCloudReady();

        if (cloudDot) {
          cloudDot.className = 'cloud-status-dot ' + (isReady ? 'connected' : (isCfg ? 'connected' : 'setup'));
        }
        if (cloudText) {
          cloudText.textContent = isReady ? 'Cloud: Connected' : (isCfg ? 'Firebase Ready' : 'Cloud Setup');
        }
        if (authCloudDot) {
          authCloudDot.className = 'cloud-status-dot ' + (isCfg ? 'connected' : 'setup');
        }
        if (authCloudText) {
          authCloudText.textContent = isCfg ? `Firebase: ${window.FirebaseService.loadConfig().projectId}` : 'Firebase: Configure Cloud Database';
        }

        if (user) {
          authScreen?.classList.add('hidden');
          const nameEl = document.getElementById('userDisplayName');
          const emailEl = document.getElementById('userDisplayEmail');
          const avatarEl = document.getElementById('userAvatar');

          const name = user.displayName || user.email.split('@')[0];
          if (nameEl) nameEl.textContent = name;
          if (emailEl) emailEl.textContent = user.email;
          if (avatarEl) {
            const initials = name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
            avatarEl.textContent = initials || 'WZ';
          }

          // Hydrate cloud state if ready
          if (isReady) {
            window.FirebaseService.loadStateFromCloud().then(cloudState => {
              if (cloudState && (cloudState.clients?.length > 0 || cloudState.tickets?.length > 0)) {
                state = cloudState;
                savePsaState(state);
                renderAll();
              }
            });

            window.FirebaseService.subscribeToCloudState(cloudState => {
              if (cloudState) {
                state = cloudState;
                savePsaState(state);
                renderAll();
              }
            });
          }
        } else {
          authScreen?.classList.remove('hidden');
        }
      });
    }
  }

  window.switchTab = switchTab;
  window.openClientProfile = openClientProfile;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
