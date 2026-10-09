"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  GripVertical,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  Volume2,
  VolumeX
} from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import UserAvatar from "@/components/user-avatar";
import { isTaskSoundEnabled, playTaskSound, playTaskSoundIfEnabled, setTaskSoundEnabled, unlockTaskSound } from "@/lib/client-task-sound";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/features/task-management/shared/constants";

type Employee = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role: string;
  employmentStatus?: string;
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

type TaskPageProps = {
  companyName: string;
  userName: string;
  userEmail: string;
  userImage?: string;
  userId: string;
  currentRole: string;
  taskManagementEnabled: boolean;
};

const MANAGER_ROLES = ["COMPANY_OWNER", "COMPANY_ADMIN", "PLATFORM_ADMIN"];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.error || "REQUEST_FAILED") as Error & { code?: string };
    error.code = body.error;
    throw error;
  }
  return body.data as T;
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "TASK_REQUEST_FAILED";
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Please sign in again to manage tasks.",
    FORBIDDEN: "You don't have permission to perform that action.",
    FEATURE_NOT_IN_PLAN: "Task Management isn't enabled for this company's active plan.",
    ASSIGNEE_REQUIRED: "Choose at least one employee to assign this task to.",
    ASSIGNEE_NOT_FOUND: "One of the selected employees is no longer active in this workspace.",
    TASK_TITLE_REQUIRED: "Enter a title for the task.",
    TASK_LIST_FAILED: "Tasks couldn't be loaded. Please try again.",
    TASK_CREATE_FAILED: "The task couldn't be created. Please check the details and try again."
  };
  return messages[code] ?? code.replaceAll("_", " ").toLowerCase();
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

function priorityClasses(priority: TaskPriority) {
  switch (priority) {
    case "URGENT": return "bg-rose-50 text-rose-700 ring-rose-200";
    case "HIGH": return "bg-amber-50 text-amber-700 ring-amber-200";
    case "LOW": return "bg-slate-50 text-slate-600 ring-slate-200";
    default: return "bg-blue-50 text-blue-700 ring-blue-200";
  }
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
  taskManagementEnabled
}: TaskPageProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
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
  const [searchTerm, setSearchTerm] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);

  const canManage = MANAGER_ROLES.includes(currentRole);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const filteredTasks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return tasks;
    return tasks.filter((task) => {
      const assignedNames = task.assigneeUserIds.map((id) => {
        const employee = employeeById.get(id);
        return employee ? employee.name + " " + employee.email : "";
      }).join(" ");
      return [task.title, task.description, assignedNames, task.priority, task.status]
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [tasks, searchTerm, employeeById]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, TaskItem[]> = {
      TODO: [],
      IN_PROGRESS: [],
      BLOCKED: [],
      IN_REVIEW: [],
      COMPLETED: [],
      CANCELLED: []
    };
    for (const task of filteredTasks) grouped[task.status].push(task);
    return grouped;
  }, [filteredTasks]);

  const load = useCallback(async function loadTasks(showSpinner = true) {
    if (!taskManagementEnabled) {
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const [taskPage, staff] = await Promise.all([
        api<{ items: TaskItem[]; nextCursor: string | null }>("/api/tasks?limit=50"),
        api<Employee[]>("/api/company/employees")
      ]);
      setTasks(taskPage.items);
      setEmployees(staff);
      setSelectedAssigneeIds((current) => current.length ? current.filter((id) => staff.some((member) => member.id === id)) : [userId]);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [taskManagementEnabled, userId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSoundEnabled(isTaskSoundEnabled());
      void load();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

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

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    if (!selectedAssigneeIds.length) {
      setError("Choose at least one employee to assign this task to.");
      return;
    }

    if (soundEnabled) void unlockTaskSound();
    setSaving(true);
    try {
      const created = await api<TaskItem>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          assigneeUserIds: selectedAssigneeIds
        })
      });
      setTasks((current) => [created, ...current.filter((task) => task.id !== created.id)]);
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setDueAt("");
      setShowCreateForm(false);
      setNotice("Task created and assigned.");
      void playTaskSoundIfEnabled("created");
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setSaving(false);
    }
  }

  async function updateAssignment(task: TaskItem, assignment: TaskAssignmentItem, status: TaskStatus) {
    setError("");
    setNotice("");
    setBusyAssignmentId(assignment.id);
    if (soundEnabled) void unlockTaskSound();
    const managerForTask = canManage || task.createdByUserId === userId;
    try {
      await api<{ taskStatus: TaskStatus }>(`/api/tasks/${task.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          ...(managerForTask ? { assignmentId: assignment.id } : {})
        })
      });
      const [taskPage, detail] = await Promise.all([
        api<{ items: TaskItem[]; nextCursor: string | null }>("/api/tasks?limit=50"),
        api<TaskDetails>(`/api/tasks/${task.id}`)
      ]);
      setTasks(taskPage.items);
      setDetails((current) => ({ ...current, [task.id]: detail }));
      setNotice("Task status updated.");
      void playTaskSoundIfEnabled(status === "COMPLETED" ? "completed" : "updated");
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

      const [taskPage, refreshedDetail] = await Promise.all([
        api<{ items: TaskItem[]; nextCursor: string | null }>("/api/tasks?limit=50"),
        api<TaskDetails>("/api/tasks/" + task.id)
      ]);
      setTasks(taskPage.items);
      setDetails((current) => ({ ...current, [task.id]: refreshedDetail }));
      setNotice("Task moved to " + labelStatus(status).toLowerCase() + ".");
      void playTaskSoundIfEnabled(status === "COMPLETED" ? "completed" : "updated");
    } catch (moveError) {
      setError(errorMessage(moveError));
    } finally {
      setMovingTaskId(null);
      setDraggedTaskId(null);
      setDropTargetStatus(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#faf9f1] text-slate-950">
      <WorkspaceSidebar
        companyName={companyName}
        userName={userName || userEmail}
        userEmail={userEmail}
        userImage={userImage}
        currentRole={currentRole}
        taskManagementEnabled={taskManagementEnabled}
        canManage={canManage}
        adminManaged={currentRole === "PLATFORM_ADMIN"}
        avatarFallback="/api/profile/avatar"
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <div className={sidebarCollapsed ? "lg:pl-20" : "lg:pl-72"}>
        <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-[#faf9f1]/95 backdrop-blur-xl">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Workspace</p>
              <h1 className="mt-1 truncate text-base font-semibold tracking-tight text-slate-950">Task management</h1>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                name={userName || userEmail}
                email={userEmail}
                image={userImage}
                fallbackImage="/api/profile/avatar"
                size={36}
              />
              <div className="hidden min-w-0 sm:block">
                <p className="max-w-48 truncate text-xs font-semibold text-slate-800">{userName || userEmail}</p>
                <p className="max-w-48 truncate text-[10px] text-slate-500">{userEmail}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
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
              <label className="relative block min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  aria-label="Search tasks"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search tasks, descriptions, assignees…"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm((visible) => !visible)}
                  aria-expanded={showCreateForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-3 text-xs font-semibold text-white transition hover:bg-slate-800"
                >
                  <Plus className="size-4" />
                  {showCreateForm ? "Hide create form" : "Create task"}
                </button>
                <button
                  type="button"
                  aria-pressed={soundEnabled}
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    setTaskSoundEnabled(next);
                    if (next) void unlockTaskSound();
                  }}
                  title={soundEnabled ? "Turn task sound effects off" : "Turn task sound effects on"}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-semibold transition ${soundEnabled ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                  Sound effects {soundEnabled ? "on" : "off"}
                </button>
                <button
                  type="button"
                  aria-label="Preview task created sound"
                  title="Preview the new-task sound"
                  onClick={() => void playTaskSound("created")}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  Created
                </button>
                <button
                  type="button"
                  aria-label="Preview task updated sound"
                  title="Preview the task-update sound"
                  onClick={() => void playTaskSound("updated")}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  Updated
                </button>
                <button
                  type="button"
                  aria-label="Preview task completed sound"
                  title="Preview the task-complete sound"
                  onClick={() => void playTaskSound("completed")}
                  className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-xs font-semibold text-violet-800 transition hover:bg-violet-100"
                >
                  Completed
                </button>
              </div>
            </div>
          </section>

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

          {!taskManagementEnabled ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-base font-semibold text-amber-950">Task Management isn’t enabled</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">Enable Task Management in the plan assigned to this company, then reload this page. Access is checked on the server as well as in navigation.</p>
            </section>
          ) : (
            <>
              {showCreateForm && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <Plus className="size-4" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold">Create a task</h2>
                    <p className="text-xs text-slate-500">Choose one or more active employees to assign it to.</p>
                  </div>
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
                        {employees.filter((employee) => employee.employmentStatus !== "INACTIVE").map((employee) => (
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
                      <p className="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">No active workspace members were found.</p>
                    )}
                  </fieldset>

                  <div className="flex justify-end">
                    <button type="submit" disabled={saving || !title.trim() || !selectedAssigneeIds.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                      {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                      {saving ? "Creating task…" : "Create task"}
                    </button>
                  </div>
                </form>
              </section>
              )}

              <section className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Task board</h2>
                    <p className="mt-1 text-xs text-slate-500">Open a card to inspect assigned members and update assignment progress.</p>
                  </div>
                  <p className="text-[11px] text-slate-500">{filteredTasks.length} of {tasks.length} tasks</p>
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
                    <button type="button" onClick={() => setShowCreateForm(true)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-xs font-semibold text-white hover:bg-slate-800">
                      <Plus className="size-4" /> Create task
                    </button>
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No tasks match “{searchTerm}”. Try another search.
                  </div>
                ) : (
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
                              const detail = details[task.id];
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
                                  {expanded && (
                                    <div className="border-t border-slate-200 bg-slate-50/70 px-3.5 py-3">
                                      {!detail ? (
                                        <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading assignments…</p>
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
                                                    onChange={(event) => void updateAssignment(task, assignment, event.target.value as TaskStatus)}
                                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                                                  >
                                                    {statuses.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                                                  </select>
                                                </label>
                                                {busyAssignmentId === assignment.id && <LoaderCircle className="mt-2 size-4 animate-spin text-blue-600" />}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </article>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
