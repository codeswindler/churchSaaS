import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  PencilLine,
  Plus,
  Search,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

type DiscipleshipTab = 'attendance' | 'members' | 'groups';

interface DiscipleshipGroup {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  memberCount?: number;
}

interface DiscipleshipMember {
  id: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  enrollmentDate?: string | null;
  status: 'active' | 'inactive';
  notes?: string | null;
  groups?: DiscipleshipGroup[];
  groupIds?: string[];
}

interface DiscipleshipAttendance {
  id: string;
  attendanceDate: string;
  weekday: string;
  attendanceType: 'service' | 'group';
  eventName?: string | null;
  member?: DiscipleshipMember;
  group?: DiscipleshipGroup | null;
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

function createMemberForm() {
  return {
    fullName: '',
    phone: '',
    email: '',
    gender: '',
    enrollmentDate: getNairobiToday(),
    status: 'active',
    notes: '',
    groupIds: [] as string[],
  };
}

const createGroupForm = () => ({
  name: '',
  description: '',
  isActive: true,
});

const discipleshipTabs: {
  value: DiscipleshipTab;
  label: string;
  icon: typeof CalendarCheck2;
}[] = [
  { value: 'attendance', label: 'Attendance', icon: CalendarCheck2 },
  { value: 'members', label: 'Members', icon: UserCheck },
  { value: 'groups', label: 'Groups', icon: UsersRound },
];

export default function ChurchDiscipleship() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DiscipleshipTab>('attendance');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberStatus, setMemberStatus] = useState('');
  const [memberGroupFilter, setMemberGroupFilter] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [isAttendanceTypeOpen, setIsAttendanceTypeOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState<{
    attendanceDate: string;
    attendanceType: 'service' | 'group';
    groupId: string;
    eventName: string;
  }>({
    attendanceDate: getNairobiToday(),
    attendanceType: 'service',
    groupId: '',
    eventName: '',
  });
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [detailMemberId, setDetailMemberId] = useState('');
  const [memberEditor, setMemberEditor] = useState<DiscipleshipMember | null>(
    null,
  );
  const [memberForm, setMemberForm] = useState(createMemberForm);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupEditor, setGroupEditor] = useState<DiscipleshipGroup | null>(null);
  const [groupForm, setGroupForm] = useState(createGroupForm);

  const { data: summary } = useQuery({
    queryKey: ['discipleship-summary'],
    queryFn: () =>
      api.get('/church/discipleship/summary').then((response) => response.data),
  });

  const { data: groups = [] } = useQuery<DiscipleshipGroup[]>({
    queryKey: ['discipleship-groups'],
    queryFn: () =>
      api.get('/church/discipleship/groups').then((response) => response.data),
  });

  const memberQuery = buildQuery({
    search: memberSearch.trim(),
    status: memberStatus,
    groupId: memberGroupFilter,
  });
  const { data: members = [], isLoading: membersLoading } = useQuery<
    DiscipleshipMember[]
  >({
    queryKey: [
      'discipleship-members',
      memberSearch.trim(),
      memberStatus,
      memberGroupFilter,
    ],
    queryFn: () =>
      api
        .get(`/church/discipleship/members${memberQuery}`)
        .then((response) => response.data),
  });

  const { data: attendance = [] } = useQuery<DiscipleshipAttendance[]>({
    queryKey: ['discipleship-attendance'],
    queryFn: () =>
      api
        .get('/church/discipleship/attendance')
        .then((response) => response.data),
  });

  const { data: memberAttendance = [], isLoading: memberAttendanceLoading } =
    useQuery<DiscipleshipAttendance[]>({
      queryKey: ['discipleship-member-attendance', detailMemberId],
      enabled: Boolean(detailMemberId),
      queryFn: () =>
        api
          .get(`/church/discipleship/attendance?memberId=${detailMemberId}`)
          .then((response) => response.data),
    });

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId),
    [members, selectedMemberId],
  );
  const detailMember = useMemo(
    () => members.find((member) => member.id === detailMemberId),
    [detailMemberId, members],
  );

  const refreshDiscipleship = () => {
    queryClient.invalidateQueries({ queryKey: ['discipleship-summary'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-groups'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-attendance'] });
  };

  const memberMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...memberForm,
        groupIds: memberForm.groupIds,
      };
      if (memberEditor) {
        return api
          .patch(`/church/discipleship/members/${memberEditor.id}`, payload)
          .then((response) => response.data);
      }
      return api
        .post('/church/discipleship/members', payload)
        .then((response) => response.data);
    },
    onSuccess: () => {
      toast.success(memberEditor ? 'Member updated' : 'Member created');
      setIsMemberModalOpen(false);
      setMemberEditor(null);
      setMemberForm(createMemberForm());
      refreshDiscipleship();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save member');
    },
  });

  const groupMutation = useMutation({
    mutationFn: async () => {
      if (groupEditor) {
        return api
          .patch(`/church/discipleship/groups/${groupEditor.id}`, groupForm)
          .then((response) => response.data);
      }
      return api
        .post('/church/discipleship/groups', groupForm)
        .then((response) => response.data);
    },
    onSuccess: () => {
      toast.success(groupEditor ? 'Group updated' : 'Group created');
      setIsGroupModalOpen(false);
      setGroupEditor(null);
      setGroupForm(createGroupForm());
      refreshDiscipleship();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to save group');
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async () =>
      api
        .post('/church/discipleship/attendance/mark', {
          memberId: selectedMemberId,
          ...attendanceForm,
        })
        .then((response) => response.data),
    onSuccess: () => {
      toast.success('Attendance marked');
      setAttendanceForm((current) => ({
        ...current,
        eventName: '',
      }));
      refreshDiscipleship();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to mark attendance',
      );
    },
  });

  const openMemberEditor = (member?: DiscipleshipMember) => {
    setIsMemberModalOpen(true);
    setMemberEditor(member || null);
    setMemberForm(
      member
        ? {
            fullName: member.fullName || '',
            phone: member.phone || '',
            email: member.email || '',
            gender: member.gender || '',
            enrollmentDate: member.enrollmentDate || getNairobiToday(),
            status: member.status || 'active',
            notes: member.notes || '',
            groupIds:
              member.groupIds || member.groups?.map((group) => group.id) || [],
          }
        : createMemberForm(),
    );
  };

  const openGroupEditor = (group?: DiscipleshipGroup) => {
    setIsGroupModalOpen(true);
    setGroupEditor(group || null);
    setGroupForm(
      group
        ? {
            name: group.name || '',
            description: group.description || '',
            isActive: group.isActive !== false,
          }
        : createGroupForm(),
    );
  };

  const toggleMemberGroup = (groupId: string) => {
    setMemberForm((current) => {
      const next = new Set(current.groupIds);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return { ...current, groupIds: [...next] };
    });
  };

  const submitMember = (event: FormEvent) => {
    event.preventDefault();
    memberMutation.mutate();
  };

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    groupMutation.mutate();
  };

  const statCards = [
    ['Members', summary?.totals?.totalMembers ?? 0],
    ['Active', summary?.totals?.activeMembers ?? 0],
    ['Groups', summary?.totals?.activeGroups ?? 0],
    ['Present today', summary?.totals?.presentToday ?? 0],
  ];
  const activeGroups = groups.filter((group) => group.isActive !== false);
  const attendanceTypeValue =
    attendanceForm.attendanceType === 'group' && attendanceForm.groupId
      ? `group:${attendanceForm.groupId}`
      : 'service';
  const attendanceTypeLabel =
    attendanceForm.attendanceType === 'group'
      ? activeGroups.find((group) => group.id === attendanceForm.groupId)
          ?.name || 'Select attendance type'
      : 'Service';
  const memberAttendanceSummary = useMemo(() => {
    const serviceCount = memberAttendance.filter(
      (item) => item.attendanceType === 'service',
    ).length;
    const groupCount = memberAttendance.length - serviceCount;
    return {
      total: memberAttendance.length,
      serviceCount,
      groupCount,
      lastAttended: memberAttendance[0]?.attendanceDate || 'No attendance yet',
    };
  }, [memberAttendance]);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </section>

      <section className="panel p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {discipleshipTabs.map(({ value, label, icon: TabIcon }) => {
            return (
              <button
                key={value}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  activeTab === value
                    ? 'bg-amber-200 text-stone-950'
                    : 'border border-white/10 text-stone-200 hover:bg-white/5'
                }`}
                type="button"
                onClick={() => setActiveTab(value)}
              >
                <span className="flex items-center justify-center gap-2">
                  <TabIcon size={17} />
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeTab === 'attendance' && (
        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="panel p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Search and mark
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Mark member present
                </h3>
              </div>
              <button
                className="btn-primary justify-center"
                type="button"
                onClick={() => openMemberEditor()}
              >
                <Plus size={17} />
                Add member
              </button>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
              <div className="space-y-3">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Member search
                  </span>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"
                      size={17}
                    />
                    <input
                      className="input"
                      style={{ paddingLeft: '2.75rem' }}
                      placeholder="Search by name, phone, or email"
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                    />
                  </div>
                </label>

                <div className="max-h-[410px] space-y-2 overflow-y-auto pr-1">
                  {membersLoading ? (
                    <p className="rounded-2xl border border-white/10 p-4 text-sm text-stone-300">
                      Loading members...
                    </p>
                  ) : members.length === 0 ? (
                    <p className="rounded-2xl border border-white/10 p-4 text-sm text-stone-300">
                      No members found.
                    </p>
                  ) : (
                    members.slice(0, 12).map((member) => (
                      <button
                        key={member.id}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selectedMemberId === member.id
                            ? 'border-amber-200 bg-amber-200/15'
                            : 'border-white/10 bg-black/10 hover:bg-white/5'
                        }`}
                        type="button"
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        <span className="block font-semibold text-white">
                          {member.fullName}
                        </span>
                        <span className="mt-1 block text-xs text-stone-400">
                          {(member.groups || [])
                            .map((group) => group.name)
                            .join(', ') || 'No group assigned'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Selected member
                    </p>
                    <h4 className="mt-2 text-lg font-semibold text-white">
                      {selectedMember?.fullName || 'Choose a member'}
                    </h4>
                  </div>
                  {selectedMember && (
                    <button
                      className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                      type="button"
                      onClick={() => openMemberEditor(selectedMember)}
                      title="Edit member"
                    >
                      <PencilLine size={16} />
                    </button>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Attendance date
                    </span>
                    <input
                      className="input"
                      type="date"
                      value={attendanceForm.attendanceDate}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          attendanceDate: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <div className="relative space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Attendance type
                    </span>
                    <button
                      aria-expanded={isAttendanceTypeOpen}
                      className="input flex items-center justify-between gap-3 text-left"
                      type="button"
                      onClick={() =>
                        setIsAttendanceTypeOpen((current) => !current)
                      }
                    >
                      <span>{attendanceTypeLabel}</span>
                      <ChevronDown
                        className={`shrink-0 transition ${
                          isAttendanceTypeOpen ? 'rotate-180' : ''
                        }`}
                        size={17}
                      />
                    </button>
                    {isAttendanceTypeOpen ? (
                      <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-white/10 bg-stone-950 p-2 shadow-2xl">
                        {[
                          { value: 'service', label: 'Service' },
                          ...activeGroups.map((group) => ({
                            value: `group:${group.id}`,
                            label: group.name,
                          })),
                        ].map((option) => (
                          <button
                            key={option.value}
                            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                              attendanceTypeValue === option.value
                                ? 'bg-amber-200 text-stone-950'
                                : 'text-stone-200 hover:bg-white/10'
                            }`}
                            type="button"
                            onClick={() => {
                              const value = option.value;
                              setIsAttendanceTypeOpen(false);
                              if (value === 'service') {
                                setAttendanceForm((current) => ({
                                  ...current,
                                  attendanceType: 'service',
                                  groupId: '',
                                  eventName: '',
                                }));
                                return;
                              }

                              setAttendanceForm((current) => ({
                                ...current,
                                attendanceType: 'group',
                                groupId: value.replace('group:', ''),
                              }));
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {attendanceForm.attendanceType === 'group' && (
                    <label className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Event name
                      </span>
                      <input
                        className="input"
                        placeholder="Men's seminar, choir practice..."
                        value={attendanceForm.eventName}
                        onChange={(event) =>
                          setAttendanceForm((current) => ({
                            ...current,
                            eventName: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}

                  <button
                    className="btn-primary w-full justify-center"
                    type="button"
                    disabled={!selectedMemberId || attendanceMutation.isPending}
                    onClick={() => attendanceMutation.mutate()}
                  >
                    <CheckCircle2 size={17} />
                    Mark present
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Recent attendance
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Latest marks
            </h3>
            <div className="mt-5 space-y-3">
              {attendance.length === 0 ? (
                <p className="rounded-2xl border border-white/10 p-4 text-sm text-stone-300">
                  No attendance has been recorded yet.
                </p>
              ) : (
                attendance.slice(0, 12).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-white">
                          {item.member?.fullName || 'Member'}
                        </h4>
                        <p className="mt-1 text-xs text-stone-400">
                          {item.weekday}, {item.attendanceDate}
                        </p>
                      </div>
                      <span className="rounded-full border border-amber-200/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                        {item.attendanceType}
                      </span>
                    </div>
                    {(item.group || item.eventName) && (
                      <p className="mt-3 text-sm text-stone-300">
                        {[item.group?.name, item.eventName]
                          .filter(Boolean)
                          .join(' - ')}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'members' && (
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Member records
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Discipleship members
              </h3>
            </div>
            <button
              className="btn-primary justify-center"
              type="button"
              onClick={() => openMemberEditor()}
            >
              <Plus size={17} />
              Add member
            </button>
          </div>

          <div className="grid gap-3 border-b border-white/10 p-4 md:grid-cols-3">
            <input
              className="input-compact"
              placeholder="Search members"
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
            />
            <select
              className="input-compact"
              value={memberGroupFilter}
              onChange={(event) => setMemberGroupFilter(event.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <select
              className="input-compact"
              value={memberStatus}
              onChange={(event) => setMemberStatus(event.target.value)}
            >
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="divide-y divide-white/10">
            {members.length === 0 ? (
              <p className="p-6 text-sm text-stone-300">No members found.</p>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="grid cursor-pointer gap-4 p-5 transition hover:bg-white/5 md:grid-cols-[1fr_0.8fr_auto] md:items-center"
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailMemberId(member.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setDetailMemberId(member.id);
                    }
                  }}
                >
                  <div>
                    <h4 className="font-semibold text-white">
                      {member.fullName}
                    </h4>
                    <p className="mt-1 text-xs text-stone-400">
                      Enrolled {member.enrollmentDate || 'not set'} ·{' '}
                      {member.status}
                    </p>
                  </div>
                  <p className="text-sm text-stone-300">
                    {(member.groups || [])
                      .map((group) => group.name)
                      .join(', ') || 'No group assigned'}
                  </p>
                  <button
                    className="rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openMemberEditor(member);
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {activeTab === 'groups' && (
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Church groups
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Group setup
              </h3>
            </div>
            <button
              className="btn-primary justify-center"
              type="button"
              onClick={() => openGroupEditor()}
            >
              <Plus size={17} />
              Add group
            </button>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {groups.length === 0 ? (
              <p className="text-sm text-stone-300">No groups created yet.</p>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-3xl border border-white/10 bg-black/10 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-white">{group.name}</h4>
                      <p className="mt-1 text-xs text-stone-400">
                        {group.memberCount || 0} members ·{' '}
                        {group.isActive ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                      type="button"
                      onClick={() => openGroupEditor(group)}
                      title="Edit group"
                    >
                      <PencilLine size={16} />
                    </button>
                  </div>
                  {group.description && (
                    <p className="mt-4 text-sm leading-6 text-stone-300">
                      {group.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {isMemberModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setIsMemberModalOpen(false);
            setMemberEditor(null);
            setMemberForm(createMemberForm());
          }}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-4xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  {memberEditor ? 'Edit member' : 'New member'}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Member details
                </h3>
              </div>
              <button
                className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                type="button"
                onClick={() => {
                  setIsMemberModalOpen(false);
                  setMemberEditor(null);
                  setMemberForm(createMemberForm());
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={submitMember}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Full name
                  </span>
                  <input
                    className="input"
                    required
                    value={memberForm.fullName}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        fullName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Enrollment date
                  </span>
                  <input
                    className="input"
                    type="date"
                    value={memberForm.enrollmentDate}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        enrollmentDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Phone
                  </span>
                  <input
                    className="input"
                    value={memberForm.phone}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Email
                  </span>
                  <input
                    className="input"
                    type="email"
                    value={memberForm.email}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Gender
                  </span>
                  <input
                    className="input"
                    value={memberForm.gender}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        gender: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Status
                  </span>
                  <select
                    className="input"
                    value={memberForm.status}
                    onChange={(event) =>
                      setMemberForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                  Groups
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groups.length === 0 ? (
                    <p className="text-sm text-stone-300">
                      Create groups first, then assign members here.
                    </p>
                  ) : (
                    groups.map((group) => (
                      <label
                        key={group.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-stone-200"
                      >
                        <input
                          checked={memberForm.groupIds.includes(group.id)}
                          type="checkbox"
                          onChange={() => toggleMemberGroup(group.id)}
                        />
                        {group.name}
                      </label>
                    ))
                  )}
                </div>
              </div>

              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                  Notes
                </span>
                <textarea
                  className="input min-h-28"
                  value={memberForm.notes}
                  onChange={(event) =>
                    setMemberForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              <button
                className="btn-primary w-full justify-center"
                disabled={memberMutation.isPending}
                type="submit"
              >
                Save member
              </button>
            </form>
            </section>
          </div>
        </div>
      ) : null}

      {detailMemberId ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setDetailMemberId('')}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-4xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Member profile
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {detailMember?.fullName || 'Member details'}
                  </h3>
                  <p className="mt-2 text-sm text-stone-300">
                    Enrolled {detailMember?.enrollmentDate || 'not set'} ·{' '}
                    {detailMember?.status || 'active'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {detailMember ? (
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setDetailMemberId('');
                        openMemberEditor(detailMember);
                      }}
                    >
                      <PencilLine size={16} />
                      Edit member
                    </button>
                  ) : null}
                  <button
                    className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                    type="button"
                    onClick={() => setDetailMemberId('')}
                    title="Close member details"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['Attendance marks', memberAttendanceSummary.total],
                  ['Services', memberAttendanceSummary.serviceCount],
                  ['Group events', memberAttendanceSummary.groupCount],
                  ['Last attended', memberAttendanceSummary.lastAttended],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                  >
                    <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">
                      {label}
                    </p>
                    <p className="mt-2 font-semibold text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Member information
                  </p>
                  <dl className="mt-4 space-y-4 text-sm">
                    {[
                      ['Phone', detailMember?.phone || 'Not set'],
                      ['Email', detailMember?.email || 'Not set'],
                      ['Gender', detailMember?.gender || 'Not set'],
                      [
                        'Groups',
                        (detailMember?.groups || [])
                          .map((group) => group.name)
                          .join(', ') || 'No groups assigned',
                      ],
                      ['Notes', detailMember?.notes || 'No notes'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs uppercase tracking-[0.18em] text-stone-400">
                          {label}
                        </dt>
                        <dd className="mt-1 text-stone-100">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Attendance history
                  </p>
                  <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                    {memberAttendanceLoading ? (
                      <p className="text-sm text-stone-300">
                        Loading attendance...
                      </p>
                    ) : memberAttendance.length === 0 ? (
                      <p className="text-sm text-stone-300">
                        No attendance has been recorded for this member.
                      </p>
                    ) : (
                      memberAttendance.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {item.attendanceType === 'service'
                                  ? item.eventName || 'Church service'
                                  : item.eventName ||
                                    item.group?.name ||
                                    'Group attendance'}
                              </p>
                              <p className="mt-1 text-xs text-stone-400">
                                {item.weekday}, {item.attendanceDate}
                              </p>
                            </div>
                            <span className="rounded-full border border-amber-200/30 px-3 py-1 text-xs font-semibold text-amber-100">
                              {item.attendanceType === 'group'
                                ? item.group?.name || 'Group'
                                : 'Service'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {isGroupModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setIsGroupModalOpen(false);
            setGroupEditor(null);
            setGroupForm(createGroupForm());
          }}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-2xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    {groupEditor ? 'Edit group' : 'New group'}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Group details
                  </h3>
                </div>
                <button
                  className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                  type="button"
                  onClick={() => {
                    setIsGroupModalOpen(false);
                    setGroupEditor(null);
                    setGroupForm(createGroupForm());
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form className="mt-6 space-y-5" onSubmit={submitGroup}>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Group name
                  </span>
                  <input
                    className="input"
                    required
                    value={groupForm.name}
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                    Description
                  </span>
                  <textarea
                    className="input min-h-28"
                    value={groupForm.description}
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 p-4 text-sm font-semibold text-stone-200">
                  <input
                    checked={groupForm.isActive}
                    type="checkbox"
                    onChange={(event) =>
                      setGroupForm((current) => ({
                        ...current,
                        isActive: event.target.checked,
                      }))
                    }
                  />
                  Active group
                </label>

                <button
                  className="btn-primary w-full justify-center"
                  disabled={groupMutation.isPending}
                  type="submit"
                >
                  Save group
                </button>
              </form>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
