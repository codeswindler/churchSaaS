import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  Clock3,
  Inbox,
  MessageSquareText,
  RotateCcw,
  Search,
  Send,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import SmsPhonePreview from "../../components/SmsPhonePreview";
import api from "../../services/api";
import { getGsm7SmsMetrics } from "../../services/smsMetrics";

type Workspace = "outbox" | "compose" | "addressBox";

const initialMessageForm = {
  audience: "all",
  churchIds: [] as string[],
  message: "",
};

const initialFilters = {
  churchId: "",
  from: "",
  to: "",
  sendStatus: "",
  deliveryStatus: "",
};

const undoSeconds = 6;

function toQueryString(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

const selectableTileClass = "rounded-2xl border px-4 py-3 text-left transition";
const selectedTileClass =
  "border-emerald-300/60 bg-emerald-300/15 text-white shadow-[0_0_0_1px_rgba(110,231,183,0.14)]";
const idleTileClass =
  "border-white/10 bg-black/10 text-stone-300 hover:border-emerald-300/35 hover:bg-emerald-300/10 hover:text-white";

function normalizeWorkspace(value: string | null): Workspace {
  return value === "outbox" || value === "addressBox" ? value : "compose";
}

export default function PlatformMessaging() {
  const queryClient = useQueryClient();
  const [routeSearchParams, setRouteSearchParams] = useSearchParams();
  const activeWorkspace = normalizeWorkspace(routeSearchParams.get("tab"));
  const setActiveWorkspace = (workspace: Workspace) => {
    const next = new URLSearchParams(routeSearchParams);
    next.set("tab", workspace);
    setRouteSearchParams(next);
  };
  const [form, setForm] = useState(initialMessageForm);
  const [filters, setFilters] = useState(initialFilters);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingSend, setPendingSend] = useState<null | {
    seconds: number;
    payload: typeof initialMessageForm;
  }>(null);

  const queryString = useMemo(() => toQueryString(filters), [filters]);
  const messageMetrics = getGsm7SmsMetrics(form.message);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["platform-messaging-config"],
    queryFn: () =>
      api.get("/platform/messaging/config").then((response) => response.data),
  });

  const { data: outbox, isLoading: outboxLoading } = useQuery({
    queryKey: ["platform-messaging-outbox", queryString],
    queryFn: () =>
      api
        .get(
          `/platform/messaging/outbox${queryString ? `?${queryString}` : ""}`,
        )
        .then((response) => response.data),
  });

  const churches = config?.churches || [];
  const smsConfig = config?.smsConfig;
  const platformSmsReady = Boolean(
    smsConfig?.configured || smsConfig?.fallbackConfigured,
  );
  const activeChurches = churches.filter(
    (church: any) => church.status === "active",
  );
  const outboxRows = outbox || [];
  const selectedCount =
    form.audience === "all" ? activeChurches.length : form.churchIds.length;
  const estimatedRecipients =
    form.audience === "all"
      ? activeChurches.reduce(
          (sum: number, church: any) =>
            sum + Number(church.contacts?.length || 0),
          0,
        )
      : churches
          .filter((church: any) => form.churchIds.includes(church.id))
          .reduce(
            (sum: number, church: any) =>
              sum + Number(church.contacts?.length || 0),
            0,
          );

  const filteredChurches = churches.filter((church: any) => {
    const haystack = [
      church.name,
      church.slug,
      church.contactEmail,
      church.contactPhone,
      ...(church.contacts || []).flatMap((contact: any) => [
        contact.name,
        contact.email,
        contact.phone,
      ]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchTerm.trim().toLowerCase());
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: typeof initialMessageForm) => {
      const response = await api.post("/platform/messaging/bulk", payload);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(
        `SMS sent to ${Number(data.recipientCount || 0).toLocaleString()} contact${Number(data.recipientCount || 0) === 1 ? "" : "s"}`,
      );
      setForm(initialMessageForm);
      setActiveWorkspace("outbox");
      queryClient.invalidateQueries({
        queryKey: ["platform-messaging-outbox"],
      });
      queryClient.invalidateQueries({ queryKey: ["platform-churches"] });
      queryClient.invalidateQueries({ queryKey: ["platform-dashboard"] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to send platform SMS",
      );
    },
  });

  useEffect(() => {
    if (!pendingSend) {
      return;
    }

    if (pendingSend.seconds <= 0) {
      const payload = pendingSend.payload;
      setPendingSend(null);
      sendMutation.mutate(payload);
      return;
    }

    const timer = window.setTimeout(() => {
      setPendingSend((current) =>
        current ? { ...current, seconds: current.seconds - 1 } : current,
      );
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [pendingSend, sendMutation]);

  const toggleChurch = (churchId: string) => {
    setForm((current) => {
      const selected = new Set(current.churchIds);
      if (selected.has(churchId)) {
        selected.delete(churchId);
      } else {
        selected.add(churchId);
      }
      return {
        ...current,
        churchIds: Array.from(selected),
      };
    });
  };

  const queueSend = () => {
    if (!platformSmsReady) {
      toast.error("Set platform SMS credentials in Settings before sending");
      return;
    }
    if (!form.message.trim()) {
      toast.error("Write the message before sending");
      return;
    }
    if (form.audience === "selected" && form.churchIds.length === 0) {
      toast.error("Select at least one church");
      return;
    }
    if (pendingSend) {
      toast.error("A message is already waiting for the undo window");
      return;
    }

    setPendingSend({
      seconds: undoSeconds,
      payload: {
        ...form,
        churchIds: [...form.churchIds],
      },
    });
    toast.success(`SMS will send in ${undoSeconds} seconds`);
  };

  const cancelPendingSend = () => {
    setPendingSend(null);
    toast.success("SMS send cancelled");
  };

  const messageChurch = (churchId: string) => {
    setForm((current) => ({
      ...current,
      audience: "selected",
      churchIds: [churchId],
    }));
    setActiveWorkspace("compose");
  };

  return (
    <div className="space-y-5">
      <section className="panel p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
                Client churches
              </p>
              <div className="mt-1 text-xl font-semibold text-white">
                {Number(churches.length || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
                Active audience
              </p>
              <div className="mt-1 text-xl font-semibold text-white">
                {Number(activeChurches.length || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
                Outbox records
              </p>
              <div className="mt-1 text-xl font-semibold text-white">
                {Number(outboxRows.length || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.22em] text-stone-400">
                Sender
              </p>
              <div className="mt-1 text-xl font-semibold text-white">
                {platformSmsReady ? "Ready" : "Missing"}
              </div>
            </div>
          </div>

        </div>
      </section>

      {activeWorkspace === "compose" ? (
        <section className="panel p-5 sm:p-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              queueSend();
            }}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Platform SMS Composer
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Talk to client churches
                </h3>
                <p className="mt-2 max-w-2xl text-sm text-stone-300">
                  Send operational notices to church contacts and first admin
                  users from one platform workspace.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
                {selectedCount.toLocaleString()} church
                {selectedCount === 1 ? "" : "es"} selected | about{" "}
                {estimatedRecipients.toLocaleString()} contact
                {estimatedRecipients === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] xl:items-start">
              <div className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label className="label">Audience</label>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    {
                      id: "all",
                      title: "All active churches",
                      description:
                        "Send to every active church contact in the registry.",
                    },
                    {
                      id: "selected",
                      title: "Selected churches",
                      description:
                        "Choose one or more churches from the client address box.",
                    },
                  ].map((option) => {
                    const isSelected = form.audience === option.id;
                    return (
                      <button
                        key={option.id}
                        className={`${selectableTileClass} ${
                          isSelected ? selectedTileClass : idleTileClass
                        }`}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            audience: option.id,
                          }))
                        }
                      >
                        <span className="block font-semibold">
                          {option.title}
                        </span>
                        <span className="text-xs text-stone-400">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.audience === "selected" ? (
                <div className="lg:col-span-2">
                  <label className="label">Churches</label>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {churches.map((church: any) => {
                      const isSelected = form.churchIds.includes(church.id);
                      return (
                        <button
                          key={church.id}
                          className={`${selectableTileClass} ${
                            isSelected ? selectedTileClass : idleTileClass
                          }`}
                          type="button"
                          onClick={() => toggleChurch(church.id)}
                        >
                          <span className="block font-semibold">
                            {church.name}
                          </span>
                          <span className="text-xs text-stone-400">
                            {church.contactPhone ||
                              church.primaryContact?.phone ||
                              "No phone on file"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="lg:col-span-2">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                  <label className="label mb-0">Message</label>
                  <span className="text-xs text-stone-400">
                    {messageMetrics.length} chars | {messageMetrics.segments}{" "}
                    unit{messageMetrics.segments === 1 ? "" : "s"} |{" "}
                    {messageMetrics.remainingInCurrentSegment} left on current
                    segment
                  </span>
                </div>
                <textarea
                  className="input mt-2 min-h-44 resize-y"
                  placeholder="Example: Dear client, we will run scheduled maintenance tonight from 10 PM."
                  value={form.message}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      message: event.target.value,
                    }))
                  }
                />
              </div>

              {pendingSend ? (
                <div className="lg:col-span-2 rounded-3xl border border-amber-200/30 bg-amber-200/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <Clock3 className="mt-1 text-amber-200" size={18} />
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-100">
                          Undo window
                        </p>
                        <p className="mt-1 text-sm text-stone-300">
                          Sending in {pendingSend.seconds}s. Cancel now if the
                          audience or message needs a change.
                        </p>
                      </div>
                    </div>
                    <button
                      className="btn-secondary justify-center"
                      type="button"
                      onClick={cancelPendingSend}
                    >
                      <RotateCcw size={16} />
                      Undo send
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                className="btn-primary w-full justify-center lg:col-span-2"
                disabled={sendMutation.isPending || Boolean(pendingSend)}
                type="submit"
              >
                <Send size={16} />
                {sendMutation.isPending
                  ? "Sending..."
                  : pendingSend
                    ? `Sending in ${pendingSend.seconds}s`
                    : "Send platform SMS"}
              </button>
              </div>

              <div className="xl:sticky xl:top-6">
                <SmsPhonePreview
                  message={form.message}
                  sender={smsConfig?.smsShortcode || "Choice SMS"}
                />
              </div>
            </div>
          </form>
        </section>
      ) : null}

      {activeWorkspace === "addressBox" ? (
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Client Address Box
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Church contacts and admins
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-stone-300">
                Review each church contact number and start a targeted SMS from
                the same list.
              </p>
            </div>
            <div className="relative w-full lg:max-w-sm">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                size={16}
              />
              <input
                className="input input-leading-icon"
                placeholder="Search churches or contacts"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>

          {configLoading ? (
            <div className="mt-6 rounded-3xl border border-white/10 bg-black/10 p-5 text-stone-300">
              Loading client address box...
            </div>
          ) : (
            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {filteredChurches.map((church: any) => (
                <div
                  key={church.id}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">
                          {church.name}
                        </h4>
                        <p className="mt-1 text-xs text-stone-400">
                          /c/{church.slug} | {church.status}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="badge border-white/10 bg-white/5 text-stone-100">
                            {church.smsReady ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <MessageSquareText size={12} />
                            )}
                            Own SMS {church.smsReady ? "ready" : "missing"}
                          </span>
                          <span className="badge border-white/10 bg-white/5 text-stone-100">
                            <Users size={12} />
                            {Number(church.contacts?.length || 0)} contacts
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn-secondary justify-center px-3 py-2"
                      type="button"
                      onClick={() => messageChurch(church.id)}
                    >
                      <Send size={14} />
                      Message
                    </button>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {(church.contacts || []).map(
                      (contact: any, index: number) => (
                        <div
                          key={`${church.id}-${contact.phone}-${index}`}
                          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
                        >
                          <div className="font-medium text-white">
                            {contact.name || church.name}
                          </div>
                          <div className="mt-1 text-stone-300">
                            {contact.phone || "-"}
                          </div>
                          <div className="mt-1 text-xs text-stone-400">
                            {contact.email || church.contactEmail || "-"} |{" "}
                            {contact.role || contact.source}
                          </div>
                        </div>
                      ),
                    )}
                    {!church.contacts || church.contacts.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-400">
                        No SMS contact has been saved for this church.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {filteredChurches.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5 text-sm text-stone-400">
                  No churches match this search.
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {activeWorkspace === "outbox" ? (
        <section className="space-y-5">
          <section className="panel p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Inbox className="mt-1 text-amber-200" size={18} />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Platform Outbox
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Client SMS activity
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="label">Church</label>
                <select
                  className="input"
                  value={filters.churchId}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      churchId: event.target.value,
                    }))
                  }
                >
                  <option value="">All churches</option>
                  {churches.map((church: any) => (
                    <option key={church.id} value={church.id}>
                      {church.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">From</label>
                <input
                  className="input"
                  type="date"
                  value={filters.from}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      from: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  className="input"
                  type="date"
                  value={filters.to}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      to: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">Provider</label>
                <select
                  className="input"
                  value={filters.sendStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      sendStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="accepted">Accepted</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                </select>
              </div>
              <div>
                <label className="label">Delivery</label>
                <select
                  className="input"
                  value={filters.deliveryStatus}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      deliveryStatus: event.target.value,
                    }))
                  }
                >
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
          </section>

          <section className="table-shell">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Outbox
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Messages sent to client churches
              </h3>
            </div>

            {outboxLoading ? (
              <div className="p-6 text-stone-300">Loading outbox...</div>
            ) : (
              <div className="table-scroll-region">
                <table className="mobile-card-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Church</th>
                      <th>Recipient</th>
                      <th>Units</th>
                      <th>Provider</th>
                      <th>Delivery</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboxRows.map((item: any) => (
                      <tr key={item.id}>
                        <td className="mono text-xs" data-label="Date">
                          {formatDate(item.createdAt)}
                        </td>
                        <td data-label="Church">
                          {item.church?.name || "Client church"}
                        </td>
                        <td data-label="Recipient">
                          <div className="font-medium text-white">
                            {item.recipientName || "Church contact"}
                          </div>
                          <div className="text-xs text-stone-400">
                            {item.recipientMobile}
                          </div>
                        </td>
                        <td data-label="Units">{item.estimatedUnits}</td>
                        <td data-label="Provider">
                          {item.providerDescription || item.sendStatus}
                        </td>
                        <td data-label="Delivery">
                          {item.deliveryDescription || item.deliveryStatus}
                        </td>
                        <td className="max-w-md truncate" data-label="Message">
                          {item.messageBody}
                        </td>
                      </tr>
                    ))}
                    {outboxRows.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No platform SMS outbox records yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : null}
    </div>
  );
}
