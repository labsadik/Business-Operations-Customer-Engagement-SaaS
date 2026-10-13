"use client";

import { clientApi } from "@/lib/client-api";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Activity,
  FolderOpen,
  ClipboardList,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  Filter,
  Trash2,
  LayoutGrid,
  List,
  RotateCcw,
  Volume2,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import { useWorkspaceSidebarState } from "@/components/use-workspace-sidebar-state";
import UserAvatar from "@/components/user-avatar";
import WorkspaceUserProfile from "@/components/workspace-user-profile";
import { playTaskSoundIfEnabled } from "@/lib/client-task-sound";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/features/task-management/shared/constants";

type Employee = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  employmentStatus?: string;
};

type TaskDailyUsage = {
  enabled: boolean;
  usedToday: number;
  dailyLimit: number | null;
  remainingToday: number | null;
};

type TaskItem = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  assigneeUserIds: string[];
  assignmentSummary: { total: number; completed: number };
};

type TaskAssignmentItem = {
  id: string;
  assignee: { id: string; name: string; email: string; image: string | null } | null;
  assignedByUserId: string;
  status: TaskStatus;
  assignedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  statusChangedAt: string;
};

type TaskDetails = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string; email: string; image: string | null } | null;
  assignments: TaskAssignmentItem[];
};

type TaskViewMode = "BOARD" | "CALENDAR" | "TIMELINE" | "LIST";
type StatusOverviewFilter = "ALL" | "ACTIVE" | TaskStatus;
type TeamDirectoryFilter = "ALL" | "ACTIVE" | "ON_LEAVE" | "INACTIVE";
type RealtimeStatus = "CONNECTING" | "CONNECTED" | "POLLING";
type TaskSortMode = "UPDATED" | "DUE_DATE" | "PRIORITY";
type TaskOwnerFilter = "ALL" | "ASSIGNED_TO_ME" | "CREATED_BY_ME" | "OVERDUE";
type TaskCleanupPeriod = "WEEKLY" | "MONTHLY" | "YEARLY";

type TaskPageProps = {
  companyName: string;
  userName: string;
  userEmail: string;
  userImage?: string;
  userId: string;
  currentRole: string;
  taskManagementEnabled: boolean;
  vaultEnabled: boolean;
  liveChatEnabled: boolean;
};

const MANAGER_ROLES = ["COMPANY_ADMIN", "PLATFORM_ADMIN"];
const EMPLOYEE_DIRECTORY_REFRESH_MS = 5 * 60_000;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  return clientApi<T>(url, init);
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "TASK_REQUEST_FAILED";
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Please sign in again to manage tasks.",
    FORBIDDEN: "You don't have permission to perform that action.",
    FEATURE_NOT_IN_PLAN: "Task Management isn't enabled for this company's active plan.",
    PLAN_SUSPENDED: "Task updates are locked because this company's plan is suspended or expired. Ask a platform administrator to restore plan access.",
    ASSIGNEE_REQUIRED: "Choose at least one employee to assign this task to.",
    ASSIGNEE_NOT_FOUND: "One of the selected employees is no longer active in this workspace.",
    TASK_TITLE_REQUIRED: "Enter a title for the task.",
    TASK_LIST_FAILED: "Tasks couldn't be loaded. Please try again.",
    TASK_CREATE_FAILED: "The task couldn't be created. Please check the details and try again.",
    TASK_DAILY_LIMIT_REACHED: "Today’s task-assignment limit has been reached. You can assign more tasks after the workspace day resets.",
    TASK_LIMIT_CONFIGURATION_INVALID: "The task limit for this plan is misconfigured. Please contact your platform administrator.",
    TASK_STATUS_CONFLICT: "This task changed in another session. Refresh the board and try again.",
    ASSIGNMENT_NOT_FOUND: "This assignment is no longer available. Refresh the board and try again.",
    TASK_ALREADY_CANCELLED: "This task has been cancelled and can no longer be changed.",
    INVALID_TASK_CURSOR: "The task list cursor expired. Refresh the board and try again."
  };
  return messages[code] ?? "Something went wrong while working with tasks. Please try again.";
}

function labelStatus(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (value) => value.toUpperCase());
}

function formatDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No due date"
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function calendarDateKey(value: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function priorityClasses(priority: TaskPriority) {
  switch (priority) {
    case "URGENT": return "bg-rose-50 text-rose-700 ring-rose-200";
    case "HIGH": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "LOW": return "bg-slate-50 text-slate-600 ring-slate-200";
    default: return "bg-blue-50 text-blue-700 ring-blue-200";
  }
}

function employmentStatusName(status?: string) {
  if (status === "ON_LEAVE") return "On leave";
  if (status === "INACTIVE") return "Inactive";
  return "Active";
}

function employmentStatusClasses(status?: string) {
  if (status === "ON_LEAVE") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (status === "INACTIVE") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function statusColumnClasses(status: TaskStatus) {
  switch (status) {
    case "IN_PROGRESS": return "bg-blue-50 text-blue-700 ring-blue-200";
    case "BLOCKED": return "bg-rose-50 text-rose-700 ring-rose-200";
    case "IN_REVIEW": return "bg-violet-50 text-violet-700 ring-violet-200";
    case "COMPLETED": return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "CANCELLED": return "bg-slate-100 text-slate-500 ring-slate-200";
    default: return "bg-white text-slate-700 ring-slate-200";
  }
}

export default function TaskManagementDashboard({
  companyName,
  userName,
  userEmail,
  userImage,
  userId,
  currentRole,
  taskManagementEnabled,
  vaultEnabled,
  liveChatEnabled
}: TaskPageProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [dailyUsage, setDailyUsage] = useState<TaskDailyUsage>({
    enabled: taskManagementEnabled,
    usedToday: 0,
    dailyLimit: 10,
    remainingToday: 10
  });
  const dailyLimitReached = Boolean(
    taskManagementEnabled &&
    dailyUsage.enabled &&
    dailyUsage.dailyLimit !== null &&
    (dailyUsage.remainingToday ?? 0) <= 0
  );
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "ALL">("ALL");
  const [ownerFilter, setOwnerFilter] = useState<TaskOwnerFilter>("ALL");
  const [sortMode, setSortMode] = useState<TaskSortMode>("UPDATED");
  const [viewMode, setViewMode] = useState<TaskViewMode>("BOARD");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("CONNECTING");
  const [workViewOpen, setWorkViewOpen] = useState(false);
  const [teamDirectoryOpen, setTeamDirectoryOpen] = useState(false);
  const [statusOverviewOpen, setStatusOverviewOpen] = useState(false);
  const [teamDirectoryFilter, setTeamDirectoryFilter] = useState<TeamDirectoryFilter>("ALL");
  const [statusOverviewFilter, setStatusOverviewFilter] = useState<StatusOverviewFilter>("ALL");
  const [calendarMonth, setCalendarMonth] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), 1); });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => { const today = new Date(); return new Date(today.getFullYear(), today.getMonth(), today.getDate()); });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupPeriod, setCleanupPeriod] = useState<TaskCleanupPeriod>("WEEKLY");
  const [cleaningTasks, setCleaningTasks] = useState(false);
  const [details, setDetails] = useState<Record<string, TaskDetails>>({});
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyAssignmentId, setBusyAssignmentId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([userId]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState<{ task: TaskItem; assignment: TaskAssignmentItem } | null>(null);
  const { collapsed: sidebarCollapsed, toggle: toggleSidebar } = useWorkspaceSidebarState();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const canManage = MANAGER_ROLES.includes(currentRole);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const assignableEmployees = useMemo(
    () => employees.filter((employee) => employee.employmentStatus === "ACTIVE"),
    [employees]
  );
  const filteredTasks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const priorityRank: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const matching = tasks.filter((task) => {
      if (statusFilter !== "ALL" && task.status !== statusFilter) return false;
      if (priorityFilter !== "ALL" && task.priority !== priorityFilter) return false;
      if (ownerFilter === "ASSIGNED_TO_ME" && !task.assigneeUserIds.includes(userId)) return false;
      if (ownerFilter === "CREATED_BY_ME" && task.createdByUserId !== userId) return false;
      if (ownerFilter === "OVERDUE") {
        const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : Number.NaN;
        if (!Number.isFinite(dueTime) || dueTime >= nowMs || ["COMPLETED", "CANCELLED"].includes(task.status)) return false;
      }
      if (!query) return true;
      const assignedNames = task.assigneeUserIds.map((id) => {
        const employee = employeeById.get(id);
        return employee ? employee.name + " " + employee.email : "";
      }).join(" ");
      return [task.title, task.description, assignedNames, task.priority, task.status, task.id]
        .some((value) => value.toLowerCase().includes(query));
    });

    return matching.sort((left, right) => {
      if (sortMode === "PRIORITY") {
        const difference = priorityRank[left.priority] - priorityRank[right.priority];
        if (difference) return difference;
      } else if (sortMode === "DUE_DATE") {
        const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
        if (leftDue !== rightDue) return leftDue - rightDue;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [tasks, searchTerm, employeeById, statusFilter, priorityFilter, ownerFilter, sortMode, userId, nowMs]);

  const taskMetrics = useMemo(() => ({
    total: tasks.length,
    active: tasks.filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status)).length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    blocked: tasks.filter((task) => task.status === "BLOCKED").length,
    overdue: tasks.filter((task) => {
      const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : Number.NaN;
      return Number.isFinite(dueTime) && dueTime < nowMs && !["COMPLETED", "CANCELLED"].includes(task.status);
    }).length
  }), [tasks, nowMs]);

  const hasActiveFilters = Boolean(searchTerm.trim() || statusFilter !== "ALL" || priorityFilter !== "ALL" || ownerFilter !== "ALL");

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskItem[]> = {
      TODO: [], IN_PROGRESS: [], BLOCKED: [], IN_REVIEW: [], COMPLETED: [], CANCELLED: []
    };
    for (const task of filteredTasks) grouped[task.status].push(task);
    return grouped;
  }, [filteredTasks]);

  const calendarTasksByDate = useMemo(() => {
    const grouped = new Map<string, TaskItem[]>();
    for (const task of filteredTasks) {
      const key = calendarDateKey(task.dueAt);
      if (!key) continue;
      const dayTasks = grouped.get(key) ?? [];
      dayTasks.push(task);
      grouped.set(key, dayTasks);
    }
    return grouped;
  }, [filteredTasks]);
  const calendarDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    first.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [calendarMonth]);
  const selectedCalendarTasks = calendarTasksByDate.get(calendarDateKey(selectedCalendarDate)) ?? [];
  const timelineTasks = useMemo(() => [...filteredTasks].sort((left, right) =>
    new Date(left.dueAt ?? left.startedAt ?? left.createdAt).getTime() -
    new Date(right.dueAt ?? right.startedAt ?? right.createdAt).getTime()
  ), [filteredTasks]);
  const statusOverviewTasks = useMemo(() => filteredTasks.filter((task) => {
    if (statusOverviewFilter === "ALL") return true;
    if (statusOverviewFilter === "ACTIVE") return !["COMPLETED", "CANCELLED"].includes(task.status);
    return task.status === statusOverviewFilter;
  }), [filteredTasks, statusOverviewFilter]);
  const statusOverviewOptions: Array<{ value: StatusOverviewFilter; label: string; count: number; tone: string }> = [
    { value: "ALL", label: "Tasks loaded", count: tasks.length, tone: "text-slate-900" },
    { value: "ACTIVE", label: "Active work", count: taskMetrics.active, tone: "text-blue-700" },
    { value: "TODO", label: "To do / queued", count: tasksByStatus.TODO.length, tone: "text-slate-700" },
    { value: "IN_PROGRESS", label: "In progress", count: tasksByStatus.IN_PROGRESS.length, tone: "text-indigo-700" },
    { value: "BLOCKED", label: "Locked / blocked", count: tasksByStatus.BLOCKED.length, tone: "text-rose-700" },
    { value: "IN_REVIEW", label: "In review", count: tasksByStatus.IN_REVIEW.length, tone: "text-violet-700" },
    { value: "COMPLETED", label: "Completed", count: tasksByStatus.COMPLETED.length, tone: "text-emerald-700" },
    { value: "CANCELLED", label: "Cancelled", count: tasksByStatus.CANCELLED.length, tone: "text-slate-500" }
  ];

  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const employeeDirectoryLoadedAtRef = useRef(0);
  const loadQueuedRef = useRef(false);
  const loadTaskRef = useRef<((showSpinner?: boolean) => Promise<void>) | null>(null);

  const load = useCallback(async function loadTasks(showSpinner = true) {
    // Collapse overlapping reads, but remember that a mutation/focus refresh arrived
    // during the request so a stale response cannot be the final rendered state.
    if (loadInFlightRef.current) {
      loadQueuedRef.current = true;
      return loadInFlightRef.current;
    }
    if (!taskManagementEnabled) {
      setLoading(false);
      return;
    }

    if (showSpinner) setLoading(true);
    setError("");

    const pending = (async () => {
      try {
        const refreshEmployeeDirectory =
          Date.now() - employeeDirectoryLoadedAtRef.current >= EMPLOYEE_DIRECTORY_REFRESH_MS;
        const staffRequest = refreshEmployeeDirectory
          ? api<Employee[]>("/api/company/employees")
              .then((staff) => {
                employeeDirectoryLoadedAtRef.current = Date.now();
                return staff;
              })
              .catch(() => null)
          : Promise.resolve(null);

        const [taskPage, staff] = await Promise.all([
          api<{ items: TaskItem[]; nextCursor: string | null; usage?: TaskDailyUsage }>("/api/tasks?limit=50"),
          staffRequest
        ]);
        setTasks(taskPage.items);
        setNextCursor(taskPage.nextCursor);
        if (taskPage.usage) setDailyUsage(taskPage.usage);
        if (staff !== null) {
          setEmployees(staff);
          const assignableIds = new Set(staff.filter((member) => member.employmentStatus === "ACTIVE").map((member) => member.id));
          setSelectedAssigneeIds((current) => current.length
            ? current.filter((id) => assignableIds.has(id))
            : assignableIds.has(userId) ? [userId] : []);
        }
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    })();

    loadInFlightRef.current = pending;
    try {
      await pending;
    } finally {
      if (loadInFlightRef.current === pending) loadInFlightRef.current = null;
      if (loadQueuedRef.current) {
        loadQueuedRef.current = false;
        window.setTimeout(() => void loadTaskRef.current?.(false), 0);
      }
    }
  }, [taskManagementEnabled, userId]);



  useEffect(() => {
    loadTaskRef.current = load;
  }, [load]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void load();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);



  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!taskManagementEnabled) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let connectionTimer: number | undefined;
    let attempt = 0;

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== undefined) return;
      setRealtimeStatus("POLLING");
      const delay = Math.min(1_000 * (2 ** Math.min(attempt, 5)), 30_000);
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        setRealtimeStatus("CONNECTING");
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        const result = await api<{ enabled: boolean; ticket: string | null }>("/api/tasks/realtime-ticket");
        if (cancelled) return;
        if (!result.enabled || !result.ticket) {
          setRealtimeStatus("POLLING");
          return;
        }

        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        const currentSocket = new WebSocket(
          `${scheme}//${window.location.host}/api/tasks/realtime`,
          ["canvas-tasks", `ticket.${result.ticket}`]
        );
        socket = currentSocket;
        connectionTimer = window.setTimeout(() => {
          if (currentSocket.readyState === WebSocket.CONNECTING) currentSocket.close();
        }, 10_000);

        currentSocket.onopen = () => {
          if (cancelled) return currentSocket.close();
          if (connectionTimer !== undefined) window.clearTimeout(connectionTimer);
          connectionTimer = undefined;
          attempt = 0;
          setRealtimeStatus("CONNECTED");
        };
        currentSocket.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as { type?: string };
            if (message.type === "task.changed") void load(false);
            if (message.type === "board.changed") void load(false);
          } catch {
            // Ignore malformed frames; the authenticated refresh path repairs the view.
          }
        };
        currentSocket.onerror = () => currentSocket.close();
        currentSocket.onclose = () => {
          if (connectionTimer !== undefined) window.clearTimeout(connectionTimer);
          connectionTimer = undefined;
          if (socket === currentSocket) socket = null;
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();
    return () => {
      cancelled = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (connectionTimer !== undefined) window.clearTimeout(connectionTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [taskManagementEnabled, load]);

  useEffect(() => {
    // Authenticated polling remains a recovery path for serverless deployments and network interruptions.
    const refreshVisibleTasks = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    const poll = window.setInterval(refreshVisibleTasks, 30_000);
    document.addEventListener("visibilitychange", refreshVisibleTasks);
    window.addEventListener("focus", refreshVisibleTasks);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", refreshVisibleTasks);
      window.removeEventListener("focus", refreshVisibleTasks);
    };
  }, [load]);

  useEffect(() => {
    if (!showCreateForm && !searchOpen && !cleanupOpen && !cancelConfirm && !workViewOpen && !teamDirectoryOpen && !statusOverviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || cleaningTasks || saving) return;
      setShowCreateForm(false);
      setSearchOpen(false);
      setCleanupOpen(false);
      setCancelConfirm(null);
      setWorkViewOpen(false);
      setTeamDirectoryOpen(false);
      setStatusOverviewOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCreateForm, searchOpen, cleanupOpen, cancelConfirm, workViewOpen, teamDirectoryOpen, statusOverviewOpen, cleaningTasks, saving]);

  useEffect(() => {
    const syncOwnEmploymentStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ employmentStatus?: string }>).detail;
      if (!detail?.employmentStatus) return;
      setEmployees((current) => current.map((employee) =>
        employee.id === userId ? { ...employee, employmentStatus: detail.employmentStatus } : employee
      ));
      if (detail.employmentStatus !== "ACTIVE") {
        setSelectedAssigneeIds((current) => current.filter((id) => id !== userId));
      }
    };
    window.addEventListener("canvas:employment-status-updated", syncOwnEmploymentStatus);
    return () => window.removeEventListener("canvas:employment-status-updated", syncOwnEmploymentStatus);
  }, [userId]);

  async function loadMoreTasks() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "50", cursor: nextCursor });
      const page = await api<{ items: TaskItem[]; nextCursor: string | null }>("/api/tasks?" + params.toString());
      setTasks((current) => {
        const knownIds = new Set(current.map((task) => task.id));
        return [...current, ...page.items.filter((task) => !knownIds.has(task.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openTask(taskId: string) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    if (details[taskId]) return;
    setError("");
    try {
      const detail = await api<TaskDetails>(`/api/tasks/${taskId}`);
      setDetails((current) => ({ ...current, [taskId]: detail }));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  async function clearClosedTasks() {
    if (!canManage || cleaningTasks) return;
    setError("");
    setNotice("");
    setCleaningTasks(true);
    try {
      const result = await api<{ deletedCount: number; period: TaskCleanupPeriod; days: number }>("/api/tasks", {
        method: "DELETE",
        body: JSON.stringify({
          period: cleanupPeriod,
          confirm: "CLEAR_CLOSED_TASKS"
        })
      });
      setCleanupOpen(false);
      setExpandedTaskId(null);
      setDetails({});
      await load(false);
      const periodLabel = cleanupPeriod === "WEEKLY" ? "last 7 days" : cleanupPeriod === "MONTHLY" ? "last 30 days" : "last 365 days";
      setNotice(result.deletedCount
        ? `Permanently cleared ${result.deletedCount} closed task(s) updated in the ${periodLabel}.`
        : `No completed or cancelled tasks matched the ${periodLabel} cleanup window.`);
    } catch (cleanupError) {
      setError(errorMessage(cleanupError));
    } finally {
      setCleaningTasks(false);
    }
  }

  function syncTaskFromDetail(taskId: string, detail: TaskDetails) {
    const completed = detail.assignments.filter((assignment) => assignment.status === "COMPLETED").length;
    setTasks((current) => current.map((task) => task.id === taskId ? {
      ...task,
      status: detail.status,
      dueAt: detail.dueAt,
      startedAt: detail.startedAt,
      completedAt: detail.completedAt,
      updatedAt: detail.updatedAt,
      assignmentSummary: { total: detail.assignments.length, completed }
    } : task));
    setDetails((current) => ({ ...current, [taskId]: detail }));
  }

  async function updateAssignment(task: TaskItem, assignment: TaskAssignmentItem, status: TaskStatus) {
    setError("");
    setNotice("");
    setBusyAssignmentId(assignment.id);
    const managerForTask = canManage || task.createdByUserId === userId;
    try {
      await api<{ taskStatus: TaskStatus }>(`/api/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(managerForTask ? { assignmentId: assignment.id } : {})
        })
      });
      const detail = await api<TaskDetails>(`/api/tasks/${task.id}`);
      syncTaskFromDetail(task.id, detail);
      setNotice("Task status updated.");
      void playTaskSoundIfEnabled(
        status === "COMPLETED" ? "completed" : status === "CANCELLED" ? "cancelled" : "updated"
      );
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setBusyAssignmentId(null);
    }
  }

  async function moveTaskToStatus(task: TaskItem, status: TaskStatus) {
    if (task.status === status || movingTaskId || task.status === "CANCELLED") return;

    const managerForTask = canManage || task.createdByUserId === userId;
    if (status === "CANCELLED" && !managerForTask) {
      setError("Only a task manager or its creator can cancel a task.");
      return;
    }

    setError("");
    setNotice("");
    setMovingTaskId(task.id);

    try {
      const detail = details[task.id] ?? await api<TaskDetails>("/api/tasks/" + task.id);
      const assignmentsToUpdate = detail.assignments.filter((assignment) =>
        assignment.status !== status &&
        assignment.status !== "CANCELLED" &&
        (managerForTask || assignment.assignee?.id === userId)
      );

      if (!assignmentsToUpdate.length) {
        throw new Error("No editable assignment was found for this task.");
      }

      // Managers/creators move the whole task; employees move only their own assignment.
      for (const assignment of assignmentsToUpdate) {
        await api("/api/tasks/" + task.id + "/status", {
          method: "PATCH",
          body: JSON.stringify({
            status,
            ...(managerForTask ? { assignmentId: assignment.id } : {})
          })
        });
      }

      const refreshedDetail = await api<TaskDetails>("/api/tasks/" + task.id);
      syncTaskFromDetail(task.id, refreshedDetail);
      setNotice("Task moved to " + labelStatus(status).toLowerCase() + ".");
      void playTaskSoundIfEnabled(
        status === "COMPLETED" ? "completed" : status === "CANCELLED" ? "cancelled" : "updated"
      );
    } catch (moveError) {
      setError(errorMessage(moveError));
    } finally {
      setMovingTaskId(null);
      setDraggedTaskId(null);
      setDropTargetStatus(null);
    }
  }

  function renderTaskDetails(task: TaskItem) {
    const detail = details[task.id];
    const managerForTask = canManage || task.createdByUserId === userId;
    return (
      <div className="border-t border-slate-200 bg-slate-50/70 px-3.5 py-3">
        {!detail ? (
          <p className="flex items-center gap-2 text-xs text-slate-500" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Loading assignments…
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <UserAvatar name={detail.createdBy?.name ?? detail.createdBy?.email ?? "Workspace member"} email={detail.createdBy?.email ?? ""} image={detail.createdBy?.image} size={24} className="text-[8px]" />
                <p className="truncate text-[10px] text-slate-500">Created by {detail.createdBy?.name ?? detail.createdBy?.email ?? "Workspace member"}</p>
              </div>
              <span className="text-[10px] text-slate-400">Updated {formatDate(detail.updatedAt)}</span>
            </div>
            {detail.assignments.map((assignment) => {
              const canChange = managerForTask || assignment.assignee?.id === userId;
              const statuses = managerForTask ? TASK_STATUSES : TASK_STATUSES.filter((item) => item !== "CANCELLED");
              return (
                <div key={assignment.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex min-w-0 items-center gap-2">
                    <UserAvatar name={assignment.assignee?.name ?? assignment.assignee?.email ?? "Workspace member"} email={assignment.assignee?.email ?? ""} image={assignment.assignee?.image} size={28} className="text-[8px]" />
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-semibold text-slate-800">{assignment.assignee?.name ?? assignment.assignee?.email ?? "Workspace member"}</p>
                      <p className="truncate text-[9px] text-slate-500">{assignment.assignee?.email ?? ""}</p>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-semibold text-slate-500">Assignment status</span>
                    <select
                      aria-label={`Status for ${assignment.assignee?.name ?? "assignee"}`}
                      disabled={!canChange || busyAssignmentId === assignment.id || task.status === "CANCELLED"}
                      value={assignment.status}
                      onChange={(event) => {
                        const nextStatus = event.target.value as TaskStatus;
                        if (nextStatus === "CANCELLED") {
                          setCancelConfirm({ task, assignment });
                          return;
                        }
                        void updateAssignment(task, assignment, nextStatus);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {statuses.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                    </select>
                  </label>
                  {busyAssignmentId === assignment.id && <LoaderCircle className="mt-2 size-4 animate-spin text-blue-600" aria-label="Saving assignment status" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <WorkspaceSidebar
        companyName={companyName}
        taskManagementEnabled={taskManagementEnabled}
        vaultEnabled={vaultEnabled}
        liveChatEnabled={liveChatEnabled}
        canManage={canManage}
        adminManaged={currentRole === "PLATFORM_ADMIN"}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
      />
      <div className={sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}>
        <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-[#faf9f1]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Workspace</p>
              <h1 className="mt-1 truncate text-base font-semibold tracking-tight text-slate-950">Task management</h1>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:px-3.5"
              >
                <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <WorkspaceUserProfile name={userName || userEmail} email={userEmail} image={userImage} currentRole={currentRole} />
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-6 px-5 py-7 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Team work</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tasks for {companyName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">A project board for assigning work, tracking ownership, and moving tasks through clear stages.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <ClipboardList className="size-5 text-blue-600" />
                <div>
                  <p className="text-xl font-semibold tabular-nums">{tasks.length}</p>
                  <p className="text-[10px] text-slate-500">Workspace tasks</p>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <button
                type="button"
                aria-label="Search tasks"
                onClick={() => setSearchOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={searchOpen}
                className="inline-flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm text-slate-500 transition hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:max-w-md"
              >
                <Search className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{searchTerm || "Search tasks, descriptions, assignees…"}</span>
                <span className="ml-auto hidden rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 sm:inline">Search</span>
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  aria-haspopup="dialog"
                  aria-expanded={showCreateForm}
                  disabled={dailyLimitReached}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="size-4" />
                  {"Create task"}
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setCleanupOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Clear task history
                  </button>
                )}
                <div className={"inline-flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-medium " + (realtimeStatus === "CONNECTED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : realtimeStatus === "CONNECTING" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600")} aria-live="polite" aria-label={realtimeStatus === "CONNECTED" ? "Real-time task updates connected" : realtimeStatus === "CONNECTING" ? "Connecting to real-time task updates" : "Polling fallback is active"}>
                  {realtimeStatus === "CONNECTED" ? <Wifi className="size-4" aria-hidden="true" /> : realtimeStatus === "CONNECTING" ? <WifiOff className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                  {realtimeStatus === "CONNECTED" ? "Live updates connected" : realtimeStatus === "CONNECTING" ? "Connecting live updates" : "Polling fallback active"}
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-600" aria-label="Task action sounds are enabled automatically">
                  <Volume2 className="size-4 text-blue-600" aria-hidden="true" />
                  Action sounds on automatically
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Task workspace folders" className="grid gap-4 lg:grid-cols-3">
            <button type="button" onClick={() => { setViewMode("BOARD"); setWorkViewOpen(true); }} aria-label="Task work view" aria-haspopup="dialog" className="group rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm"><FolderOpen className="size-6" aria-hidden="true" /></span><span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-800">Workspace</span></div>
              <h2 className="mt-4 text-base font-bold text-slate-950">Task work view</h2><p className="mt-1 text-xs leading-5 text-slate-600">Open Kanban, calendar, timeline or task list in a focused popup.</p>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-blue-100 pt-3"><span className="text-xs font-semibold text-slate-700"><strong className="text-slate-950">{tasks.length}</strong> tasks loaded</span><span className="text-[11px] font-semibold text-blue-700 group-hover:underline">Open workspace ↗</span></div>
              <div className="mt-3 flex items-center gap-1.5">{employees.slice(0,4).map((employee)=><span key={employee.id} className="-ml-0.5 inline-flex rounded-full ring-2 ring-white"><UserAvatar name={employee.name || employee.email} email={employee.email} image={employee.image} size={26}/></span>)}{employees.length>4&&<span className="text-[10px] font-semibold text-slate-500">+{employees.length-4} people</span>}</div>
            </button>
            <button type="button" onClick={() => { setTeamDirectoryFilter("ALL"); setTeamDirectoryOpen(true); }} aria-haspopup="dialog" className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Users className="size-6" aria-hidden="true"/></span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">People</span></div>
              <h2 className="mt-4 text-base font-bold text-slate-950">Team directory</h2><p className="mt-1 text-xs leading-5 text-slate-600">Inspect team availability, leave and inactive accounts.</p>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-[10px] font-semibold"><span className="rounded-full bg-emerald-50 px-2.5 py-1.5 text-emerald-800">{employees.filter((e)=>e.employmentStatus==="ACTIVE").length} active</span><span className="rounded-full bg-amber-50 px-2.5 py-1.5 text-amber-800">{employees.filter((e)=>e.employmentStatus==="ON_LEAVE").length} on leave</span><span className="rounded-full bg-rose-50 px-2.5 py-1.5 text-rose-800">{employees.filter((e)=>e.employmentStatus==="INACTIVE").length} inactive</span></div>
              <div className="mt-3 flex items-center gap-1.5">{employees.slice(0,5).map((employee)=><span key={employee.id} className="-ml-0.5 inline-flex rounded-full ring-2 ring-white"><UserAvatar name={employee.name || employee.email} email={employee.email} image={employee.image} size={25}/></span>)}</div>
            </button>
            <button type="button" onClick={() => { setStatusOverviewFilter("ALL"); setStatusOverviewOpen(true); }} aria-haspopup="dialog" className="group rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
              <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><ClipboardList className="size-6" aria-hidden="true"/></span><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-800">Operations</span></div>
              <h2 className="mt-4 text-base font-bold text-slate-950">Task status</h2><p className="mt-1 text-xs leading-5 text-slate-600">See task counts and inspect each stage.</p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3"><div className="rounded-xl bg-slate-50 px-2 py-2"><p className="text-lg font-bold text-slate-900">{taskMetrics.total}</p><p className="text-[9px] text-slate-500">Loaded</p></div><div className="rounded-xl bg-blue-50 px-2 py-2"><p className="text-lg font-bold text-blue-700">{taskMetrics.active}</p><p className="text-[9px] text-blue-700">Active</p></div><div className="rounded-xl bg-rose-50 px-2 py-2"><p className="text-lg font-bold text-rose-700">{taskMetrics.blocked}</p><p className="text-[9px] text-rose-700">Locked</p></div></div>
            </button>
          </section>
          {teamDirectoryOpen && <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="team-directory-title" className="mx-auto my-4 w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">People workspace</p><h2 id="team-directory-title" className="mt-1 text-xl font-bold text-slate-950">Team availability</h2><p className="mt-1 text-sm text-slate-500">Select a status to review members available for work.</p></div><button type="button" onClick={()=>setTeamDirectoryOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Close</button></div>
            <div className="mt-5 grid grid-cols-3 gap-2">{([{v:"ACTIVE" as const,l:"Active",n:employees.filter((e)=>e.employmentStatus==="ACTIVE").length},{v:"ON_LEAVE" as const,l:"On leave",n:employees.filter((e)=>e.employmentStatus==="ON_LEAVE").length},{v:"INACTIVE" as const,l:"Inactive",n:employees.filter((e)=>e.employmentStatus==="INACTIVE").length}]).map(x=><button key={x.v} type="button" onClick={()=>setTeamDirectoryFilter(x.v)} className={"rounded-2xl border p-3 text-left "+(teamDirectoryFilter===x.v?"border-blue-300 bg-blue-50":"border-slate-200 bg-white")}><p className="text-[10px] font-semibold uppercase">{x.l}</p><p className="mt-1 text-2xl font-bold">{x.n}</p></button>)}</div>
            <button type="button" onClick={()=>setTeamDirectoryFilter("ALL")} className={"mt-3 rounded-full px-3 py-1.5 text-xs font-semibold "+(teamDirectoryFilter==="ALL"?"bg-slate-900 text-white":"bg-slate-100 text-slate-600")}>All team ({employees.length})</button>
            <div className="mt-4 grid max-h-[58vh] gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{employees.filter((e)=>teamDirectoryFilter==="ALL"||e.employmentStatus===teamDirectoryFilter).map(employee=><article key={employee.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3"><UserAvatar name={employee.name||employee.email} email={employee.email} image={employee.image} size={42}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{employee.name||employee.email}{employee.id===userId?" (you)":""}</p><p className="truncate text-[11px] text-slate-500">{employee.email}</p><p className="text-[10px] text-slate-400">{employee.role.replaceAll("_"," ").toLowerCase()}</p></div><span className={"rounded-full px-2 py-1 text-[9px] font-semibold "+employmentStatusClasses(employee.employmentStatus)}>{employmentStatusName(employee.employmentStatus)}</span></article>)}
              {employees.filter((e)=>teamDirectoryFilter==="ALL"||e.employmentStatus===teamDirectoryFilter).length===0&&<p className="col-span-full p-8 text-center text-sm text-slate-500">No members in this availability group.</p>}</div>
          </section></div>}
          {statusOverviewOpen && <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"><section role="dialog" aria-modal="true" aria-labelledby="task-status-overview-title" className="mx-auto my-4 w-full max-w-6xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">Operations workspace</p><h2 id="task-status-overview-title" className="mt-1 text-xl font-bold text-slate-950">Task status overview</h2><p className="mt-1 text-sm text-slate-500">Counts reflect loaded tasks; select a status to filter its work.</p></div><button type="button" onClick={()=>setStatusOverviewOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold">Close</button></div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">{statusOverviewOptions.map(item=><button key={item.value} type="button" onClick={()=>setStatusOverviewFilter(item.value)} className={"rounded-2xl border p-3 text-left "+(statusOverviewFilter===item.value?"border-blue-300 bg-blue-50 ring-2 ring-blue-100":"border-slate-200 bg-white hover:bg-slate-50")}><p className="text-[10px] font-semibold leading-4 text-slate-500">{item.label}</p><p className={"mt-1 text-2xl font-bold "+item.tone}>{item.count}</p></button>)}</div>
            <div className="mt-5 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{statusOverviewOptions.find(x=>x.value===statusOverviewFilter)?.label}</h3><span className="text-xs text-slate-500">{statusOverviewTasks.length} shown</span></div>
            <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200">{statusOverviewTasks.map(task=><button key={task.id} type="button" onClick={()=>{setStatusOverviewOpen(false);setWorkViewOpen(true);setViewMode("BOARD");setStatusFilter(task.status);void openTask(task.id);}} className="flex w-full flex-col gap-2 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 sm:flex-row sm:items-center"><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className="mt-1 block text-[10px] text-slate-500">TASK-{task.id.slice(-6).toUpperCase()} · {labelStatus(task.priority)} · {formatDate(task.dueAt)}</span></span><span className="flex items-center gap-1">{task.assigneeUserIds.slice(0,3).map(id=>{const member=employeeById.get(id);return member?<span key={id} title={member.name}><UserAvatar name={member.name||member.email} email={member.email} image={member.image} size={26}/></span>:null;})}</span><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold "+statusColumnClasses(task.status)}>{task.status==="BLOCKED"?"Locked / blocked":labelStatus(task.status)}</span></button>)}
              {statusOverviewTasks.length===0&&<p className="p-10 text-center text-sm text-slate-500">No tasks match this status and the current filters.</p>}</div>
          </section></div>}
          {error &&

          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
          {notice && (
            <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <p>{notice}</p>
            </div>
          )}

          {cleanupOpen && canManage && taskManagementEnabled && (
            <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
              <section role="dialog" aria-modal="true" aria-labelledby="task-cleanup-title" className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700"><Trash2 className="size-5" aria-hidden="true" /></span>
                  <div>
                    <h2 id="task-cleanup-title" className="text-lg font-semibold text-slate-950">Clear closed task history</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Permanently remove completed or cancelled tasks updated in the selected period, along with their assignments, activity records, and notifications.</p>
                  </div>
                </div>
                <label className="mt-5 block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-700">Cleanup period</span>
                  <select value={cleanupPeriod} onChange={(event) => setCleanupPeriod(event.target.value as TaskCleanupPeriod)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                    <option value="WEEKLY">Weekly · last 7 days</option>
                    <option value="MONTHLY">Monthly · last 30 days</option>
                    <option value="YEARLY">Yearly · last 365 days</option>
                  </select>
                </label>
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">Active tasks are never cleared by this action. This deletion cannot be undone.</p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" disabled={cleaningTasks} onClick={() => setCleanupOpen(false)} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button type="button" disabled={cleaningTasks} onClick={() => void clearClosedTasks()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-xs font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50">
                    {cleaningTasks && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                    {cleaningTasks ? "Clearing history…" : "Permanently clear closed tasks"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {searchOpen && taskManagementEnabled && (
            <div
              className="fixed inset-0 z-[85] grid place-items-start justify-center bg-slate-950/55 p-3 pt-[12vh] backdrop-blur-sm sm:p-6 sm:pt-[15vh]"
              onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}
            >
              <section role="dialog" aria-modal="true" aria-labelledby="task-search-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <form onSubmit={(event) => { event.preventDefault(); setSearchOpen(false); }}>
                  <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3.5 sm:px-5">
                    <Search className="size-5 shrink-0 text-blue-600" aria-hidden="true" />
                    <label className="min-w-0 flex-1">
                      <span id="task-search-title" className="sr-only">Search tasks</span>
                      <input autoFocus value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search task title, description, assignee…" className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-0" />
                    </label>
                    {searchTerm && <button type="button" onClick={() => setSearchTerm("")} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100">Clear</button>}
                    <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search dialog" className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></button>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-[11px] text-slate-500 sm:px-5">
                    <span>{searchTerm ? `${filteredTasks.length} matching task(s)` : "Search across tasks and assigned team members"}</span>
                    <button type="submit" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800">View results</button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {cancelConfirm && (
            <div className="fixed inset-0 z-[88] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
              <section role="dialog" aria-modal="true" aria-labelledby="cancel-task-assignment-title" className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
                <h2 id="cancel-task-assignment-title" className="text-lg font-semibold text-slate-950">Cancel this assignment?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Cancel <span className="font-semibold">&ldquo;{cancelConfirm.task.title}&rdquo;</span> for {cancelConfirm.assignment.assignee?.name ?? "this member"}? This updates the assignment status for the company workspace.</p>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setCancelConfirm(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Keep assignment</button>
                  <button type="button" onClick={() => { const pending = cancelConfirm; setCancelConfirm(null); void updateAssignment(pending.task, pending.assignment, "CANCELLED"); }} className="rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-800">Confirm cancellation</button>
                </div>
              </section>
            </div>
          )}

          {!taskManagementEnabled ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-base font-semibold text-amber-950">Task Management isn’t enabled</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">Enable Task Management in the plan assigned to this company, then reload this page. Access is checked on the server as well as in navigation.</p>
            </section>
          ) : (
            <>
              <section aria-label="Task workload summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {[
                  { label: "Tasks loaded", value: taskMetrics.total, detail: nextCursor ? "More tasks available" : "All tasks loaded", tone: "text-slate-950" },
                  { label: "Active work", value: taskMetrics.active, detail: "Not completed or cancelled", tone: "text-blue-700" },
                  { label: "In progress", value: taskMetrics.inProgress, detail: "Being worked on", tone: "text-indigo-700" },
                  { label: "Blocked / overdue", value: taskMetrics.blocked + taskMetrics.overdue, detail: taskMetrics.blocked + " blocked · " + taskMetrics.overdue + " overdue", tone: taskMetrics.blocked + taskMetrics.overdue > 0 ? "text-rose-700" : "text-slate-950" }
                ].map((metric) => (
                  <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <p className="text-[11px] font-semibold text-slate-500">{metric.label}</p>
                    <p className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${metric.tone}`}>{metric.value}</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-400">{metric.detail}</p>
                  </article>
                ))}
              </section>

              <section aria-label="Daily task assignment allowance" className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">Daily task-assignment allowance</p>
                  <p id="task-daily-limit-message" className="mt-1 text-[11px] leading-5 text-slate-500">
                    {dailyUsage.dailyLimit === null
                      ? String(dailyUsage.usedToday) + " tasks assigned today · Unlimited daily cap."
                      : String(dailyUsage.usedToday) + " of " + String(dailyUsage.dailyLimit) + " task assignments used today."}
                    {dailyLimitReached ? " Limit reached. New task assignments are locked until the next workspace day." : ""}
                  </p>
                </div>
                {dailyUsage.dailyLimit !== null && (
                  <div className="mt-3 h-2 min-w-28 flex-1 overflow-hidden rounded-full bg-slate-100 sm:mt-0 sm:max-w-xs">
                    <div className={"h-full rounded-full " + (dailyLimitReached ? "bg-rose-600" : "bg-violet-600")} style={{ width: String(Math.min(100, (dailyUsage.usedToday / Math.max(1, dailyUsage.dailyLimit)) * 100)) + "%" }} />
                  </div>
                )}
                {dailyLimitReached && (
                  <span className="mt-3 inline-flex shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-semibold text-rose-700 sm:mt-0">Daily cap reached</span>
                )}
              </section>

              {showCreateForm && (
              <div
                className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
                onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCreateForm(false); }}
              >
              <section role="dialog" aria-modal="true" aria-labelledby="create-task-title" className="w-full max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-7">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                      <Plus className="size-4" />
                    </span>
                    <div>
                      <h2 id="create-task-title" className="text-base font-semibold">Create a task</h2>
                      <p className="text-xs text-slate-500">Choose one or more active employees to assign it to.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowCreateForm(false)} disabled={saving} aria-label="Close create task dialog" className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={createTask} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-700">Task title</span>
                      <input
                        required
                        maxLength={160}
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="e.g. Prepare the weekly report"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-700">Priority</span>
                        <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500">
                          {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-700">Due date</span>
                        <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2.5 py-3 text-sm outline-none focus:border-blue-500" />
                      </label>
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span></span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} rows={3} placeholder="Add context, expected outcome, or instructions…" className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-blue-500" />
                  </label>

                  <fieldset>
                    <legend className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <Users className="size-4 text-slate-400" />
                      Assign to ({selectedAssigneeIds.length} selected)
                    </legend>
                    {employees.length ? (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {assignableEmployees.map((employee) => (
                          <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:bg-slate-50">
                            <input
                              type="checkbox"
                              checked={selectedAssigneeIds.includes(employee.id)}
                              onChange={(event) => setSelectedAssigneeIds((current) => event.target.checked
                                ? [...new Set([...current, employee.id])]
                                : current.filter((id) => id !== employee.id))}
                              className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <UserAvatar name={employee.name || employee.email} email={employee.email} image={employee.image} size={34} className="border-2 border-white shadow-sm" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-slate-800">{employee.name || employee.email}</span>
                              <span className="block truncate text-[10px] text-slate-500">{employee.email}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
                        {employees.length ? "No members are currently active and available for new task assignments." : "No active workspace members were found."}
                      </p>
                    )}
                  </fieldset>

                  <div className="flex justify-end">
                    <button type="submit" disabled={saving || dailyLimitReached || !title.trim() || !selectedAssigneeIds.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      {saving ? "Creating task…" : "Create task"}
                    </button>
                  </div>
                  {dailyLimitReached && (
                    <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      Today’s assignment limit is reached. Task creation will unlock after the workspace day resets.
                    </p>
                  )}
                </form>
              </section>
              </div>
              )}

              {workViewOpen && (
                <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/65 p-2 backdrop-blur-sm sm:p-5">
                  <section role="dialog" aria-modal="true" aria-labelledby="task-workspace-title" className="mx-auto my-2 w-full max-w-[1680px] rounded-3xl border border-slate-200 bg-slate-50 p-3 shadow-2xl sm:p-5">
                    <div className="sticky top-0 z-20 mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-700">Task workspace</p><h2 id="task-workspace-title" className="mt-1 text-lg font-bold text-slate-950">Work view</h2><p className="mt-1 text-xs text-slate-500">Switch between board, calendar, timeline and list.</p></div>
                      <div className="flex items-center gap-2"><span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{filteredTasks.length} matching tasks</span><button type="button" onClick={()=>setWorkViewOpen(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><X className="size-4"/>Close workspace</button></div>
                    </div>
                    <section className="space-y-3">
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Filter className="size-4" aria-hidden="true" />Filters</div>
                  <label className="min-w-36 flex-1 sm:flex-none">
                    <span className="sr-only">Filter tasks by status</span>
                    <select aria-label="Filter tasks by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "ALL")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                      <option value="ALL">All statuses</option>
                      {TASK_STATUSES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                    </select>
                  </label>
                  <label className="min-w-32 flex-1 sm:flex-none">
                    <span className="sr-only">Filter tasks by priority</span>
                    <select aria-label="Filter tasks by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "ALL")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                      <option value="ALL">All priorities</option>
                      {TASK_PRIORITIES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                    </select>
                  </label>
                  <label className="min-w-40 flex-1 sm:flex-none">
                    <span className="sr-only">Filter by task ownership</span>
                    <select aria-label="Filter by task ownership" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value as TaskOwnerFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                      <option value="ALL">Everyone’s tasks</option>
                      <option value="ASSIGNED_TO_ME">Assigned to me</option>
                      <option value="CREATED_BY_ME">Created by me</option>
                      <option value="OVERDUE">Overdue only</option>
                    </select>
                  </label>
                  <label className="min-w-40 flex-1 sm:flex-none">
                    <span className="sr-only">Sort tasks</span>
                    <select aria-label="Sort tasks" value={sortMode} onChange={(event) => setSortMode(event.target.value as TaskSortMode)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                      <option value="UPDATED">Recently updated</option>
                      <option value="DUE_DATE">Due date first</option>
                      <option value="PRIORITY">Highest priority</option>
                    </select>
                  </label>
                  {hasActiveFilters && <button type="button" onClick={() => { setSearchTerm(""); setStatusFilter("ALL"); setPriorityFilter("ALL"); setOwnerFilter("ALL"); }} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw className="size-3.5" aria-hidden="true" />Clear filters</button>}
                  <div className="ml-auto inline-flex flex-wrap rounded-xl border border-slate-200 bg-slate-50 p-1" aria-label="Task view">
                    <button type="button" aria-label="Kanban board view" aria-pressed={viewMode === "BOARD"} onClick={() => setViewMode("BOARD")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold " + (viewMode === "BOARD" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}><LayoutGrid className="size-3.5" aria-hidden="true" />Board</button>
                    <button type="button" aria-label="Calendar view" aria-pressed={viewMode === "CALENDAR"} onClick={() => setViewMode("CALENDAR")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold " + (viewMode === "CALENDAR" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}><CalendarDays className="size-3.5" aria-hidden="true" />Calendar</button>
                    <button type="button" aria-label="Timeline view" aria-pressed={viewMode === "TIMELINE"} onClick={() => setViewMode("TIMELINE")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold " + (viewMode === "TIMELINE" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}><Activity className="size-3.5" aria-hidden="true" />Timeline</button>
                    <button type="button" aria-label="List view" aria-pressed={viewMode === "LIST"} onClick={() => setViewMode("LIST")} className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold " + (viewMode === "LIST" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800")}><List className="size-3.5" aria-hidden="true" />List</button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Task board</h2>
                    <p className="mt-1 text-xs text-slate-500">Open a task to inspect assignments and update progress.</p>
                  </div>
                  <p className="text-[11px] text-slate-500" aria-live="polite">{filteredTasks.length} matching · {tasks.length} loaded</p>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-12 text-sm text-slate-500">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading tasks…
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                    <ClipboardList className="mx-auto size-8 text-slate-300" />
                    <h3 className="mt-3 text-sm font-semibold">No tasks yet</h3>
                    <p className="mt-1 text-xs text-slate-500">Create the first task to start tracking your team’s work.</p>
                    <button type="button" onClick={() => setShowCreateForm(true)} disabled={dailyLimitReached} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                      <Plus className="size-4" /> Create task
                    </button>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No tasks match “{searchTerm}”. Try another search.
                  </div>
                ) : viewMode === "CALENDAR" ? (
                  <section aria-label="Task calendar" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h3 className="text-base font-bold text-slate-950">Task calendar</h3><p className="mt-1 text-xs text-slate-500">{calendarTasksByDate.size} dates with due tasks · {filteredTasks.length} filtered tasks loaded</p></div><div className="flex items-center gap-2">
                      <button type="button" onClick={()=>{const d=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);setCalendarMonth(d);setSelectedCalendarDate(d);}} aria-label="Previous month" className="grid size-9 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronLeft className="size-4"/></button>
                      <h4 className="min-w-36 text-center text-sm font-bold">{calendarMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h4>
                      <button type="button" onClick={()=>{const d=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);setCalendarMonth(d);setSelectedCalendarDate(d);}} aria-label="Next month" className="grid size-9 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronRight className="size-4"/></button>
                      <button type="button" onClick={()=>{const d=new Date();setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));setSelectedCalendarDate(new Date(d.getFullYear(),d.getMonth(),d.getDate()));}} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">Today</button>
                    </div></div>
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="px-1 py-2 text-center text-[10px] font-bold uppercase text-slate-500 sm:px-3">{d}</div>)}</div>
                    <div className="grid grid-cols-7">{calendarDays.map(day=>{
                      const key=calendarDateKey(day), inMonth=day.getMonth()===calendarMonth.getMonth(), today=calendarDateKey(new Date())===key, selected=calendarDateKey(selectedCalendarDate)===key, dayTasks=calendarTasksByDate.get(key)??[];
                      return <button key={key} type="button" onClick={()=>{setSelectedCalendarDate(day);if(!inMonth)setCalendarMonth(new Date(day.getFullYear(),day.getMonth(),1));}} aria-label={day.toLocaleDateString()+": "+dayTasks.length+" tasks due"} aria-pressed={selected} className={"flex min-h-[96px] min-w-0 flex-col border-b border-r border-slate-100 p-1.5 text-left sm:min-h-[118px] sm:p-2 "+(!inMonth?"bg-slate-50/70 text-slate-400 ":"bg-white text-slate-800 ")+(selected?"bg-blue-50 ring-2 ring-inset ring-blue-500":"hover:bg-blue-50/50")}>
                        <span className="flex items-center justify-between gap-1"><span className={"grid size-6 place-items-center rounded-full text-[11px] font-semibold "+(today?"bg-blue-600 text-white":"")}>{day.getDate()}</span>{dayTasks.length>0&&<span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">{dayTasks.length}</span>}</span>
                        <span className="mt-1.5 hidden w-full space-y-1 sm:block">{dayTasks.slice(0,2).map(task=><span key={task.id} className={"block truncate rounded-md border-l-2 px-1.5 py-1 text-[9px] font-semibold "+(task.status==="COMPLETED"?"border-emerald-500 bg-emerald-50 text-emerald-800":task.status==="BLOCKED"?"border-rose-500 bg-rose-50 text-rose-800":task.status==="IN_PROGRESS"?"border-blue-500 bg-blue-50 text-blue-800":"border-slate-400 bg-slate-100 text-slate-700")}>{task.title}</span>)}</span>
                        {dayTasks.length>0&&<span className="mt-auto flex items-center gap-0.5 pt-1">{dayTasks.slice(0,3).map(task=>task.assigneeUserIds.slice(0,1).map(id=>{const e=employeeById.get(id);return e?<span key={task.id+id} title={e.name}><UserAvatar name={e.name||e.email} email={e.email} image={e.image} size={18}/></span>:null;}))}{dayTasks.length>3&&<span className="text-[9px] text-slate-500">+{dayTasks.length-3}</span>}</span>}
                      </button>;
                    })}</div>
                    <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">Selected date</p><h4 className="mt-1 text-base font-bold">{selectedCalendarDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</h4></div><p className="text-xs font-semibold text-slate-500">{selectedCalendarTasks.length} tasks due</p></div>
                      <div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">{selectedCalendarTasks.map(task=><button key={task.id} type="button" onClick={()=>void openTask(task.id)} className="flex w-full flex-col gap-2 p-3 text-left hover:bg-blue-50/50 sm:flex-row sm:items-center"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold">{task.title}</span><span className="mt-1 block text-[10px] text-slate-500">TASK-{task.id.slice(-6).toUpperCase()} · {labelStatus(task.status)} · {labelStatus(task.priority)}</span></span><span className="flex items-center gap-1">{task.assigneeUserIds.slice(0,4).map(id=>{const e=employeeById.get(id);return e?<span key={id} title={e.name}><UserAvatar name={e.name||e.email} email={e.email} image={e.image} size={25}/></span>:null;})}</span></button>)}{selectedCalendarTasks.length===0&&<p className="p-6 text-center text-xs text-slate-500">No tasks are due on this date.</p>}</div>
                      {nextCursor&&<div className="mt-3 flex justify-end"><button type="button" onClick={()=>void loadMoreTasks()} disabled={loadingMore} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">{loadingMore?"Loading more tasks…":"Load more tasks"}</button></div>}
                    </div>
                  </section>
                ) : viewMode === "TIMELINE" ? (
                  <section aria-label="Task timeline" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-base font-bold">Task timeline</h3><p className="mt-1 text-xs text-slate-500">Chronological view of due dates, owners, priority and progress.</p></div><div className="flex gap-2 text-[10px] font-semibold"><span className="rounded-full bg-blue-50 px-2.5 py-1.5 text-blue-700">{taskMetrics.inProgress} in progress</span><span className="rounded-full bg-rose-50 px-2.5 py-1.5 text-rose-700">{taskMetrics.blocked} locked</span><span className="rounded-full bg-emerald-50 px-2.5 py-1.5 text-emerald-700">{tasksByStatus.COMPLETED.length} complete</span></div></div>
                    {timelineTasks.length?<div className="relative mt-5 space-y-4 pl-6 before:absolute before:bottom-3 before:left-[9px] before:top-2 before:w-px before:bg-slate-200">{timelineTasks.map(task=>{
                      const target=task.dueAt?new Date(task.dueAt):new Date(task.startedAt??task.createdAt), overdue=Boolean(task.dueAt&&target.getTime()<nowMs&&!["COMPLETED","CANCELLED"].includes(task.status)), progress=task.assignmentSummary.total?Math.round(task.assignmentSummary.completed/task.assignmentSummary.total*100):task.status==="COMPLETED"?100:0;
                      return <article key={task.id} className="relative rounded-2xl border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm"><span className={"absolute -left-[22px] top-5 size-[11px] rounded-full border-2 border-white ring-1 ring-slate-200 "+(task.status==="COMPLETED"?"bg-emerald-500":task.status==="BLOCKED"?"bg-rose-500":task.status==="IN_PROGRESS"?"bg-blue-500":"bg-slate-400")}/>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><p className={"text-[10px] font-semibold "+(overdue?"text-rose-700":"text-slate-500")}>{task.dueAt?(overdue?"OVERDUE · ":"DUE · ")+formatDate(task.dueAt):"CREATED / STARTED · "+formatDate(task.startedAt??task.createdAt)}</p><button type="button" onClick={()=>void openTask(task.id)} className="mt-1 block max-w-full text-left text-sm font-bold text-slate-900 hover:text-blue-700">{task.title}</button><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.description||"No description added."}</p></div>
                          <div className="flex flex-wrap items-center gap-3"><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold "+statusColumnClasses(task.status)}>{task.status==="BLOCKED"?"Locked / blocked":labelStatus(task.status)}</span><span className={"rounded-full px-2.5 py-1 text-[10px] font-semibold "+priorityClasses(task.priority)}>{labelStatus(task.priority)}</span><div className="flex items-center gap-1">{task.assigneeUserIds.slice(0,4).map(id=>{const e=employeeById.get(id);return e?<span key={id} title={e.name}><UserAvatar name={e.name||e.email} email={e.email} image={e.image} size={27}/></span>:null;})}<span className="text-[10px] text-slate-500">{task.assigneeUserIds.length} assignee(s)</span></div></div></div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="flex items-center gap-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{width:progress+"%"}}/></div><span className="text-[10px] font-semibold text-slate-500">{progress}% assignment completion</span></div><button type="button" onClick={()=>void openTask(task.id)} className="text-[10px] font-semibold text-blue-700 hover:underline">View task details ↗</button></div>
                      </article>;
                    })}</div>:<p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">No tasks match your filters.</p>}
                  </section>) : viewMode !== "LIST" ? (
                  <div aria-label="Task status board" className="grid grid-flow-col auto-cols-[minmax(18rem,21rem)] gap-4 overflow-x-auto pb-4">
                    {TASK_STATUSES.map((status) => {
                      const columnTasks = tasksByStatus[status];
                      return (
                        <section
                          key={status}
                          aria-label={labelStatus(status) + " tasks"}
                          onDragOver={(event) => {
                            if (!draggedTaskId || movingTaskId) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDropTargetStatus(status);
                          }}
                          onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setDropTargetStatus((current) => current === status ? null : current);
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            const taskId = event.dataTransfer.getData("text/plain") || draggedTaskId;
                            setDraggedTaskId(null);
                            setDropTargetStatus(null);
                            const draggedTask = tasks.find((item) => item.id === taskId);
                            if (draggedTask) void moveTaskToStatus(draggedTask, status);
                          }}
                          className={[
                            "flex min-h-64 min-w-0 flex-col rounded-2xl border border-slate-200 border-t-4 p-3 transition-colors",
                            status === "IN_PROGRESS" ? "border-t-blue-500" : status === "BLOCKED" ? "border-t-rose-500" : status === "IN_REVIEW" ? "border-t-violet-500" : status === "COMPLETED" ? "border-t-emerald-500" : status === "CANCELLED" ? "border-t-slate-400" : "border-t-slate-500",
                            status === "IN_PROGRESS" ? "bg-blue-50/55" : status === "BLOCKED" ? "bg-rose-50/55" : status === "IN_REVIEW" ? "bg-violet-50/55" : status === "COMPLETED" ? "bg-emerald-50/55" : status === "CANCELLED" ? "bg-slate-100/80" : "bg-slate-50",
                            dropTargetStatus === status ? "ring-2 ring-blue-400 ring-offset-2 shadow-lg" : ""
                          ].join(" ")}
                        >
                          <div className="mb-3 flex items-center justify-between gap-2 px-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className={`size-2 shrink-0 rounded-full ${status === "IN_PROGRESS" ? "bg-blue-500" : status === "BLOCKED" ? "bg-rose-500" : status === "IN_REVIEW" ? "bg-violet-500" : status === "COMPLETED" ? "bg-emerald-500" : status === "CANCELLED" ? "bg-slate-400" : "bg-slate-500"}`} />
                              <h3 className="truncate text-xs font-bold uppercase tracking-[0.09em] text-slate-700">{labelStatus(status)}</h3>
                            </div>
                            <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusColumnClasses(status)}`}>{columnTasks.length}</span>
                          </div>
                          <div className="flex flex-1 flex-col gap-3">
                            {columnTasks.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-slate-300/90 bg-white/55 px-3 py-5 text-center text-[11px] text-slate-400">No tasks</div>
                            ) : columnTasks.map((task) => {
                              const expanded = expandedTaskId === task.id;
                              const managerForTask = canManage || task.createdByUserId === userId;
                              const assigneeNames = task.assigneeUserIds.map((id) => {
                                const employee = employeeById.get(id);
                                return employee?.name || employee?.email || "Workspace member";
                              });
                              const assigneeMembers = task.assigneeUserIds
                                .map((id) => employeeById.get(id))
                                .filter((employee): employee is Employee => Boolean(employee));
                              const canDragTask = task.status !== "CANCELLED" &&
                                (managerForTask || task.assigneeUserIds.includes(userId));
                              return (
                                <article
                                  key={task.id}
                                  draggable={canDragTask && movingTaskId !== task.id}
                                  onDragStart={(event) => {
                                    if (!canDragTask) {
                                      event.preventDefault();
                                      return;
                                    }
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", task.id);
                                    setDraggedTaskId(task.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedTaskId(null);
                                    setDropTargetStatus(null);
                                  }}
                                  className={[
                                    "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md",
                                    canDragTask ? "cursor-grab active:cursor-grabbing" : "",
                                    draggedTaskId === task.id ? "opacity-55" : ""
                                  ].join(" ")}
                                >
                                  <button type="button" onClick={() => void openTask(task.id)} aria-expanded={expanded} className="w-full p-3.5 text-left transition hover:bg-slate-50">
                                    <span className="flex items-center justify-between gap-2">
                                      <span className="inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold tracking-wide text-slate-400">
                                        {canDragTask && <GripVertical className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />}
                                        <span className="truncate">TASK-{task.id.slice(-6).toUpperCase()}</span>
                                      </span>
                                      <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold ring-1 ring-inset ${priorityClasses(task.priority)}`}>{labelStatus(task.priority)}</span>
                                    </span>
                                    <span className="mt-2 block text-sm font-semibold leading-5 text-slate-900">{task.title}</span>
                                    {task.description && <span className="mt-1.5 block line-clamp-3 text-[11px] leading-5 text-slate-500">{task.description}</span>}
                                    <span className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
                                      <span className="inline-flex min-w-0 items-center gap-1.5"><CalendarClock className="size-3.5 shrink-0" /><span className="truncate">{formatDate(task.dueAt)}</span></span>
                                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-semibold tabular-nums">{task.assignmentSummary.completed}/{task.assignmentSummary.total}</span>
                                    </span>
                                    <span className="mt-2 flex min-w-0 items-center gap-1.5 text-[10px] text-slate-500">
                                      <Users className="size-3.5 shrink-0" />
                                      <span className="inline-flex shrink-0 -space-x-2">
                                        {assigneeMembers.slice(0, 2).map((employee) => (
                                          <UserAvatar key={employee.id} name={employee.name || employee.email} email={employee.email} image={employee.image} size={22} className="border-2 border-white text-[8px]" />
                                        ))}
                                      </span>
                                      <span className="truncate">{assigneeNames.slice(0, 2).join(", ") || "Unassigned"}</span>
                                      {assigneeNames.length > 2 && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5">+{assigneeNames.length - 2}</span>}
                                      <ChevronDown className={`ml-auto size-3.5 shrink-0 transition ${expanded ? "rotate-180" : ""}`} />
                                    </span>
                                  </button>
                                  {expanded && renderTaskDetails(task)}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] border-collapse text-left">
                        <thead className="border-b border-slate-200 bg-slate-50"><tr>
                          {["Task", "Assignees", "Priority", "Status", "Due date", "Progress"].map((heading) => <th key={heading} scope="col" className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{heading}</th>)}
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredTasks.map((task) => {
                            const assigneeNames = task.assigneeUserIds.map((id) => {
                              const employee = employeeById.get(id);
                              return employee?.name || employee?.email || "Workspace member";
                            });
                            const assigneeMembers = task.assigneeUserIds.map((id) => employeeById.get(id)).filter((employee): employee is Employee => Boolean(employee));
                            const overdue = Boolean(task.dueAt && new Date(task.dueAt).getTime() < nowMs && !["COMPLETED", "CANCELLED"].includes(task.status));
                            return (
                              <Fragment key={task.id}>
                                <tr className="transition hover:bg-slate-50/80">
                                  <td className="max-w-[320px] px-4 py-3.5">
                                    <button type="button" onClick={() => void openTask(task.id)} aria-expanded={expandedTaskId === task.id} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                                      <span className="block text-[10px] font-semibold tracking-wide text-slate-400">TASK-{task.id.slice(-6).toUpperCase()}</span>
                                      <span className="mt-1 block truncate text-sm font-semibold text-slate-900">{task.title}</span>
                                      {task.description && <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-slate-500">{task.description}</span>}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3.5"><div className="flex items-center gap-2">
                                    <span className="inline-flex shrink-0 -space-x-2">{assigneeMembers.slice(0, 3).map((employee) => <UserAvatar key={employee.id} name={employee.name || employee.email} email={employee.email} image={employee.image} size={24} className="border-2 border-white text-[8px]" />)}</span>
                                    <span className="max-w-40 truncate text-xs text-slate-600">{assigneeNames.join(", ") || "Unassigned"}</span>
                                  </div></td>
                                  <td className="px-4 py-3.5"><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityClasses(task.priority)}`}>{labelStatus(task.priority)}</span></td>
                                  <td className="px-4 py-3.5"><span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusColumnClasses(task.status)}`}>{labelStatus(task.status)}</span></td>
                                  <td className={`whitespace-nowrap px-4 py-3.5 text-xs ${overdue ? "font-semibold text-rose-700" : "text-slate-500"}`}>{overdue && <span className="mr-1">Overdue ·</span>}{formatDate(task.dueAt)}</td>
                                  <td className="px-4 py-3.5"><div className="flex items-center gap-2">
                                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${task.assignmentSummary.total ? Math.round(task.assignmentSummary.completed / task.assignmentSummary.total * 100) : 0}%` }} /></div>
                                    <span className="text-[10px] tabular-nums text-slate-500">{task.assignmentSummary.completed}/{task.assignmentSummary.total}</span>
                                  </div></td>
                                </tr>
                                {expandedTaskId === task.id && <tr className="bg-slate-50/60"><td colSpan={6} className="p-0">{renderTaskDetails(task)}</td></tr>}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {nextCursor && !loading && (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                    <button type="button" onClick={() => void loadMoreTasks()} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      {loadingMore ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                      {loadingMore ? "Loading more tasks…" : "Load 50 more tasks"}
                    </button>
                  </div>
                )}
                    </section>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
