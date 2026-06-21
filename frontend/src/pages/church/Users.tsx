import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import api from "../../services/api";

const initialForm = {
  name: "",
  email: "",
  username: "",
  phone: "",
  password: "",
  role: "user",
  permissionOverrides: [] as string[],
  permissionDenials: [] as string[],
  isActive: true,
};

const roleOptions = [
  {
    value: "priest",
    label: "Priest",
    description:
      "Church super admin with financial dashboards, reports, and all enabled modules.",
  },
  {
    value: "user",
    label: "User",
    description:
      "Standard non-financial access. A Priest can remove individual permissions as needed.",
  },
];

const permissionOptions = [
  ["dashboard.view", "Dashboard"],
  ["contributions.view", "View contributions"],
  ["contributions.record", "Record contributions"],
  ["reports.view", "View reports"],
  ["reports.export", "Export reports"],
  ["fundAccounts.view", "View fund accounts"],
  ["fundAccounts.manage", "Manage fund accounts"],
  ["contributors.view", "View contributors"],
  ["contributors.tag", "Tag contributor gender"],
  ["messaging.view", "View messaging"],
  ["messaging.send", "Send bulk messages"],
  ["outbox.view", "View outbox"],
  ["congregation.manage", "Manage sermons & announcements"],
  ["presentation.manage", "Manage presentation"],
  ["users.view", "View staff users"],
  ["users.manage", "Manage staff users"],
  ["discipleship.view", "View discipleship"],
  ["discipleship.manage", "Manage discipleship members"],
  ["discipleship.attendanceRecord", "Record discipleship attendance"],
] as const;

const rolePermissionPresets: Record<string, string[]> = {
  priest: permissionOptions.map(([value]) => value),
  user: [
    "fundAccounts.view",
    "fundAccounts.manage",
    "contributors.view",
    "contributors.tag",
    "messaging.view",
    "messaging.send",
    "outbox.view",
    "congregation.manage",
    "presentation.manage",
    "users.view",
    "discipleship.view",
    "discipleship.manage",
    "discipleship.attendanceRecord",
  ],
};

const financialPermissionValues = new Set([
  "dashboard.view",
  "contributions.view",
  "contributions.record",
  "reports.view",
  "reports.export",
]);
const priestOnlyPermissionValues = new Set([
  ...financialPermissionValues,
  "users.manage",
]);

function normalizeStaffRole(role?: string | null) {
  return role === "priest" || role === "church_admin" ? "priest" : "user";
}

export default function ChurchUsers() {
  const queryClient = useQueryClient();
  const { data: currentProfile } = useQuery({
    queryKey: ["auth-profile"],
    queryFn: () => api.get("/auth/profile").then((response) => response.data),
  });
  const canManageStaff =
    currentProfile?.role === "priest" ||
    currentProfile?.role === "church_admin";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [form, setForm] = useState<any>(initialForm);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const { data: users, isLoading } = useQuery({
    queryKey: ["church-users"],
    queryFn: () => api.get("/church/users").then((response) => response.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const payload = { ...form };
        const response = await api.patch(`/church/users/${editingId}`, payload);
        return response.data;
      }
      const response = await api.post("/church/users", form);
      return response.data;
    },
    onSuccess: (data: any) => {
      if (editingId) {
        toast.success("User updated");
      } else if (data?.credentialsSmsSent) {
        toast.success("User created and login SMS sent");
      } else {
        toast.error(
          data?.credentialsSmsError
            ? `User created, but login SMS failed. ${data.credentialsSmsError}`
            : "User created, but login SMS failed. Check SMS outbox.",
        );
      }
      setEditingId(null);
      setIsEditorOpen(false);
      setForm(initialForm);
      queryClient.invalidateQueries({ queryKey: ["church-users"] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || "Unable to save user");
    },
  });

  const resendCredentialsMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.post(
        `/church/users/${userId}/resend-credentials`,
      );
      return response.data;
    },
    onSuccess: () => {
      toast.success("Login credentials sent by SMS");
      queryClient.invalidateQueries({ queryKey: ["church-users"] });
      queryClient.invalidateQueries({ queryKey: ["church-messaging-outbox"] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || "Unable to send credentials SMS",
      );
    },
  });

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (saveMutation.isPending) {
          return;
        }

        setIsEditorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditorOpen, saveMutation.isPending]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(initialForm);
    setIsEditorOpen(true);
  };

  const togglePermission = (permission: string) => {
    setForm((current: any) => {
      const role = normalizeStaffRole(current.role);
      if (role === "priest" || priestOnlyPermissionValues.has(permission)) {
        return current;
      }

      const defaults = rolePermissionPresets[role] || [];
      const overrides = new Set(current.permissionOverrides || []);
      const denials = new Set(current.permissionDenials || []);
      if (defaults.includes(permission)) {
        if (denials.has(permission)) {
          denials.delete(permission);
        } else {
          denials.add(permission);
        }
        overrides.delete(permission);
      } else if (overrides.has(permission)) {
        overrides.delete(permission);
      } else {
        overrides.add(permission);
        denials.delete(permission);
      }
      return {
        ...current,
        permissionOverrides: Array.from(overrides),
        permissionDenials: Array.from(denials),
      };
    });
  };

  const changeRole = (role: string) => {
    setForm((current: any) => ({
      ...current,
      role,
      permissionOverrides: [],
      permissionDenials: [],
    }));
  };

  const closeEditor = () => {
    if (saveMutation.isPending) {
      return;
    }

    setIsEditorOpen(false);
  };

  return (
    <div className="church-console-page users-page space-y-6">
      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Church Staff
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Internal user list
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Priests control staff access. Users can view this list when
                permitted, but cannot create or change staff accounts.
              </p>
            </div>

            {canManageStaff ? (
              <button
                className="btn-primary justify-center"
                type="button"
                onClick={openCreateModal}
              >
                + Add staff
              </button>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading staff users...</div>
        ) : (
          <div className="table-scroll-region">
            <table className="mobile-card-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(users || []).map((user: any) => (
                  <tr key={user.id}>
                    <td data-label="Name">
                      <div className="font-medium text-white">{user.name}</div>
                      <div className="text-xs text-stone-400">
                        {user.phone || user.username || "-"}
                      </div>
                    </td>
                    <td data-label="Email">{user.email}</td>
                    <td className="capitalize" data-label="Role">
                      {normalizeStaffRole(user.role)}
                    </td>
                    <td data-label="Status">
                      {user.isActive ? "Active" : "Inactive"}
                    </td>
                    <td data-label="Actions">
                      <div className="flex flex-wrap gap-2">
                        {canManageStaff ? (
                          <>
                            <button
                              className="btn-secondary px-3 py-2"
                              type="button"
                              onClick={() => {
                                setEditingId(user.id);
                                setForm({
                                  name: user.name,
                                  email: user.email,
                                  username: user.username || "",
                                  phone: user.phone || "",
                                  password: "",
                                  role: normalizeStaffRole(user.role),
                                  permissionOverrides:
                                    user.permissionOverrides || [],
                                  permissionDenials:
                                    user.permissionDenials || [],
                                  isActive: user.isActive,
                                });
                                setIsEditorOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn-secondary px-3 py-2"
                              aria-label={`Send login details to ${user.name}`}
                              disabled={
                                !user.phone ||
                                resendCredentialsMutation.isPending
                              }
                              title={
                                user.phone
                                  ? "Send login details by SMS"
                                  : "Add a phone number before sending credentials"
                              }
                              type="button"
                              onClick={() =>
                                resendCredentialsMutation.mutate(user.id)
                              }
                            >
                              <Send size={14} />
                              Login SMS
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-stone-400">
                            View only
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isEditorOpen && canManageStaff ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeEditor}
        >
          <div
            className="modal-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <section className="panel modal-card max-w-3xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Staff User Setup
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {editingId
                      ? "Edit church user"
                      : "Create church staff user"}
                  </h3>
                </div>

                <button
                  aria-label="Close staff user form"
                  className="shell-icon-button"
                  type="button"
                  onClick={closeEditor}
                >
                  <X size={18} />
                </button>
              </div>

              <form
                className="mt-6 space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveMutation.mutate();
                }}
              >
                {[
                  ["name", "Full name"],
                  ["email", "Email address"],
                  ["username", "Username"],
                  ["phone", "Phone number"],
                  [
                    "password",
                    editingId ? "New password (optional)" : "Password",
                  ],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label">
                      {label}
                      {!editingId && key === "phone" ? " *" : ""}
                    </label>
                    <input
                      ref={key === "name" ? nameInputRef : undefined}
                      className="input"
                      required={!editingId && key === "phone"}
                      type={key === "password" ? "password" : "text"}
                      value={form[key]}
                      onChange={(event) =>
                        setForm((current: any) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}

                <div>
                  <label className="label">Role</label>
                  <select
                    className="input"
                    value={form.role}
                    onChange={(event) => changeRole(event.target.value)}
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-stone-400">
                    {roleOptions.find((role) => role.value === form.role)
                      ?.description || ""}
                  </p>
                </div>

                <section className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Permissions
                  </p>
                  <p className="mt-2 text-sm text-stone-300">
                    User permissions start checked and can be removed
                    individually. Priest permissions stay fixed. Disabled church
                    modules remain hidden.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {permissionOptions.map(([value, label]) => {
                      const isRolePermission =
                        rolePermissionPresets[form.role]?.includes(value);
                      const isOverride = (
                        form.permissionOverrides || []
                      ).includes(value);
                      const isDenied = (form.permissionDenials || []).includes(
                        value,
                      );
                      const isPriestOnly =
                        form.role !== "priest" &&
                        priestOnlyPermissionValues.has(value);
                      const isPriestRole = form.role === "priest";
                      const isChecked = isPriestRole
                        ? true
                        : isPriestOnly
                          ? false
                          : isRolePermission
                            ? !isDenied
                            : isOverride && !isDenied;
                      return (
                        <label
                          key={value}
                          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                            isChecked
                              ? "border-emerald-300/30 bg-emerald-300/10 text-stone-100"
                              : isPriestOnly
                                ? "border-white/10 bg-white/5 text-stone-500"
                                : "border-white/10 bg-white/5 text-stone-100"
                          }`}
                        >
                          <input
                            checked={isChecked}
                            disabled={isPriestRole || isPriestOnly}
                            type="checkbox"
                            onChange={() => togglePermission(value)}
                          />
                          <span className="flex-1">{label}</span>
                          {isPriestRole ? (
                            <span className="rounded-full border border-emerald-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                              Priest
                            </span>
                          ) : isPriestOnly ? (
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                              Priest only
                            </span>
                          ) : isDenied ? (
                            <span className="rounded-full border border-rose-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-100">
                              Removed
                            </span>
                          ) : isRolePermission ? (
                            <span className="rounded-full border border-emerald-300/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                              Default
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </section>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-100">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) =>
                      setForm((current: any) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active login access
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    className="btn-primary flex-1 justify-center"
                    type="submit"
                  >
                    {saveMutation.isPending
                      ? "Saving..."
                      : editingId
                        ? "Update user"
                        : "Create user"}
                  </button>
                  <button
                    className="btn-secondary justify-center"
                    type="button"
                    onClick={closeEditor}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
