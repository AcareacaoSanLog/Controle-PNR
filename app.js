(function () {
  const STORAGE_KEY = "pnr-txf-dashboard-state-v1";
  const SETTINGS_KEY = "pnr-txf-dashboard-settings-v1";
  const AUTH_DAY_KEY = "pnr-txf-dashboard-auth-day-v1";
  const BILLING_MIGRATION_KEY = "pnr-txf-legacy-billing-migration-v1";
  const CLOUD_TABLE = "pnr_dashboard_state";
  const CLOUD_ID = "xpt-ba-teixeira-03";
  const BASE_NAME = "XPT_BA_Teixeira de Freitas_03";
  const SUPABASE_URL = "https://enhvhetmxuebgcrflhko.supabase.co";
  const SUPABASE_PUBLIC_KEY = "sb_publishable_LiUb2xFvOilmmY9WIOoL_Q_6s04IcL3";

  const columnHints = {
    br: ["spxtn", "shipment_id", "shipment id", "tn", "tracking", "numero de rastreamento", "número de rastreamento", "br"],
    driver: ["driver", "entregador", "motorista"],
    station: ["station", "base", "xpt"],
    sla: ["sla deadline", "deadline", "prazo", "sla"],
    reason: ["rejection reason", "motivo", "reason", "pnr reason"],
    created: ["created time", "data de criação", "data de criacao", "created"],
    status: ["status", "situação", "situacao"],
    ticketIhs: ["ihs ticket id", "id do ticket ihs", "ticket ihs", "id ticket ihs", "ihs id", "ticket id", "id ticket", "ticket"]
  };

  const state = {
    rows: [],
    sourceRows: [],
    treatments: {},
    assignedOverrides: {},
    ticketIhsByBr: {},
    imports: [],
    filters: { search: "", situation: [], status: [], reason: [], driver: [], day: [], group: "" },
    modal: { status: "", driver: "", sort: "default", search: "" },
    overviewDetail: "",
    overviewModal: { status: [], driver: [], situation: [], reason: [], sort: "default", search: "" },
    duplicates: { categories: [], statuses: [], drivers: [], search: "", group: "" },
    reports: { types: [], days: [], drivers: [], treatments: [], search: "" },
    panel: "overview",
    settings: loadJson(SETTINGS_KEY, {})
  };

  let treatmentCloudTimer = null;
  let assignedSlaPrintDate = "";
  let reportsSlaPrintDate = "";
  let currentCloudSession = null;
  let pendingCloudLogin = null;
  let cloudAutoLoadPromise = null;

  const situationOptions = [
    { value: "pending", label: "Pendentes" },
    { value: "in_progress", label: "Em tratativa" },
    { value: "treated", label: "Tratadas" },
    { value: "resolved", label: "Resolvidas" },
    { value: "duplicate", label: "Duplicadas" },
    { value: "history", label: "Com histórico" }
  ];

  const statusPanelMap = {
    created: "Criado",
    analysis: "Em análise",
    reverted: "Revertido",
    billingForms: "Faturamento",
    billing: "Faturamento"
  };

  const legacyCreatedByFile = {
    "pnr_station_tickert_2026-08-09-00-15-13.csv": new Set([
      "BR2676246950744",
      "BR265466355597F"
    ])
  };

  function statusPanelStatus(panel = state.panel) {
    return statusPanelMap[panel] || "";
  }

  function isAssignedPanel(panel = state.panel) {
    return panel === "assigned";
  }

  function showDayFilterPanel(panel = state.panel) {
    return panel === "created" || panel === "assigned" || panel === "analysis" || panel === "reverted" || panel === "billingForms" || panel === "billing";
  }

  function panelElementId(panel = state.panel) {
    if (isAssignedPanel(panel)) return "worklist";
    return statusPanelStatus(panel) ? "worklist" : panel;
  }

  function isWorklistPanel(panel = state.panel) {
    return panel === "worklist" || isAssignedPanel(panel) || Boolean(statusPanelStatus(panel));
  }

  const els = {
    fileInput: document.getElementById("fileInput"),
    syncLine: document.getElementById("syncLine"),
    sideTotal: document.getElementById("sideTotal"),
    sideSaved: document.getElementById("sideSaved"),
    panelTitle: document.getElementById("panelTitle"),
    panelSummary: document.getElementById("panelSummary"),
    kpis: document.getElementById("kpis"),
    overviewTreatmentRate: document.getElementById("overviewTreatmentRate"),
    overviewTreatmentText: document.getElementById("overviewTreatmentText"),
    funnelSteps: document.getElementById("funnelSteps"),
    deadlineCards: document.getElementById("deadlineCards"),
    statusDonut: document.getElementById("statusDonut"),
    focusPending: document.getElementById("focusPending"),
    focusPendingText: document.getElementById("focusPendingText"),
    focusResolved: document.getElementById("focusResolved"),
    focusResolvedText: document.getElementById("focusResolvedText"),
    focusKnown: document.getElementById("focusKnown"),
    focusKnownText: document.getElementById("focusKnownText"),
    overviewDrilldown: document.getElementById("overviewDrilldown"),
    overviewDrillTitle: document.getElementById("overviewDrillTitle"),
    overviewDrillCount: document.getElementById("overviewDrillCount"),
    overviewDrillBody: document.getElementById("overviewDrillBody"),
    overviewDrillCloseBtn: document.getElementById("overviewDrillCloseBtn"),
    overviewStatusFilter: document.getElementById("overviewStatusFilter"),
    overviewDriverFilter: document.getElementById("overviewDriverFilter"),
    overviewSituationFilter: document.getElementById("overviewSituationFilter"),
    overviewReasonFilter: document.getElementById("overviewReasonFilter"),
    overviewSortFilter: document.getElementById("overviewSortFilter"),
    overviewSearch: document.getElementById("overviewSearch"),
    overviewClearFiltersBtn: document.getElementById("overviewClearFiltersBtn"),
    statusBars: document.getElementById("statusBars"),
    reasonBars: document.getElementById("reasonBars"),
    driverRanking: document.getElementById("driverRanking"),
    treatmentCloudCard: document.getElementById("treatmentCloudCard"),
    searchInput: document.getElementById("searchInput"),
    situationFilter: document.getElementById("situationFilter"),
    driverFilter: document.getElementById("driverFilter"),
    statusFilter: document.getElementById("statusFilter"),
    reasonFilter: document.getElementById("reasonFilter"),
    dayFilter: document.getElementById("dayFilter"),
    assignCreatedBtn: document.getElementById("assignCreatedBtn"),
    treatmentGroupsHead: document.getElementById("treatmentGroupsHead"),
    treatmentGroupsBody: document.getElementById("treatmentGroupsBody"),
    detailModal: document.getElementById("detailModal"),
    detailModalTitle: document.getElementById("detailModalTitle"),
    detailModalCount: document.getElementById("detailModalCount"),
    detailModalCloseBtn: document.getElementById("detailModalCloseBtn"),
    modalStatusFilter: document.getElementById("modalStatusFilter"),
    modalDriverFilter: document.getElementById("modalDriverFilter"),
    modalSortFilter: document.getElementById("modalSortFilter"),
    modalSearch: document.getElementById("modalSearch"),
    modalClearFiltersBtn: document.getElementById("modalClearFiltersBtn"),
    clearFiltersBtn: document.getElementById("clearFiltersBtn"),
    detailTableHead: document.getElementById("detailTableHead"),
    rowsBody: document.getElementById("rowsBody"),
    historyBody: document.getElementById("historyBody"),
    duplicateSummaryCards: document.getElementById("duplicateSummaryCards"),
    duplicateCategoryFilter: document.getElementById("duplicateCategoryFilter"),
    duplicateStatusFilter: document.getElementById("duplicateStatusFilter"),
    duplicateDriverFilter: document.getElementById("duplicateDriverFilter"),
    duplicateSearch: document.getElementById("duplicateSearch"),
    clearDuplicateFiltersBtn: document.getElementById("clearDuplicateFiltersBtn"),
    duplicateRowsCount: document.getElementById("duplicateRowsCount"),
    duplicateBody: document.getElementById("duplicateBody"),
    managerDate: document.getElementById("managerDate"),
    managerMessage: document.getElementById("managerMessage"),
    managerStats: document.getElementById("managerStats"),
    managerRanking: document.getElementById("managerRanking"),
    reportsTypeFilter: document.getElementById("reportsTypeFilter"),
    reportsDayFilter: document.getElementById("reportsDayFilter"),
    reportsDriverFilter: document.getElementById("reportsDriverFilter"),
    reportsTreatmentFilter: document.getElementById("reportsTreatmentFilter"),
    reportsSearch: document.getElementById("reportsSearch"),
    clearReportsBtn: document.getElementById("clearReportsBtn"),
    copyReportsBtn: document.getElementById("copyReportsBtn"),
    reportsKpis: document.getElementById("reportsKpis"),
    reportsDriverCount: document.getElementById("reportsDriverCount"),
    reportsRowsCount: document.getElementById("reportsRowsCount"),
    reportsRanking: document.getElementById("reportsRanking"),
    reportsBody: document.getElementById("reportsBody"),
    reportsSlaPrintDate: document.getElementById("reportsSlaPrintDate"),
    applyReportsSlaPrintBtn: document.getElementById("applyReportsSlaPrintBtn"),
    resetReportsSlaPrintBtn: document.getElementById("resetReportsSlaPrintBtn"),
    reportsSlaPrintStatus: document.getElementById("reportsSlaPrintStatus"),
    copyManagerMessageBtn: document.getElementById("copyManagerMessageBtn"),
    assignedSlaPrintDate: document.getElementById("assignedSlaPrintDate"),
    applyAssignedSlaPrintBtn: document.getElementById("applyAssignedSlaPrintBtn"),
    resetAssignedSlaPrintBtn: document.getElementById("resetAssignedSlaPrintBtn"),
    assignedSlaPrintStatus: document.getElementById("assignedSlaPrintStatus"),
    exportViewBtn: document.getElementById("exportViewBtn"),
    exportFormsBtn: document.getElementById("exportFormsBtn"),
    exportBillingPnrBtn: document.getElementById("exportBillingPnrBtn"),
    exportTreatmentsBtn: document.getElementById("exportTreatmentsBtn"),
    exportTreatmentsWorklistBtn: document.getElementById("exportTreatmentsWorklistBtn"),
    saveCloudBtn: document.getElementById("saveCloudBtn"),
    loadCloudBtn: document.getElementById("loadCloudBtn"),
    supabaseUrl: document.getElementById("supabaseUrl"),
    supabaseKey: document.getElementById("supabaseKey"),
    authEmail: document.getElementById("authEmail"),
    authPassword: document.getElementById("authPassword"),
    cloudImportTreatmentsBtn: document.getElementById("cloudImportTreatmentsBtn"),
    treatmentsFileInput: document.getElementById("treatmentsFileInput"),
    cloudSyncTreatmentsBtn: document.getElementById("cloudSyncTreatmentsBtn"),
    cloudManualBr: document.getElementById("cloudManualBr"),
    cloudManualTreatment: document.getElementById("cloudManualTreatment"),
    cloudManualSaveBtn: document.getElementById("cloudManualSaveBtn"),
    cloudAuthDialog: document.getElementById("cloudAuthDialog"),
    cloudAuthForm: document.getElementById("cloudAuthForm"),
    cloudAuthEmail: document.getElementById("cloudAuthEmail"),
    cloudAuthPassword: document.getElementById("cloudAuthPassword"),
    cloudAuthCancelBtn: document.getElementById("cloudAuthCancelBtn"),
    cloudAuthMessage: document.getElementById("cloudAuthMessage"),
    saveSettingsBtn: document.getElementById("saveSettingsBtn"),
    loginBtn: document.getElementById("loginBtn"),
    logoutBtn: document.getElementById("logoutBtn"),
    exportBackupBtn: document.getElementById("exportBackupBtn"),
    restoreBackupInput: document.getElementById("restoreBackupInput")
  };

  function clean(value) {
    return String(value ?? "").trim();
  }

  function lower(value) {
    return clean(value).toLocaleLowerCase("pt-BR");
  }

  function normalizedHeader(value) {
    return lower(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function html(value) {
    return clean(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || "") || fallback;
    } catch {
      return fallback;
    }
  }

  function saveLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      rows: state.rows,
      treatments: state.treatments,
      assignedOverrides: state.assignedOverrides,
      ticketIhsByBr: state.ticketIhsByBr,
      imports: state.imports.slice(0, 40)
    }));
  }

  function dashboardPayload() {
    rebuildTicketIhsMemory();
    return {
      app: "DASHBOARD_PNR_TXF",
      version: 2,
      base: BASE_NAME,
      exportedAt: new Date().toISOString(),
      rows: state.rows,
      treatments: state.treatments,
      assignedOverrides: state.assignedOverrides,
      ticketIhsByBr: state.ticketIhsByBr,
      imports: state.imports
    };
  }

  function applyDashboardPayload(payload) {
    if (!payload || payload.app !== "DASHBOARD_PNR_TXF") throw new Error("Este arquivo não ? um backup do Dashboard PNR.");
    if (!Array.isArray(payload.rows)) throw new Error("Backup inválido: lista de PNRs ausente.");
    state.rows = payload.rows;
    state.treatments = payload.treatments && typeof payload.treatments === "object" ? payload.treatments : {};
    state.assignedOverrides = payload.assignedOverrides && typeof payload.assignedOverrides === "object" ? payload.assignedOverrides : {};
    state.ticketIhsByBr = payload.ticketIhsByBr && typeof payload.ticketIhsByBr === "object" ? payload.ticketIhsByBr : {};
    state.imports = Array.isArray(payload.imports) ? payload.imports : [];
    rebuildTicketIhsMemory();
    hydrateRowsWithLegacyMigration();
    saveLocal();
    renderAll();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportBackup() {
    const payload = dashboardPayload();
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(new Blob([json], { type: "application/json;charset=utf-8" }), `backup-dashboard-pnr-${localDateInput(new Date())}.json`);
    setSync(`Backup completo gerado com ${countFormat(payload.rows.length)} PNRs e ${countFormat(Object.keys(payload.treatments).length)} tratativas.`, "ok");
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      applyDashboardPayload(payload);
      setSync(`Backup restaurado: ${countFormat(state.rows.length)} PNRs carregadas.`, "ok");
    } catch (error) {
      setSync(`Erro ao restaurar backup: ${error.message || error}`, "error");
    } finally {
      if (els.restoreBackupInput) els.restoreBackupInput.value = "";
    }
  }

  function restoreLocal() {
    const saved = loadJson(STORAGE_KEY, null);
    if (!saved) return;
    state.rows = Array.isArray(saved.rows) ? saved.rows : [];
    state.treatments = saved.treatments || {};
    state.assignedOverrides = saved.assignedOverrides || {};
    state.ticketIhsByBr = saved.ticketIhsByBr || {};
    state.rows.forEach(row => {
      if (row.assignedAt || (row.wasCreated && hasAssignedDriver(row))) {
        state.assignedOverrides[normalizeKey(row.br)] = row.assignedAt || new Date().toISOString();
      }
    });
    rebuildTicketIhsMemory();
    state.imports = Array.isArray(saved.imports) ? saved.imports : [];
    hydrateRowsWithLegacyMigration();
  }

  function countFormat(value) {
    return new Intl.NumberFormat("pt-BR").format(Number(value || 0));
  }

  function dateLabel(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }

  function dateRank(value) {
    const raw = clean(value);
    if (!raw) return Number.POSITIVE_INFINITY;
    const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (brDate) {
      const [, day, month, year, hour, minute, second = "0"] = brDate;
      return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime();
    }
    const parsed = new Date(raw.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
  }

  function earliestDate(current, candidate) {
    if (!clean(current)) return clean(candidate);
    if (!clean(candidate)) return clean(current);
    return dateRank(candidate) < dateRank(current) ? clean(candidate) : clean(current);
  }

  function dateOnlyLabel(value, fallback) {
    const raw = clean(value);
    if (!raw) return fallback;
    const brDate = raw.match(/^(\d{2}\/\d{2}\/\d{4})/);
    if (brDate) return brDate[1];
    const parsed = new Date(raw.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString("pt-BR");
    return raw;
  }

  function rowCreatedDay(row) {
    return dateOnlyLabel(row.created, "");
  }

  function dayRank(value) {
    const raw = clean(value);
    const brDate = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!brDate) return dateRank(raw);
    const [, day, month, year] = brDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }

  function excelSerialToDate(value) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1) return null;
    const wholeDays = Math.floor(serial);
    const fraction = serial - wholeDays;
    const utcMs = Date.UTC(1899, 11, 30) + wholeDays * 86400000 + Math.round(fraction * 86400000);
    const excelDate = new Date(utcMs);
    return new Date(
      excelDate.getUTCFullYear(),
      excelDate.getUTCMonth(),
      excelDate.getUTCDate(),
      excelDate.getUTCHours(),
      excelDate.getUTCMinutes(),
      excelDate.getUTCSeconds()
    );
  }

  function formatSheetDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
    }
    const raw = clean(value);
    if (!raw) return "";
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const serialDate = excelSerialToDate(raw);
      if (serialDate) return serialDate.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
    }
    const parsed = new Date(raw.replace(" ", "T"));
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
    return raw;
  }

  function normalizeKey(value) {
    return clean(value).toUpperCase();
  }

  function detectColumn(headers, kind) {
    const hints = columnHints[kind] || [];
    const normalized = headers.map(header => ({ raw: header, value: normalizedHeader(header) }));
    for (const hint of hints) {
      const normalizedHint = normalizedHeader(hint);
      const hit = normalized.find(item => item.value === normalizedHint);
      if (hit) return hit.raw;
    }
    for (const hint of hints) {
      const normalizedHint = normalizedHeader(hint);
      const hit = normalized.find(item => item.value.includes(normalizedHint));
      if (hit) return hit.raw;
    }
    return "";
  }

  function originalColumns(row, headers) {
    return Object.fromEntries(headers.map(header => [header, clean(row[header])]));
  }

  function ticketIhsFromOriginal(row) {
    if (clean(row.ticketIhs)) return clean(row.ticketIhs);
    const original = row.originalColumns || {};
    const exact = original["IHS Ticket ID"] || original["ID do ticket IHS"];
    if (clean(exact)) return clean(exact);
    const hitKey = Object.keys(original).find(key => {
      const header = normalizedHeader(key);
      return header === "ihs ticket id" || header.includes("ihs ticket") || header.includes("ticket ihs");
    });
    if (hitKey && clean(original[hitKey])) return clean(original[hitKey]);
    return state.ticketIhsByBr?.[normalizeKey(row.br)] || "";
  }

  function rebuildTicketIhsMemory() {
    const next = {};
    state.rows.forEach(row => {
      const key = normalizeKey(row.br);
      const ticket = ticketIhsFromOriginal({ ...row, ticketIhs: row.ticketIhs || "", originalColumns: row.originalColumns || {} });
      if (key && ticket) next[key] = ticket;
    });
    state.ticketIhsByBr = next;
    state.rows = state.rows.map(row => ({
      ...row,
      ticketIhs: ticketIhsFromOriginal(row)
    }));
  }

  function normalizeStatus(status) {
    const value = clean(status) || "Sem status";
    const normalized = lower(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (normalized === "created") return "Criado";
    if (normalized === "reversed") return "Revertido";
    if (normalized === "forbilling" || normalized === "for billing") return "Faturamento";
    if (normalized === "reviewing" || normalized === "revisao" || normalized === "em analise") return "Em análise";
    if (normalized === "late reply" || normalized === "latereply") return "Resposta fora do prazo";
    if (normalized === "assigned") return "Atribu\u00edda";
    return value;
  }

  function normalizeRowStatus(row) {
    const status = normalizeStatus(row.rawStatus || row.status);
    if (status === "Criado" && state.assignedOverrides?.[normalizeKey(row.br)]) return "Atribuída";
    if (row.rawStatus || status !== "Criado") return status;
    const fileName = clean(row.file).split("/").pop();
    const createdBrs = legacyCreatedByFile[fileName];
    if (createdBrs && !createdBrs.has(normalizeKey(row.br))) return "Atribu\u00edda";
    return status;
  }

  function normalizeReason(reason) {
    const value = (clean(reason) || "Sem motivo").replace(/^\s*\[?\s*evidence\s*\]?\s*/i, "").trim() || "Sem motivo";
    const normalized = lower(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    if (normalized === "reviewing" || normalized === "revisao" || normalized === "em analise") return "Em análise";
    if (normalized === "late reply" || normalized === "latereply") return "Resposta fora do prazo";
    if (normalized === "assigned") return "Sem motivo";
    if (normalized === "no confirmation of receipt") return "Sem confirmação de recebimento";
    if (normalized === "divergent/incomplete contact" || normalized === "divergent incomplete contact") return "Contato divergente/incompleto";
    return value;
  }

  function driverName(value) {
    const raw = clean(value);
    if (!raw) return "Sem entregador";
    return raw.replace(/^\[\d+\]\s*/, "");
  }

  function hasAssignedDriver(row) {
    if (row.status === "Atribu\u00edda") return true;
    if (row.status === "Atribuida") return true;
    return false;
  }

  function treatmentAllowedPanel(panel = state.panel) {
    const panelStatus = statusPanelStatus(panel);
    return panel === "worklist" || panel === "assigned" || panelStatus === "Em análise" || panelStatus === "Faturamento" || panelStatus === "Revertido";
  }

  function treatmentEditablePanel(panel = state.panel) {
    return panel === "worklist" || panel === "assigned" || statusPanelStatus(panel) === "Faturamento";
  }

  function actionableTreatmentRow(row) {
    return hasAssignedDriver(row) || row.status === "Faturamento";
  }

  function priorityOf(row) {
    if (row.duplicateInImport) return { label: "Duplicada", tone: "amber", rank: 2 };
    if (isTreatmentStateResolved(row.treatmentState)) return { label: "Baixa", tone: "green", rank: 5 };
    if (isTreatmentStateTreated(row.treatmentState)) return { label: "Ok", tone: "green", rank: 4 };
    if (row.known) return { label: "Revisar", tone: "blue", rank: 1 };
    if (row.status === "Criado" || row.status === "Em análise") return { label: "Alta", tone: "red", rank: 0 };
    return { label: "Media", tone: "amber", rank: 3 };
  }

  function treatmentFor(br) {
    return state.treatments[normalizeKey(br)] || null;
  }

  function hydrateRowsWithLegacyMigration() {
    hydrateRows();
    if (migrateLegacyBillingTreatments()) {
      hydrateRows();
      saveLocal();
    }
  }

  function migrateLegacyBillingTreatments() {
    const previousMigration = loadJson(BILLING_MIGRATION_KEY, null);
    if (previousMigration && Number(previousMigration.migrated || 0) > 0) return false;
    const hasData = state.rows.length && Object.keys(state.treatments || {}).length;
    if (!hasData) return false;
    let migrated = 0;
    state.rows.forEach(row => {
      if (row.status !== "Faturamento") return;
      const key = normalizeKey(row.br);
      const treatment = state.treatments[key];
      if (!treatment?.text || treatment.billingText) return;
      treatment.billingText = treatment.text;
      treatment.billingUpdatedAt = treatment.updatedAt || new Date().toISOString();
      treatment.legacyBillingMigrated = true;
      migrated += 1;
    });
    if (!migrated) return false;
    localStorage.setItem(BILLING_MIGRATION_KEY, JSON.stringify({
      migrated,
      migratedAt: new Date().toISOString()
    }));
    return true;
  }

  function hydrateRows() {
    const counts = new Map();
    state.rows.forEach(row => counts.set(row.br, (counts.get(row.br) || 0) + 1));
    state.rows = state.rows.map(row => {
      const treatment = treatmentFor(row.br);
      const treatmentState = treatment?.state || "Pendente";
      const known = Boolean(treatment && treatment.updatedAt);
      const importedStatus = normalizeStatus(row.rawStatus || row.status);
      const normalizedStatus = normalizeRowStatus(row);
      return {
        ...row,
        driver: driverName(row.driver),
        sla: formatSheetDate(row.sla),
        created: formatSheetDate(row.created),
        status: normalizedStatus,
        wasCreated: Boolean(row.wasCreated) || importedStatus === "Criado" || normalizedStatus === "Criado",
        reason: normalizeReason(row.reason),
        duplicateInImport: (counts.get(row.br) || 0) > 1,
        known,
        treatmentText: treatment?.text || "",
        treatmentState,
        treatmentUpdatedAt: treatment?.updatedAt || "",
        billingTreatmentText: treatment?.billingText || "",
        billingTreatmentUpdatedAt: treatment?.billingUpdatedAt || "",
        billingFormTreatedAt: treatment?.billingFormTreatedAt || ""
      };
    });
  }

  function rowsFromSheet(rawRows, fileName, sheetName) {
    const headers = Object.keys(rawRows[0] || {});
    const cols = {
      br: detectColumn(headers, "br"),
      driver: detectColumn(headers, "driver"),
      station: detectColumn(headers, "station"),
      sla: detectColumn(headers, "sla"),
      reason: detectColumn(headers, "reason"),
      created: detectColumn(headers, "created"),
      status: detectColumn(headers, "status"),
      ticketIhs: detectColumn(headers, "ticketIhs")
    };
    if (!cols.br) throw new Error("Não encontrei a coluna de BR/SPXTN.");

    return rawRows.map((row, index) => {
      const br = normalizeKey(row[cols.br]);
      if (!br) return null;
      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${index}`,
        br,
        driver: driverName(row[cols.driver]),
        station: clean(row[cols.station]) || BASE_NAME,
        sla: formatSheetDate(row[cols.sla]),
        reason: normalizeReason(row[cols.reason]),
        created: formatSheetDate(row[cols.created]),
        ticketIhs: clean(row[cols.ticketIhs]),
        originalColumns: originalColumns(row, headers),
        rawStatus: clean(row[cols.status]),
        status: normalizeStatus(row[cols.status]),
        file: fileName,
        sheet: sheetName
      };
    }).filter(Boolean);
  }

  function parseCsvRows(text) {
    const input = String(text || "").replace(/^\ufeff/, "");
    const firstLine = input.split(/\r?\n/, 1)[0] || "";
    const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : firstLine.includes("\t") ? "\t" : ",";
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      const next = input[index + 1];
      if (quoted) {
        if (char === '"' && next === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          cell += char;
        }
        continue;
      }
      if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell || row.length) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
    }
    const headers = (rows.shift() || []).map(clean);
    return rows
      .filter(values => values.some(clean))
      .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  }

  async function importCsv(file, target) {
    const text = await file.text();
    const sheetRows = parseCsvRows(text);
    if (sheetRows.length) target.push(...rowsFromSheet(sheetRows, file.name, "CSV"));
  }

  async function importWorkbook(file, target) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
    workbook.SheetNames.forEach(sheetName => {
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", blankrows: false });
      if (sheetRows.length) target.push(...rowsFromSheet(sheetRows, file.name, sheetName));
    });
  }

  async function importZip(file, target) {
    if (typeof JSZip === "undefined") throw new Error("ZIP precisa de internet ativa nesta primeira versão.");
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter(entry => !entry.dir && /\.(csv|xlsx|xls)$/i.test(entry.name));
    for (const entry of entries) {
      if (/\.csv$/i.test(entry.name)) {
        const text = await entry.async("text");
        const sheetRows = parseCsvRows(text);
        if (sheetRows.length) target.push(...rowsFromSheet(sheetRows, `${file.name}/${entry.name}`, "CSV"));
        continue;
      }
      const data = await entry.async("arraybuffer");
      const workbook = XLSX.read(data, { type: "array", cellDates: false });
      workbook.SheetNames.forEach(sheetName => {
        const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", blankrows: false });
        if (sheetRows.length) target.push(...rowsFromSheet(sheetRows, `${file.name}/${entry.name}`, sheetName));
      });
    }
  }

  async function handleFiles(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    if (typeof XLSX === "undefined") {
      setSync("A biblioteca de planilhas não carregou.", "error");
      return;
    }

    try {
      setSync("Importando planilha PNR...", "warn");
      const rows = [];
      for (const file of selected) {
        if (/\.zip$/i.test(file.name)) await importZip(file, rows);
        else if (/\.csv$/i.test(file.name)) await importCsv(file, rows);
        else if (/\.(csv|xlsx|xls)$/i.test(file.name)) await importWorkbook(file, rows);
      }
      if (!rows.length) throw new Error("Nenhuma linha válida foi encontrada.");
      state.rows = rows;
      state.ticketIhsByBr = {};
      rebuildTicketIhsMemory();
      state.imports.unshift({
        at: new Date().toISOString(),
        files: selected.map(file => file.name),
        total: rows.length
      });
      hydrateRowsWithLegacyMigration();
      saveLocal();
      renderAll();
      const ihsCount = state.rows.filter(row => ticketIhsFromOriginal(row)).length;
      setSync(`Planilha importada com sucesso. ${countFormat(ihsCount)} IDs IHS encontrados.`, ihsCount ? "ok" : "warn");
      setPanel("overview");
    } catch (error) {
      console.error(error);
      setSync(`Erro ao importar: ${error.message || error}`, "error");
    } finally {
      els.fileInput.value = "";
    }
  }

  function setSync(message, type = "") {
    if (!clean(message)) {
      els.syncLine.hidden = true;
      els.syncLine.textContent = "";
      els.syncLine.className = "sync-line";
      return;
    }
    els.syncLine.hidden = false;
    els.syncLine.textContent = message;
    els.syncLine.className = `sync-line ${type}`.trim();
  }

  function isFinalized(row) {
    return row.status === "Revertido" || isTreatmentStateResolved(row.treatmentState) || row.treatmentState === "Tratado" || Boolean(row.treatmentText);
  }

  function isResolved(row) {
    return row.status === "Revertido" || isTreatmentStateResolved(row.treatmentState);
  }

  function isBillingForms(row) {
    return row.status === "Faturamento" && !row.billingTreatmentText;
  }

  function isBillingRecorded(row) {
    return row.status === "Faturamento" && Boolean(row.billingTreatmentText);
  }

  function isBillingPending(row) {
    return isBillingForms(row);
  }

  function isBillingTreatmentContext(row, panel = state.panel) {
    const billingDetailPanels = ["worklist", "treated", "billingAll", "total"];
    return statusPanelStatus(panel) === "Faturamento" || (billingDetailPanels.includes(panel) && row.status === "Faturamento");
  }

  function rowTreatmentText(row, panel = state.panel) {
    return isBillingTreatmentContext(row, panel) ? row.billingTreatmentText : row.treatmentText;
  }

  function rowTreatmentUpdatedAt(row, panel = state.panel) {
    return isBillingTreatmentContext(row, panel) ? row.billingTreatmentUpdatedAt : row.treatmentUpdatedAt;
  }

  function rowTreatmentState(row, panel = state.panel) {
    return isBillingTreatmentContext(row, panel) ? (row.billingTreatmentText ? "Tratado" : "Pendente") : row.treatmentState;
  }

  function isTreatmentStateTreated(value) {
    return value === "Tratado" || value === "Tratada com SIM";
  }

  function isTreatmentStateResolved(value) {
    return value === "Resolvido" || value === "Entregador resolveu";
  }

  function treatmentStateOptions(panel = state.panel) {
    return statusPanelStatus(panel) === "Em análise"
      ? ["Pendente", "Tratada com SIM", "Entregador resolveu"]
      : ["Pendente", "Em tratativa", "Tratado", "Resolvido"];
  }

  function hasAnyTreatment(row) {
    return Boolean(row.treatmentText || row.billingTreatmentText);
  }

  function hasStatusTreatment(row) {
    return row.status === "Faturamento" ? Boolean(row.billingTreatmentText) : Boolean(row.treatmentText);
  }

  function deadlineLimit() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime() + (2 * 86400000) - 1;
  }

  function stats() {
    const total = state.rows.length;
    const treated = state.rows.filter(hasStatusTreatment).length;
    const resolved = state.rows.filter(isResolved).length;
    const pending = state.rows.filter(row => row.treatmentState === "Pendente").length;
    const known = state.rows.filter(row => row.known).length;
    const duplicates = state.rows.filter(row => row.duplicateInImport).length;
    const created = state.rows.filter(row => row.status === "Criado").length;
    const analysis = state.rows.filter(row => row.status === "Em análise").length;
    const reverted = state.rows.filter(row => row.status === "Revertido").length;
    const billingTotal = state.rows.filter(row => row.status === "Faturamento").length;
    const billing = state.rows.filter(isBillingPending).length;
    const billingForms = state.rows.filter(isBillingForms).length;
    const billingRecorded = state.rows.filter(isBillingRecorded).length;
    const assignedRows = state.rows.filter(hasAssignedDriver);
    const assigned = assignedRows.length;
    const inProgress = state.rows.filter(row => row.treatmentState === "Em tratativa").length;
    const openRows = assignedRows.filter(row => !isFinalized(row));
    const endTomorrow = deadlineLimit();
    const nearDeadline = openRows.filter(row => {
      const rank = dateRank(row.sla);
      return Number.isFinite(rank) && rank <= endTomorrow;
    }).length;
    const inDeadline = openRows.filter(row => {
      const rank = dateRank(row.sla);
      return Number.isFinite(rank) && rank > endTomorrow;
    }).length;
    return { total, treated, resolved, pending, known, duplicates, created, analysis, reverted, billingTotal, billing, billingForms, billingRecorded, assigned, inProgress, nearDeadline, inDeadline };
  }

  function situationMatches(row, situation, panel = state.panel) {
    const stateLabel = rowTreatmentState(row, panel);
    if (situation === "pending") return stateLabel === "Pendente";
    if (situation === "in_progress") return stateLabel === "Em tratativa";
    if (situation === "treated") return isTreatmentStateTreated(stateLabel) || hasStatusTreatment(row);
    if (situation === "resolved") return isResolved(row) || isTreatmentStateResolved(stateLabel);
    if (situation === "duplicate") return row.duplicateInImport;
    if (situation === "history") return row.known;
    return true;
  }

  function setShortcut(situation = "", options = {}) {
    state.filters.situation = situation ? [situation] : [];
    state.filters.group = "";
    if (options.clearDriver) state.filters.driver = [];
    setPanel("worklist");
    renderAll();
  }

  function counter(rows, field) {
    const map = new Map();
    rows.forEach(row => map.set(row[field], (map.get(row[field]) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
  }

  function counterByValue(rows, getter) {
    const map = new Map();
    rows.forEach(row => {
      const value = clean(getter(row));
      if (value) map.set(value, (map.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => dayRank(a[0]) - dayRank(b[0]) || a[0].localeCompare(b[0], "pt-BR"));
  }

  function duplicateCategory(rows) {
    const statuses = Array.from(new Set(rows.map(row => row.status).filter(Boolean)));
    if (statuses.length > 1) return "Duplicada mista";
    const status = statuses[0] || "Sem status";
    if (status === "Faturamento") return "Duplicada faturamento";
    if (status === "Revertido") return "Duplicada revertida";
    if (["Criado", "Atribuída", "Em análise"].includes(status)) return "Duplicada em aberto";
    return `Duplicada ${status.toLowerCase()}`;
  }

  function duplicateCategoryTone(category) {
    if (category === "Duplicada mista") return "amber";
    if (category === "Duplicada faturamento") return "red";
    if (category === "Duplicada revertida") return "green";
    if (category === "Duplicada em aberto") return "blue";
    return "gray";
  }

  function duplicateCategoryRank(category) {
    const ranks = {
      "Duplicada mista": 1,
      "Duplicada em aberto": 2,
      "Duplicada faturamento": 3,
      "Duplicada revertida": 4
    };
    return ranks[category] || 9;
  }

  function duplicateGroups(rows = state.rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = normalizeKey(row.br);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return Array.from(map.entries())
      .filter(([, groupRows]) => groupRows.length > 1)
      .map(([br, groupRows]) => {
        const statusCounts = counter(groupRows, "status");
        const driverCounts = counter(groupRows, "driver");
        const category = duplicateCategory(groupRows);
        return {
          br,
          rows: groupRows.slice().sort((a, b) => dateRank(a.created) - dateRank(b.created) || a.status.localeCompare(b.status, "pt-BR")),
          qty: groupRows.length,
          category,
          tone: duplicateCategoryTone(category),
          statuses: statusCounts.map(([label, total]) => `${label} (${countFormat(total)})`).join(" • "),
          statusValues: statusCounts.map(([label]) => label),
          drivers: driverCounts.map(([label, total]) => `${label}${total > 1 ? ` (${countFormat(total)})` : ""}`).join(" • "),
          driverValues: driverCounts.map(([label]) => label),
          created: groupRows.reduce((value, row) => earliestDate(value, row.created), groupRows[0]?.created || ""),
          sla: groupRows.reduce((value, row) => earliestDate(value, displaySla(row)), displaySla(groupRows[0] || {}) || "")
        };
      })
      .sort((a, b) => duplicateCategoryRank(a.category) - duplicateCategoryRank(b.category) || b.qty - a.qty || a.br.localeCompare(b.br, "pt-BR"));
  }

  function duplicateFilteredGroups() {
    const categories = selectedValues(state.duplicates.categories);
    const statuses = selectedValues(state.duplicates.statuses);
    const drivers = selectedValues(state.duplicates.drivers);
    const search = lower(state.duplicates.search);
    return duplicateGroups().filter(group => {
      if (categories.length && !categories.includes(group.category)) return false;
      if (statuses.length && !group.statusValues.some(status => statuses.includes(status))) return false;
      if (drivers.length && !group.driverValues.some(driver => drivers.includes(driver))) return false;
      if (!search) return true;
      return [group.br, group.category, group.statuses, group.drivers, ...group.rows.flatMap(row => [row.reason, row.treatmentText, row.billingTreatmentText])]
        .some(value => lower(value).includes(search));
    });
  }

  function renderKpis() {
    const s = stats();
    const items = [
      ["Total atribu\u00eddas", s.assigned, "PNRs atribu\u00eddas para tratar", "wine", "assigned", ""],
      ["Criadas", s.created, "Entraram como pendência", "red", "created", ""],
      ["Revertidas", s.reverted, "Resolvidas por reversão", "amber", "reverted", ""],
      ["Faturamento", s.billingTotal, `${countFormat(s.billingForms)} sem tratativa de faturamento`, "violet", "billingAll", ""],
      ["Tratadas", s.treated, "Com registro salvo", "green", "treated", treatedStatusSummary()]
    ];
    els.kpis.innerHTML = items.map(([label, value, hint, tone, shortcut, extra]) => `
      <button class="kpi ${tone}" data-kpi="${html(shortcut)}" type="button">
        <span>${html(label)}</span>
        <strong>${countFormat(value)}</strong>
        <small>${html(hint)}</small>
        ${extra ? `<small class="kpi-breakdown">${html(extra)}</small>` : ""}
      </button>
    `).join("");

    els.overviewTreatmentRate.textContent = percent(s.treated, s.total);
    els.overviewTreatmentText.textContent = s.total ? `${countFormat(s.treated)} de ${countFormat(s.total)} PNRs já receberam tratativa.` : "Importe uma planilha para iniciar.";
    els.sideTotal.textContent = s.total ? `${countFormat(s.total)} PNRs importadas` : "Sem importação";
    els.sideSaved.textContent = `${countFormat(Object.keys(state.treatments).length)} tratativas salvas`;
  }

  function treatedStatusSummary() {
    const rows = state.rows.filter(hasStatusTreatment);
    if (!rows.length) return "Sem tratativas por status";
    return counter(rows, "status")
      .map(([label, value]) => `${label}: ${countFormat(value)}`)
      .join(" • ");
  }

  function baseRowsForPanel(panel = state.panel) {
    if (panel === "worklist") return state.rows.filter(actionableTreatmentRow);
    if (panel === "assigned") return state.rows.filter(hasAssignedDriver);
    if (panel === "created") return state.rows.filter(row => row.status === "Criado");
    if (panel === "analysis") return state.rows.filter(row => row.status === "Em análise");
    if (panel === "reverted") return state.rows.filter(row => row.status === "Revertido");
    if (panel === "billingForms") return state.rows.filter(isBillingForms);
    if (panel === "billing") return state.rows.filter(isBillingRecorded);
    if (panel === "duplicates") return duplicateGroups().flatMap(group => group.rows);
    return state.rows.slice();
  }

  function hasActivePanelFilters() {
    return Boolean(
      clean(state.filters.search) ||
      selectedValues(state.filters.situation).length ||
      selectedValues(state.filters.status).length ||
      selectedValues(state.filters.reason).length ||
      selectedValues(state.filters.driver).length ||
      selectedValues(state.filters.day).length
    );
  }

  function renderPanelSummary() {
    if (!els.panelSummary) return;
    const s = stats();
    if (state.panel === "overview") {
      els.panelSummary.hidden = true;
      els.panelSummary.textContent = "";
      return;
    }
    els.panelSummary.hidden = false;
    if (state.panel === "history") {
      els.panelSummary.textContent = `Histórico: ${countFormat(Object.keys(state.treatments).length)} BRs com tratativa salva`;
      return;
    }
    if (state.panel === "manager") {
      els.panelSummary.textContent = "Mensagem pronta para copiar e enviar";
      return;
    }
    if (state.panel === "duplicates") {
      const total = duplicateGroups().length;
      const visible = duplicateFilteredGroups().length;
      const rowsTotal = duplicateGroups().reduce((sum, group) => sum + group.qty, 0);
      const parts = [`PNR Duplicadas: ${countFormat(total)} BRs | ${countFormat(rowsTotal)} ocorrências`];
      if (visible !== total) parts.push(`exibindo ${countFormat(visible)} nos filtros`);
      els.panelSummary.textContent = parts.join(" | ");
      return;
    }
    if (state.panel === "reports") {
      const total = reportsBaseRows().length;
      const visible = reportsFilteredRows().length;
      const parts = [`Tratativas informes: ${countFormat(total)} PNRs`];
      if (visible !== total) parts.push(`exibindo ${countFormat(visible)} nos filtros`);
      if (reportsSlaPrintDate) parts.push(`SLA temporário dos informes: ${dateOnlyLabel(reportsSlaPrintLabel(), "Sem SLA")}`);
      els.panelSummary.textContent = parts.join(" | ");
      return;
    }
    if (!isWorklistPanel()) {
      els.panelSummary.textContent = "Configuração do dashboard";
      return;
    }
    const total = baseRowsForPanel(state.panel).length;
    const visible = filterRows({ ignoreGroup: true }).length;
    const labels = {
      worklist: "Tratativas",
      assigned: "PNR Atribuídas",
      created: "PNR Criadas",
      analysis: "PNR em Análise",
      reverted: "PNR Revertidas",
      billingForms: "Faturamento Forms",
      billing: "Faturamento PNR"
    };
    const parts = [`${labels[state.panel] || "PNRs"}: ${countFormat(total)} PNRs`];
    if (hasActivePanelFilters() && visible !== total) parts.push(`exibindo ${countFormat(visible)} nos filtros`);
    if (state.panel === "billingForms") {
      const formsRows = baseRowsForPanel("billingForms");
      const ihsCount = formsRows.filter(row => ticketIhsFromOriginal(row)).length;
      parts.push(`${countFormat(s.billingRecorded)} já em Faturamento PNR`);
      parts.push(`${countFormat(ihsCount)} com ID IHS`);
    }
    if (state.panel === "billing") parts.push(`${countFormat(s.billingForms)} ainda no Forms`);
    if (state.panel === "assigned") parts.push(`${countFormat(s.nearDeadline)} próximas do vencimento`);
    if (state.panel === "assigned" && assignedSlaPrintDate) parts.push(`SLA temporário: ${dateOnlyLabel(assignedSlaPrintLabel(), "Sem SLA")}`);
    els.panelSummary.textContent = parts.join(" | ");
  }

  function renderTopActions() {
    if (!els.exportFormsBtn) return;
    const showFormsExport = state.panel === "billingForms";
    els.exportFormsBtn.hidden = !showFormsExport;
    els.exportFormsBtn.disabled = !state.rows.some(isBillingForms);
    if (els.exportBillingPnrBtn) {
      const showBillingPnrExport = state.panel === "billing";
      els.exportBillingPnrBtn.hidden = !showBillingPnrExport;
      els.exportBillingPnrBtn.disabled = !state.rows.some(isBillingRecorded);
    }
    if (els.exportTreatmentsWorklistBtn) {
      els.exportTreatmentsWorklistBtn.hidden = state.panel !== "worklist";
      els.exportTreatmentsWorklistBtn.disabled = !Object.keys(state.treatments).length;
    }
  }

  function localDateInput(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function dateInputToSlaLabel(value) {
    const match = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    return `${match[3]}/${match[2]}/${match[1]}, 23:59:31`;
  }

  function assignedSlaPrintLabel() {
    return dateInputToSlaLabel(assignedSlaPrintDate);
  }

  function reportsSlaPrintLabel() {
    return dateInputToSlaLabel(reportsSlaPrintDate);
  }

  function setAssignedSlaPrintStatus(text) {
    if (els.assignedSlaPrintStatus) els.assignedSlaPrintStatus.textContent = text;
  }

  function setReportsSlaPrintStatus(text) {
    if (els.reportsSlaPrintStatus) els.reportsSlaPrintStatus.textContent = text;
  }

  function syncAssignedSlaPrintInputs() {
    if (els.assignedSlaPrintDate) els.assignedSlaPrintDate.value = assignedSlaPrintDate;
  }

  function syncReportsSlaPrintInput() {
    if (els.reportsSlaPrintDate) els.reportsSlaPrintDate.value = reportsSlaPrintDate;
  }

  function displaySla(row) {
    return state.panel === "assigned" && assignedSlaPrintDate && hasAssignedDriver(row)
      ? assignedSlaPrintLabel()
      : row.sla;
  }

  function displayReportsSla(row) {
    return reportsSlaPrintDate ? reportsSlaPrintLabel() : row.sla;
  }

  function applyAssignedSlaPrint() {
    const value = clean(els.assignedSlaPrintDate?.value);
    if (!value) {
      setSync("Escolha uma data para aplicar no SLA temporário.", "warn");
      return;
    }
    assignedSlaPrintDate = value;
    syncAssignedSlaPrintInputs();
    setAssignedSlaPrintStatus(`SLA temporário ativo: ${dateOnlyLabel(assignedSlaPrintLabel(), "Sem SLA")}.`);
    renderAll();
    setSync("SLA temporário aplicado somente em PNR Atribuídas.", "ok");
  }

  function resetAssignedSlaPrint() {
    assignedSlaPrintDate = "";
    syncAssignedSlaPrintInputs();
    setAssignedSlaPrintStatus("Não altera a planilha importada.");
    renderAll();
    setSync("SLA real restaurado em PNR Atribuídas.", "ok");
  }

  function applyReportsSlaPrint() {
    const value = clean(els.reportsSlaPrintDate?.value);
    if (!value) {
      setSync("Escolha uma data para aplicar no SLA temporário dos informes.", "warn");
      return;
    }
    reportsSlaPrintDate = value;
    syncReportsSlaPrintInput();
    setReportsSlaPrintStatus(`SLA temporário ativo nos informes: ${dateOnlyLabel(reportsSlaPrintLabel(), "Sem SLA")}.`);
    renderReports();
    renderPanelSummary();
    setSync("SLA temporário aplicado somente em Tratativas informes.", "ok");
  }

  function resetReportsSlaPrint() {
    reportsSlaPrintDate = "";
    syncReportsSlaPrintInput();
    setReportsSlaPrintStatus("Não altera a planilha importada.");
    renderReports();
    renderPanelSummary();
    setSync("SLA real restaurado em Tratativas informes.", "ok");
  }

  function managerDefaultDate() {
    const ranks = state.rows
      .map(row => dateRank(row.created))
      .filter(rank => Number.isFinite(rank));
    if (!ranks.length) return localDateInput(new Date());
    return localDateInput(new Date(Math.max(...ranks)));
  }

  function managerDateLabel() {
    const value = clean(els.managerDate?.value);
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return new Date().toLocaleDateString("pt-BR");
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  function managerDayRows() {
    const selectedDay = managerDateLabel();
    return state.rows.filter(row => rowCreatedDay(row) === selectedDay);
  }

  function isAnalysisTreatedYes(row) {
    const treatmentState = rowTreatmentState(row, "analysis");
    const treatmentText = lower(rowTreatmentText(row, "analysis"));
    return treatmentState === "Tratada com SIM" || treatmentState === "Tratado" || /\bsim\b/.test(treatmentText);
  }

  function isAnalysisDriverResolved(row) {
    const treatmentState = rowTreatmentState(row, "analysis");
    return treatmentState === "Entregador resolveu" || treatmentState === "Resolvido";
  }

  function isBillingFormTreatedOnManagerDay(row) {
    const treatment = treatmentFor(row.br);
    return row.status === "Faturamento"
      && Boolean(row.billingTreatmentText)
      && Boolean(treatment?.billingFormTreatedAt || row.billingFormTreatedAt)
      && dateOnlyLabel(treatment?.billingFormTreatedAt || row.billingFormTreatedAt, "") === managerDateLabel();
  }

  function managerFormsTreatedTodayCount() {
    const treated = new Set();
    state.rows.forEach(row => {
      if (isBillingFormTreatedOnManagerDay(row)) treated.add(normalizeKey(row.br));
    });
    return treated.size;
  }

  function managerAssignedRanking(limit = Infinity) {
    const rows = state.rows.filter(hasAssignedDriver);
    return counter(rows, "driver").slice(0, limit).map(([driver, total], index) => ({
      position: index + 1,
      driver,
      total
    }));
  }

  function managerRankingText() {
    const ranking = managerAssignedRanking();
    if (!ranking.length) return "Sem PNRs atribuídas no momento.";
    return ranking.map(item => `${item.position}. ${item.driver}: ${countFormat(item.total)} PNR${item.total === 1 ? "" : "s"}`).join("\n");
  }

  function managerNumbers() {
    const rows = managerDayRows();
    const analysisRows = rows.filter(row => row.status === "Em análise");
    const assignedRows = state.rows.filter(hasAssignedDriver);
    const openAssigned = assignedRows.length;
    return {
      assignedDay: assignedRows.length,
      created: state.rows.filter(row => row.wasCreated || row.status === "Criado").length,
      treatedYes: analysisRows.filter(isAnalysisTreatedYes).length,
      driverResolved: analysisRows.filter(isAnalysisDriverResolved).length,
      billing: rows.filter(row => row.status === "Faturamento").length,
      formsTreatedToday: managerFormsTreatedTodayCount(),
      reverted: rows.filter(row => row.status === "Revertido").length,
      openAssigned
    };
  }

  function managerMessageText() {
    const values = managerNumbers();
    return `📈 *Atualização de PNR ${managerDateLabel()}*

* Atribuídas: ${countFormat(values.assignedDay)}
* Criadas: ${countFormat(values.created)}
* Tratadas com SIM: ${countFormat(values.treatedYes)}
* Entregador resolveu: ${countFormat(values.driverResolved)}
* Faturamento: ${countFormat(values.billing)}
* Forms tratados hoje: ${countFormat(values.formsTreatedToday)}
* Revertidas: ${countFormat(values.reverted)}

🏆 *Ranking de PNRs atribuídas por entregador*
${managerRankingText()}

📌 Total atribuídas geral : *${countFormat(values.openAssigned)} PNR*`;
  }

  function renderManager() {
    if (!els.managerMessage) return;
    if (els.managerDate && !els.managerDate.value) els.managerDate.value = managerDefaultDate();
    const values = managerNumbers();
    els.managerMessage.value = managerMessageText();
    if (els.managerStats) {
      const rows = [
        ["Atribuídas geral", values.assignedDay],
        ["Criadas geral", values.created],
        ["Tratadas com SIM em análise", values.treatedYes],
        ["Entregador resolveu", values.driverResolved],
        ["Faturamento", values.billing],
        ["Forms tratados hoje", values.formsTreatedToday],
        ["Revertidas", values.reverted],
        ["Total atribuídas geral", values.openAssigned]
      ];
      els.managerStats.innerHTML = rows.map(([label, value]) => `
        <div class="manager-stat">
          <span>${html(label)}</span>
          <strong>${countFormat(value)}</strong>
        </div>
      `).join("");
    }
    if (els.managerRanking) {
      const ranking = managerAssignedRanking();
      els.managerRanking.innerHTML = ranking.length
        ? ranking.map(item => `
          <div class="manager-ranking-row">
            <span>${countFormat(item.position)}. ${html(item.driver)}</span>
            <strong>${countFormat(item.total)}</strong>
          </div>
        `).join("")
        : `<div class="manager-ranking-empty">Sem PNRs atribuídas no momento.</div>`;
    }
  }

  function reportTypeLabel(type) {
    const labels = {
      all: "Todos os tipos",
      created: "PNR Criadas",
      assigned: "PNR Atribu\u00eddas",
      analysis: "PNR em An\u00e1lise",
      reverted: "PNR Revertidas",
      billing: "Faturamento PNR"
    };
    return labels[type] || labels.all;
  }

  function reportTypeOptions() {
    return [
      { value: "created", label: "PNR Criadas" },
      { value: "assigned", label: "PNR Atribu\u00eddas" },
      { value: "analysis", label: "PNR em An\u00e1lise" },
      { value: "reverted", label: "PNR Revertidas" },
      { value: "billing", label: "Faturamento PNR" }
    ];
  }

  function reportTreatmentLabel(row) {
    return clean(reportTreatmentText(row)) || "Sem tratativa";
  }

  function reportTreatmentValue(row) {
    return clean(reportTreatmentText(row)) || "__without_treatment__";
  }

  function reportTreatmentOptions(rows = reportsBaseRows()) {
    const map = new Map();
    rows.forEach(row => {
      const value = reportTreatmentValue(row);
      if (!map.has(value)) map.set(value, reportTreatmentLabel(row));
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => {
        if (a.value === "__without_treatment__") return -1;
        if (b.value === "__without_treatment__") return 1;
        return a.label.localeCompare(b.label, "pt-BR");
      });
  }

  function reportRowType(row) {
    if (row.status === "Criado") return "created";
    if (row.status === "Em an\u00e1lise") return "analysis";
    if (row.status === "Faturamento" && row.billingTreatmentText) return "billing";
    if (row.status === "Revertido") return "reverted";
    if (hasAssignedDriver(row)) return "assigned";
    return "";
  }

  function reportTreatmentText(row) {
    return reportRowType(row) === "billing" ? row.billingTreatmentText : row.treatmentText;
  }

  function reportTreatmentUpdatedAt(row) {
    return reportRowType(row) === "billing" ? row.billingTreatmentUpdatedAt : row.treatmentUpdatedAt;
  }

  function reportRowKey(row) {
    return [normalizeKey(row.br), row.status, row.driver, rowCreatedDay(row), dateOnlyLabel(displayReportsSla(row), "")].join("|");
  }

  function reportGroupKey(row) {
    return [
      reportRowType(row),
      row.driver,
      clean(reportTreatmentText(row)) || "Sem tratativa",
      rowCreatedDay(row),
      dateOnlyLabel(displayReportsSla(row), "")
    ].join("|");
  }

  function reportsBaseRows() {
    return state.rows.filter(row => ["created", "assigned", "analysis", "reverted", "billing"].includes(reportRowType(row)));
  }

  function reportsFilteredRows() {
    const types = selectedValues(state.reports.types);
    const days = selectedValues(state.reports.days);
    const drivers = selectedValues(state.reports.drivers);
    const treatments = selectedValues(state.reports.treatments);
    const search = lower(state.reports.search);
    return reportsBaseRows().filter(row => {
      const rowType = reportRowType(row);
      const treatment = reportTreatmentText(row);
      if (types.length && !types.includes(rowType)) return false;
      if (days.length && !days.includes(rowCreatedDay(row))) return false;
      if (drivers.length && !drivers.includes(row.driver)) return false;
      if (treatments.length && !treatments.includes(reportTreatmentValue(row))) return false;
      if (!search) return true;
      return [row.driver, treatment]
        .some(value => lower(value).includes(search));
    }).sort((a, b) => dayRank(rowCreatedDay(b)) - dayRank(rowCreatedDay(a)) || a.driver.localeCompare(b.driver, "pt-BR") || a.br.localeCompare(b.br, "pt-BR"));
  }

  function reportsGroupedRows(rows = reportsFilteredRows()) {
    const groups = new Map();
    rows.forEach(row => {
      const key = reportGroupKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          driver: row.driver,
          treatment: clean(reportTreatmentText(row)) || "Sem tratativa",
          created: row.created,
          sla: displayReportsSla(row),
          qty: 0,
          rows: []
        });
      }
      const group = groups.get(key);
      group.qty += 1;
      group.rows.push(row);
      group.created = earliestDate(group.created, row.created);
      group.sla = earliestDate(group.sla, displayReportsSla(row));
    });
    return Array.from(groups.values()).sort((a, b) =>
      dayRank(dateOnlyLabel(b.created, "")) - dayRank(dateOnlyLabel(a.created, "")) ||
      a.driver.localeCompare(b.driver, "pt-BR") ||
      a.treatment.localeCompare(b.treatment, "pt-BR") ||
      dateRank(a.sla) - dateRank(b.sla)
    );
  }

  function syncReportsFilters() {
    const typeOptions = reportTypeOptions();
    state.reports.types = validSelections(state.reports.types, typeOptions);
    const selectedTypes = selectedValues(state.reports.types);
    const typeRows = reportsBaseRows().filter(row => !selectedTypes.length || selectedTypes.includes(reportRowType(row)));
    const dayOptions = counterByValue(typeRows, rowCreatedDay).map(([label]) => ({ value: label, label }));
    state.reports.days = validSelections(state.reports.days, dayOptions);
    const selectedDays = selectedValues(state.reports.days);
    const dayRows = selectedDays.length ? typeRows.filter(row => selectedDays.includes(rowCreatedDay(row))) : typeRows;
    const driverOptions = counter(dayRows, "driver").map(([label]) => ({ value: label, label }));
    state.reports.drivers = validSelections(state.reports.drivers, driverOptions);
    const selectedDrivers = selectedValues(state.reports.drivers);
    const treatmentRows = selectedDrivers.length ? dayRows.filter(row => selectedDrivers.includes(row.driver)) : dayRows;
    const treatmentOptions = reportTreatmentOptions(treatmentRows);
    state.reports.treatments = validSelections(state.reports.treatments, treatmentOptions);
    renderMultiFilter(els.reportsTypeFilter, typeOptions, state.reports.types, "Todos os tipos");
    renderMultiFilter(els.reportsDayFilter, dayOptions, state.reports.days, "Todos os dias");
    renderMultiFilter(els.reportsDriverFilter, driverOptions, state.reports.drivers, "Todos");
    renderMultiFilter(els.reportsTreatmentFilter, treatmentOptions, state.reports.treatments, "Todas");
    if (els.reportsSearch) els.reportsSearch.value = state.reports.search || "";
  }

  function renderReports() {
    if (!els.reportsBody) return;
    syncReportsFilters();
    const rows = reportsFilteredRows();
    const selectedTypes = selectedValues(state.reports.types);
    const selectedDays = selectedValues(state.reports.days);
    const selectedDrivers = selectedValues(state.reports.drivers);
    const typeLabel = selectedTypes.length ? selectedTypes.map(reportTypeLabel).join(", ") : "Todos os tipos";
    const withDay = selectedDays.length ? ` | Dias: ${selectedDays.join(", ")}` : "";
    const withDriver = selectedDrivers.length ? ` | Entregadores: ${selectedDrivers.join(", ")}` : "";
    if (els.reportsRowsCount) els.reportsRowsCount.textContent = `${countFormat(rows.length)} PNR${rows.length === 1 ? "" : "s"} encontradas | ${typeLabel}${withDay}${withDriver}`;
    if (!rows.length) {
      els.reportsBody.innerHTML = `<tr><td class="detail-empty-row" colspan="6">Nenhuma PNR encontrada nos filtros atuais.</td></tr>`;
      if (window.lucide) window.lucide.createIcons();
      return;
    }
    const groups = reportsGroupedRows(rows);
    els.reportsBody.innerHTML = groups.map(group => `
        <tr>
          <td>${html(group.driver)}</td>
          <td>${html(group.treatment)}</td>
          <td>${html(dateOnlyLabel(group.created, "Sem data"))}</td>
          <td>${html(dateOnlyLabel(group.sla, "Sem SLA"))}</td>
          <td><strong>${countFormat(group.qty)}</strong></td>
          <td><button class="open-group-button" data-report-open="${html(group.key)}" type="button">Abrir</button></td>
        </tr>
      `).join("");
    if (window.lucide) window.lucide.createIcons();
  }

  function openReportDetail(key) {
    const group = reportsGroupedRows().find(item => item.key === key) || reportsGroupedRows(reportsBaseRows()).find(item => item.key === key);
    const rows = group?.rows || [];
    if (!rows.length) return;
    if (els.detailModal.parentElement !== document.body) document.body.appendChild(els.detailModal);
    const allBilling = rows.every(row => reportRowType(row) === "billing");
    els.detailModal.classList.add("report-detail-mode");
    els.detailModalTitle.textContent = group.driver || "Sem entregador";
    els.detailModalCount.textContent = `${countFormat(rows.length)} PNR${rows.length === 1 ? "" : "s"} encontradas | ${group.treatment}`;
    els.detailTableHead.innerHTML = `
      <tr>
        <th>BR</th>
        <th>Status</th>
        <th>Entregador</th>
        <th>Motivo</th>
        <th>SLA</th>
        <th>Tratativa</th>
        ${allBilling ? "" : "<th>Situação</th>"}
      </tr>
    `;
    els.rowsBody.innerHTML = rows.map(row => {
      const isBilling = reportRowType(row) === "billing";
      const treatmentText = reportTreatmentText(row);
      const treatmentUpdatedAt = reportTreatmentUpdatedAt(row);
      const treatmentState = isBilling ? (treatmentText ? "Tratado" : "Pendente") : rowTreatmentState(row, reportRowType(row));
      const treatmentPatch = isBilling ? "billingText" : "text";
      return `
      <tr>
        <td><strong>${html(row.br)}</strong></td>
        <td><span class="detail-status-pill">${html(row.status)}</span></td>
        <td>${html(row.driver)}</td>
        <td>${html(row.reason || "Sem motivo")}</td>
        <td><strong>${html(displayReportsSla(row) || "Sem SLA")}</strong><div class="detail-muted">${html(row.created ? `Criado em ${row.created}` : "")}</div></td>
        <td>
          <div class="detail-treatment-box">
            <textarea data-treatment="${html(row.br)}" data-treatment-field="${html(treatmentPatch)}" placeholder="Descreva a tratativa realizada">${html(treatmentText)}</textarea>
            <div class="detail-muted">${treatmentUpdatedAt ? `Atualizado em ${html(dateLabel(treatmentUpdatedAt))}` : "Sem registro salvo"}</div>
          </div>
        </td>
        ${allBilling ? "" : isBilling ? "<td></td>" : `<td>
          <select class="detail-state-select" data-state="${html(row.br)}">
            ${treatmentStateOptions().map(item => `<option value="${item}" ${treatmentState === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </td>`}
      </tr>
    `;
    }).join("");
    els.detailModal.showModal();
  }

  function reportsMessageText() {
    const rows = reportsFilteredRows();
    const ranking = counter(rows, "driver");
    const headerDay = state.reports.day ? ` - ${state.reports.day}` : "";
    const title = `Tratativas informes - ${reportTypeLabel(state.reports.type || "all")}${headerDay}`;
    const lines = ranking.length
      ? ranking.map(([driver, total], index) => `${index + 1}. ${driver}: ${countFormat(total)} PNR${total === 1 ? "" : "s"}`).join("\n")
      : "Sem PNRs nos filtros selecionados.";
    return `*${title}*\n\nTotal: *${countFormat(rows.length)} PNR${rows.length === 1 ? "" : "s"}*\n\n${lines}`;
  }

  async function copyReportsMessage() {
    const text = reportsMessageText();
    try {
      await navigator.clipboard.writeText(text);
      setSync("Informe de tratativas copiado.", "ok");
    } catch {
      setSync("N\u00e3o consegui copiar automaticamente. Selecione os dados da tela e copie manualmente.", "warn");
    }
  }

  async function copyManagerMessage() {
    const text = els.managerMessage?.value || managerMessageText();
    try {
      await navigator.clipboard.writeText(text);
      setSync("Mensagem do gestor copiada.", "ok");
    } catch {
      els.managerMessage?.focus();
      els.managerMessage?.select();
      document.execCommand("copy");
      setSync("Mensagem do gestor copiada.", "ok");
    }
  }

  function assignAllCreatedRows() {
    const createdRows = state.rows.filter(row => row.status === "Criado");
    if (!createdRows.length) {
      setSync("Nenhuma PNR criada para atribuir.", "warn");
      return;
    }
    createdRows.forEach(row => {
      state.assignedOverrides[normalizeKey(row.br)] = new Date().toISOString();
    });
    const createdIds = new Set(createdRows.map(row => row.id || row.br));
    state.rows = state.rows.map(row => {
      if (!createdIds.has(row.id || row.br)) return row;
      return {
        ...row,
        rawStatus: "assigned",
        status: "Atribuída",
        wasCreated: true,
        assignedAt: new Date().toISOString()
      };
    });
    hydrateRows();
    saveLocal();
    state.filters.group = "";
    renderAll();
    setSync(`${countFormat(createdRows.length)} PNRs criadas foram atribuídas.`, "ok");
  }

  function percent(value, total) {
    if (!total) return "0%";
    return `${Math.round((value / total) * 100)}%`;
  }

  function statusColor(label) {
    const normalized = String(label || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (normalized === "faturamento") return "#E45C10";
    if (normalized === "revertido") return "#4B5D16";
    if (normalized === "atribuida") return "#4B5D16";
    if (normalized === "criado") return "#F2B635";
    if (normalized === "revisao" || normalized === "em analise") return "#223300";
    return "#ECE2CE";
  }

  function billingReasonData() {
    const allowed = ["Sem confirmação de recebimento", "Contato divergente/incompleto", "Resposta fora do prazo"];
    const totals = new Map(allowed.map(label => [label, 0]));
    state.rows.forEach(row => {
      if (row.status !== "Faturamento" || !totals.has(row.reason)) return;
      totals.set(row.reason, totals.get(row.reason) + 1);
    });
    return allowed.map(label => [label, totals.get(label) || 0]).filter(([, value]) => value > 0);
  }

  function renderBars(element, data, emptyText, colorForLabel = null) {
    const max = Math.max(...data.map(([, value]) => value), 1);
    if (!data.length) {
      element.innerHTML = `<div class="empty-row">${html(emptyText)}</div>`;
      return;
    }
    element.innerHTML = data.slice(0, 8).map(([label, value]) => `
      <div class="bar-item">
        <div>
          <div class="bar-label"><span>${html(label)}</span><span>${percent(value, state.rows.length)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, (value / max) * 100)}%;${colorForLabel ? `background:${colorForLabel(label)};` : ""}"></div></div>
        </div>
        <div class="bar-count">${countFormat(value)}</div>
      </div>
    `).join("");
  }

  function renderFunnel() {
    const s = stats();
    const steps = [
      ["Atribu\u00eddas", s.assigned, "PNRs atribu\u00eddas para tratar", "assigned", "urgent"],
      ["Criadas", s.created, "Pendências recém-criadas", "created", "monitor"],
      ["Faturamento Forms", s.billingForms, "Sem tratativa de faturamento", "billingForms", "billing"]
    ];
    els.funnelSteps.innerHTML = steps.map(([label, value, hint, shortcut, tone]) => `
      <button class="funnel-step action-summary ${html(tone)}" data-kpi="${html(shortcut)}" type="button">
        <div>
          <strong>${html(label)}</strong>
          <small>${html(hint)}</small>
        </div>
        <b>${countFormat(value)}</b>
      </button>
    `).join("");
  }

  function renderDeadlineCards() {
    const s = stats();
    const items = [
      ["Dentro do prazo", s.inDeadline, "Atribu\u00eddas sem press\u00e3o imediata de SLA", "inDeadline"],
      ["Pr\u00f3ximas do vencimento", s.nearDeadline, "Atribu\u00eddas com SLA pr\u00f3ximo", "nearDeadline"]
    ];
    els.deadlineCards.innerHTML = items.map(([label, value, hint, shortcut]) => `
      <button class="deadline-item" data-kpi="${html(shortcut)}" type="button">
        <span>${html(label)}</span>
        <strong>${countFormat(value)}</strong>
        <small>${html(hint)}</small>
      </button>
    `).join("");
  }

  function renderStatusDonut(data) {
    const total = data.reduce((sum, [, value]) => sum + value, 0);
    if (!total) {
      els.statusDonut.style.background = "";
      els.statusDonut.innerHTML = `<span>0</span><small>PNRs</small>`;
      return;
    }
    let cursor = 0;
    const segments = data.map(([label, value]) => {
      const start = cursor;
      const size = (value / total) * 100;
      cursor += size;
      return `${statusColor(label)} ${start}% ${cursor}%`;
    });
    els.statusDonut.style.background = `conic-gradient(${segments.join(", ")})`;
    els.statusDonut.innerHTML = `<span>${countFormat(total)}</span><small>PNRs</small>`;
  }

  function renderOverview() {
    const statusData = counter(state.rows, "status");
    renderStatusDonut(statusData);
    renderFunnel();
    renderDeadlineCards();
    renderBars(els.statusBars, statusData, "Importe uma planilha para ver status.", statusColor);
    renderBars(els.reasonBars, billingReasonData(), "Sem motivos de faturamento para exibir.", () => "#E45C10");
    const pendingRows = state.rows.filter(row => hasAssignedDriver(row) && !isFinalized(row));
    const drivers = counter(pendingRows, "driver").slice(0, 10);
    els.driverRanking.innerHTML = drivers.length ? drivers.map(([driver, total], index) => `
      <button class="driver-row" data-driver="${html(driver)}" type="button">
        <span class="driver-row-copy">
          <strong>${index + 1}. ${html(driver)}</strong>
        </span>
        <b>${countFormat(total)} PNRs em aberto</b>
      </button>
    `).join("") : `<div class="driver-empty">Sem entregadores em aberto.</div>`;
    renderOverviewDetail();
  }

  function overviewDetailMeta(type) {
    const meta = {
      total: { title: "Total de PNR", hint: "Todas as PNRs importadas na visão atual" },
      assigned: { title: "PNRs atribu\u00eddas", hint: "PNRs atribu\u00eddas para tratativa" },
      pending: { title: "PNRs pendentes", hint: "PNRs que ainda precisam de ação" },
      treated: { title: "PNRs tratadas", hint: "PNRs com tratativa salva" },
      resolved: { title: "PNRs resolvidas", hint: "PNRs finalizadas" },
      duplicate: { title: "PNRs duplicadas", hint: "PNRs repetidas no arquivo importado" },
      history: { title: "PNRs com histórico", hint: "BRs que já tinham registro salvo" },
      created: { title: "PNRs criadas", hint: "PNRs com status Criado" },
      reverted: { title: "PNRs revertidas", hint: "PNRs resolvidas por reversão" },
      billingAll: { title: "PNRs em faturamento", hint: "Todas as PNRs que foram para faturamento" },
      billingForms: { title: "Faturamento Forms", hint: "PNRs de faturamento sem tratativa de faturamento" },
      billing: { title: "Faturamento PNR", hint: "PNRs de faturamento com tratativa salva" },
      inDeadline: { title: "PNRs atribu\u00eddas dentro do prazo", hint: "Atribu\u00eddas sem press\u00e3o imediata de SLA" },
      nearDeadline: { title: "PNRs atribu\u00eddas pr\u00f3ximas do vencimento", hint: "Atribu\u00eddas com SLA at\u00e9 amanh\u00e3" }
    };
    return meta[type] || null;
  }

  function overviewBaseRows(type) {
    return state.rows.filter(row => {
      if (type === "assigned") return hasAssignedDriver(row);
      if (type === "pending") return row.treatmentState === "Pendente";
      if (type === "treated") return hasStatusTreatment(row);
      if (type === "resolved") return isResolved(row);
      if (type === "duplicate") return row.duplicateInImport;
      if (type === "history") return row.known;
      if (type === "created") return row.status === "Criado";
      if (type === "reverted") return row.status === "Revertido";
      if (type === "billingAll") return row.status === "Faturamento";
      if (type === "billingForms") return isBillingForms(row);
      if (type === "billing") return isBillingRecorded(row);
      if (type === "inDeadline") return hasAssignedDriver(row) && !isFinalized(row) && Number.isFinite(dateRank(row.sla)) && dateRank(row.sla) > deadlineLimit();
      if (type === "nearDeadline") return hasAssignedDriver(row) && !isFinalized(row) && Number.isFinite(dateRank(row.sla)) && dateRank(row.sla) <= deadlineLimit();
      return true;
    });
  }

  function overviewDetailRows(type) {
    const search = lower(state.overviewModal.search);
    const statusFilters = selectedValues(state.overviewModal.status);
    const driverFilters = selectedValues(state.overviewModal.driver);
    const situationFilters = selectedValues(state.overviewModal.situation);
    const reasonFilters = selectedValues(state.overviewModal.reason);
    let rows = overviewBaseRows(type).filter(row => {
      if (statusFilters.length && !statusFilters.includes(row.status)) return false;
      if (driverFilters.length && !driverFilters.includes(row.driver)) return false;
      if (situationFilters.length && !situationFilters.some(situation => situationMatches(row, situation, type))) return false;
      if (reasonFilters.length && !reasonFilters.includes(row.reason)) return false;
      if (!search) return true;
      return [row.br, row.status, row.driver, rowTreatmentState(row, type), row.treatmentText, row.billingTreatmentText, row.reason]
        .some(value => lower(value).includes(search));
    });
    if (state.overviewModal.sort === "br") rows = rows.sort((a, b) => a.br.localeCompare(b.br, "pt-BR"));
    if (state.overviewModal.sort === "driver") rows = rows.sort((a, b) => a.driver.localeCompare(b.driver, "pt-BR") || a.br.localeCompare(b.br, "pt-BR"));
    if (state.overviewModal.sort === "sla") rows = rows.sort((a, b) => dateRank(a.sla) - dateRank(b.sla) || a.br.localeCompare(b.br, "pt-BR"));
    if (state.overviewModal.sort === "situation") rows = rows.sort((a, b) => rowTreatmentState(a, type).localeCompare(rowTreatmentState(b, type), "pt-BR") || a.br.localeCompare(b.br, "pt-BR"));
    if (state.overviewModal.sort === "default") rows = rows.sort((a, b) => dateRank(a.sla) - dateRank(b.sla) || a.driver.localeCompare(b.driver, "pt-BR") || a.br.localeCompare(b.br));
    return rows;
  }

  function openOverviewDetail(type) {
    state.overviewDetail = type || "total";
    state.overviewModal = { status: [], driver: [], situation: [], reason: [], sort: "default", search: "" };
    state.panel = "overview";
    renderAll();
    if (!els.overviewDrilldown.open) els.overviewDrilldown.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  function renderOverviewDetail() {
    const meta = overviewDetailMeta(state.overviewDetail);
    if (!meta) {
      els.overviewDrillBody.innerHTML = "";
      return;
    }
    const baseRows = overviewBaseRows(state.overviewDetail);
    const statusOptions = counter(baseRows, "status").map(([label]) => ({ value: label, label }));
    const driverOptions = counter(baseRows, "driver").map(([label]) => ({ value: label, label }));
    const reasonOptions = counter(baseRows, "reason").map(([label]) => ({ value: label, label }));
    state.overviewModal.status = validSelections(state.overviewModal.status, statusOptions);
    state.overviewModal.driver = validSelections(state.overviewModal.driver, driverOptions);
    state.overviewModal.situation = validSelections(state.overviewModal.situation, situationOptions);
    state.overviewModal.reason = validSelections(state.overviewModal.reason, reasonOptions);
    const rows = overviewDetailRows(state.overviewDetail);
    els.overviewDrillTitle.textContent = meta.title;
    els.overviewDrillCount.textContent = `${countFormat(rows.length)} de ${countFormat(baseRows.length)} PNRs encontradas. ${meta.hint}.`;
    renderMultiFilter(els.overviewStatusFilter, statusOptions, state.overviewModal.status, "Todos");
    renderMultiFilter(els.overviewDriverFilter, driverOptions, state.overviewModal.driver, "Todos");
    renderMultiFilter(els.overviewSituationFilter, situationOptions, state.overviewModal.situation, "Todas");
    renderMultiFilter(els.overviewReasonFilter, reasonOptions, state.overviewModal.reason, "Todos");
    els.overviewSortFilter.value = state.overviewModal.sort || "default";
    els.overviewSearch.value = state.overviewModal.search || "";
    if (!rows.length) {
      els.overviewDrillBody.innerHTML = `<tr><td class="empty-row" colspan="7">Nenhuma PNR encontrada para este cartão.</td></tr>`;
      return;
    }
    els.overviewDrillBody.innerHTML = rows.map(row => {
      const treatmentText = rowTreatmentText(row, state.overviewDetail);
      const treatmentUpdatedAt = rowTreatmentUpdatedAt(row, state.overviewDetail);
      const treatmentState = rowTreatmentState(row, state.overviewDetail);
      const treatmentPatch = isBillingTreatmentContext(row, state.overviewDetail) ? "billingText" : "text";
      return `
      <tr>
        <td><strong class="br-cell">${html(row.br)}</strong></td>
        <td><span class="overview-status-pill">${html(row.status)}</span></td>
        <td>${html(row.driver)}</td>
        <td>${html(dateOnlyLabel(row.created, "Sem data"))}</td>
        <td>${html(dateOnlyLabel(row.sla, "Sem SLA"))}</td>
        <td>${html(treatmentState)}</td>
        <td>
          <div class="overview-treatment-box">
            <textarea data-overview-treatment="${html(row.br)}" data-treatment-field="${html(treatmentPatch)}" placeholder="Descreva a tratativa realizada">${html(treatmentText)}</textarea>
            <div class="detail-muted">${treatmentUpdatedAt ? `Atualizado em ${html(dateLabel(treatmentUpdatedAt))}` : "Sem registro salvo"}</div>
          </div>
        </td>
      </tr>
    `;
    }).join("");
  }

  function syncDuplicateFilters() {
    const groups = duplicateGroups();
    const categoryOptions = counterByValue(groups, group => group.category).map(([label]) => ({ value: label, label }));
    const statusMap = new Map();
    const driverMap = new Map();
    groups.forEach(group => {
      group.statusValues.forEach(status => statusMap.set(status, (statusMap.get(status) || 0) + 1));
      group.driverValues.forEach(driver => driverMap.set(driver, (driverMap.get(driver) || 0) + 1));
    });
    const statusOptions = Array.from(statusMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([label]) => ({ value: label, label }));
    const driverOptions = Array.from(driverMap.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR")).map(([label]) => ({ value: label, label }));
    state.duplicates.categories = validSelections(state.duplicates.categories, categoryOptions);
    state.duplicates.statuses = validSelections(state.duplicates.statuses, statusOptions);
    state.duplicates.drivers = validSelections(state.duplicates.drivers, driverOptions);
    renderMultiFilter(els.duplicateCategoryFilter, categoryOptions, state.duplicates.categories, "Todos os tipos");
    renderMultiFilter(els.duplicateStatusFilter, statusOptions, state.duplicates.statuses, "Todos");
    renderMultiFilter(els.duplicateDriverFilter, driverOptions, state.duplicates.drivers, "Todos");
    if (els.duplicateSearch) els.duplicateSearch.value = state.duplicates.search || "";
  }

  function renderDuplicateSummaryCards(groups = duplicateGroups()) {
    const byCategory = new Map();
    groups.forEach(group => byCategory.set(group.category, (byCategory.get(group.category) || 0) + 1));
    const cards = [
      ["Total duplicadas", groups.length, "BRs repetidas na base", ""],
      ["Mistas", byCategory.get("Duplicada mista") || 0, "Status diferentes na mesma BR", "Duplicada mista"],
      ["Faturamento", byCategory.get("Duplicada faturamento") || 0, "Duplicadas em faturamento", "Duplicada faturamento"],
      ["Revertidas", byCategory.get("Duplicada revertida") || 0, "Duplicadas revertidas", "Duplicada revertida"],
      ["Em aberto", byCategory.get("Duplicada em aberto") || 0, "Criadas, atribuídas ou em análise", "Duplicada em aberto"]
    ];
    els.duplicateSummaryCards.innerHTML = cards.map(([label, value, hint, category]) => `
      <button class="duplicate-kpi ${category ? duplicateCategoryTone(category) : "gray"}" data-duplicate-category="${html(category)}" type="button">
        <span>${html(label)}</span>
        <strong>${countFormat(value)}</strong>
        <small>${html(hint)}</small>
      </button>
    `).join("");
  }

  function renderDuplicates() {
    if (!els.duplicateBody) return;
    const groups = duplicateGroups();
    syncDuplicateFilters();
    const filtered = duplicateFilteredGroups();
    renderDuplicateSummaryCards(groups);
    const occurrenceTotal = filtered.reduce((sum, group) => sum + group.qty, 0);
    els.duplicateRowsCount.textContent = `${countFormat(filtered.length)} BR${filtered.length === 1 ? "" : "s"} duplicada${filtered.length === 1 ? "" : "s"} | ${countFormat(occurrenceTotal)} ocorrência${occurrenceTotal === 1 ? "" : "s"}`;
    if (!filtered.length) {
      els.duplicateBody.innerHTML = `<tr><td class="empty-row" colspan="8">Nenhuma BR duplicada encontrada nos filtros atuais.</td></tr>`;
      return;
    }
    els.duplicateBody.innerHTML = filtered.map(group => `
      <tr>
        <td><strong class="br-cell">${html(group.br)}</strong></td>
        <td><strong>${countFormat(group.qty)}</strong></td>
        <td><span class="pill ${html(group.tone)}">${html(group.category)}</span></td>
        <td>${html(group.statuses)}</td>
        <td>${html(group.drivers)}</td>
        <td>${html(dateOnlyLabel(group.created, "Sem data"))}</td>
        <td>${html(dateOnlyLabel(group.sla, "Sem SLA"))}</td>
        <td><button class="open-group-button" data-duplicate-open="${html(group.br)}" type="button">Abrir</button></td>
      </tr>
    `).join("");
  }

  function duplicateTreatmentText(row) {
    return row.status === "Faturamento" ? row.billingTreatmentText : row.treatmentText;
  }

  function openDuplicateDetail(br) {
    const group = duplicateGroups().find(item => item.br === normalizeKey(br));
    if (!group) return;
    if (els.detailModal.parentElement !== document.body) document.body.appendChild(els.detailModal);
    els.detailModal.classList.add("duplicate-detail-mode");
    els.detailModalTitle.textContent = `Duplicidade ${group.br}`;
    els.detailModalCount.textContent = `${countFormat(group.qty)} ocorrências | ${group.category}`;
    els.detailTableHead.innerHTML = `
      <tr>
        <th>BR</th>
        <th>Status</th>
        <th>Entregador</th>
        <th>Motivo</th>
        <th>PNR criada em</th>
        <th>Vence SLA</th>
        <th>Tratativa</th>
      </tr>
    `;
    els.rowsBody.innerHTML = group.rows.map(row => {
      const treatment = clean(duplicateTreatmentText(row)) || "Sem tratativa";
      return `
        <tr>
          <td><strong>${html(row.br)}</strong></td>
          <td><span class="detail-status-pill">${html(row.status)}</span></td>
          <td>${html(row.driver)}</td>
          <td>${html(row.reason)}</td>
          <td>${html(row.created || "Sem data")}</td>
          <td><strong>${html(displaySla(row) || "Sem SLA")}</strong></td>
          <td>${html(treatment)}</td>
        </tr>
      `;
    }).join("");
    els.detailModal.showModal();
    if (window.lucide) window.lucide.createIcons();
  }

  function hasDetailFilter() {
    return Boolean(state.filters.group);
  }

  function rowGroupKey(row) {
    const parts = treatmentAllowedPanel() ? [row.driver, treatmentSummary(row)] : [row.driver];
    return parts.map(item => clean(item).replaceAll("|", "/")).join("|");
  }

  function treatmentSummary(row, panel = state.panel) {
    const text = rowTreatmentText(row, panel);
    const stateLabel = rowTreatmentState(row, panel);
    return clean(text || (stateLabel !== "Pendente" ? stateLabel : "")) || "Sem tratativa";
  }

  function filterRows(options = {}) {
    const search = lower(state.filters.search);
    const forcedStatus = statusPanelStatus();
    const statusFilters = selectedValues(state.filters.status);
    const reasonFilters = selectedValues(state.filters.reason);
    const situationFilters = selectedValues(state.filters.situation);
    const driverFilters = selectedValues(state.filters.driver);
    const dayFilters = selectedValues(state.filters.day);
    return state.rows.filter(row => {
      if (forcedStatus && row.status !== forcedStatus) return false;
      if (state.panel === "billingForms" && !isBillingForms(row)) return false;
      if (state.panel === "billing" && !isBillingRecorded(row)) return false;
      if (state.panel === "worklist" && !actionableTreatmentRow(row)) return false;
      if (isAssignedPanel() && !hasAssignedDriver(row)) return false;
      if (statusFilters.length && !statusFilters.includes(row.status)) return false;
      if (reasonFilters.length && !reasonFilters.includes(row.reason)) return false;
      if (situationFilters.length && !situationFilters.some(situation => situationMatches(row, situation))) return false;
      if (!options.ignoreDriver && driverFilters.length && !driverFilters.includes(row.driver)) return false;
      if (showDayFilterPanel() && dayFilters.length && !dayFilters.includes(rowCreatedDay(row))) return false;
      if (!options.ignoreGroup && state.filters.group && rowGroupKey(row) !== state.filters.group) return false;
      if (!search) return true;
      return [row.br, row.driver, row.station, row.status, row.reason, row.treatmentText, row.billingTreatmentText]
        .some(value => lower(value).includes(search));
    }).sort((a, b) => priorityOf(a).rank - priorityOf(b).rank || a.driver.localeCompare(b.driver, "pt-BR") || a.br.localeCompare(b.br));
  }

  function visibleRows() {
    if (!hasDetailFilter()) return [];
    return filterRows();
  }

  function exportRowsForCurrentView() {
    if (state.panel === "overview") {
      return state.overviewDetail ? overviewDetailRows(state.overviewDetail) : state.rows.slice();
    }
    if (isWorklistPanel()) {
      return hasDetailFilter() ? visibleRows() : filterRows({ ignoreGroup: true });
    }
    if (state.panel === "duplicates") return duplicateFilteredGroups().flatMap(group => group.rows);
    if (state.panel === "reports") return reportsFilteredRows();
    return state.rows.slice();
  }

  function billingFormsExportRows() {
    return state.rows
      .filter(isBillingForms)
      .sort((a, b) => a.driver.localeCompare(b.driver, "pt-BR") || a.br.localeCompare(b.br, "pt-BR"))
      .map(row => ({
        BR: row.br,
        Entregador: row.driver,
        "ID do ticket IHS": ticketIhsFromOriginal(row)
      }));
  }

  function latestImportDateLabel() {
    const importDate = state.imports?.[0]?.at || state.imports?.[0]?.importedAt || "";
    return dateOnlyLabel(importDate, "");
  }

  function billingEnteredDate(row) {
    const originalDate = rowValueByHints(row.originalColumns || {}, [
      "Data faturamento",
      "Data de faturamento",
      "Faturamento em",
      "Billing date",
      "Billing time",
      "ForBilling time",
      "For Billing time",
      "Updated Time",
      "Update Time",
      "Last Updated Time"
    ]);
    return dateOnlyLabel(originalDate, "")
      || latestImportDateLabel()
      || dateOnlyLabel(row.billingTreatmentUpdatedAt, "")
      || dateOnlyLabel(row.billingFormTreatedAt, "")
      || dateOnlyLabel(row.created, "");
  }

  function billingPnrExportRows() {
    return state.rows
      .filter(isBillingRecorded)
      .sort((a, b) => {
        const driverCompare = a.driver.localeCompare(b.driver, "pt-BR");
        if (driverCompare) return driverCompare;
        return a.br.localeCompare(b.br, "pt-BR");
      })
      .map(row => ({
        BR: row.br,
        Entregador: row.driver,
        "PNR criada em": dateOnlyLabel(row.created, row.created || ""),
        "Entrou em faturamento em": billingEnteredDate(row),
        "Motivo do faturamento": row.reason || "Sem motivo",
        Tratativa: row.billingTreatmentText || row.treatmentText || "Sem tratativa"
      }));
  }

  function modalRows() {
    const search = lower(state.modal.search);
    let rows = visibleRows().filter(row => {
      if (state.modal.status && row.status !== state.modal.status) return false;
      if (state.modal.driver && row.driver !== state.modal.driver) return false;
      if (!search) return true;
      return [row.br, row.status, row.driver, row.reason, row.treatmentText, row.billingTreatmentText, rowTreatmentState(row)]
        .some(value => lower(value).includes(search));
    });
    if (state.modal.sort === "br") rows = rows.sort((a, b) => a.br.localeCompare(b.br, "pt-BR"));
    if (state.modal.sort === "status") rows = rows.sort((a, b) => a.status.localeCompare(b.status, "pt-BR") || a.br.localeCompare(b.br, "pt-BR"));
    if (state.modal.sort === "situation") rows = rows.sort((a, b) => rowTreatmentState(a).localeCompare(rowTreatmentState(b), "pt-BR") || a.br.localeCompare(b.br, "pt-BR"));
    return rows;
  }

  function situationLabel(value) {
    const labels = {
      pending: "Pendentes",
      in_progress: "Em tratativa",
      treated: "Tratadas",
      resolved: "Resolvidas",
      duplicate: "Duplicadas",
      history: "Com histórico"
    };
    return labels[value] || value;
  }

  function renderFilters() {
    const forcedStatus = statusPanelStatus();
    const detailColumns = detailColumnState();
    const optionRows = state.panel === "billingForms"
      ? state.rows.filter(isBillingForms)
      : state.panel === "billing"
      ? state.rows.filter(isBillingRecorded)
      : state.panel === "worklist"
      ? state.rows.filter(actionableTreatmentRow)
      : isAssignedPanel()
      ? state.rows.filter(hasAssignedDriver)
      : forcedStatus ? state.rows.filter(row => row.status === forcedStatus) : state.rows;
    const driverOptions = counter(optionRows, "driver").map(([label]) => ({ value: label, label }));
    const statusOptions = counter(optionRows, "status").map(([label]) => ({ value: label, label }));
    const reasonOptions = counter(optionRows, "reason").map(([label]) => ({ value: label, label }));
    const dayOptions = counterByValue(optionRows, rowCreatedDay).map(([label]) => ({ value: label, label }));
    state.filters.driver = validSelections(state.filters.driver, driverOptions);
    state.filters.situation = validSelections(state.filters.situation, situationOptions);
    state.filters.status = validSelections(state.filters.status, statusOptions);
    state.filters.reason = validSelections(state.filters.reason, reasonOptions);
    state.filters.day = validSelections(state.filters.day, dayOptions);
    if (!detailColumns.showSituation) state.filters.situation = [];
    if (!detailColumns.showReason) state.filters.reason = [];
    if (!showDayFilterPanel()) state.filters.day = [];
    setFilterVisible(els.situationFilter, detailColumns.showSituation);
    setFilterVisible(els.reasonFilter, detailColumns.showReason);
    setFilterVisible(els.dayFilter, showDayFilterPanel());
    if (els.assignCreatedBtn) {
      const createdCount = state.rows.filter(row => row.status === "Criado").length;
      const showAssignCreated = state.panel === "created";
      els.assignCreatedBtn.hidden = !showAssignCreated;
      els.assignCreatedBtn.style.display = showAssignCreated ? "" : "none";
      els.assignCreatedBtn.disabled = !createdCount;
      const label = els.assignCreatedBtn.querySelector("span");
      if (label) label.textContent = createdCount ? `Atribuir todas (${countFormat(createdCount)})` : "Atribuir todas";
    }
    renderMultiFilter(els.driverFilter, driverOptions, state.filters.driver, "Todos");
    renderMultiFilter(els.situationFilter, situationOptions, state.filters.situation, "Todas");
    renderMultiFilter(els.statusFilter, statusOptions, state.filters.status, "Todos");
    renderMultiFilter(els.reasonFilter, reasonOptions, state.filters.reason, "Todos");
    renderMultiFilter(els.dayFilter, dayOptions, state.filters.day, "Todos");
    els.searchInput.value = state.filters.search;
    renderTreatmentGroups();
    renderModalFilters();
  }

  function selectedValues(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return clean(value) ? [clean(value)] : [];
  }

  function validSelections(selected, options) {
    const validValues = new Set(options.map(option => option.value));
    return selectedValues(selected).filter(value => validValues.has(value));
  }

  function setFilterVisible(filter, visible) {
    const wrapper = filter?.closest(".filter-label");
    if (wrapper) wrapper.hidden = !visible;
  }

  function renderMultiFilter(container, options, selected, allLabel) {
    const validValues = new Set(options.map(option => option.value));
    const selectedSet = new Set(selectedValues(selected).filter(value => validValues.has(value)));
    const selectedOptions = options.filter(option => selectedSet.has(option.value));
    const title = selectedOptions.length
      ? `${selectedOptions[0].label}${selectedOptions.length > 1 ? ` +${selectedOptions.length - 1}` : ""}`
      : allLabel;
    container.innerHTML = `
      <button class="multi-filter-button" type="button" aria-expanded="false">
        <span>${html(title)}</span>
        <i data-lucide="chevron-down"></i>
      </button>
      <div class="multi-filter-menu" hidden>
        <label class="multi-filter-option">
          <input type="checkbox" value="" ${selectedSet.size ? "" : "checked"}>
          <span>${html(allLabel)}</span>
        </label>
        ${options.map(option => `
          <label class="multi-filter-option">
            <input type="checkbox" value="${html(option.value)}" ${selectedSet.has(option.value) ? "checked" : ""}>
            <span>${html(option.label)}</span>
          </label>
        `).join("")}
      </div>
    `;
  }

  function closeMultiFilters(except = null) {
    document.querySelectorAll(".multi-filter").forEach(container => {
      if (container === except) return;
      const menu = container.querySelector(".multi-filter-menu");
      const button = container.querySelector(".multi-filter-button");
      if (menu) menu.hidden = true;
      if (button) button.setAttribute("aria-expanded", "false");
    });
  }

  function openMultiFilter(container) {
    closeMultiFilters(container);
    const menu = container.querySelector(".multi-filter-menu");
    const button = container.querySelector(".multi-filter-button");
    if (menu) menu.hidden = false;
    if (button) button.setAttribute("aria-expanded", "true");
  }

  function bindMultiFilter(container) {
    container.addEventListener("click", event => {
      const button = event.target.closest(".multi-filter-button");
      if (!button) return;
      const menu = container.querySelector(".multi-filter-menu");
      const shouldOpen = Boolean(menu?.hidden);
      if (shouldOpen) openMultiFilter(container);
      else closeMultiFilters();
    });
    container.addEventListener("change", event => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox) return;
      const key = container.dataset.filter;
      if (!key) return;
      const menuBeforeRender = container.querySelector(".multi-filter-menu");
      const scrollTopBeforeRender = menuBeforeRender?.scrollTop || 0;
      const scope = container.dataset.scope === "overview"
        ? state.overviewModal
        : container.dataset.scope === "reports"
        ? state.reports
        : container.dataset.scope === "duplicates"
        ? state.duplicates
        : state.filters;
      const current = new Set(selectedValues(scope[key]));
      if (!checkbox.value) {
        scope[key] = [];
      } else {
        if (checkbox.checked) current.add(checkbox.value);
        else current.delete(checkbox.value);
        scope[key] = Array.from(current);
      }
      if (container.dataset.scope === "overview") renderOverviewDetail();
      else if (container.dataset.scope === "reports") {
        renderReports();
        renderPanelSummary();
      }
      else if (container.dataset.scope === "duplicates") {
        state.duplicates.group = "";
        renderDuplicates();
        renderPanelSummary();
      }
      else {
        state.filters.group = "";
        renderAll();
      }
      openMultiFilter(container);
      const menuAfterRender = container.querySelector(".multi-filter-menu");
      if (menuAfterRender) menuAfterRender.scrollTop = scrollTopBeforeRender;
    });
  }

  function fillSelect(select, values, allLabel) {
    const current = select.value;
    select.innerHTML = `<option value="">${html(allLabel)}</option>` + values.map(value => `<option value="${html(value)}">${html(value)}</option>`).join("");
    select.value = values.includes(current) ? current : "";
  }

  function fillSelectKeep(select, values, allLabel, current) {
    select.innerHTML = `<option value="">${html(allLabel)}</option>` + values.map(value => `<option value="${html(value)}">${html(value)}</option>`).join("");
    select.value = values.includes(current) ? current : "";
  }

  function treatmentGroups() {
    const map = new Map();
    filterRows({ ignoreGroup: true }).forEach(row => {
      const key = rowGroupKey(row);
      if (!map.has(key)) {
        map.set(key, {
          key,
          driver: row.driver,
          treatment: treatmentSummary(row),
          created: row.created,
          sla: displaySla(row),
          qty: 0
        });
      }
      const group = map.get(key);
      group.qty += 1;
      group.created = earliestDate(group.created, row.created);
      group.sla = earliestDate(group.sla, displaySla(row));
    });
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty || dateRank(a.sla) - dateRank(b.sla) || a.driver.localeCompare(b.driver, "pt-BR"));
  }

  function renderTreatmentGroups() {
    const groups = treatmentGroups();
    const showTreatment = treatmentAllowedPanel();
    els.treatmentGroupsHead.closest(".groups-table")?.classList.toggle("groups-table-no-treatment", !showTreatment);
    els.treatmentGroupsHead.innerHTML = `
      <tr>
        <th>Entregador</th>
        ${showTreatment ? "<th>Tratativa</th>" : ""}
        <th>PNR criada em</th>
        <th>Vence SLA</th>
        <th>Qtd</th>
        <th></th>
      </tr>
    `;
    if (!groups.length) {
      els.treatmentGroupsBody.innerHTML = `<tr><td class="empty-row" colspan="${showTreatment ? 6 : 5}">Nenhum grupo encontrado nos filtros atuais.</td></tr>`;
      return;
    }
    els.treatmentGroupsBody.innerHTML = groups.map(item => `
      <tr class="${state.filters.group === item.key ? "selected-row" : ""}">
        <td><strong>${html(item.driver)}</strong></td>
        ${showTreatment ? `<td>${html(item.treatment)}</td>` : ""}
        <td>${html(dateOnlyLabel(item.created, "Sem data"))}</td>
        <td>${html(dateOnlyLabel(item.sla, "Sem SLA"))}</td>
        <td><strong>${countFormat(item.qty)}</strong></td>
        <td><button class="open-group-button" data-open-group="${html(item.key)}" type="button">Abrir</button></td>
      </tr>
    `).join("");
  }

  function renderModalFilters() {
    const rows = visibleRows();
    const columns = detailColumnState();
    const situationSort = els.modalSortFilter.querySelector('option[value="situation"]');
    if (situationSort) situationSort.hidden = !columns.showSituation;
    if (!columns.showSituation && state.modal.sort === "situation") state.modal.sort = "default";
    fillSelectKeep(els.modalStatusFilter, counter(rows, "status").map(([label]) => label), "Todos", state.modal.status);
    fillSelectKeep(els.modalDriverFilter, counter(rows, "driver").map(([label]) => label), "Todos", state.modal.driver);
    els.modalSortFilter.value = state.modal.sort || "default";
    els.modalSearch.value = state.modal.search || "";
  }

  function detailColumnState() {
    const forcedStatus = statusPanelStatus();
    const showTreatment = treatmentAllowedPanel();
    const editTreatment = treatmentEditablePanel();
    return {
      showReason: forcedStatus !== "Criado" && forcedStatus !== "Revertido",
      showTreatment,
      editTreatment,
      showSituation: showTreatment && (!forcedStatus || forcedStatus === "Em análise")
    };
  }

  function detailColumnCount(columns) {
    return 4 + (columns.showReason ? 1 : 0) + (columns.showTreatment ? 1 : 0) + (columns.showSituation ? 1 : 0);
  }

  function renderDetailHeader(columns) {
    els.detailTableHead.innerHTML = `
      <tr>
        <th>BR</th>
        <th>Status</th>
        <th>Entregador</th>
        ${columns.showReason ? "<th>Motivo</th>" : ""}
        <th>SLA</th>
        ${columns.showTreatment ? "<th>Tratativa</th>" : ""}
        ${columns.showSituation ? "<th>Situação</th>" : ""}
      </tr>
    `;
  }

  function renderRows() {
    const rows = modalRows();
    const columns = detailColumnState();
    const columnCount = detailColumnCount(columns);
    renderDetailHeader(columns);
    if (!hasDetailFilter()) {
      els.detailModalTitle.textContent = "Detalhes";
      els.detailModalCount.textContent = "0 PNRs encontradas";
      els.rowsBody.innerHTML = `<tr><td class="detail-empty-row" colspan="${columnCount}">Nenhum grupo aberto no momento.</td></tr>`;
      return;
    }
    const baseRows = visibleRows();
    const first = baseRows[0];
    els.detailModalTitle.textContent = first ? `${first.driver}` : "Detalhes";
    els.detailModalCount.textContent = `${countFormat(rows.length)} de ${countFormat(baseRows.length)} PNRs encontradas`;
    if (!rows.length) {
      els.rowsBody.innerHTML = `<tr><td class="detail-empty-row" colspan="${columnCount}">Nenhuma PNR nesta visão.</td></tr>`;
      return;
    }
    els.rowsBody.innerHTML = rows.map(row => {
      const treatmentText = rowTreatmentText(row);
      const treatmentUpdatedAt = rowTreatmentUpdatedAt(row);
      const treatmentState = rowTreatmentState(row);
      const treatmentPatch = isBillingTreatmentContext(row) ? "billingText" : "text";
      return `
        <tr>
          <td><strong>${html(row.br)}</strong></td>
          <td><span class="detail-status-pill">${html(row.status)}</span></td>
          <td>${html(row.driver)}</td>
          ${columns.showReason ? `<td>${html(row.reason)}</td>` : ""}
          <td><strong>${html(displaySla(row) || "Sem SLA")}</strong><div class="detail-muted">${html(row.created ? `Criado em ${row.created}` : "")}</div></td>
          ${columns.showTreatment ? `<td>
            <div class="detail-treatment-box">
              ${columns.editTreatment
                ? `<textarea data-treatment="${html(row.br)}" data-treatment-field="${html(treatmentPatch)}" placeholder="Descreva a tratativa realizada">${html(treatmentText)}</textarea>`
                : `<div class="detail-treatment-readonly">${html(treatmentSummary(row))}</div>`}
              <div class="detail-muted">${treatmentUpdatedAt ? `Atualizado em ${html(dateLabel(treatmentUpdatedAt))}` : "Sem registro salvo"}</div>
            </div>
          </td>` : ""}
          ${columns.showSituation ? `<td>
            <select class="detail-state-select" data-state="${html(row.br)}">
              ${treatmentStateOptions().map(item => `<option value="${item}" ${treatmentState === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </td>` : ""}
        </tr>
      `;
    }).join("");
  }

  function renderHistory() {
    const items = Object.values(state.treatments).flatMap(item => {
      const rows = [];
      if (item.text) rows.push({ ...item, historyText: item.text, historyUpdatedAt: item.updatedAt, historyType: "Análise" });
      if (item.billingText) rows.push({ ...item, historyText: item.billingText, historyUpdatedAt: item.billingUpdatedAt || item.updatedAt, historyType: "Faturamento" });
      return rows;
    }).sort((a, b) => new Date(b.historyUpdatedAt || 0) - new Date(a.historyUpdatedAt || 0));
    if (!items.length) {
      els.historyBody.innerHTML = `<tr><td class="empty-row" colspan="5">Nenhuma tratativa salva ainda.</td></tr>`;
      return;
    }
    els.historyBody.innerHTML = items.map(item => {
      const brStatus = historyBrStatus(item);
      return `
        <tr>
          <td class="br-cell">${html(item.br)}</td>
          <td><span class="pill ${statusTone(brStatus)}">${html(brStatus)}</span></td>
          <td>${html(`${item.historyType}: ${item.historyText || ""}`)}</td>
          <td>${html(dateLabel(item.historyUpdatedAt))}</td>
          <td>
            <button class="history-remove-button" data-history-remove="${html(item.br)}" data-history-type="${html(item.historyType)}" type="button">
              Remover tratativa
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  function historyBrStatus(item) {
    const key = normalizeKey(item.br);
    const row = state.rows.find(entry => entry.br === key);
    return row?.status || "Fora da base atual";
  }

  function statusTone(status) {
    if (status === "Revertido") return "green";
    if (status === "Faturamento") return "red";
    if (status === "Criado") return "amber";
    if (status === "Em análise") return "amber";
    if (status === "Atribuída" || status === "Atribuida") return "blue";
    return "gray";
  }

  function updateTreatment(br, patch, options = {}) {
    const key = normalizeKey(br);
    const current = state.treatments[key] || { br: key, text: "", state: "Pendente" };
    const now = new Date().toISOString();
    const hadBillingText = Boolean(clean(current.billingText));
    const next = {
      ...current,
      ...patch,
      br: key,
      updatedAt: now
    };
    if (Object.prototype.hasOwnProperty.call(patch, "billingText")) {
      next.billingUpdatedAt = now;
      if (options.fromBillingForms && clean(patch.billingText) && !hadBillingText && !next.billingFormTreatedAt) {
        next.billingFormTreatedAt = now;
      }
    }
    if (!next.text && !next.billingText && next.state === "Pendente") delete state.treatments[key];
    else state.treatments[key] = next;
    hydrateRows();
    saveLocal();
    if (options.render !== false) renderAll();
    setSync("Tratativa salva.", "ok");
    if (options.cloud !== false) queueTreatmentCloudSync();
  }

  function removeHistoryTreatment(br, type, options = {}) {
    const key = normalizeKey(br);
    const current = state.treatments[key];
    if (!current) return false;
    const next = { ...current, br: key };
    if (type === "Faturamento") {
      delete next.billingText;
      delete next.billingUpdatedAt;
      delete next.billingFormTreatedAt;
      delete next.legacyBillingMigrated;
    } else {
      delete next.text;
      delete next.updatedAt;
      next.state = "Pendente";
    }
    if (!clean(next.text) && !clean(next.billingText) && (next.state || "Pendente") === "Pendente") {
      delete state.treatments[key];
    } else {
      state.treatments[key] = next;
    }
    hydrateRows();
    saveLocal();
    if (options.render !== false) renderAll();
    setSync(`Tratativa de ${type.toLowerCase()} removida da BR ${key}.`, "ok");
    if (options.cloud !== false) queueTreatmentCloudSync();
    return true;
  }

  function exportCsv(rows, filename) {
    const headers = ["BR", "Status da PNR", "Motivo", "Entregador", "Base", "SLA", "Criado em", "Situação", "Tratativa análise", "Atualizado em", "Tratativa faturamento", "Atualizado faturamento", "Tratado Forms em", "Duplicada"];
    const body = rows.map(row => [
      row.br, row.status, row.reason, row.driver, row.station, row.sla, row.created,
      row.treatmentState, row.treatmentText, row.treatmentUpdatedAt, row.billingTreatmentText, row.billingTreatmentUpdatedAt, row.billingFormTreatedAt, row.duplicateInImport ? "Sim" : "Não"
    ]);
    const csv = [headers, ...body].map(line => line.map(cell => `"${clean(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportSavedTreatments() {
    const rows = Object.values(state.treatments).map(item => ({
      br: item.br, status: "", reason: "", driver: "", station: BASE_NAME, sla: "", created: "",
      treatmentState: item.state, treatmentText: item.text, treatmentUpdatedAt: item.updatedAt,
      billingTreatmentText: item.billingText || "", billingTreatmentUpdatedAt: item.billingUpdatedAt || "",
      billingFormTreatedAt: item.billingFormTreatedAt || "",
      duplicateInImport: false
    }));
    exportCsv(rows, "pnr-tratativas-salvas.csv");
    setSync(`${countFormat(rows.length)} tratativas exportadas.`, "ok");
  }

  function rowValueByHints(row, hints) {
    const entries = Object.entries(row || {});
    const normalize = value => clean(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const normalizedHints = hints.map(normalize);
    const found = entries.find(([key]) => normalizedHints.includes(normalize(key)));
    return found ? clean(found[1]) : "";
  }

  function treatmentRowsFromWorksheetRows(rawRows) {
    const now = new Date().toISOString();
    return rawRows.map(row => {
      const br = normalizeKey(rowValueByHints(row, ["BR", "SPXTN", "shipment_id", "tracking"]));
      if (!br) return null;
      const text = rowValueByHints(row, ["Tratativa analise", "Tratativa análise", "Tratativa análise", "Tratativa", "Treatment"]);
      const billingText = rowValueByHints(row, ["Tratativa faturamento", "Faturamento"]);
      const treatmentState = rowValueByHints(row, ["Situacao", "Situação", "Situação", "Status da tratativa"]) || "Pendente";
      const updatedAt = rowValueByHints(row, ["Atualizado em", "Atualizacao", "Atualização", "Atualização"]);
      const billingUpdatedAt = rowValueByHints(row, ["Atualizado faturamento", "Atualizacao faturamento", "Atualização faturamento", "Atualização faturamento"]);
      const billingFormTreatedAt = rowValueByHints(row, ["Tratado Forms em", "Forms tratado em", "Faturamento Forms tratado em"]);
      if (!text && !billingText && treatmentState === "Pendente") return null;
      return {
        br,
        state: treatmentState,
        text,
        billingText,
        updatedAt: updatedAt || (text ? now : ""),
        billingUpdatedAt: billingUpdatedAt || "",
        billingFormTreatedAt: billingFormTreatedAt || ""
      };
    }).filter(Boolean);
  }

  async function treatmentRowsFromFile(file) {
    if (/\.json$/i.test(file.name)) {
      const payload = JSON.parse(await file.text());
      if (Array.isArray(payload)) return treatmentRowsFromWorksheetRows(payload);
      if (payload?.treatments) return Object.values(payload.treatments);
      if (payload?.payload?.treatments) return Object.values(payload.payload.treatments);
      return [];
    }
    if (/\.csv$/i.test(file.name)) return treatmentRowsFromWorksheetRows(parseCsvRows(await file.text()));
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      if (typeof XLSX === "undefined") throw new Error("A biblioteca de Excel não carregou.");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      return workbook.SheetNames.flatMap(sheetName => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", blankrows: false });
        return treatmentRowsFromWorksheetRows(rows);
      });
    }
    return [];
  }

  async function importTreatmentsFile(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    try {
      setSync("Importando tratativas...", "warn");
      const imported = [];
      for (const file of selected) imported.push(...await treatmentRowsFromFile(file));
      if (!imported.length) throw new Error("Nenhuma tratativa valida foi encontrada no arquivo.");
      imported.forEach(item => {
        const key = normalizeKey(item.br);
        const current = state.treatments[key] || { br: key, text: "", state: "Pendente" };
        const next = {
          ...current,
          br: key,
          state: clean(item.state) || current.state || "Pendente"
        };
        if (clean(item.text)) {
          next.text = clean(item.text);
          next.updatedAt = item.updatedAt || current.updatedAt || new Date().toISOString();
        }
      if (clean(item.billingText)) {
        next.billingText = clean(item.billingText);
        next.billingUpdatedAt = item.billingUpdatedAt || current.billingUpdatedAt || item.updatedAt || "";
        next.billingFormTreatedAt = item.billingFormTreatedAt || current.billingFormTreatedAt || "";
        next.updatedAt = next.updatedAt || next.billingUpdatedAt;
      }
        state.treatments[key] = next;
      });
      hydrateRows();
      saveLocal();
      renderAll();
      setSync(`${countFormat(imported.length)} tratativas importadas. Clique em sincronizar para enviar para a nuvem.`, "ok");
    } catch (error) {
      setSync(`Erro ao importar tratativas: ${error.message || error}`, "error");
    } finally {
      if (els.treatmentsFileInput) els.treatmentsFileInput.value = "";
    }
  }

  function exportBillingFormsExcel() {
    if (typeof XLSX === "undefined" || !XLSX.utils || !XLSX.writeFile) {
      setSync("A biblioteca de Excel não carregou.", "error");
      return;
    }
    const rows = billingFormsExportRows();
    if (!rows.length) {
      setSync("Não há PNRs no Faturamento Forms para exportar.", "warn");
      return;
    }
    const ihsFilled = rows.filter(row => clean(row["ID do ticket IHS"])).length;
    if (!ihsFilled) {
      setSync("Nenhum ID IHS encontrado. Reimporte a planilha que possui a coluna IHS Ticket ID.", "error");
      return;
    }
    const sheet = XLSX.utils.json_to_sheet(rows, { header: ["BR", "Entregador", "ID do ticket IHS"] });
    rows.forEach((row, index) => {
      const cell = sheet[`C${index + 2}`];
      if (cell) {
        cell.t = "s";
        cell.v = clean(row["ID do ticket IHS"]);
        cell.w = clean(row["ID do ticket IHS"]);
      }
    });
    sheet["!cols"] = [{ wch: 20 }, { wch: 34 }, { wch: 24 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Faturamento Forms");
    XLSX.writeFile(workbook, `faturamento-forms-${localDateInput(new Date())}.xlsx`);
    setSync(`${countFormat(rows.length)} PNRs do Faturamento Forms exportadas. ${countFormat(ihsFilled)} com ID IHS.`, "ok");
  }

  function exportBillingPnrExcel() {
    if (typeof XLSX === "undefined" || !XLSX.utils || !XLSX.writeFile) {
      setSync("A biblioteca de Excel não carregou.", "error");
      return;
    }
    const rows = billingPnrExportRows();
    if (!rows.length) {
      setSync("Não há PNRs no Faturamento PNR para exportar.", "warn");
      return;
    }
    const headers = ["BR", "Entregador", "PNR criada em", "Entrou em faturamento em", "Motivo do faturamento", "Tratativa"];
    const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    sheet["!cols"] = [
      { wch: 20 },
      { wch: 36 },
      { wch: 16 },
      { wch: 24 },
      { wch: 34 },
      { wch: 46 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Faturamento PNR");
    XLSX.writeFile(workbook, `faturamento-pnr-${localDateInput(new Date())}.xlsx`);
    setSync(`${countFormat(rows.length)} PNRs do Faturamento PNR exportadas em Excel.`, "ok");
  }

  function renderSettings() {
    const settings = cloudSettings();
    els.supabaseUrl.value = settings.supabaseUrl || "";
    els.supabaseKey.value = settings.supabaseKey || "";
  }

  function cloudSettings() {
    return {
      supabaseUrl: clean(SUPABASE_URL) || clean(state.settings?.supabaseUrl),
      supabaseKey: clean(SUPABASE_PUBLIC_KEY) || clean(state.settings?.supabaseKey)
    };
  }

  function unsafeSupabaseKey(key) {
    const value = clean(key);
    if (!value) return false;
    if (/service[_-]?role/i.test(value)) return true;
    const parts = value.split(".");
    if (parts.length < 2 || typeof atob === "undefined") return false;
    try {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload?.role === "service_role";
    } catch {
      return false;
    }
  }

  function supabaseClient() {
    const settings = cloudSettings();
    if (!window.supabase || !settings.supabaseUrl || !settings.supabaseKey) return null;
    if (unsafeSupabaseKey(settings.supabaseKey)) {
      setSync("Chave service_role bloqueada. Use somente chave pública/publishable no dashboard.", "error");
      return null;
    }
    return window.supabase.createClient(settings.supabaseUrl, settings.supabaseKey);
  }

  function setCloudAuthMessage(message, type = "") {
    if (!els.cloudAuthMessage) return;
    els.cloudAuthMessage.textContent = message;
    els.cloudAuthMessage.className = `cloud-auth-message${type ? ` ${type}` : ""}`;
  }

  function setDailyAuthLocked(locked) {
    document.body.classList.toggle("cloud-auth-locked", Boolean(locked));
    if (els.cloudAuthCancelBtn) els.cloudAuthCancelBtn.hidden = Boolean(locked);
  }

  function currentAuthDay() {
    return localDateInput(new Date());
  }

  function markCloudAuthOk(session, options = {}) {
    currentCloudSession = session || null;
    sessionStorage.setItem(AUTH_DAY_KEY, currentAuthDay());
    if (!options.keepLocked) setDailyAuthLocked(false);
  }

  function openCloudLogin(client, options = {}) {
    if (!els.cloudAuthDialog || !els.cloudAuthEmail || !els.cloudAuthPassword) {
      setSync("Login do Supabase indisponível nesta tela.", "error");
      return Promise.resolve(null);
    }
    if (pendingCloudLogin) return pendingCloudLogin.promise;
    setDailyAuthLocked(Boolean(options.required));
    setCloudAuthMessage(options.required ? "Entre para liberar o dashboard hoje." : "Login obrigatório para usar a nuvem.");
    els.cloudAuthPassword.value = "";
    let resolver = null;
    const promise = new Promise(resolve => {
      resolver = resolve;
    });
    pendingCloudLogin = { client, resolve: resolver, promise, required: Boolean(options.required) };
    els.cloudAuthDialog.showModal();
    window.setTimeout(() => els.cloudAuthEmail.focus(), 60);
    return promise;
  }

  function closeCloudLogin(result = null) {
    const pending = pendingCloudLogin;
    pendingCloudLogin = null;
    if (els.cloudAuthDialog?.open) els.cloudAuthDialog.close();
    pending?.resolve(result);
  }

  async function loginCloud() {
    const client = supabaseClient();
    if (!client) {
      setSync("Configuração do Supabase ausente no código. Informe a URL e a chave pública antes de publicar.", "warn");
      return null;
    }
    try {
      const { data } = await client.auth.getSession();
      if (data?.session && sessionStorage.getItem(AUTH_DAY_KEY) === currentAuthDay()) {
        currentCloudSession = data.session;
        return client;
      }
      if (data?.session) await client.auth.signOut();
    } catch {
      currentCloudSession = null;
    }
    return openCloudLogin(client, { required: document.body.classList.contains("cloud-auth-locked") });
  }

  async function ensureDailyCloudLogin() {
    const client = supabaseClient();
    if (!client) {
      setDailyAuthLocked(false);
      return;
    }
    try {
      const { data } = await client.auth.getSession();
      if (data?.session && sessionStorage.getItem(AUTH_DAY_KEY) === currentAuthDay()) {
        markCloudAuthOk(data.session, { keepLocked: true });
        await autoLoadCloud(client);
        return;
      }
      if (data?.session) await client.auth.signOut();
    } catch {
      currentCloudSession = null;
    }
    setDailyAuthLocked(true);
    openCloudLogin(client, { required: true });
  }

  /*
    const email = clean(els.authEmail.value);
    const password = els.authPassword.value;
    if (!email || !password) {
      setSync("Informe e-mail e senha para entrar.", "warn");
      return null;
    }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setSync("Login não autorizado no Supabase.", "error");
      return null;
    }
    setSync(`Login ativo: ${data.session.user.email}`, "ok");
    return client;
  }

  */

  async function cloudUserId(client) {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id) throw new Error("Sessão do Supabase inválida. Entre novamente.");
    return data.user.id;
  }

  async function saveCloud() {
    const client = await loginCloud();
    if (!client) return;
    try {
      const userId = await cloudUserId(client);
      const payload = { ...dashboardPayload(), savedAt: new Date().toISOString() };
      const { error } = await client.from(CLOUD_TABLE).upsert({ id: CLOUD_ID, owner_id: userId, updated_by: userId, payload, updated_at: payload.savedAt }, { onConflict: "id" });
      if (error) setSync(`Erro ao salvar na nuvem: ${error.message}`, "error");
      else setSync("Dashboard PNR salvo na nuvem.", "ok");
    } catch (error) {
      setSync(`Erro ao salvar na nuvem: ${error.message || error}`, "error");
    }
  }

  async function cloudPayload(client) {
    const { data, error } = await client.from(CLOUD_TABLE).select("payload").eq("id", CLOUD_ID).maybeSingle();
    if (error) throw error;
    return data?.payload || {};
  }

  async function loadCloudDashboard(client, options = {}) {
    try {
      const payload = await cloudPayload(client);
      if (!payload || !Object.keys(payload).length) {
        if (options.notify !== false) setSync("Nenhum dashboard PNR salvo na nuvem ainda.", "warn");
        return false;
      }
      applyDashboardPayload({ app: "DASHBOARD_PNR_TXF", ...payload });
      if (options.notify !== false) {
        setSync(options.auto ? "Dashboard PNR carregado automaticamente da nuvem." : "Dashboard PNR carregado da nuvem.", "ok");
      }
      return true;
    } catch (error) {
      const prefix = options.auto ? "Erro ao carregar automaticamente da nuvem" : "Erro ao carregar da nuvem";
      setSync(`${prefix}: ${error.message || error}`, "error");
      return false;
    } finally {
      if (options.unlock) setDailyAuthLocked(false);
    }
  }

  async function autoLoadCloud(client) {
    if (cloudAutoLoadPromise) return cloudAutoLoadPromise;
    cloudAutoLoadPromise = loadCloudDashboard(client, { auto: true, unlock: true });
    try {
      return await cloudAutoLoadPromise;
    } finally {
      cloudAutoLoadPromise = null;
    }
  }

  async function saveTreatmentsPayload(client) {
    const current = await cloudPayload(client);
    const userId = await cloudUserId(client);
    rebuildTicketIhsMemory();
    const payload = {
      ...current,
      app: "DASHBOARD_PNR_TXF",
      version: 2,
      base: BASE_NAME,
      rows: state.rows.length ? state.rows : Array.isArray(current.rows) ? current.rows : [],
      treatments: state.treatments,
      assignedOverrides: state.assignedOverrides,
      ticketIhsByBr: { ...(current.ticketIhsByBr || {}), ...state.ticketIhsByBr },
      imports: state.imports.length ? state.imports : Array.isArray(current.imports) ? current.imports : [],
      savedAt: new Date().toISOString()
    };
    const { error } = await client.from(CLOUD_TABLE).upsert({ id: CLOUD_ID, owner_id: userId, updated_by: userId, payload, updated_at: payload.savedAt }, { onConflict: "id" });
    if (error) throw error;
    return payload;
  }

  function queueTreatmentCloudSync() {
    const settings = cloudSettings();
    if (!settings.supabaseUrl || !settings.supabaseKey) return;
    clearTimeout(treatmentCloudTimer);
    treatmentCloudTimer = setTimeout(async () => {
      const client = supabaseClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      if (!data?.session) return;
      try {
        await saveTreatmentsPayload(client);
        setSync("Tratativa salva na nuvem.", "ok");
      } catch {
        setSync("Tratativa salva localmente. Sincronize com a nuvem quando possível.", "warn");
      }
    }, 1200);
  }

  async function saveTreatmentsCloud() {
    const client = await loginCloud();
    if (!client) return;
    try {
      await saveTreatmentsPayload(client);
      setSync("Tratativas sincronizadas na nuvem.", "ok");
      renderSettings();
    } catch (error) {
      setSync(`Erro ao sincronizar tratativas: ${error.message}`, "error");
    }
  }

  async function loadCloudTreatments() {
    const client = await loginCloud();
    if (!client) return;
    try {
      const payload = await cloudPayload(client);
      if (!payload.treatments) {
        setSync("Nenhuma tratativa salva na nuvem ainda.", "warn");
        return;
      }
      state.treatments = payload.treatments || {};
      state.assignedOverrides = payload.assignedOverrides || state.assignedOverrides || {};
      state.ticketIhsByBr = payload.ticketIhsByBr || state.ticketIhsByBr || {};
      rebuildTicketIhsMemory();
      hydrateRowsWithLegacyMigration();
      saveLocal();
      renderAll();
      setSync("Tratativas importadas da nuvem.", "ok");
    } catch (error) {
      setSync(`Erro ao importar tratativas: ${error.message}`, "error");
    }
  }

  async function loadCloud() {
    const client = await loginCloud();
    if (!client) return;
    await loadCloudDashboard(client);
  }

  function setPanel(panel) {
    state.panel = panel;
    document.querySelectorAll(".panel").forEach(item => item.classList.toggle("active", item.id === panelElementId(panel)));
    document.querySelectorAll(".nav-button").forEach(item => item.classList.toggle("active", item.dataset.panel === panel));
    const titles = {
      overview: "Visão geral",
      worklist: "Tratativas",
      assigned: "PNR Atribuídas",
      created: "PNR Criadas",
      analysis: "PNR em Análise",
      reverted: "PNR Revertidas",
      billingForms: "Faturamento Forms",
      billing: "Faturamento PNR",
      duplicates: "PNR Duplicadas",
      reports: "Tratativas informes",
      manager: "Gestor",
      history: "Histórico",
      settings: "Configuração"
    };
    els.panelTitle.textContent = titles[panel] || "Controle PNR";
    renderPanelSummary();
    renderTopActions();
    if (isWorklistPanel(panel)) {
      els.treatmentCloudCard.hidden = panel !== "worklist";
      renderFilters();
      renderRows();
    }
    if (panel === "manager") renderManager();
    if (panel === "reports") renderReports();
    if (panel === "duplicates") renderDuplicates();
    if (panel === "history") renderHistory();
    if (panel === "settings") renderSettings();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderAll() {
    renderKpis();
    renderOverview();
    renderFilters();
    renderRows();
    renderPanelSummary();
    renderManager();
    renderReports();
    renderDuplicates();
    renderHistory();
    renderSettings();
    renderTopActions();
    if (window.lucide) window.lucide.createIcons();
  }

  function bindEvents() {
    els.fileInput.addEventListener("change", event => handleFiles(event.target.files));
    document.querySelectorAll(".nav-button").forEach(button => button.addEventListener("click", () => setPanel(button.dataset.panel)));
    els.managerDate?.addEventListener("input", renderManager);
    els.copyManagerMessageBtn?.addEventListener("click", copyManagerMessage);
    els.copyReportsBtn?.addEventListener("click", copyReportsMessage);
    els.reportsSearch?.addEventListener("input", event => {
      state.reports.search = event.target.value;
      renderReports();
      renderPanelSummary();
    });
    els.clearReportsBtn?.addEventListener("click", () => {
      state.reports = { types: [], days: [], drivers: [], treatments: [], search: "" };
      renderReports();
      renderPanelSummary();
    });
    els.duplicateSearch?.addEventListener("input", event => {
      state.duplicates.search = event.target.value;
      state.duplicates.group = "";
      renderDuplicates();
      renderPanelSummary();
    });
    els.clearDuplicateFiltersBtn?.addEventListener("click", () => {
      state.duplicates = { categories: [], statuses: [], drivers: [], search: "", group: "" };
      renderDuplicates();
      renderPanelSummary();
    });
    els.duplicateSummaryCards?.addEventListener("click", event => {
      const button = event.target.closest("[data-duplicate-category]");
      if (!button) return;
      const category = clean(button.dataset.duplicateCategory);
      state.duplicates.categories = category ? [category] : [];
      state.duplicates.statuses = [];
      state.duplicates.drivers = [];
      state.duplicates.search = "";
      state.duplicates.group = "";
      renderDuplicates();
      renderPanelSummary();
    });
    els.duplicateBody?.addEventListener("click", event => {
      const button = event.target.closest("[data-duplicate-open]");
      if (!button) return;
      openDuplicateDetail(button.dataset.duplicateOpen);
    });
    els.reportsBody?.addEventListener("click", event => {
      const button = event.target.closest("[data-report-open]");
      if (!button) return;
      openReportDetail(button.dataset.reportOpen);
    });
    els.applyAssignedSlaPrintBtn?.addEventListener("click", applyAssignedSlaPrint);
    els.resetAssignedSlaPrintBtn?.addEventListener("click", resetAssignedSlaPrint);
    els.applyReportsSlaPrintBtn?.addEventListener("click", applyReportsSlaPrint);
    els.resetReportsSlaPrintBtn?.addEventListener("click", resetReportsSlaPrint);
    els.assignCreatedBtn?.addEventListener("click", assignAllCreatedRows);
    els.exportFormsBtn?.addEventListener("click", exportBillingFormsExcel);
    els.exportBillingPnrBtn?.addEventListener("click", exportBillingPnrExcel);
    els.searchInput.addEventListener("input", event => { state.filters.search = event.target.value; state.filters.group = ""; renderAll(); });
    [els.driverFilter, els.situationFilter, els.statusFilter, els.reasonFilter, els.dayFilter, els.overviewStatusFilter, els.overviewDriverFilter, els.overviewSituationFilter, els.overviewReasonFilter, els.reportsTypeFilter, els.reportsDayFilter, els.reportsDriverFilter, els.reportsTreatmentFilter, els.duplicateCategoryFilter, els.duplicateStatusFilter, els.duplicateDriverFilter].forEach(bindMultiFilter);
    document.addEventListener("click", event => {
      if (!event.target.closest(".multi-filter")) closeMultiFilters();
    });
    els.clearFiltersBtn.addEventListener("click", () => {
      state.filters = { search: "", situation: [], status: [], reason: [], driver: [], day: [], group: "" };
      renderAll();
    });
    els.treatmentGroupsBody.addEventListener("click", event => {
      const button = event.target.closest("[data-open-group]");
      if (!button) return;
      state.filters.group = button.dataset.openGroup;
      state.modal = { status: "", driver: "", sort: "default", search: "" };
      renderAll();
      els.detailModal.showModal();
      if (window.lucide) window.lucide.createIcons();
    });
    els.detailModalCloseBtn.addEventListener("click", () => els.detailModal.close());
    els.detailModal.addEventListener("click", event => {
      if (event.target === els.detailModal) els.detailModal.close();
    });
    els.detailModal.addEventListener("close", () => {
      els.detailModal.classList.remove("report-detail-mode");
      els.detailModal.classList.remove("duplicate-detail-mode");
      state.filters.group = "";
      state.duplicates.group = "";
      renderAll();
    });
    els.modalStatusFilter.addEventListener("change", event => { state.modal.status = event.target.value; renderAll(); });
    els.modalDriverFilter.addEventListener("change", event => { state.modal.driver = event.target.value; renderAll(); });
    els.modalSortFilter.addEventListener("change", event => { state.modal.sort = event.target.value; renderAll(); });
    els.modalSearch.addEventListener("input", event => { state.modal.search = event.target.value; renderRows(); });
    els.modalClearFiltersBtn.addEventListener("click", () => {
      state.modal = { status: "", driver: "", sort: "default", search: "" };
      renderAll();
    });
    els.rowsBody.addEventListener("change", event => {
      const stateSelect = event.target.closest("[data-state]");
      if (stateSelect) updateTreatment(stateSelect.dataset.state, { state: stateSelect.value });
      const input = event.target.closest("[data-treatment]");
      if (input) {
        const field = input.dataset.treatmentField || "text";
        updateTreatment(input.dataset.treatment, { [field]: input.value }, { render: false, fromBillingForms: field === "billingText" && state.panel === "billingForms" });
      }
    });
    els.rowsBody.addEventListener("input", debounce(event => {
      const input = event.target.closest("[data-treatment]");
      if (input) {
        const field = input.dataset.treatmentField || "text";
        updateTreatment(input.dataset.treatment, { [field]: input.value }, { render: false, fromBillingForms: field === "billingText" && state.panel === "billingForms" });
      }
    }, 450));
    els.driverRanking.addEventListener("click", event => {
      const button = event.target.closest("[data-driver]");
      if (!button) return;
      state.filters.driver = [button.dataset.driver];
      state.filters.situation = ["pending"];
      state.filters.group = "";
      setPanel("worklist");
      renderAll();
    });
    document.getElementById("overview").addEventListener("click", event => {
      const button = event.target.closest("[data-kpi]");
      if (!button) return;
      const shortcut = clean(button.dataset.kpi);
      openOverviewDetail(shortcut || "total");
    });
    document.querySelectorAll("[data-shortcut]").forEach(button => button.addEventListener("click", () => {
      const map = { pending: "pending", resolved: "resolved", history: "history" };
      openOverviewDetail(map[button.dataset.shortcut] || "total");
    }));
    els.overviewDrillCloseBtn.addEventListener("click", () => {
      state.overviewDetail = "";
      els.overviewDrilldown.close();
      renderAll();
    });
    els.overviewDrilldown.addEventListener("click", event => {
      if (event.target === els.overviewDrilldown) {
        state.overviewDetail = "";
        els.overviewDrilldown.close();
        renderAll();
      }
    });
    els.overviewSortFilter.addEventListener("change", event => { state.overviewModal.sort = event.target.value; renderOverviewDetail(); });
    els.overviewSearch.addEventListener("input", event => { state.overviewModal.search = event.target.value; renderOverviewDetail(); });
    els.overviewClearFiltersBtn.addEventListener("click", () => {
      state.overviewModal = { status: [], driver: [], situation: [], reason: [], sort: "default", search: "" };
      renderOverviewDetail();
    });
    els.historyBody?.addEventListener("click", event => {
      const button = event.target.closest("[data-history-remove]");
      if (!button) return;
      const br = button.dataset.historyRemove;
      const type = button.dataset.historyType;
      const confirmed = window.confirm(`Remover a tratativa de ${type.toLowerCase()} da BR ${br}?`);
      if (!confirmed) return;
      removeHistoryTreatment(br, type);
    });
    els.overviewDrillBody.addEventListener("input", debounce(event => {
      const input = event.target.closest("[data-overview-treatment]");
      if (input) {
        const field = input.dataset.treatmentField || "text";
        updateTreatment(input.dataset.overviewTreatment, { [field]: input.value }, { render: false });
      }
    }, 450));
    document.querySelectorAll("[data-open-filter]").forEach(button => button.addEventListener("click", () => setPanel("worklist")));
    els.exportViewBtn.addEventListener("click", () => exportCsv(exportRowsForCurrentView(), "pnr-visão-atual.csv"));
    els.exportTreatmentsBtn.addEventListener("click", exportSavedTreatments);
    els.exportTreatmentsWorklistBtn?.addEventListener("click", exportSavedTreatments);
    els.cloudImportTreatmentsBtn.addEventListener("click", () => els.treatmentsFileInput?.click());
    els.treatmentsFileInput?.addEventListener("change", event => importTreatmentsFile(event.target.files));
    els.cloudSyncTreatmentsBtn.addEventListener("click", saveTreatmentsCloud);
    els.cloudManualSaveBtn.addEventListener("click", () => {
      const br = normalizeKey(els.cloudManualBr.value);
      const text = clean(els.cloudManualTreatment.value);
      if (!br || !text) {
        setSync("Informe a BR e a tratativa para salvar.", "warn");
        return;
      }
      updateTreatment(br, { text, state: "Tratado" });
      els.cloudManualBr.value = "";
      els.cloudManualTreatment.value = "";
      renderSettings();
    });
    els.cloudAuthForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const client = pendingCloudLogin?.client || supabaseClient();
      if (!client) {
        setCloudAuthMessage("Supabase indisponível. Verifique a configuração.", "error");
        return;
      }
      const email = clean(els.cloudAuthEmail.value).toLowerCase();
      const password = els.cloudAuthPassword.value;
      if (!email || !password) {
        setCloudAuthMessage("Informe e-mail e senha.", "error");
        return;
      }
      setCloudAuthMessage("Entrando...");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        setCloudAuthMessage("Login não autorizado no Supabase.", "error");
        return;
      }
      setCloudAuthMessage("Carregando dados da nuvem...");
      markCloudAuthOk(data.session, { keepLocked: true });
      setSync(`Login ativo: ${data.session.user.email}`, "ok");
      await autoLoadCloud(client);
      closeCloudLogin(client);
    });
    els.cloudAuthCancelBtn?.addEventListener("click", () => {
      if (pendingCloudLogin?.required) {
        setCloudAuthMessage("Login obrigatório para liberar o dashboard hoje.", "error");
        return;
      }
      setSync("Login cancelado. A ação da nuvem não foi concluída.", "warn");
      closeCloudLogin(null);
    });
    els.cloudAuthDialog?.addEventListener("cancel", event => {
      event.preventDefault();
      if (pendingCloudLogin?.required) {
        setCloudAuthMessage("Login obrigatório para liberar o dashboard hoje.", "error");
        return;
      }
      setSync("Login cancelado. A ação da nuvem não foi concluída.", "warn");
      closeCloudLogin(null);
    });
    els.saveSettingsBtn.addEventListener("click", () => {
      const supabaseKey = clean(els.supabaseKey.value);
      if (unsafeSupabaseKey(supabaseKey)) {
        setSync("Chave service_role bloqueada. Cole somente a chave pública/publishable do Supabase.", "error");
        return;
      }
      state.settings = { supabaseUrl: clean(els.supabaseUrl.value), supabaseKey };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
      setSync("Configuração salva neste navegador.", "ok");
    });
    els.loginBtn.addEventListener("click", loginCloud);
    els.logoutBtn.addEventListener("click", async () => {
      const client = supabaseClient();
      await client?.auth.signOut();
      setSync("Sessão encerrada.", "ok");
    });
    els.saveCloudBtn.addEventListener("click", saveCloud);
    els.loadCloudBtn.addEventListener("click", loadCloud);
    els.exportBackupBtn?.addEventListener("click", exportBackup);
    els.restoreBackupInput?.addEventListener("change", event => restoreBackup(event.target.files?.[0]));
  }

  function debounce(fn, wait) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  restoreLocal();
  bindEvents();
  renderAll();
  ensureDailyCloudLogin();
  if (window.lucide) window.lucide.createIcons();
}());
