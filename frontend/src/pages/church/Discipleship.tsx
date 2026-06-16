import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  GitMerge,
  PencilLine,
  Plus,
  Search,
  Upload,
  UserCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
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
  isFirstTimeAtChurch?: boolean | null;
  hasChurchRole?: boolean | null;
  churchRoleNotes?: string | null;
  status: 'active' | 'inactive';
  notes?: string | null;
  groups?: DiscipleshipGroup[];
  groupIds?: string[];
  aliases?: {
    id: string;
    alias: string;
    source: string;
  }[];
  linkedContributorCount?: number;
  pendingMatchCount?: number;
  contributionSummary?: {
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
      paymentReference?: string | null;
      channel?: string | null;
    }[];
  };
}

interface DiscipleshipMatchCandidate {
  id: string;
  observedName: string;
  matchReason: string;
  matchScore: number;
  contributor?: {
    id: string;
    name: string;
    phone?: string | null;
  };
  candidateMember?: DiscipleshipMember;
}

interface DiscipleshipDuplicateCluster {
  id: string;
  clusterKey: string;
  score: number;
  reasons: string[];
  recommendedCanonicalId?: string | null;
  members: (DiscipleshipMember & {
    isManual?: boolean;
    attendanceCount?: number;
  })[];
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

interface BatchImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  assignedGroups: number;
  warnings: number;
  errors: number;
  issues?: {
    row: number;
    member?: string;
    severity: 'warning' | 'error';
    message: string;
  }[];
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

function formatKes(value: unknown) {
  return `KES ${Number(value || 0).toLocaleString()}`;
}

function formatYesNo(value: boolean | null | undefined) {
  if (value === true) {
    return 'Yes';
  }
  if (value === false) {
    return 'No';
  }
  return 'Not set';
}

function createMemberForm() {
  return {
    fullName: '',
    phone: '',
    gender: '',
    enrollmentDate: '',
    isFirstTimeAtChurch: null as boolean | null,
    hasChurchGroups: null as boolean | null,
    hasChurchRole: null as boolean | null,
    churchRoleNotes: '',
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
  const [memberGroupFilter, setMemberGroupFilter] = useState('');
  const [recentAttendanceSearch, setRecentAttendanceSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [isAttendanceTypeOpen, setIsAttendanceTypeOpen] = useState(false);
  const [attendanceForm, setAttendanceForm] = useState<{
    attendanceDate: string;
    groupId: string;
    eventName: string;
  }>({
    attendanceDate: getNairobiToday(),
    groupId: '',
    eventName: '',
  });
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [memberRegistrationStep, setMemberRegistrationStep] = useState(1);
  const [detailMemberId, setDetailMemberId] = useState('');
  const [memberEditor, setMemberEditor] = useState<DiscipleshipMember | null>(
    null,
  );
  const [memberForm, setMemberForm] = useState(createMemberForm);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupEditor, setGroupEditor] = useState<DiscipleshipGroup | null>(null);
  const [groupForm, setGroupForm] = useState(createGroupForm);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchSummary, setBatchSummary] = useState<BatchImportSummary | null>(
    null,
  );
  const [duplicateReviewClusterId, setDuplicateReviewClusterId] = useState('');
  const [selectedDuplicateMemberIds, setSelectedDuplicateMemberIds] = useState<
    string[]
  >([]);

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
    groupId: memberGroupFilter,
  });
  const { data: members = [], isLoading: membersLoading } = useQuery<
    DiscipleshipMember[]
  >({
    queryKey: [
      'discipleship-members',
      memberSearch.trim(),
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

  const { data: matchCandidates = [] } = useQuery<
    DiscipleshipMatchCandidate[]
  >({
    queryKey: ['discipleship-matches'],
    queryFn: () =>
      api
        .get('/church/discipleship/matches')
        .then((response) => response.data),
  });
  const { data: duplicateClusters = [] } = useQuery<
    DiscipleshipDuplicateCluster[]
  >({
    queryKey: ['discipleship-duplicate-members'],
    queryFn: () =>
      api
        .get('/church/discipleship/duplicate-members')
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

  const { data: detailMember } = useQuery<DiscipleshipMember>({
    queryKey: ['discipleship-member-detail', detailMemberId],
    enabled: Boolean(detailMemberId),
    queryFn: () =>
      api
        .get(`/church/discipleship/members/${detailMemberId}`)
        .then((response) => response.data),
  });

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId),
    [members, selectedMemberId],
  );
  const panelMember = selectedMember || members[0] || null;
  const panelMemberAttendance = useMemo(() => {
    if (!panelMember) {
      return [];
    }
    return attendance.filter((item) => item.member?.id === panelMember.id);
  }, [attendance, panelMember]);
  const duplicateReviewCluster = useMemo(
    () =>
      duplicateClusters.find(
        (cluster) => cluster.id === duplicateReviewClusterId,
      ) || null,
    [duplicateClusters, duplicateReviewClusterId],
  );

  const refreshDiscipleship = () => {
    queryClient.invalidateQueries({ queryKey: ['discipleship-summary'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-groups'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-attendance'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-matches'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-duplicate-members'],
    });
    queryClient.invalidateQueries({ queryKey: ['discipleship-member-detail'] });
  };

  const memberMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: memberForm.fullName,
        phone: memberForm.phone,
        gender: memberForm.gender,
        enrollmentDate: memberForm.isFirstTimeAtChurch
          ? memberForm.enrollmentDate || getNairobiToday()
          : memberEditor?.enrollmentDate || null,
        isFirstTimeAtChurch: memberForm.isFirstTimeAtChurch,
        hasChurchRole: memberForm.hasChurchRole,
        churchRoleNotes: memberForm.hasChurchRole
          ? memberForm.churchRoleNotes
          : '',
        notes: memberForm.notes,
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
      setMemberRegistrationStep(1);
      refreshDiscipleship();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message || 'Unable to save member';
      if (error?.response?.status === 409) {
        toast(message, { icon: '!' });
        return;
      }
      toast.error(message);
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

  const batchImportMutation = useMutation({
    mutationFn: async () => {
      if (!batchFile) {
        throw new Error('Choose a completed template file');
      }
      const formData = new FormData();
      formData.append('file', batchFile);
      const response = await api.post(
        '/church/discipleship/members/import',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      return response.data as BatchImportSummary;
    },
    onSuccess: (data) => {
      setBatchSummary(data);
      setBatchFile(null);
      setActiveTab('members');
      refreshDiscipleship();
      toast.success(`Registered ${Number(data.created || 0)} member(s)`);
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          error?.message ||
          'Unable to import members',
      );
    },
  });

  const statementImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api
        .post('/church/discipleship/reconciliation/mpesa-statement', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then((response) => response.data);
    },
    onSuccess: (data) => {
      refreshDiscipleship();
      toast.success(
        `Matched ${Number(data.matched || 0)} statement row(s); updated ${Number(data.updated || 0)} name(s)`,
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to reconcile statement',
      );
    },
  });

  const matchReviewMutation = useMutation({
    mutationFn: ({
      candidateId,
      action,
    }: {
      candidateId: string;
      action: 'confirm' | 'dismiss';
    }) =>
      api
        .post(`/church/discipleship/matches/${candidateId}/review`, { action })
        .then((response) => response.data),
    onSuccess: (_data, variables) => {
      refreshDiscipleship();
      toast.success(
        variables.action === 'confirm'
          ? 'Member identities linked'
          : 'Potential match dismissed',
      );
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to review match');
    },
  });

  const duplicateReviewMutation = useMutation({
    mutationFn: ({
      action,
      memberIds,
      canonicalMemberId,
    }: {
      action: 'merge' | 'skip';
      memberIds: string[];
      canonicalMemberId?: string | null;
    }) =>
      api
        .post('/church/discipleship/duplicate-members/review', {
          action,
          memberIds,
          canonicalMemberId,
        })
        .then((response) => response.data),
    onSuccess: (_data, variables) => {
      refreshDiscipleship();
      setDuplicateReviewClusterId('');
      setSelectedDuplicateMemberIds([]);
      toast.success(
        variables.action === 'merge'
          ? 'Duplicate disciple records merged'
          : 'Duplicate suggestion skipped',
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to review duplicate records',
      );
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async () =>
      api
        .post('/church/discipleship/attendance/mark', {
          memberId: selectedMemberId,
          attendanceType: 'group',
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
    setMemberRegistrationStep(1);
    setMemberEditor(member || null);
    setMemberForm(
      member
        ? {
            fullName: member.fullName || '',
            phone: member.phone || '',
            gender: member.gender || '',
            enrollmentDate: member.enrollmentDate || '',
            isFirstTimeAtChurch: member.isFirstTimeAtChurch ?? null,
            hasChurchGroups: (member.groupIds || member.groups || []).length > 0,
            hasChurchRole: member.hasChurchRole ?? null,
            churchRoleNotes: member.churchRoleNotes || '',
            notes: member.notes || '',
            groupIds:
              member.groupIds || member.groups?.map((group) => group.id) || [],
          }
        : createMemberForm(),
    );
  };

  const openDuplicateReview = (cluster: DiscipleshipDuplicateCluster) => {
    setDuplicateReviewClusterId(cluster.id);
    setSelectedDuplicateMemberIds(cluster.members.map((member) => member.id));
    setActiveTab('members');
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
    if (memberRegistrationStep < 4) {
      setMemberRegistrationStep((current) => current + 1);
      return;
    }
    memberMutation.mutate();
  };

  const submitGroup = (event: FormEvent) => {
    event.preventDefault();
    groupMutation.mutate();
  };

  const closeBatchModal = () => {
    setIsBatchModalOpen(false);
    setBatchFile(null);
    setBatchSummary(null);
  };

  const downloadMemberTemplate = async () => {
    try {
      const response = await api.get(
        '/church/discipleship/members/import-template',
        {
          responseType: 'blob',
        },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'discipleship-member-template.xlsx';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || 'Unable to download template',
      );
    }
  };

  const statCards = [
    ['Members', summary?.totals?.totalMembers ?? 0],
    ['Active', summary?.totals?.activeMembers ?? 0],
    ['Groups', summary?.totals?.activeGroups ?? 0],
    ['Present today', summary?.totals?.presentToday ?? 0],
  ];
  const activeGroups = groups.filter((group) => group.isActive !== false);
  const attendanceTypeLabel =
    activeGroups.find((group) => group.id === attendanceForm.groupId)?.name ||
    'Select attendance group';

  useEffect(() => {
    if (
      activeGroups.length > 0 &&
      !activeGroups.some((group) => group.id === attendanceForm.groupId)
    ) {
      setAttendanceForm((current) => ({
        ...current,
        groupId: activeGroups[0].id,
      }));
    }
  }, [activeGroups, attendanceForm.groupId]);
  const memberAttendanceSummary = useMemo(() => {
    const groupEvents = memberAttendance.filter(
      (item) => item.attendanceType === 'group',
    );
    return {
      total: memberAttendance.length,
      groupCount: groupEvents.length,
      groupsAttended: new Set(
        groupEvents.map((item) => item.group?.id).filter(Boolean),
      ).size,
      lastAttended: memberAttendance[0]?.attendanceDate || 'No attendance yet',
    };
  }, [memberAttendance]);
  const recentAttendance = useMemo(() => {
    const search = recentAttendanceSearch.trim().toLowerCase();
    if (!search) {
      return attendance;
    }
    return attendance.filter((item) =>
      `${item.member?.fullName || ''} ${item.group?.name || ''} ${item.eventName || ''}`
        .toLowerCase()
        .includes(search),
    );
  }, [attendance, recentAttendanceSearch]);
  const selectedDuplicateMembers = useMemo(() => {
    if (!duplicateReviewCluster) {
      return [];
    }
    return duplicateReviewCluster.members.filter((member) =>
      selectedDuplicateMemberIds.includes(member.id),
    );
  }, [duplicateReviewCluster, selectedDuplicateMemberIds]);
  const duplicateCanonicalId =
    selectedDuplicateMembers.find((member) => member.isManual)?.id ||
    selectedDuplicateMembers[0]?.id ||
    null;

  return (
    <div className="space-y-4 discipleship-page">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div key={label} className="panel p-4 discipleship-stat-card">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
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

      {duplicateClusters.length > 0 ? (
        <section className="rounded-3xl border border-amber-200/30 bg-amber-200/10 p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-200/15 text-amber-100">
                <AlertTriangle size={19} />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-amber-100">
                  Duplicate records found
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">
                  {duplicateClusters.length} possible duplicate group
                  {duplicateClusters.length === 1 ? '' : 's'} need review
                </h3>
                <p className="mt-1 text-sm text-stone-300">
                  {duplicateClusters[0].members
                    .map((member) => member.fullName)
                    .slice(0, 4)
                    .join(', ')}
                  {duplicateClusters[0].members.length > 4 ? ', ...' : ''}
                </p>
              </div>
            </div>
            <button
              className="btn-primary justify-center"
              type="button"
              onClick={() => openDuplicateReview(duplicateClusters[0])}
            >
              <GitMerge size={17} />
              Review details
            </button>
          </div>
        </section>
      ) : null}

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
                      placeholder="Search by name or phone"
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
                      Attendance group
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
                        {activeGroups.length === 0 ? (
                          <p className="px-3 py-2.5 text-sm text-stone-400">
                            Create an active group before marking attendance.
                          </p>
                        ) : activeGroups.map((group) => (
                          <button
                            key={group.id}
                            className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition ${
                              attendanceForm.groupId === group.id
                                ? 'bg-amber-200 text-stone-950'
                                : 'text-stone-200 hover:bg-white/10'
                            }`}
                            type="button"
                            onClick={() => {
                              setIsAttendanceTypeOpen(false);
                              setAttendanceForm((current) => ({
                                ...current,
                                groupId: group.id,
                              }));
                            }}
                          >
                            {group.name}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Event name
                    </span>
                    <input
                      className="input"
                      placeholder="Optional: Sunday service, choir practice..."
                      value={attendanceForm.eventName}
                      onChange={(event) =>
                        setAttendanceForm((current) => ({
                          ...current,
                          eventName: event.target.value,
                        }))
                      }
                    />
                  </label>

                  <button
                    className="btn-primary w-full justify-center"
                    type="button"
                    disabled={
                      !selectedMemberId ||
                      !attendanceForm.groupId ||
                      attendanceMutation.isPending
                    }
                    onClick={() => attendanceMutation.mutate()}
                  >
                    <CheckCircle2 size={17} />
                    Mark present
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="panel p-5 sm:p-6 discipleship-detail-panel">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Member details
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              {panelMember?.fullName || 'Select a member'}
            </h3>
            {panelMember ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                        Phone
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {panelMember.phone || 'Not captured'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                        Gender
                      </p>
                      <p className="mt-1 text-sm font-semibold capitalize text-white">
                        {panelMember.gender || 'Not set'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-stone-300">
                    {(panelMember.groups || []).map((group) => group.name).join(', ') ||
                      'No group assigned'}
                  </p>
                  <button
                    className="btn-secondary mt-4 justify-center"
                    type="button"
                    onClick={() => setDetailMemberId(panelMember.id)}
                  >
                    Open full details
                  </button>
                </div>
                {panelMember.contributionSummary ? (
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                      Linked contributions
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">
                      KES {Number(panelMember.contributionSummary.totalAmount || 0).toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-stone-400">
                      {panelMember.contributionSummary.contributionCount} contribution(s)
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                  Attendance history
                </p>
                <h4 className="mt-1 font-semibold text-white">Latest marks</h4>
              </div>
              <button
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={() => setRecentAttendanceSearch('')}
              >
                Clear
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {(panelMember ? panelMemberAttendance : recentAttendance).length === 0 ? (
                <p className="rounded-2xl border border-white/10 p-4 text-sm text-stone-300">
                  No attendance has been recorded for this member yet.
                </p>
              ) : (
                (panelMember ? panelMemberAttendance : recentAttendance).slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    className="w-full rounded-2xl border border-white/10 bg-black/10 p-4 text-left transition hover:bg-white/5"
                    type="button"
                    onClick={() => {
                      if (item.member?.id) {
                        setDetailMemberId(item.member.id);
                      }
                    }}
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
                        {item.group?.name || item.attendanceType}
                      </span>
                    </div>
                    {(item.group || item.eventName) && (
                      <p className="mt-3 text-sm text-stone-300">
                        {[item.group?.name, item.eventName]
                          .filter(Boolean)
                          .join(' - ')}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'members' && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Member records
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Discipleship members
              </h3>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="btn-secondary cursor-pointer justify-center">
                <Upload size={17} />
                {statementImportMutation.isPending
                  ? 'Reconciling...'
                  : 'Reconcile M-Pesa names'}
                <input
                  accept=".xlsx,.csv"
                  className="hidden"
                  disabled={statementImportMutation.isPending}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      statementImportMutation.mutate(file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() => {
                  setBatchSummary(null);
                  setBatchFile(null);
                  setIsBatchModalOpen(true);
                }}
              >
                <FileSpreadsheet size={17} />
                Batch register
              </button>
              <button
                className="btn-primary justify-center"
                type="button"
                onClick={() => openMemberEditor()}
              >
                <Plus size={17} />
                Add member
              </button>
            </div>
          </div>

          {matchCandidates.length > 0 ? (
            <div className="border-b border-white/10 bg-amber-200/5 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-amber-100">
                    Potential matches
                  </p>
                  <h4 className="mt-1 font-semibold text-white">
                    Confirm people whose transaction names look related
                  </h4>
                  <p className="mt-1 text-sm text-stone-300">
                    These were not merged automatically because the match needs
                    a person to confirm it.
                  </p>
                </div>
                <span className="rounded-full border border-amber-200/30 px-3 py-1 text-sm font-semibold text-amber-100">
                  {matchCandidates.length} pending
                </span>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {matchCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="rounded-2xl border border-white/10 bg-black/10 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                          Transaction name
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {candidate.observedName ||
                            candidate.contributor?.name ||
                            'Unknown payer'}
                        </p>
                      </div>
                      <span className="text-center text-amber-100">→</span>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                          Existing disciple
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {candidate.candidateMember?.fullName || 'Member'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-stone-400">
                      {candidate.matchReason}
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <button
                        className="btn-secondary justify-center"
                        disabled={matchReviewMutation.isPending}
                        type="button"
                        onClick={() =>
                          matchReviewMutation.mutate({
                            candidateId: candidate.id,
                            action: 'dismiss',
                          })
                        }
                      >
                        Keep separate
                      </button>
                      <button
                        className="btn-primary justify-center"
                        disabled={matchReviewMutation.isPending}
                        type="button"
                        onClick={() =>
                          matchReviewMutation.mutate({
                            candidateId: candidate.id,
                            action: 'confirm',
                          })
                        }
                      >
                        <CheckCircle2 size={17} />
                        Confirm match
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 border-b border-white/10 p-3 md:grid-cols-2">
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
          </div>

          <div className="divide-y divide-white/10">
            {members.length === 0 ? (
              <p className="p-4 text-sm text-stone-300">No members found.</p>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className={`grid cursor-pointer gap-3 p-3 transition hover:bg-white/5 md:grid-cols-[1fr_0.8fr_auto] md:items-center ${
                    panelMember?.id === member.id ? 'bg-amber-200/10' : ''
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMemberId(member.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setSelectedMemberId(member.id);
                    }
                  }}
                >
                  <div>
                    <h4 className="font-semibold text-white">
                      {member.fullName}
                    </h4>
                    <p className="mt-1 text-xs text-stone-400">
                      Enrolled {member.enrollmentDate || 'not set'}
                    </p>
                    {(member.aliases || []).filter(
                      (alias) =>
                        alias.source !== 'manual' &&
                        alias.alias.toLowerCase() !==
                          member.fullName.toLowerCase(),
                    ).length > 0 ? (
                      <p className="mt-1 text-xs text-amber-100/80">
                        Also known as{' '}
                        {(member.aliases || [])
                          .filter(
                            (alias) =>
                              alias.source !== 'manual' &&
                              alias.alias.toLowerCase() !==
                                member.fullName.toLowerCase(),
                          )
                          .map((alias) => alias.alias)
                          .join(', ')}
                      </p>
                    ) : null}
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
        </div>

        <aside className="space-y-4">
          <section className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Selected disciple
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {panelMember?.fullName || 'Choose a member'}
                </h3>
              </div>
              {panelMember ? (
                <button
                  className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                  type="button"
                  title="Edit member"
                  onClick={() => openMemberEditor(panelMember)}
                >
                  <PencilLine size={16} />
                </button>
              ) : null}
            </div>
            {panelMember ? (
              <div className="mt-4 space-y-3 text-sm text-stone-300">
                <p>
                  <span className="text-stone-400">Phone:</span>{' '}
                  {panelMember.phone || 'Not captured'}
                </p>
                <p>
                  <span className="text-stone-400">Gender:</span>{' '}
                  {panelMember.gender || 'Not set'}
                </p>
                <p>
                  <span className="text-stone-400">Groups:</span>{' '}
                  {(panelMember.groups || []).map((group) => group.name).join(', ') ||
                    'No group assigned'}
                </p>
                <p>
                  <span className="text-stone-400">Last attendance:</span>{' '}
                  {panelMemberAttendance[0]?.attendanceDate || 'No attendance yet'}
                </p>
                {panelMember.contributionSummary ? (
                  <p>
                    <span className="text-stone-400">Linked giving:</span> KES{' '}
                    {Number(
                      panelMember.contributionSummary.totalAmount || 0,
                    ).toLocaleString()}
                  </p>
                ) : null}
                <button
                  className="btn-secondary mt-2 w-full justify-center"
                  type="button"
                  onClick={() => setDetailMemberId(panelMember.id)}
                >
                  View details
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-stone-300">
                Select a member from the list to see biodata and attendance.
              </p>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Groups
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Member categories
                </h3>
              </div>
              <button
                className="btn-primary px-3 py-2"
                type="button"
                onClick={() => openGroupEditor()}
              >
                <Plus size={16} />
                Add
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {groups.slice(0, 8).map((group) => (
                <button
                  key={group.id}
                  className="w-full rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-left transition hover:bg-white/5"
                  type="button"
                  onClick={() => openGroupEditor(group)}
                >
                  <span className="block font-semibold text-white">
                    {group.name}
                  </span>
                  <span className="mt-1 block text-xs text-stone-400">
                    {group.memberCount || 0} members
                  </span>
                </button>
              ))}
              {groups.length === 0 ? (
                <p className="rounded-2xl border border-white/10 p-3 text-sm text-stone-300">
                  No groups created yet.
                </p>
              ) : null}
            </div>
          </section>
        </aside>
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
            setMemberRegistrationStep(1);
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
                  {memberEditor ? 'Update disciple biodata' : 'Register disciple'}
                </h3>
                <p className="mt-2 text-sm text-stone-300">
                  Step {memberRegistrationStep} of 4
                </p>
              </div>
              <button
                className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                type="button"
                onClick={() => {
                  setIsMemberModalOpen(false);
                  setMemberEditor(null);
                  setMemberForm(createMemberForm());
                  setMemberRegistrationStep(1);
                }}
              >
                <X size={18} />
              </button>
            </div>

            <form className="mt-6 space-y-5" onSubmit={submitMember}>
              {memberRegistrationStep === 1 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
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
                      Phone number
                    </span>
                    <input
                      className="input"
                      required
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
                      Gender
                    </span>
                    <select
                      className="input"
                      required
                      value={memberForm.gender}
                      onChange={(event) =>
                        setMemberForm((current) => ({
                          ...current,
                          gender: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {memberRegistrationStep === 2 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Enrollment
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    Is this their first time in the church?
                  </h4>
                  <p className="mt-2 text-sm text-stone-300">
                    A Yes answer records today as their enrollment date.
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        className={`rounded-2xl border px-5 py-4 text-left font-semibold transition ${
                          memberForm.isFirstTimeAtChurch === value
                            ? 'border-amber-200 bg-amber-200/15 text-white'
                            : 'border-white/10 text-stone-200 hover:bg-white/5'
                        }`}
                        type="button"
                        onClick={() =>
                          setMemberForm((current) => ({
                            ...current,
                            isFirstTimeAtChurch: value,
                            enrollmentDate: value
                              ? getNairobiToday()
                              : current.enrollmentDate,
                          }))
                        }
                      >
                        {value ? 'Yes, first time' : 'No, already attending'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {memberRegistrationStep === 3 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Church groups
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    Are they part of any church group?
                  </h4>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        className={`rounded-2xl border px-5 py-4 text-left font-semibold transition ${
                          memberForm.hasChurchGroups === value
                            ? 'border-amber-200 bg-amber-200/15 text-white'
                            : 'border-white/10 text-stone-200 hover:bg-white/5'
                        }`}
                        type="button"
                        onClick={() =>
                          setMemberForm((current) => ({
                            ...current,
                            hasChurchGroups: value,
                            groupIds: value ? current.groupIds : [],
                          }))
                        }
                      >
                        {value ? 'Yes, select groups' : 'No church group'}
                      </button>
                    ))}
                  </div>
                  {memberForm.hasChurchGroups ? (
                    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {groups.length === 0 ? (
                        <p className="text-sm text-stone-300">
                          No groups have been created yet.
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
                  ) : null}
                </div>
              ) : null}

              {memberRegistrationStep === 4 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Responsibility
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-white">
                    Do they belong to a small Christian community or serve in a
                    church role?
                  </h4>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        className={`rounded-2xl border px-5 py-4 text-left font-semibold transition ${
                          memberForm.hasChurchRole === value
                            ? 'border-amber-200 bg-amber-200/15 text-white'
                            : 'border-white/10 text-stone-200 hover:bg-white/5'
                        }`}
                        type="button"
                        onClick={() =>
                          setMemberForm((current) => ({
                            ...current,
                            hasChurchRole: value,
                            churchRoleNotes: value
                              ? current.churchRoleNotes
                              : '',
                          }))
                        }
                      >
                        {value ? 'Yes, record details' : 'No role recorded'}
                      </button>
                    ))}
                  </div>
                  {memberForm.hasChurchRole ? (
                    <label className="mt-5 block space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                        Community or church role details
                      </span>
                      <textarea
                        className="input min-h-28"
                        placeholder="Example: Cell group leader, choir member, youth mentor..."
                        value={memberForm.churchRoleNotes}
                        onChange={(event) =>
                          setMemberForm((current) => ({
                            ...current,
                            churchRoleNotes: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className="btn-secondary justify-center"
                  disabled={memberRegistrationStep === 1}
                  type="button"
                  onClick={() =>
                    setMemberRegistrationStep((current) =>
                      Math.max(1, current - 1),
                    )
                  }
                >
                  Back
                </button>
                <button
                  className="btn-primary justify-center"
                  disabled={
                    memberMutation.isPending ||
                    (memberRegistrationStep === 2 &&
                      memberForm.isFirstTimeAtChurch === null) ||
                    (memberRegistrationStep === 3 &&
                      memberForm.hasChurchGroups === null) ||
                    (memberRegistrationStep === 4 &&
                      memberForm.hasChurchRole === null)
                  }
                  type="submit"
                >
                  {memberRegistrationStep === 4
                    ? memberMutation.isPending
                      ? 'Saving...'
                      : 'Complete registration'
                    : 'Next'}
                </button>
              </div>
            </form>
            </section>
          </div>
        </div>
      ) : null}

      {isBatchModalOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeBatchModal}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-3xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    Batch register
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    Upload discipleship members
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-stone-300">
                    Use the template columns. Group names are optional and must
                    match groups already created in Discipleship.
                  </p>
                </div>
                <button
                  className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                  type="button"
                  onClick={closeBatchModal}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={downloadMemberTemplate}
                >
                  <Download size={17} />
                  Download template
                </button>
                <label className="btn-secondary cursor-pointer justify-center">
                  <Upload size={17} />
                  {batchFile ? batchFile.name : 'Choose XLSX or CSV'}
                  <input
                    accept=".xlsx,.csv"
                    className="hidden"
                    type="file"
                    onChange={(event) => {
                      setBatchSummary(null);
                      setBatchFile(event.target.files?.[0] || null);
                    }}
                  />
                </label>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-black/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  Template fields
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-300">
                  <strong className="text-white">fullName</strong> is required.
                  Phone and gender are required. Optional fields are
                  firstTimeAtChurch, enrollmentDate, groups, churchRoleNotes,
                  and notes. Use YYYY-MM-DD for dates.
                </p>
              </div>

              {batchSummary ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-4">
                    {[
                      ['Rows', batchSummary.totalRows],
                      ['Created', batchSummary.created],
                      ['Skipped', batchSummary.skipped],
                      ['Groups assigned', batchSummary.assignedGroups],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                          {label}
                        </p>
                        <p className="mt-2 text-xl font-semibold text-white">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {(batchSummary.issues || []).length > 0 ? (
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-3xl border border-white/10 bg-black/10 p-3">
                      {(batchSummary.issues || []).slice(0, 20).map((issue) => (
                        <div
                          key={`${issue.row}-${issue.message}`}
                          className="rounded-2xl border border-white/10 p-3 text-sm text-stone-200"
                        >
                          <span className="font-semibold text-white">
                            Row {issue.row}
                          </span>
                          {issue.member ? ` - ${issue.member}` : ''}:{' '}
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="btn-primary w-full justify-center"
                    type="button"
                    onClick={closeBatchModal}
                  >
                    View members
                  </button>
                </div>
              ) : (
                <button
                  className="btn-primary mt-5 w-full justify-center"
                  disabled={!batchFile || batchImportMutation.isPending}
                  type="button"
                  onClick={() => batchImportMutation.mutate()}
                >
                  <Upload size={17} />
                  {batchImportMutation.isPending
                    ? 'Uploading members...'
                    : 'Upload and review summary'}
                </button>
              )}
            </section>
          </div>
        </div>
      ) : null}

      {duplicateReviewCluster ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            setDuplicateReviewClusterId('');
            setSelectedDuplicateMemberIds([]);
          }}
        >
          <div className="modal-shell">
            <section
              className="panel modal-card max-w-5xl p-5 sm:p-6"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-amber-100">
                    Duplicate review
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    These records look similar
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                    Select only the records that belong to the same disciple.
                    Manual records are preferred as the main profile when a
                    merge is saved.
                  </p>
                  {duplicateReviewCluster.reasons.length > 0 ? (
                    <p className="mt-2 text-xs text-stone-400">
                      Matched by:{' '}
                      {duplicateReviewCluster.reasons.join(', ')}
                    </p>
                  ) : null}
                </div>
                <button
                  className="rounded-full border border-white/10 p-2 text-stone-200 hover:bg-white/5"
                  type="button"
                  onClick={() => {
                    setDuplicateReviewClusterId('');
                    setSelectedDuplicateMemberIds([]);
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {duplicateReviewCluster.members.map((member) => {
                  const checked = selectedDuplicateMemberIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className={`cursor-pointer rounded-3xl border p-4 transition ${
                        checked
                          ? 'border-amber-200 bg-amber-200/10'
                          : 'border-white/10 bg-black/10 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-white">
                            {member.fullName}
                          </h4>
                          <p className="mt-1 text-xs text-stone-400">
                            {member.isManual
                              ? 'Manual record'
                              : 'Transaction-created record'}
                          </p>
                        </div>
                        <input
                          checked={checked}
                          type="checkbox"
                          onChange={() =>
                            setSelectedDuplicateMemberIds((current) =>
                              checked
                                ? current.filter((id) => id !== member.id)
                                : [...current, member.id],
                            )
                          }
                        />
                      </div>
                      <div className="mt-4 space-y-2 text-sm text-stone-300">
                        <p>Phone: {member.phone || 'Not set'}</p>
                        <p>
                          Groups:{' '}
                          {(member.groups || [])
                            .map((group) => group.name)
                            .join(', ') || 'No group assigned'}
                        </p>
                        <p>
                          Attendance marks: {Number(member.attendanceCount || 0)}
                        </p>
                        <p>
                          Contributions:{' '}
                          {Number(
                            member.contributionSummary?.contributionCount || 0,
                          )}
                        </p>
                        {(member.aliases || []).filter(
                          (alias) => alias.source !== 'manual',
                        ).length > 0 ? (
                          <p className="text-xs text-amber-100/80">
                            Also known as{' '}
                            {(member.aliases || [])
                              .filter((alias) => alias.source !== 'manual')
                              .map((alias) => alias.alias)
                              .join(', ')}
                          </p>
                        ) : null}
                      </div>
                      {duplicateCanonicalId === member.id && checked ? (
                        <span className="mt-4 inline-flex rounded-full border border-amber-200/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-100">
                          Main profile
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <button
                  className="btn-secondary justify-center"
                  disabled={duplicateReviewMutation.isPending}
                  type="button"
                  onClick={() =>
                    duplicateReviewMutation.mutate({
                      action: 'skip',
                      memberIds: duplicateReviewCluster.members.map(
                        (member) => member.id,
                      ),
                    })
                  }
                >
                  Skip this group
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => {
                    setDuplicateReviewClusterId('');
                    setSelectedDuplicateMemberIds([]);
                  }}
                >
                  Close
                </button>
                <button
                  className="btn-primary justify-center"
                  disabled={
                    selectedDuplicateMemberIds.length < 2 ||
                    duplicateReviewMutation.isPending
                  }
                  type="button"
                  onClick={() =>
                    duplicateReviewMutation.mutate({
                      action: 'merge',
                      memberIds: selectedDuplicateMemberIds,
                      canonicalMemberId: duplicateCanonicalId,
                    })
                  }
                >
                  <GitMerge size={17} />
                  Merge selected
                </button>
              </div>
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
                    Enrolled {detailMember?.enrollmentDate || 'not set'}
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
                  ['Groups attended', memberAttendanceSummary.groupsAttended],
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
                      ['Gender', detailMember?.gender || 'Not set'],
                      [
                        'First time in church',
                        formatYesNo(detailMember?.isFirstTimeAtChurch),
                      ],
                      [
                        'Groups',
                        (detailMember?.groups || [])
                          .map((group) => group.name)
                          .join(', ') || 'No groups assigned',
                      ],
                      [
                        'Small community or church role',
                        formatYesNo(detailMember?.hasChurchRole),
                      ],
                      [
                        'Role or community notes',
                        detailMember?.churchRoleNotes || 'No role notes',
                      ],
                      [
                        'Known transaction names',
                        (detailMember?.aliases || [])
                          .filter((alias) => alias.source !== 'manual')
                          .map((alias) => alias.alias)
                          .filter(
                            (alias, index, items) =>
                              items.indexOf(alias) === index,
                          )
                          .join(', ') || 'No transaction aliases',
                      ],
                      [
                        'Linked transaction identities',
                        String(detailMember?.linkedContributorCount || 0),
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

              {Number(
                detailMember?.contributionSummary?.contributionCount || 0,
              ) > 0 ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-black/10 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                        Contribution record
                      </p>
                      <h4 className="mt-2 text-lg font-semibold text-white">
                        Transaction-linked discipleship
                      </h4>
                      <p className="mt-1 text-sm text-stone-300">
                        Church Service attendance is inferred from confirmed
                        contribution dates.
                      </p>
                    </div>
                    <div className="grid gap-2 text-right sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                          Total
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {formatKes(
                            detailMember?.contributionSummary?.totalAmount,
                          )}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
                          Entries
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {
                            detailMember?.contributionSummary
                              ?.contributionCount
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {(detailMember?.contributionSummary?.dates || [])
                      .slice(0, 12)
                      .map((item) => (
                        <div
                          key={item.date}
                          className="rounded-2xl border border-white/10 bg-white/5 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">
                                {item.date}
                              </p>
                              <p className="mt-1 text-xs text-stone-400">
                                {item.count} contribution
                                {item.count === 1 ? '' : 's'}
                              </p>
                            </div>
                            <p className="font-semibold text-amber-100">
                              {formatKes(item.amount)}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
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
