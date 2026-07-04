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
  isFirstTimeAtChurch?: boolean | null;
  hasChurchRole?: boolean | null;
  churchRoleNotes?: string | null;
  notes?: string | null;
  isParent?: boolean | null;
  childInSundaySchool?: boolean | null;
  groups?: DiscipleshipGroup[];
  contributionSummary?: ContributionSummary;
  titheSummary?: ContributionSummary;
  activitySummary?: {
    enrollmentDate?: string | null;
    firstContributionAt?: string | null;
    latestContributionAt?: string | null;
    contributionCount?: number;
    contributionTotal?: number;
    latestAttendanceAt?: string | null;
    attendanceCount90Days: number;
    averageAttendancePerMonth: number;
  };
}

interface ContributionSummary {
  totalAmount: number;
  contributionCount: number;
  latestContributionAt?: string | null;
  dates: {
    date: string;
    amount: number;
    count: number;
  }[];
  contributions: {
    id: string;
    date: string;
    amount: number;
    fundAccountName?: string | null;
    fundAccountCode?: string | null;
    paymentReference?: string | null;
    channel?: string | null;
  }[];
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

function booleanToFormValue(value?: boolean | null) {
  if (value === true) {
    return 'yes';
  }
  if (value === false) {
    return 'no';
  }
  return '';
}

function formValueToNullableBoolean(value: string) {
  if (value === 'yes') {
    return true;
  }
  if (value === 'no') {
    return false;
  }
  return null;
}

function formatNullableBoolean(value?: boolean | null) {
  if (value === true) {
    return 'Yes';
  }
  if (value === false) {
    return 'No';
  }
  return 'Not recorded';
}

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString()}`;
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

function MiniAmountBars({
  emptyLabel,
  items,
}: {
  emptyLabel: string;
  items: ContributionSummary['dates'];
}) {
  const chartItems = items
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);
  const maxValue = Math.max(
    1,
    ...chartItems.map((item) => Number(item.amount || 0)),
  );

  if (chartItems.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 p-3 text-sm text-stone-300">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="mt-3 flex h-28 items-end gap-2 rounded-2xl border border-white/10 bg-black/10 p-3">
      {chartItems.map((item) => {
        const height = Math.max(8, (Number(item.amount || 0) / maxValue) * 88);
        return (
          <div
            key={item.date}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"
            title={`${item.date}: ${formatKes(item.amount)} from ${item.count} contribution${item.count === 1 ? '' : 's'}`}
          >
            <div
              className="w-full rounded-t-xl bg-gradient-to-t from-emerald-500 to-amber-200"
              style={{ height }}
            />
            <span className="max-w-full truncate text-[10px] text-stone-500">
              {item.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ChurchOneOnOne() {
  const queryClient = useQueryClient();
  const session = getSession();
  const canManage = hasChurchPermission(session?.user, 'discipleship.manage');
  const isPriest =
    session?.user?.role === 'priest' || session?.user?.role === 'church_admin';
  const canViewContributions =
    isPriest && hasChurchPermission(session?.user, 'contributions.view');
  const [memberSearch, setMemberSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(createFollowUpForm);
  const [isBioEditorOpen, setIsBioEditorOpen] = useState(false);
  const [bioForm, setBioForm] = useState({
    phone: '',
    email: '',
    gender: '',
    enrollmentDate: '',
    isFirstTimeAtChurch: '',
    hasChurchRole: '',
    churchRoleNotes: '',
    isParent: '',
    childInSundaySchool: '',
    notes: '',
  });

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
  const selectedMember =
    selectedMemberDetail?.id === selectedMemberBase?.id
      ? selectedMemberDetail
      : selectedMemberBase;
  const activeMemberId = selectedMemberId || selectedMember?.id || '';

  useEffect(() => {
    if (!selectedMember?.id) {
      return;
    }
    setBioForm({
      phone: selectedMember.phone || '',
      email: selectedMember.email || '',
      gender: selectedMember.gender || '',
      enrollmentDate:
        selectedMember.enrollmentDate ||
        selectedMember.activitySummary?.enrollmentDate ||
        '',
      isFirstTimeAtChurch: booleanToFormValue(
        selectedMember.isFirstTimeAtChurch,
      ),
      hasChurchRole: booleanToFormValue(selectedMember.hasChurchRole),
      churchRoleNotes: selectedMember.churchRoleNotes || '',
      isParent: booleanToFormValue(selectedMember.isParent),
      childInSundaySchool: booleanToFormValue(
        selectedMember.childInSundaySchool,
      ),
      notes: selectedMember.notes || '',
    });
    setIsBioEditorOpen(false);
  }, [
    selectedMember?.id,
    selectedMember?.phone,
    selectedMember?.email,
    selectedMember?.gender,
    selectedMember?.enrollmentDate,
    selectedMember?.isFirstTimeAtChurch,
    selectedMember?.hasChurchRole,
    selectedMember?.churchRoleNotes,
    selectedMember?.isParent,
    selectedMember?.childInSundaySchool,
    selectedMember?.notes,
    selectedMember?.activitySummary?.enrollmentDate,
  ]);

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

  const oneOnOneOverview = useMemo(() => {
    const openRecords = followUps.filter((record) => record.status === 'open');
    const nextVisit =
      followUps
        .map((record) => record.nextProposedVisitDate)
        .filter(Boolean)
        .sort((a, b) => String(a).localeCompare(String(b)))[0] || null;
    return {
      openFollowUps: openRecords.length,
      totalRecords: followUps.length,
      nextVisit,
      latestRecord: followUps[0]?.sessionDate || null,
    };
  }, [followUps]);

  const givingSummary = selectedMember?.contributionSummary;
  const titheSummary = selectedMember?.titheSummary;

  useEffect(() => {
    setMemberPage(1);
  }, [groupFilter, memberSearch]);

  useEffect(() => {
    if (members.length === 0) {
      return;
    }
    if (!selectedMemberId || !members.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(members[0].id);
    }
  }, [members, selectedMemberId]);

  const resetForm = () => {
    setEditingFollowUpId(null);
    setIsFormOpen(false);
    setForm(createFollowUpForm());
  };

  const refreshFollowUps = () => {
    queryClient.invalidateQueries({ queryKey: ['one-on-one-follow-ups'] });
    queryClient.invalidateQueries({ queryKey: ['one-on-one-member-detail'] });
    queryClient.invalidateQueries({ queryKey: ['one-on-one-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-member-detail'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-detail'],
    });
    queryClient.invalidateQueries({ queryKey: ['discipleship-follow-ups'] });
  };

  const saveBioMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMember?.id) {
        throw new Error('Select a disciple first');
      }
      return api
        .patch(`/church/discipleship/members/${selectedMember.id}`, {
          phone: bioForm.phone.trim() || null,
          email: bioForm.email.trim() || null,
          gender: bioForm.gender || null,
          enrollmentDate: bioForm.enrollmentDate || null,
          isFirstTimeAtChurch: formValueToNullableBoolean(
            bioForm.isFirstTimeAtChurch,
          ),
          hasChurchRole: formValueToNullableBoolean(bioForm.hasChurchRole),
          churchRoleNotes: bioForm.churchRoleNotes.trim() || null,
          isParent: formValueToNullableBoolean(bioForm.isParent),
          childInSundaySchool: formValueToNullableBoolean(
            bioForm.childInSundaySchool,
          ),
          notes: bioForm.notes.trim() || null,
        })
        .then((response) => response.data);
    },
    onSuccess: () => {
      toast.success('Member biodata updated');
      setIsBioEditorOpen(false);
      refreshFollowUps();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to update member biodata',
      );
    },
  });

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
      <section className="grid gap-4 md:grid-cols-[minmax(12rem,1fr)_minmax(0,4fr)]">
        <div className="panel overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Members
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">Choose</h3>
          </div>

          <div className="space-y-2 border-b border-white/10 p-3">
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
                    activeMemberId === member.id ? 'bg-amber-200/10' : ''
                  }`}
                  type="button"
                  onClick={() => setSelectedMemberId(member.id)}
                >
                  <span className="block text-sm font-semibold leading-tight text-white">
                    {member.fullName}
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

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Open follow-ups', oneOnOneOverview.openFollowUps],
                  ['Recorded visits', oneOnOneOverview.totalRecords],
                  ['Next proposed visit', oneOnOneOverview.nextVisit || 'None'],
                  ['Latest record', oneOnOneOverview.latestRecord || 'None'],
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

              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                      One-time biodata
                    </p>
                    <h4 className="mt-1 font-semibold text-white">
                      Family and Sunday-school profile
                    </h4>
                    <p className="mt-1 text-xs text-stone-400">
                      These details are stored once on the member record, not on
                      every one-on-one visit.
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      className="btn-secondary px-3 py-2 text-xs"
                      type="button"
                      onClick={() => setIsBioEditorOpen((current) => !current)}
                    >
                      <PencilLine size={14} />
                      {isBioEditorOpen ? 'Close' : 'Edit biodata'}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Phone', selectedMember.phone || 'Not captured'],
                    ['Email', selectedMember.email || 'Not captured'],
                    ['Gender', selectedMember.gender || 'Not set'],
                    [
                      'Enrollment date',
                      selectedMember.enrollmentDate ||
                        selectedMember.activitySummary?.enrollmentDate ||
                        'Not set',
                    ],
                    [
                      'First time in church',
                      formatNullableBoolean(selectedMember.isFirstTimeAtChurch),
                    ],
                    [
                      'Is member a parent?',
                      formatNullableBoolean(selectedMember.isParent),
                    ],
                    [
                      'Child in Sunday school?',
                      formatNullableBoolean(
                        selectedMember.childInSundaySchool,
                      ),
                    ],
                    [
                      'Groups',
                      (selectedMember.groups || [])
                        .map((group) => group.name)
                        .join(', ') || 'No group assigned',
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                        {label}
                      </p>
                      <p className="mt-1 break-words text-sm font-semibold text-white">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                      Community / church role
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {selectedMember.hasChurchRole
                        ? selectedMember.churchRoleNotes || 'Yes'
                        : formatNullableBoolean(selectedMember.hasChurchRole)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                      Bio notes
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {selectedMember.notes || 'No notes recorded'}
                    </p>
                  </div>
                </div>

                {isBioEditorOpen ? (
                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          Phone
                        </span>
                        <input
                          className="input-compact"
                          value={bioForm.phone}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          Email
                        </span>
                        <input
                          className="input-compact"
                          type="email"
                          value={bioForm.email}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          Gender
                        </span>
                        <select
                          className="input-compact"
                          value={bioForm.gender}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              gender: event.target.value,
                            }))
                          }
                        >
                          <option value="">Not set</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          Enrollment date
                        </span>
                        <input
                          className="input-compact"
                          type="date"
                          value={bioForm.enrollmentDate}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              enrollmentDate: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          First time in church?
                        </span>
                        <select
                          className="input-compact"
                          value={bioForm.isFirstTimeAtChurch}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              isFirstTimeAtChurch: event.target.value,
                            }))
                          }
                        >
                          <option value="">Not recorded</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                          Has church role/community?
                        </span>
                        <select
                          className="input-compact"
                          value={bioForm.hasChurchRole}
                          onChange={(event) =>
                            setBioForm((current) => ({
                              ...current,
                              hasChurchRole: event.target.value,
                            }))
                          }
                        >
                          <option value="">Not recorded</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Is member a parent?
                      </span>
                      <select
                        className="input-compact"
                        value={bioForm.isParent}
                        onChange={(event) =>
                          setBioForm((current) => ({
                            ...current,
                            isParent: event.target.value,
                          }))
                        }
                      >
                        <option value="">Not recorded</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Child in Sunday school?
                      </span>
                      <select
                        className="input-compact"
                        value={bioForm.childInSundaySchool}
                        onChange={(event) =>
                          setBioForm((current) => ({
                            ...current,
                            childInSundaySchool: event.target.value,
                          }))
                        }
                      >
                        <option value="">Not recorded</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    </div>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Role / community notes
                      </span>
                      <input
                        className="input-compact"
                        placeholder="Small community, leadership role, ministry..."
                        value={bioForm.churchRoleNotes}
                        onChange={(event) =>
                          setBioForm((current) => ({
                            ...current,
                            churchRoleNotes: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
                        Bio notes
                      </span>
                      <textarea
                        className="input min-h-20"
                        value={bioForm.notes}
                        onChange={(event) =>
                          setBioForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="btn-primary justify-center sm:w-fit"
                      disabled={saveBioMutation.isPending}
                      type="button"
                      onClick={() => saveBioMutation.mutate()}
                    >
                      Save biodata
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [
                    'Latest attendance',
                    selectedMember.activitySummary?.latestAttendanceAt ||
                      'None',
                  ],
                  [
                    'Attendance · 90 days',
                    selectedMember.activitySummary?.attendanceCount90Days ?? 0,
                  ],
                  [
                    'Average / month',
                    selectedMember.activitySummary?.averageAttendancePerMonth ??
                      0,
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

              {canViewContributions ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                      Giving overview
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        [
                          'Total giving',
                          formatKes(givingSummary?.totalAmount),
                        ],
                        [
                          'Entries',
                          givingSummary?.contributionCount || 0,
                        ],
                        [
                          'Latest',
                          givingSummary?.latestContributionAt || 'None',
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
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
                    <MiniAmountBars
                      emptyLabel="No linked giving records yet."
                      items={givingSummary?.dates || []}
                    />
                  </div>

                  <div className="rounded-3xl border border-emerald-300/20 bg-emerald-500/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">
                      Tithing pattern
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {[
                        ['Total tithe', formatKes(titheSummary?.totalAmount)],
                        ['Tithe entries', titheSummary?.contributionCount || 0],
                        [
                          'Latest tithe',
                          titheSummary?.latestContributionAt || 'None',
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-2xl border border-emerald-200/10 bg-black/10 p-3"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-100/70">
                            {label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    <MiniAmountBars
                      emptyLabel="No linked tithe records yet."
                      items={titheSummary?.dates || []}
                    />
                  </div>
                </div>
              ) : null}

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
