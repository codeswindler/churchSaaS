import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PencilLine, Plus, Search, UserCheck } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getSession, hasChurchPermission } from '../../services/api';

interface DiscipleshipGroup {
  id: string;
  name: string;
}

interface DiscipleshipMember {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  enrollmentDate?: string | null;
  notes?: string | null;
  groups?: DiscipleshipGroup[];
  activitySummary?: {
    latestAttendanceAt?: string | null;
    attendanceCount90Days: number;
    averageAttendancePerMonth: number;
  };
}

type FollowUpStatus = 'open' | 'completed' | 'cancelled';

interface FollowUpRecord {
  id: string;
  memberId: string;
  sessionDate: string;
  discussionSummary?: string | null;
  issueRaised?: string | null;
  proposedSolutions?: string | null;
  nextProposedVisitDate?: string | null;
  nextVisitNotes?: string | null;
  status: FollowUpStatus;
  recordedByUser?: {
    id: string;
    name: string;
  } | null;
}

function getNairobiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}

function buildQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

function createFollowUpForm() {
  return {
    sessionDate: getNairobiToday(),
    discussionSummary: '',
    issueRaised: '',
    proposedSolutions: '',
    nextProposedVisitDate: '',
    nextVisitNotes: '',
    status: 'open' as FollowUpStatus,
  };
}

function formatStatus(status: FollowUpStatus) {
  if (status === 'completed') {
    return 'Completed';
  }
  if (status === 'cancelled') {
    return 'Cancelled';
  }
  return 'Open';
}

export default function ChurchOneOnOne() {
  const queryClient = useQueryClient();
  const session = getSession();
  const canManage = hasChurchPermission(session?.user, 'discipleship.manage');
  const [memberSearch, setMemberSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(createFollowUpForm);

  const { data: groups = [] } = useQuery<DiscipleshipGroup[]>({
    queryKey: ['one-on-one-groups'],
    queryFn: () =>
      api.get('/church/discipleship/groups').then((response) => response.data),
  });

  const memberQuery = buildQuery({
    search: memberSearch.trim(),
    groupId: groupFilter,
    page: String(memberPage),
    limit: '25',
  });
  const { data: memberPageData, isLoading: membersLoading } = useQuery<{
    items: DiscipleshipMember[];
    pagination: {
      page: number;
      total: number;
      totalPages: number;
    };
  }>({
    queryKey: ['one-on-one-members', memberSearch.trim(), groupFilter, memberPage],
    queryFn: () =>
      api
        .get(`/church/discipleship/members${memberQuery}`)
        .then((response) => response.data),
  });

  const members = memberPageData?.items || [];
  const selectedMemberBase =
    members.find((member) => member.id === selectedMemberId) ||
    members[0] ||
    null;
  const { data: selectedMemberDetail } = useQuery<DiscipleshipMember>({
    queryKey: ['one-on-one-member-detail', selectedMemberBase?.id],
    enabled: Boolean(selectedMemberBase?.id),
    queryFn: () =>
      api
        .get(`/church/discipleship/members/${selectedMemberBase?.id}`)
        .then((response) => response.data),
  });
  const selectedMember = selectedMemberDetail || selectedMemberBase;

  const { data: followUps = [], isLoading: followUpsLoading } = useQuery<
    FollowUpRecord[]
  >({
    queryKey: ['one-on-one-follow-ups', selectedMember?.id],
    enabled: Boolean(selectedMember?.id),
    queryFn: () =>
      api
        .get(`/church/discipleship/members/${selectedMember?.id}/follow-ups`)
        .then((response) => response.data),
  });

  useEffect(() => {
    setMemberPage(1);
  }, [groupFilter, memberSearch]);

  const stats = useMemo(() => {
    const open = followUps.filter((item) => item.status === 'open');
    const nextVisit = open
      .map((item) => item.nextProposedVisitDate)
      .filter(Boolean)
      .sort()[0];
    return {
      total: followUps.length,
      open: open.length,
      completed: followUps.filter((item) => item.status === 'completed').length,
      nextVisit: nextVisit || 'Not set',
    };
  }, [followUps]);

  const resetForm = () => {
    setEditingFollowUpId(null);
    setIsFormOpen(false);
    setForm(createFollowUpForm());
  };

  const refreshFollowUps = () => {
    queryClient.invalidateQueries({ queryKey: ['one-on-one-follow-ups'] });
    queryClient.invalidateQueries({ queryKey: ['one-on-one-member-detail'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-follow-ups'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember?.id) {
        throw new Error('Select a disciple first');
      }
      const payload = {
        sessionDate: form.sessionDate,
        discussionSummary: form.discussionSummary,
        issueRaised: form.issueRaised,
        proposedSolutions: form.proposedSolutions,
        nextProposedVisitDate: form.nextProposedVisitDate || null,
        nextVisitNotes: form.nextVisitNotes,
        status: form.status,
      };
      if (editingFollowUpId) {
        return api
          .patch(`/church/discipleship/follow-ups/${editingFollowUpId}`, payload)
          .then((response) => response.data);
      }
      return api
        .post(`/church/discipleship/members/${selectedMember.id}/follow-ups`, payload)
        .then((response) => response.data);
    },
    onSuccess: () => {
      toast.success(
        editingFollowUpId ? 'One-on-one updated' : 'One-on-one recorded',
      );
      resetForm();
      refreshFollowUps();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to save one-on-one record',
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      followUpId,
      status,
    }: {
      followUpId: string;
      status: FollowUpStatus;
    }) =>
      api
        .patch(`/church/discipleship/follow-ups/${followUpId}`, { status })
        .then((response) => response.data),
    onSuccess: () => {
      toast.success('Follow-up status updated');
      refreshFollowUps();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to update follow-up status',
      );
    },
  });

  const openEditor = (record?: FollowUpRecord) => {
    setEditingFollowUpId(record?.id || null);
    setForm(
      record
        ? {
            sessionDate: record.sessionDate || getNairobiToday(),
            discussionSummary: record.discussionSummary || '',
            issueRaised: record.issueRaised || '',
            proposedSolutions: record.proposedSolutions || '',
            nextProposedVisitDate: record.nextProposedVisitDate || '',
            nextVisitNotes: record.nextVisitNotes || '',
            status: record.status || 'open',
          }
        : createFollowUpForm(),
    );
    setIsFormOpen(true);
  };

  const submitFollowUp = (event: FormEvent) => {
    event.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="church-console-page discipleship-page space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Open follow-ups', stats.open],
          ['Completed', stats.completed],
          ['Total records', stats.total],
          ['Next proposed visit', stats.nextVisit],
        ].map(([label, value]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(290px,0.85fr)_minmax(0,1.15fr)]">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Disciples
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Choose a member
            </h3>
          </div>

          <div className="grid gap-3 border-b border-white/10 p-3 md:grid-cols-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                size={15}
              />
              <input
                className="input-compact pl-9"
                placeholder="Search members"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
              />
            </div>
            <select
              className="input-compact"
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[560px] divide-y divide-white/10 overflow-y-auto">
            {membersLoading ? (
              <p className="p-4 text-sm text-stone-300">Loading members...</p>
            ) : members.length === 0 ? (
              <p className="p-4 text-sm text-stone-300">No members found.</p>
            ) : (
              members.map((member) => (
                <button
                  key={member.id}
                  className={`block w-full p-4 text-left transition hover:bg-white/5 ${
                    selectedMember?.id === member.id ? 'bg-amber-200/10' : ''
                  }`}
                  type="button"
                  onClick={() => setSelectedMemberId(member.id)}
                >
                  <span className="block font-semibold text-white">
                    {member.fullName}
                  </span>
                  <span className="mt-1 block text-xs text-stone-400">
                    {(member.groups || []).map((group) => group.name).join(', ') ||
                      'No group assigned'}
                  </span>
                </button>
              ))
            )}
          </div>

          {memberPageData?.pagination ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3 text-xs text-stone-400">
              <span>
                {memberPageData.pagination.total.toLocaleString()} members
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary px-3 py-2"
                  disabled={memberPage <= 1}
                  type="button"
                  onClick={() => setMemberPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <button
                  className="btn-secondary px-3 py-2"
                  disabled={memberPage >= memberPageData.pagination.totalPages}
                  type="button"
                  onClick={() => setMemberPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="panel p-4 sm:p-5">
          {selectedMember ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    One-on-one module
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {selectedMember.fullName}
                  </h3>
                  <p className="mt-2 text-sm text-stone-300">
                    Record what was discussed, what help was proposed, and when
                    the next visit should happen.
                  </p>
                </div>
                {canManage ? (
                  <button
                    className="btn-primary justify-center"
                    type="button"
                    onClick={() => openEditor()}
                  >
                    <Plus size={17} />
                    Record visit
                  </button>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Phone', selectedMember.phone || 'Not captured'],
                  ['Email', selectedMember.email || 'Not captured'],
                  ['Groups', (selectedMember.groups || []).map((group) => group.name).join(', ') || 'No group assigned'],
                  [
                    'Recent attendance',
                    selectedMember.activitySummary?.latestAttendanceAt || 'None',
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-black/10 p-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {isFormOpen ? (
                <form
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                  onSubmit={submitFollowUp}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Session date
                      </span>
                      <input
                        className="input-compact"
                        required
                        type="date"
                        value={form.sessionDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            sessionDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Status
                      </span>
                      <select
                        className="input-compact"
                        value={form.status}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            status: event.target.value as FollowUpStatus,
                          }))
                        }
                      >
                        <option value="open">Open</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3">
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Discussion summary
                      </span>
                      <textarea
                        className="input min-h-24"
                        placeholder="What was discussed?"
                        value={form.discussionSummary}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            discussionSummary: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Issue raised
                      </span>
                      <textarea
                        className="input min-h-20"
                        placeholder="Need, concern, prayer request, or situation"
                        value={form.issueRaised}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            issueRaised: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Proposed solutions
                      </span>
                      <textarea
                        className="input min-h-24"
                        placeholder="Agreed next steps, support plan, or referral"
                        value={form.proposedSolutions}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            proposedSolutions: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Next proposed visit
                      </span>
                      <input
                        className="input-compact"
                        type="date"
                        value={form.nextProposedVisitDate}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            nextProposedVisitDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Next visit notes
                      </span>
                      <input
                        className="input-compact"
                        placeholder="Optional note"
                        value={form.nextVisitNotes}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            nextVisitNotes: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      className="btn-secondary justify-center sm:flex-1"
                      disabled={saveMutation.isPending}
                      type="button"
                      onClick={resetForm}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-primary justify-center sm:flex-1"
                      disabled={saveMutation.isPending}
                      type="submit"
                    >
                      {editingFollowUpId ? 'Save record' : 'Record visit'}
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                      Follow-up history
                    </p>
                    <h4 className="mt-1 font-semibold text-white">
                      Recorded one-on-one visits
                    </h4>
                  </div>
                  <UserCheck className="text-amber-100" size={20} />
                </div>

                <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {followUpsLoading ? (
                    <p className="text-sm text-stone-300">
                      Loading follow-ups...
                    </p>
                  ) : followUps.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 p-3 text-sm text-stone-300">
                      No one-on-one records yet.
                    </p>
                  ) : (
                    followUps.map((record) => (
                      <div
                        key={record.id}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">
                              {record.sessionDate}
                            </p>
                            <p className="mt-1 text-xs text-stone-400">
                              {record.recordedByUser?.name
                                ? `Recorded by ${record.recordedByUser.name}`
                                : 'Recorded visit'}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                              record.status === 'completed'
                                ? 'border-emerald-300/30 text-emerald-100'
                                : record.status === 'cancelled'
                                  ? 'border-stone-300/20 text-stone-300'
                                  : 'border-amber-200/30 text-amber-100'
                            }`}
                          >
                            {formatStatus(record.status)}
                          </span>
                        </div>

                        {record.discussionSummary ? (
                          <p className="mt-3 text-sm text-stone-200">
                            {record.discussionSummary}
                          </p>
                        ) : null}
                        {record.issueRaised ? (
                          <p className="mt-3 text-sm text-stone-200">
                            <span className="text-stone-400">Issue:</span>{' '}
                            {record.issueRaised}
                          </p>
                        ) : null}
                        {record.proposedSolutions ? (
                          <p className="mt-2 text-sm text-stone-200">
                            <span className="text-stone-400">
                              Proposed solution:
                            </span>{' '}
                            {record.proposedSolutions}
                          </p>
                        ) : null}
                        {record.nextProposedVisitDate ? (
                          <p className="mt-2 text-xs font-semibold text-amber-100">
                            Next proposed visit: {record.nextProposedVisitDate}
                          </p>
                        ) : null}

                        {canManage ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              className="btn-secondary px-3 py-2 text-xs"
                              type="button"
                              onClick={() => openEditor(record)}
                            >
                              <PencilLine size={14} />
                              Edit
                            </button>
                            <button
                              className="btn-secondary px-3 py-2 text-xs"
                              disabled={statusMutation.isPending}
                              type="button"
                              onClick={() =>
                                statusMutation.mutate({
                                  followUpId: record.id,
                                  status:
                                    record.status === 'completed'
                                      ? 'open'
                                      : 'completed',
                                })
                              }
                            >
                              <CheckCircle2 size={14} />
                              {record.status === 'completed'
                                ? 'Reopen'
                                : 'Mark completed'}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-300">
              Select a disciple to record one-on-one follow-up.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
