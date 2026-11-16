/**
 * Employee Management Dashboard
 * -------------------------------------------------------------
 * Dynamic XML Fetching, DOMParser Parsing, KPI Calculation,
 * Multi-criteria Filtering, Real-time Search, and Sorting.
 */

// Application State
const appState = {
  allEmployees: [],       // Raw data extracted from XML
  filteredEmployees: [],  // Current working set after search/filters
  sortField: 'name',      // Active sort column
  sortDirection: 'asc',   // 'asc' | 'desc'
  isLoading: false,
  xmlUrl: 'employees.xml'
};

// DOM Element References
const DOM = {
  // Navigation & Actions
  refreshBtn: document.getElementById('refreshBtn'),
  lastUpdatedTime: document.getElementById('lastUpdatedTime'),
  xmlSourceStatus: document.getElementById('xmlSourceStatus'),

  // KPI Metrics
  kpiTotalEmployees: document.getElementById('kpiTotalEmployees'),
  kpiActiveEmployees: document.getElementById('kpiActiveEmployees'),
  kpiActivePercent: document.getElementById('kpiActivePercent'),
  kpiInactiveEmployees: document.getElementById('kpiInactiveEmployees'),
  kpiInactivePercent: document.getElementById('kpiInactivePercent'),
  kpiTotalDepartments: document.getElementById('kpiTotalDepartments'),
  kpiAvgSalary: document.getElementById('kpiAvgSalary'),

  // Filters & Controls
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  deptFilter: document.getElementById('deptFilter'),
  statusFilter: document.getElementById('statusFilter'),
  sortBySelect: document.getElementById('sortBySelect'),
  resetFiltersBtn: document.getElementById('resetFiltersBtn'),

  // Meta & Status
  recordsCount: document.getElementById('recordsCount'),
  filterIndicator: document.getElementById('filterIndicator'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  errorContainer: document.getElementById('errorContainer'),
  errorTitle: document.getElementById('errorTitle'),
  errorMessage: document.getElementById('errorMessage'),
  retryBtn: document.getElementById('retryBtn'),
  emptyState: document.getElementById('emptyState'),
  emptyResetBtn: document.getElementById('emptyResetBtn'),

  // Table
  tableWrapper: document.getElementById('tableWrapper'),
  tableBody: document.getElementById('employeeTableBody'),
  sortableHeaders: document.querySelectorAll('.sortable-th')
};

/**
 * Initialize Application
 */
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadEmployeeData();
});

/**
 * Attach Event Listeners to UI Elements
 */
function setupEventListeners() {
  // Refresh button
  DOM.refreshBtn.addEventListener('click', () => {
    spinRefreshIcon(true);
    loadEmployeeData().finally(() => {
      setTimeout(() => spinRefreshIcon(false), 500);
    });
  });

  // Retry button in error alert
  DOM.retryBtn.addEventListener('click', () => {
    loadEmployeeData();
  });

  // Search input with live debouncing/instant response
  DOM.searchInput.addEventListener('input', (e) => {
    DOM.clearSearchBtn.style.display = e.target.value.trim() ? 'block' : 'none';
    applyFiltersAndSort();
  });

  // Clear search button
  DOM.clearSearchBtn.addEventListener('click', () => {
    DOM.searchInput.value = '';
    DOM.clearSearchBtn.style.display = 'none';
    DOM.searchInput.focus();
    applyFiltersAndSort();
  });

  // Department filter
  DOM.deptFilter.addEventListener('change', () => {
    applyFiltersAndSort();
  });

  // Status filter
  DOM.statusFilter.addEventListener('change', () => {
    applyFiltersAndSort();
  });

  // Sort dropdown
  DOM.sortBySelect.addEventListener('change', (e) => {
    const [field, direction] = e.target.value.split('-');
    appState.sortField = field;
    appState.sortDirection = direction;
    updateHeaderSortIcons();
    sortAndRenderTable();
  });

  // Table header click for sorting
  DOM.sortableHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const field = th.getAttribute('data-sort');
      if (appState.sortField === field) {
        // Toggle direction
        appState.sortDirection = appState.sortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        appState.sortField = field;
        appState.sortDirection = 'asc';
      }
      syncSortDropdown();
      updateHeaderSortIcons();
      sortAndRenderTable();
    });
  });

  // Reset filters buttons
  DOM.resetFiltersBtn.addEventListener('click', resetAllFilters);
  DOM.emptyResetBtn.addEventListener('click', resetAllFilters);
}

/**
 * Main Data Loader:
 * Uses Fetch API to retrieve the external XML file and DOMParser API to parse it.
 */
async function loadEmployeeData() {
  setLoadingState(true);
  hideError();

  try {
    // 1. Fetch XML via Fetch API with cache busting parameter
    const timestamp = Date.now();
    const response = await fetch(`${appState.xmlUrl}?_nocache=${timestamp}`);

    if (!response.ok) {
      throw new Error(
        `HTTP Error ${response.status} (${response.statusText || 'Not Found'}): ` +
        `Unable to retrieve "${appState.xmlUrl}". Please verify the file path and ensure you are serving via a web server (e.g. VS Code Live Server).`
      );
    }

    const xmlText = await response.text();

    if (!xmlText || !xmlText.trim()) {
      throw new Error(`The retrieved XML file "${appState.xmlUrl}" is completely empty.`);
    }

    // 2. Parse XML using JavaScript DOMParser API
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

    // 3. Inspect XML for syntax / parser errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML Syntax Error: ${parserError.textContent.trim()}`);
    }

    // 4. Extract employee nodes
    const employeeNodes = xmlDoc.querySelectorAll('employee');
    if (!employeeNodes || employeeNodes.length === 0) {
      throw new Error(`The XML document was parsed successfully, but no <employee> elements were found.`);
    }

    // 5. Parse nodes into JavaScript Object Array
    appState.allEmployees = Array.from(employeeNodes).map(node => extractEmployeeRecord(node));

    // 6. Populate Dynamic UI Controls & Calculate Metrics
    populateDepartmentOptions();
    calculateAndDisplayKPIs();
    updateLastSyncedTime();

    // 7. Render initial data
    applyFiltersAndSort();

  } catch (error) {
    console.error('Error fetching/parsing XML:', error);
    showError(error);
  } finally {
    setLoadingState(false);
  }
}

/**
 * Extracts individual employee fields from an <employee> XML node.
 * Includes fallback values to ensure robust rendering.
 */
function extractEmployeeRecord(node) {
  const getText = (selector, fallback = '') => {
    const el = node.querySelector(selector);
    return el && el.textContent ? el.textContent.trim() : fallback;
  };

  const rawSalary = getText('salary', '0');
  const numericSalary = parseFloat(rawSalary.replace(/[^0-9.-]+/g, '')) || 0;

  return {
    id: getText('id', 'N/A'),
    name: getText('name', 'Unknown'),
    department: getText('department', 'General'),
    designation: getText('designation', 'Staff'),
    email: getText('email', ''),
    phone: getText('phone', ''),
    salary: numericSalary,
    joiningDate: getText('joiningDate', ''),
    status: getText('status', 'Inactive')
  };
}

/**
 * Calculate and dynamically display Dashboard Summary Cards (KPIs)
 */
function calculateAndDisplayKPIs() {
  const employees = appState.allEmployees;
  const total = employees.length;

  const activeEmployees = employees.filter(e => e.status.toLowerCase() === 'active');
  const inactiveEmployees = employees.filter(e => e.status.toLowerCase() === 'inactive');

  const activeCount = activeEmployees.length;
  const inactiveCount = inactiveEmployees.length;

  // Unique departments count
  const departments = new Set(employees.map(e => e.department.trim()));
  const deptCount = departments.size;

  // Average Salary calculation
  const totalSalary = employees.reduce((sum, e) => sum + e.salary, 0);
  const avgSalary = total > 0 ? totalSalary / total : 0;

  // Render to DOM
  DOM.kpiTotalEmployees.textContent = total;
  DOM.kpiActiveEmployees.textContent = activeCount;
  DOM.kpiActivePercent.textContent = total > 0 ? `${Math.round((activeCount / total) * 100)}%` : '0%';

  DOM.kpiInactiveEmployees.textContent = inactiveCount;
  DOM.kpiInactivePercent.textContent = total > 0 ? `${Math.round((inactiveCount / total) * 100)}%` : '0%';

  DOM.kpiTotalDepartments.textContent = deptCount;
  DOM.kpiAvgSalary.textContent = formatCurrency(avgSalary);
}

/**
 * Populate Department Filter options dynamically from XML records
 */
function populateDepartmentOptions() {
  const currentDeptSelection = DOM.deptFilter.value;
  const departments = [...new Set(appState.allEmployees.map(e => e.department.trim()))].sort();

  // Clear previous options except "All Departments"
  DOM.deptFilter.innerHTML = '<option value="ALL">All Departments</option>';

  departments.forEach(dept => {
    const option = document.createElement('option');
    option.value = dept;
    option.textContent = dept;
    DOM.deptFilter.appendChild(option);
  });

  // Restore previous selection if still valid
  if (departments.includes(currentDeptSelection)) {
    DOM.deptFilter.value = currentDeptSelection;
  }
}

/**
 * Multi-criteria Filtering & Search Execution
 */
function applyFiltersAndSort() {
  const searchQuery = DOM.searchInput.value.trim().toLowerCase();
  const selectedDept = DOM.deptFilter.value;
  const selectedStatus = DOM.statusFilter.value;

  // Filter records
  appState.filteredEmployees = appState.allEmployees.filter(emp => {
    // 1. Search Query (Employee ID, Name, Department, Designation)
    const matchesSearch = !searchQuery || (
      emp.id.toLowerCase().includes(searchQuery) ||
      emp.name.toLowerCase().includes(searchQuery) ||
      emp.department.toLowerCase().includes(searchQuery) ||
      emp.designation.toLowerCase().includes(searchQuery)
    );

    // 2. Department Filter
    const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept;

    // 3. Status Filter
    const matchesStatus = selectedStatus === 'ALL' || emp.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesDept && matchesStatus;
  });

  // Update records count & filter indicators
  DOM.recordsCount.textContent = appState.filteredEmployees.length;
  const hasActiveFilters = searchQuery !== '' || selectedDept !== 'ALL' || selectedStatus !== 'ALL';
  DOM.filterIndicator.style.display = hasActiveFilters ? 'inline' : 'none';

  // Proceed with sorting and rendering
  sortAndRenderTable();
}

/**
 * Sorts filtered records and builds dynamic table rows
 */
function sortAndRenderTable() {
  const { sortField, sortDirection } = appState;

  // Sorting comparator
  appState.filteredEmployees.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'salary') {
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    }

    if (sortField === 'joiningDate') {
      const dateA = new Date(valA).getTime() || 0;
      const dateB = new Date(valB).getTime() || 0;
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    }

    // Default string comparison (ID, Name, Department, Status)
    valA = (valA || '').toString().toLowerCase();
    valB = (valB || '').toString().toLowerCase();

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  renderTableDOM();
}

/**
 * Dynamically Generates HTML Table Rows using DOM Manipulation
 */
function renderTableDOM() {
  const records = appState.filteredEmployees;

  // Check empty state
  if (records.length === 0) {
    DOM.tableWrapper.style.display = 'none';
    DOM.emptyState.style.display = 'flex';
    return;
  }

  DOM.emptyState.style.display = 'none';
  DOM.tableWrapper.style.display = 'block';

  // Clear existing rows
  DOM.tableBody.innerHTML = '';

  // DocumentFragment for optimal batch DOM insertion
  const fragment = document.createDocumentFragment();

  records.forEach(emp => {
    const tr = document.createElement('tr');

    // 1. Employee ID
    const tdId = document.createElement('td');
    const idBadge = document.createElement('span');
    idBadge.className = 'emp-id-cell';
    idBadge.textContent = emp.id;
    tdId.appendChild(idBadge);
    tr.appendChild(tdId);

    // 2. Name with Avatar Initials
    const tdName = document.createElement('td');
    const nameContainer = document.createElement('div');
    nameContainer.className = 'emp-name-cell';

    const avatar = document.createElement('div');
    avatar.className = 'avatar-circle';
    avatar.textContent = getInitials(emp.name);

    const nameText = document.createElement('span');
    nameText.className = 'emp-name-text';
    nameText.textContent = emp.name;

    nameContainer.appendChild(avatar);
    nameContainer.appendChild(nameText);
    tdName.appendChild(nameContainer);
    tr.appendChild(tdName);

    // 3. Department Pill
    const tdDept = document.createElement('td');
    const deptPill = document.createElement('span');
    deptPill.className = `dept-pill ${getDeptClass(emp.department)}`;
    deptPill.textContent = emp.department;
    tdDept.appendChild(deptPill);
    tr.appendChild(tdDept);

    // 4. Designation
    const tdDesig = document.createElement('td');
    tdDesig.className = 'emp-designation-text';
    tdDesig.textContent = emp.designation;
    tr.appendChild(tdDesig);

    // 5. Email Address Link
    const tdEmail = document.createElement('td');
    if (emp.email) {
      const emailLink = document.createElement('a');
      emailLink.className = 'contact-link';
      emailLink.href = `mailto:${emp.email}`;
      emailLink.textContent = emp.email;
      tdEmail.appendChild(emailLink);
    } else {
      tdEmail.textContent = '—';
    }
    tr.appendChild(tdEmail);

    // 6. Phone Number Link
    const tdPhone = document.createElement('td');
    if (emp.phone) {
      const phoneLink = document.createElement('a');
      phoneLink.className = 'contact-link';
      phoneLink.href = `tel:${emp.phone.replace(/[^0-9+]/g, '')}`;
      phoneLink.textContent = emp.phone;
      tdPhone.appendChild(phoneLink);
    } else {
      tdPhone.textContent = '—';
    }
    tr.appendChild(tdPhone);

    // 7. Salary
    const tdSalary = document.createElement('td');
    tdSalary.className = 'salary-cell';
    tdSalary.textContent = formatCurrency(emp.salary);
    tr.appendChild(tdSalary);

    // 8. Joining Date
    const tdDate = document.createElement('td');
    tdDate.className = 'date-cell';
    tdDate.textContent = formatDate(emp.joiningDate);
    tr.appendChild(tdDate);

    // 9. Status Badge
    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    const isActive = emp.status.toLowerCase() === 'active';
    statusBadge.className = `status-badge ${isActive ? 'status-active' : 'status-inactive'}`;

    const dot = document.createElement('span');
    dot.className = 'indicator-dot';

    const statusText = document.createTextNode(emp.status);
    statusBadge.appendChild(dot);
    statusBadge.appendChild(statusText);
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    fragment.appendChild(tr);
  });

  DOM.tableBody.appendChild(fragment);
}

/**
 * Reset all filter inputs to default
 */
function resetAllFilters() {
  DOM.searchInput.value = '';
  DOM.clearSearchBtn.style.display = 'none';
  DOM.deptFilter.value = 'ALL';
  DOM.statusFilter.value = 'ALL';
  DOM.sortBySelect.value = 'name-asc';

  appState.sortField = 'name';
  appState.sortDirection = 'asc';

  updateHeaderSortIcons();
  applyFiltersAndSort();
}

/**
 * Synchronize sorting indicators on table headers (▲ / ▼ / ↕)
 */
function updateHeaderSortIcons() {
  DOM.sortableHeaders.forEach(th => {
    const field = th.getAttribute('data-sort');
    const iconEl = th.querySelector('.sort-icon');
    if (!iconEl) return;

    if (field === appState.sortField) {
      if (appState.sortDirection === 'asc') {
        iconEl.textContent = '▲';
        iconEl.className = 'sort-icon sorted-asc';
      } else {
        iconEl.textContent = '▼';
        iconEl.className = 'sort-icon sorted-desc';
      }
    } else {
      iconEl.textContent = '↕';
      iconEl.className = 'sort-icon';
    }
  });
}

/**
 * Sync dropdown selection when user clicks a table header
 */
function syncSortDropdown() {
  const desiredValue = `${appState.sortField}-${appState.sortDirection}`;
  const options = Array.from(DOM.sortBySelect.options).map(o => o.value);
  if (options.includes(desiredValue)) {
    DOM.sortBySelect.value = desiredValue;
  }
}

/**
 * Helper: Formats numbers as USD Currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Helper: Formats YYYY-MM-DD to human-readable date e.g. "Mar 15, 2021"
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return dateStr;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC' // Prevent offset day shift on pure dates
  }).format(parsed);
}

/**
 * Helper: Extracts initials from a full name (e.g. "Sarah Jenkins" -> "SJ")
 */
function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Helper: Returns a CSS class for distinct department chip colors
 */
function getDeptClass(department) {
  if (!department) return 'dept-default';
  const clean = department.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `dept-${clean}`;
}

/**
 * UI Loading State Manager
 */
function setLoadingState(isLoading) {
  appState.isLoading = isLoading;
  DOM.loadingIndicator.style.display = isLoading ? 'flex' : 'none';
  if (isLoading) {
    DOM.tableWrapper.style.opacity = '0.4';
    DOM.tableWrapper.style.pointerEvents = 'none';
  } else {
    DOM.tableWrapper.style.opacity = '1';
    DOM.tableWrapper.style.pointerEvents = 'auto';
  }
}

/**
 * Display User-Friendly Error Messages
 */
function showError(error) {
  DOM.tableWrapper.style.display = 'none';
  DOM.emptyState.style.display = 'none';
  DOM.errorContainer.style.display = 'flex';

  let title = 'XML Data Retrieval Error';
  let message = error.message;

  // Specific check for file protocol / CORS warning
  if (window.location.protocol === 'file:') {
    title = 'CORS Policy Restriction Detected';
    message = `Browsers restrict Fetch API requests when opening files directly using "file://". Please launch this project using a local web server such as VS Code "Live Server" (e.g., http://127.0.0.1:5500/).\n\nTechnical details: ${error.message}`;
  }

  DOM.errorTitle.textContent = title;
  DOM.errorMessage.textContent = message;
}

/**
 * Hide Error Banner
 */
function hideError() {
  DOM.errorContainer.style.display = 'none';
}

/**
 * Refresh Icon Animation
 */
function spinRefreshIcon(start) {
  const icon = DOM.refreshBtn.querySelector('.btn-icon');
  if (!icon) return;
  if (start) {
    icon.classList.add('spinning');
  } else {
    icon.classList.remove('spinning');
  }
}

/**
 * Update Last Synced Timestamp
 */
function updateLastSyncedTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  DOM.lastUpdatedTime.textContent = `Last sync: ${timeStr}`;
}
