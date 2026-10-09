"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Users
} from "lucide-react";
import WorkspaceSidebar from "@/components/workspace-sidebar";
import UserAvatar from "@/components/user-avatar";
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from "@/features/task-management/shared/constants";

type Employee = {
  id: string;
  name: string;
  email: string;
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

  const canManage = MANAGER_ROLES.includes(currentRole);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);

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
      setNotice("Task created and assigned.");
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
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setBusyAssignmentId(null);
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
      />
      <div className="lg:pl-72">
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
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">Team work</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Tasks for {companyName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create tasks, assign them to active workspace members, and follow their progress from one place.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
                <ClipboardList className="size-5 text-blue-600" />
                <div>
                  <p className="text-xl font-semibold tabular-nums">{tasks.length}</p>
                  <p className="text-[10px] text-slate-500">Tasks loaded</p>
                </div>
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

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Workspace tasks</h2>
                    <p className="mt-1 text-xs text-slate-500">Select a task to view assignments and update progress.</p>
                  </div>
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
                    <p className="mt-1 text-xs text-slate-500">Create your first task above to get work moving.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task) => {
                      const detail = details[task.id];
                      const expanded = expandedTaskId === task.id;
                      const managerForTask = canManage || task.createdByUserId === userId;
                      return (
                        <article key={task.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                          <button type="button" onClick={() => void openTask(task.id)} aria-expanded={expanded} className="flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5">
                            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                              <ClipboardList className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">{task.title}</span>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityClasses(task.priority)}`}>{labelStatus(task.priority)}</span>
                              </span>
                              {task.description && <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{task.description}</span>}
                              <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                                <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5" />{formatDate(task.dueAt)}</span>
                                <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{task.assignmentSummary.completed}/{task.assignmentSummary.total} complete</span>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{labelStatus(task.status)}</span>
                              </span>
                              <span className="mt-2 block truncate text-[10px] text-slate-400">
                                Assigned to {task.assigneeUserIds.map((id) => employeeById.get(id)?.name ?? employeeById.get(id)?.email ?? "Workspace member").join(", ")}
                              </span>
                            </span>
                            <ChevronDown className={`mt-1 size-4 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                          </button>

                          {expanded && (
                            <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4 sm:px-5">
                              {!detail ? (
                                <p className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="size-4 animate-spin" />Loading assignment details…</p>
                              ) : (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs text-slate-500">Created by {detail.createdBy?.name ?? detail.createdBy?.email ?? "Workspace member"}</p>
                                    <span className="text-[10px] text-slate-400">Updated {formatDate(detail.updatedAt)}</span>
                                  </div>
                                  {detail.assignments.map((assignment) => {
                                    const canChange = managerForTask || assignment.assignee?.id === userId;
                                    const statuses = managerForTask ? TASK_STATUSES : TASK_STATUSES.filter((item) => item !== "CANCELLED");
                                    return (
                                      <div key={assignment.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                          <p className="truncate text-xs font-semibold text-slate-800">{assignment.assignee?.name ?? assignment.assignee?.email ?? "Workspace member"}</p>
                                          <p className="mt-0.5 truncate text-[10px] text-slate-500">{assignment.assignee?.email ?? ""}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-slate-500">Status</span>
                                          <select
                                            aria-label={`Status for ${assignment.assignee?.name ?? "assignee"}`}
                                            disabled={!canChange || busyAssignmentId === assignment.id || task.status === "CANCELLED"}
                                            value={assignment.status}
                                            onChange={(event) => void updateAssignment(task, assignment, event.target.value as TaskStatus)}
                                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-400"
                                          >
                                            {statuses.map((status) => <option key={status} value={status}>{labelStatus(status)}</option>)}
                                          </select>
                                          {busyAssignmentId === assignment.id && <LoaderCircle className="size-4 animate-spin text-blue-600" />}
                                        </div>
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
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
