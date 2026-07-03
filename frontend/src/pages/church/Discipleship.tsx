import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  Users,
  X,
} from 'lucide-react';
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import toast from 'react-hot-toast';
import api, { getSession } from '../../services/api';
import ChurchOneOnOne from './OneOnOne';

type DiscipleshipModule = 'discipleship' | 'oneOnOne';
type DiscipleshipTab = 'attendance' | 'members' | 'groups';
type MemberDetailSection = 'attendance' | 'contributions';

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

type DiscipleshipFollowUpStatus = 'open' | 'completed' | 'cancelled';

interface DiscipleshipFollowUp {
  id: string;
  memberId: string;
  sessionDate: string;
  discussionSummary?: string | null;
  issueRaised?: string | null;
  proposedSolutions?: string | null;
  nextProposedVisitDate?: string | null;
  nextVisitNotes?: string | null;
  status: DiscipleshipFollowUpStatus;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  recordedByUser?: {
    id: string;
    name: string;
  } | null;
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

function MemberActivitySummary({
  member,
  showContributions,
}: {
  member: DiscipleshipMember;
  showContributions: boolean;
}) {
  const activity = member.activitySummary;
  if (!activity) {
    return null;
  }
  const items: [string, string | number][] = [
    ['Enrolled', activity.enrollmentDate || 'Not set'],
    ['Last attendance', activity.latestAttendanceAt || 'None'],
    ['Attendance · 90 days', activity.attendanceCount90Days],
    ['Average / month', activity.averageAttendancePerMonth],
  ];
  if (showContributions) {
    items.splice(
      1,
      0,
      ['First contribution', activity.firstContributionAt || 'None'],
      ['Latest contribution', activity.latestContributionAt || 'None'],
      ['Contribution total', formatKes(activity.contributionTotal)],
      ['Contribution entries', activity.contributionCount || 0],
    );
  }
  return (
    <div className="member-activity-summary grid gap-2 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-white/10 bg-black/10 p-3"
        >
          <p className="text-[10px] uppercase tracking-[0.16em] text-stone-400">
            {label}
          </p>
          <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function MemberBioSummary({ member }: { member: DiscipleshipMember }) {
  const fields = [
    ['Phone', member.phone || 'Not captured'],
    ['Email', member.email || 'Not captured'],
    ['Gender', member.gender || 'Not set'],
    ['Enrolled', member.enrollmentDate || 'Not set'],
    ['First time in church', formatYesNo(member.isFirstTimeAtChurch)],
    [
      'Community / church role',
      member.hasChurchRole
        ? member.churchRoleNotes || 'Yes'
        : formatYesNo(member.hasChurchRole),
    ],
  ];
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label}>
            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">
              {label}
            </p>
            <p className="mt-1 break-words text-sm font-semibold text-white">
              {value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-stone-300">
        <span className="text-stone-400">Groups:</span>{' '}
        {(member.groups || []).map((group) => group.name).join(', ') ||
          'No group assigned'}
      </p>
      <p className="mt-3 text-sm text-stone-300">
        <span className="text-stone-400">Bio notes:</span>{' '}
        {member.notes || 'No notes recorded'}
      </p>
    </div>
  );
}

function createFollowUpForm() {
  return {
    sessionDate: getNairobiToday(),
    discussionSummary: '',
    issueRaised: '',
    proposedSolutions: '',
    nextProposedVisitDate: '',
    nextVisitNotes: '',
    status: 'open' as DiscipleshipFollowUpStatus,
  };
}

function formatFollowUpStatus(status: DiscipleshipFollowUpStatus) {
  if (status === 'completed') {
    return 'Completed';
  }
  if (status === 'cancelled') {
    return 'Cancelled';
  }
  return 'Open';
}

function MemberFollowUpPanel({
  memberId,
  canManage,
}: {
  memberId: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(
    null,
  );
  const [form, setForm] = useState(createFollowUpForm);
  const { data: followUps = [], isLoading } = useQuery<DiscipleshipFollowUp[]>({
    queryKey: ['discipleship-follow-ups', memberId],
    enabled: Boolean(memberId),
    queryFn: () =>
      api
        .get(`/church/discipleship/members/${memberId}/follow-ups`)
        .then((response) => response.data),
  });

  const refreshFollowUps = () => {
    queryClient.invalidateQueries({
      queryKey: ['discipleship-follow-ups', memberId],
    });
    queryClient.invalidateQueries({ queryKey: ['discipleship-member-detail'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-detail'],
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
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
        .post(`/church/discipleship/members/${memberId}/follow-ups`, payload)
        .then((response) => response.data);
    },
    onSuccess: () => {
      toast.success(
        editingFollowUpId ? 'One-on-one updated' : 'One-on-one recorded',
      );
      setIsFormOpen(false);
      setEditingFollowUpId(null);
      setForm(createFollowUpForm());
      refreshFollowUps();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to save one-on-one follow-up',
      );
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      followUpId,
      status,
    }: {
      followUpId: string;
      status: DiscipleshipFollowUpStatus;
    }) =>
      api
        .patch(`/church/discipleship/follow-ups/${followUpId}`, { status })
        .then((response) => response.data),
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === 'completed'
          ? 'Follow-up marked completed'
          : 'Follow-up reopened',
      );
      refreshFollowUps();
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to update follow-up status',
      );
    },
  });

  const openEditor = (record?: DiscipleshipFollowUp) => {
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

  const latestOpenFollowUp = followUps.find((item) => item.status === 'open');

  return (
    <div className="rounded-3xl border border-white/10 bg-black/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
            One-on-one
          </p>
          <h4 className="mt-1 font-semibold text-white">
            Pastoral follow-up
          </h4>
          {latestOpenFollowUp?.nextProposedVisitDate ? (
            <p className="mt-1 text-xs text-amber-100">
              Next proposed visit: {latestOpenFollowUp.nextProposedVisitDate}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <button
            className="btn-secondary px-3 py-2 text-xs"
            type="button"
            onClick={() => openEditor()}
          >
            <Plus size={15} />
            Record
          </button>
        ) : null}
      </div>

      {isFormOpen ? (
        <form className="mt-4 space-y-3" onSubmit={submitFollowUp}>
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
                    status: event.target.value as DiscipleshipFollowUpStatus,
                  }))
                }
              >
                <option value="open">Open</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              Discussion summary
            </span>
            <textarea
              className="input min-h-20"
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
              className="input min-h-16"
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
              className="input min-h-20"
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

          <div className="grid gap-3 sm:grid-cols-2">
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
                Visit notes
              </span>
              <input
                className="input-compact"
                placeholder="Optional visit note"
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="btn-secondary justify-center sm:flex-1"
              disabled={saveMutation.isPending}
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                setEditingFollowUpId(null);
                setForm(createFollowUpForm());
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary justify-center sm:flex-1"
              disabled={saveMutation.isPending}
              type="submit"
            >
              {editingFollowUpId ? 'Save follow-up' : 'Record follow-up'}
            </button>
          </div>
        </form>
      ) : null}

      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {isLoading ? (
          <p className="rounded-2xl border border-white/10 p-3 text-sm text-stone-300">
            Loading follow-ups...
          </p>
        ) : followUps.length === 0 ? (
          <p className="rounded-2xl border border-white/10 p-3 text-sm text-stone-300">
            No one-on-one follow-up has been recorded yet.
          </p>
        ) : (
          followUps.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    {item.sessionDate}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    {formatFollowUpStatus(item.status)}
                    {item.recordedByUser?.name
                      ? ` by ${item.recordedByUser.name}`
                      : ''}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    item.status === 'completed'
                      ? 'border-emerald-300/30 text-emerald-100'
                      : item.status === 'cancelled'
                        ? 'border-stone-300/20 text-stone-300'
                        : 'border-amber-200/30 text-amber-100'
                  }`}
                >
                  {formatFollowUpStatus(item.status)}
                </span>
              </div>

              {item.issueRaised ? (
                <p className="mt-3 text-sm text-stone-200">
                  <span className="text-stone-400">Issue:</span>{' '}
                  {item.issueRaised}
                </p>
              ) : null}
              {item.proposedSolutions ? (
                <p className="mt-2 text-sm text-stone-200">
                  <span className="text-stone-400">Proposed solution:</span>{' '}
                  {item.proposedSolutions}
                </p>
              ) : null}
              {item.nextProposedVisitDate ? (
                <p className="mt-2 text-xs font-semibold text-amber-100">
                  Next proposed visit: {item.nextProposedVisitDate}
                </p>
              ) : null}

              {canManage ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-secondary px-3 py-2 text-xs"
                    type="button"
                    onClick={() => openEditor(item)}
                  >
                    Edit
                  </button>
                  {item.status === 'completed' ? (
                    <button
                      className="btn-secondary px-3 py-2 text-xs"
                      disabled={statusMutation.isPending}
                      type="button"
                      onClick={() =>
                        statusMutation.mutate({
                          followUpId: item.id,
                          status: 'open',
                        })
                      }
                    >
                      Reopen
                    </button>
                  ) : (
                    <button
                      className="btn-secondary px-3 py-2 text-xs"
                      disabled={statusMutation.isPending}
                      type="button"
                      onClick={() =>
                        statusMutation.mutate({
                          followUpId: item.id,
                          status: 'completed',
                        })
                      }
                    >
                      Mark completed
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type ProgressChartItem = {
  label: string;
  value: number;
  caption?: string;
};

function formatChartDateLabel(value: string) {
  const [year, month, day] = value.split('-');
  if (year && month && day) {
    return `${Number(day)}/${Number(month)}`;
  }
  return value;
}

function ProgressChart({
  items,
  emptyLabel,
  mode = 'line',
  valueLabel = 'records',
  onViewDetails,
}: {
  items: ProgressChartItem[];
  emptyLabel: string;
  mode?: 'bar' | 'line';
  valueLabel?: string;
  onViewDetails?: () => void;
}) {
  const chartId = useId().replace(/:/g, '');
  const barGradientId = `discipleship-bar-${chartId}`;
  const areaGradientId = `discipleship-area-${chartId}`;
  const maxValue = Math.max(1, ...items.map((item) => item.value));
  const width = 520;
  const height = 230;
  const paddingX = 36;
  const paddingTop = 24;
  const paddingBottom = 46;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;
  const points = items.map((item, index) => {
    const x =
      items.length === 1
        ? width / 2
        : paddingX + (index / (items.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (item.value / maxValue) * chartHeight;
    return { ...item, x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${
          points[0].x
        } ${height - paddingBottom} Z`
      : '';
  const barWidth =
    points.length > 0 ? Math.min(54, (chartWidth / points.length) * 0.58) : 0;
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const totalLabel =
    valueLabel === 'KES'
      ? formatKes(total)
      : `${total.toLocaleString()} ${valueLabel}`;

  if (items.length === 0) {
    return (
      <div className="discipleship-chart-empty">
        <p>{emptyLabel}</p>
        {onViewDetails ? (
          <button
            className="btn-secondary mt-3 px-3 py-2"
            type="button"
            onClick={onViewDetails}
          >
            View details
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="discipleship-progress-chart">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xl font-semibold text-white">{totalLabel}</p>
          <p className="mt-1 text-sm text-stone-400">
            {items[0].label} to {items[items.length - 1].label}
          </p>
        </div>
        {onViewDetails ? (
          <button
            className="btn-secondary justify-center px-3 py-2"
            type="button"
            onClick={onViewDetails}
          >
            View details
          </button>
        ) : null}
      </div>

      <svg
        className="discipleship-chart-svg"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient
            id={barGradientId}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#f6de84" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient
            id={areaGradientId}
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = paddingTop + chartHeight - ratio * chartHeight;
          return (
            <g key={ratio}>
              <line
                className="discipleship-chart-grid"
                x1={paddingX}
                x2={width - paddingX}
                y1={y}
                y2={y}
              />
              <text
                className="discipleship-chart-y-label"
                x={paddingX - 10}
                y={y + 4}
                textAnchor="end"
              >
                {Math.round(maxValue * ratio).toLocaleString()}
              </text>
            </g>
          );
        })}

        {mode === 'line' && areaPath ? (
          <path
            className="discipleship-chart-area"
            d={areaPath}
            fill={`url(#${areaGradientId})`}
          />
        ) : null}
        {mode === 'line' && linePath ? (
          <path className="discipleship-chart-line" d={linePath} />
        ) : null}
        {mode === 'bar'
          ? points.map((point) => (
              <rect
                key={point.label}
                className="discipleship-chart-bar"
                fill={`url(#${barGradientId})`}
                height={height - paddingBottom - point.y}
                rx="8"
                width={barWidth}
                x={point.x - barWidth / 2}
                y={point.y}
              />
            ))
          : null}
        {points.map((point) => (
          <g key={point.label}>
            <circle
              className="discipleship-chart-point"
              cx={point.x}
              cy={point.y}
              r={mode === 'bar' ? 4 : 5}
            />
            <text
              className="discipleship-chart-x-label"
              textAnchor="middle"
              x={point.x}
              y={height - 18}
            >
              {formatChartDateLabel(point.label)}
            </text>
          </g>
        ))}
      </svg>

      <div className="discipleship-chart-caption-grid">
        {items.slice(-3).map((item) => (
          <div key={item.label} className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {item.label}
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-400">
              {item.caption || `${item.value.toLocaleString()} ${valueLabel}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function createMemberForm() {
  return {
    fullName: '',
    phone: '',
    email: '',
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
  { value: 'groups', label: 'Groups', icon: Users },
];

export default function ChurchDiscipleship() {
  const queryClient = useQueryClient();
  const session = getSession();
  const isPriest =
    session?.user?.role === 'priest' ||
    session?.user?.role === 'church_admin';
  const [activeModule, setActiveModule] =
    useState<DiscipleshipModule>('discipleship');
  const [activeTab, setActiveTab] = useState<DiscipleshipTab>('attendance');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberGroupFilter, setMemberGroupFilter] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [reviewDataEnabled, setReviewDataEnabled] = useState(false);
  const [duplicateReviewRequested, setDuplicateReviewRequested] =
    useState(false);
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
  const [detailSection, setDetailSection] =
    useState<MemberDetailSection>('attendance');
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
    refetchInterval: (query) =>
      query.state.data?.syncing ? 2_000 : false,
  });
  useEffect(() => {
    if (summary?.syncing !== false) {
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['discipleship-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-member-detail'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-detail'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-member-attendance'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-attendance'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-duplicate-members'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-follow-ups'],
    });
  }, [queryClient, summary?.syncing]);

  const { data: groups = [] } = useQuery<DiscipleshipGroup[]>({
    queryKey: ['discipleship-groups'],
    queryFn: () =>
      api.get('/church/discipleship/groups').then((response) => response.data),
  });

  const memberQuery = buildQuery({
    search: memberSearch.trim(),
    groupId: memberGroupFilter,
    page: String(memberPage),
    limit: '25',
  });
  const { data: memberPageData, isLoading: membersLoading } = useQuery<{
    items: DiscipleshipMember[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    syncing?: boolean;
  }>({
    queryKey: [
      'discipleship-members',
      memberSearch.trim(),
      memberGroupFilter,
      memberPage,
    ],
    queryFn: () =>
      api
        .get(`/church/discipleship/members${memberQuery}`)
        .then((response) => response.data),
    refetchInterval: (query) =>
      query.state.data?.syncing ? 2_000 : false,
  });
  const members = memberPageData?.items || [];
  const memberPagination = memberPageData?.pagination;
  useEffect(() => {
    setMemberPage(1);
  }, [memberGroupFilter, memberSearch]);

  const { data: attendance = [] } = useQuery<DiscipleshipAttendance[]>({
    queryKey: ['discipleship-attendance'],
    enabled: activeTab === 'attendance',
    queryFn: () =>
      api
        .get('/church/discipleship/attendance')
        .then((response) => response.data),
  });

  const { data: duplicateClusters = [] } = useQuery<
    DiscipleshipDuplicateCluster[]
  >({
    queryKey: ['discipleship-duplicate-members'],
    enabled: reviewDataEnabled,
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
  const panelMemberBase = selectedMember || members[0] || null;
  const { data: panelMemberDetail } = useQuery<DiscipleshipMember>({
    queryKey: ['discipleship-panel-member-detail', panelMemberBase?.id],
    enabled: Boolean(panelMemberBase?.id),
    queryFn: () =>
      api
        .get(`/church/discipleship/members/${panelMemberBase?.id}`)
        .then((response) => response.data),
  });
  const panelMember = panelMemberDetail || panelMemberBase;
  const { data: panelMemberAttendance = [] } = useQuery<
    DiscipleshipAttendance[]
  >({
    queryKey: ['discipleship-panel-member-attendance', panelMemberBase?.id],
    enabled: Boolean(panelMemberBase?.id),
    queryFn: () =>
      api
        .get(`/church/discipleship/attendance?memberId=${panelMemberBase?.id}`)
        .then((response) => response.data),
  });
  const duplicateReviewCluster = useMemo(
    () =>
      duplicateClusters.find(
        (cluster) => cluster.id === duplicateReviewClusterId,
      ) || null,
    [duplicateClusters, duplicateReviewClusterId],
  );
  useEffect(() => {
    if (!duplicateReviewRequested || !reviewDataEnabled) {
      return;
    }
    if (duplicateClusters.length > 0) {
      setDuplicateReviewRequested(false);
      openDuplicateReview(duplicateClusters[0]);
    }
  }, [
    duplicateClusters,
    duplicateReviewRequested,
    reviewDataEnabled,
  ]);

  const refreshDiscipleship = () => {
    queryClient.invalidateQueries({ queryKey: ['discipleship-summary'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-members'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-groups'] });
    queryClient.invalidateQueries({ queryKey: ['discipleship-attendance'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-duplicate-members'],
    });
    queryClient.invalidateQueries({ queryKey: ['discipleship-member-detail'] });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-detail'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-member-attendance'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-panel-member-attendance'],
    });
    queryClient.invalidateQueries({
      queryKey: ['discipleship-follow-ups'],
    });
  };

  const memberMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: memberForm.fullName,
        phone: memberForm.phone,
        email: memberForm.email,
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
            email: member.email || '',
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
    [
      'Duplicate reviews',
      summary?.totals?.duplicateReviews || 0,
    ],
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
  const panelAttendanceChart = useMemo(() => {
    const counts = new Map<string, number>();
    panelMemberAttendance.forEach((item) => {
      counts.set(
        item.attendanceDate,
        (counts.get(item.attendanceDate) || 0) + 1,
      );
    });
    return Array.from(counts.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-8)
      .map(([label, value]) => ({
        label,
        value,
        caption: `${value} attendance mark${value === 1 ? '' : 's'}`,
      }));
  }, [panelMemberAttendance]);
  const panelContributionChart = useMemo(() => {
    return (panelMember?.contributionSummary?.dates || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-8)
      .map((item) => ({
        label: item.date,
        value: Number(item.amount || 0),
        caption: `${item.count} contribution${item.count === 1 ? '' : 's'} - ${formatKes(item.amount)}`,
      }));
  }, [panelMember]);
  const detailAttendanceChart = useMemo(() => {
    const counts = new Map<string, number>();
    memberAttendance.forEach((item) => {
      counts.set(
        item.attendanceDate,
        (counts.get(item.attendanceDate) || 0) + 1,
      );
    });
    return Array.from(counts.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-12)
      .map(([label, value]) => ({
        label,
        value,
        caption: `${value} attendance mark${value === 1 ? '' : 's'}`,
      }));
  }, [memberAttendance]);
  const detailContributionChart = useMemo(() => {
    return (detailMember?.contributionSummary?.dates || [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12)
      .map((item) => ({
        label: item.date,
        value: Number(item.amount || 0),
        caption: `${item.count} contribution${item.count === 1 ? '' : 's'} - ${formatKes(item.amount)}`,
      }));
  }, [detailMember]);
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
  const visibleDetailSection = isPriest ? detailSection : 'attendance';
  const detailStatCards =
    visibleDetailSection === 'attendance'
      ? [
          ['Attendance marks', memberAttendanceSummary.total],
          ['Groups attended', memberAttendanceSummary.groupsAttended],
          ['Group events', memberAttendanceSummary.groupCount],
          ['Last attended', memberAttendanceSummary.lastAttended],
        ]
      : [
          [
            'Total contributed',
            formatKes(detailMember?.contributionSummary?.totalAmount),
          ],
          [
            'Contribution entries',
            detailMember?.contributionSummary?.contributionCount || 0,
          ],
          [
            'Latest contribution',
            detailMember?.contributionSummary?.latestContributionAt ||
              'No contribution yet',
          ],
          [
            'Linked identities',
            detailMember?.linkedContributorCount || 0,
          ],
        ];
  const openMemberDetails = (
    memberId: string,
    section: MemberDetailSection,
  ) => {
    setDetailSection(isPriest ? section : 'attendance');
    setDetailMemberId(memberId);
  };

  return (
    <div className="space-y-4 discipleship-page">
      <section className="panel p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['discipleship', 'Discipleship'],
            ['oneOnOne', 'One-on-one'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                activeModule === value
                  ? 'bg-amber-200 text-stone-950'
                  : 'border border-white/10 text-stone-200 hover:bg-white/5'
              }`}
              type="button"
              onClick={() => setActiveModule(value as DiscipleshipModule)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeModule === 'discipleship' ? (
        <>
          <section className="discipleship-stat-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(([label, value]) => {
          const isDuplicateReview = label === 'Duplicate reviews';
          const content = (
            <>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              {label}
            </p>
            <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
            </>
          );
          return isDuplicateReview ? (
            <button
              key={label}
              className="panel p-4 text-left discipleship-stat-card transition hover:border-amber-200/35 hover:bg-amber-200/10"
              type="button"
              onClick={() => {
                setReviewDataEnabled(true);
                setDuplicateReviewRequested(true);
              }}
            >
              {content}
            </button>
          ) : (
            <div key={label} className="panel p-4 discipleship-stat-card">
              {content}
            </div>
          );
        })}
      </section>

          <section className="panel discipleship-tabs p-3">
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
        <section className="discipleship-attendance-workspace grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
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

            <div className="discipleship-attendance-form-grid mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
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

                <div className="discipleship-member-picker max-h-[410px] space-y-2 overflow-y-auto pr-1">
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
              <div className="mt-4 rounded-2xl bg-white/[0.04] p-4">
                <MemberBioSummary member={panelMember} />
                <div className="mt-4">
                  <MemberActivitySummary
                    member={panelMember}
                    showContributions={isPriest}
                  />
                </div>
              </div>
            ) : null}
            <div className="mt-5 rounded-3xl bg-white/[0.045] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                Attendance chart
              </p>
              <ProgressChart
                emptyLabel="No attendance has been recorded for this member yet."
                items={panelAttendanceChart}
                mode="bar"
                onViewDetails={
                  panelMember
                    ? () => openMemberDetails(panelMember.id, 'attendance')
                    : undefined
                }
                valueLabel="marks"
              />
            </div>
            {isPriest ? (
              <div className="mt-5 rounded-3xl bg-white/[0.045] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
                  Giving chart
                </p>
                <ProgressChart
                  emptyLabel="No linked contributions for this member."
                  items={panelContributionChart}
                  mode="line"
                  onViewDetails={
                    panelMember
                      ? () => openMemberDetails(panelMember.id, 'contributions')
                      : undefined
                  }
                  valueLabel="KES"
                />
              </div>
            ) : null}
          </div>
        </section>
      )}

      {activeTab === 'members' && (
        <section className="discipleship-members-workspace grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
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
          {memberPagination ? (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 p-3 text-xs text-stone-400">
              <span>
                {memberPagination.total.toLocaleString()} members · page{' '}
                {memberPagination.page} of {memberPagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-secondary px-3 py-2"
                  disabled={memberPagination.page <= 1}
                  type="button"
                  onClick={() =>
                    setMemberPage((current) => Math.max(1, current - 1))
                  }
                >
                  Previous
                </button>
                <button
                  className="btn-secondary px-3 py-2"
                  disabled={
                    memberPagination.page >= memberPagination.totalPages
                  }
                  type="button"
                  onClick={() => setMemberPage((current) => current + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
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
              <div className="mt-4 space-y-4 text-base text-stone-300">
                <div className="rounded-2xl bg-black/10 p-3">
                  <MemberBioSummary member={panelMember} />
                </div>
                <MemberActivitySummary
                  member={panelMember}
                  showContributions={isPriest}
                />
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                    Attendance chart
                  </p>
                  <ProgressChart
                    emptyLabel="No attendance marks yet."
                    items={panelAttendanceChart}
                    mode="bar"
                    onViewDetails={() =>
                      openMemberDetails(panelMember.id, 'attendance')
                    }
                    valueLabel="marks"
                  />
                </div>
                {isPriest ? (
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-stone-400">
                      Giving chart
                    </p>
                    <ProgressChart
                      emptyLabel="No linked contribution pattern."
                      items={panelContributionChart}
                      mode="line"
                      onViewDetails={() =>
                        openMemberDetails(panelMember.id, 'contributions')
                      }
                      valueLabel="KES"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-sm text-stone-300">
                Select a member from the list to see biodata and attendance.
              </p>
            )}
          </section>

        </aside>
        </section>
      )}

      {activeTab === 'groups' && (
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Groups
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                Discipleship groups
              </h3>
              <p className="mt-2 text-sm text-stone-300">
                Create and edit the groups used for attendance, member filters,
                and discipleship reporting.
              </p>
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

          {groups.length === 0 ? (
            <p className="p-4 text-sm text-stone-300">
              No groups created yet.
            </p>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {groups.map((group) => (
                <button
                  key={group.id}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4 text-left transition hover:bg-white/5"
                  type="button"
                  onClick={() => openGroupEditor(group)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{group.name}</p>
                      <p className="mt-2 text-sm text-stone-300">
                        {group.description || 'No description yet.'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        group.isActive
                          ? 'border-emerald-300/30 text-emerald-100'
                          : 'border-stone-300/20 text-stone-300'
                      }`}
                    >
                      {group.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-4 text-xs uppercase tracking-[0.18em] text-stone-400">
                    {(group.memberCount || 0).toLocaleString()} members
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}
        </>
      ) : (
        <ChurchOneOnOne />
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
                      Email address (optional)
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
                  <label className="mt-5 block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
                      Member bio notes (optional)
                    </span>
                    <textarea
                      className="input min-h-24"
                      placeholder="Record pastoral, family, ministry, or follow-up details."
                      value={memberForm.notes}
                      onChange={(event) =>
                        setMemberForm((current) => ({
                          ...current,
                          notes: event.target.value,
                        }))
                      }
                    />
                  </label>
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
                    {visibleDetailSection === 'attendance'
                      ? 'Attendance details'
                      : 'Contribution details'}
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
                {detailStatCards.map(([label, value]) => (
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

              <div className="mt-5 rounded-3xl bg-white/[0.045] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                  {visibleDetailSection === 'attendance'
                    ? 'Attendance progression'
                    : 'Contribution progression'}
                </p>
                {visibleDetailSection === 'attendance' ? (
                  memberAttendanceLoading ? (
                    <p className="mt-3 text-sm text-stone-300">
                      Loading attendance...
                    </p>
                  ) : (
                    <ProgressChart
                      emptyLabel="No attendance pattern yet."
                      items={detailAttendanceChart}
                      mode="bar"
                      valueLabel="marks"
                    />
                  )
                ) : (
                  <ProgressChart
                    emptyLabel="No linked contribution pattern."
                    items={detailContributionChart}
                    mode="line"
                    valueLabel="KES"
                  />
                )}
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
                        'Enrollment date',
                        detailMember?.enrollmentDate || 'Not set',
                      ],
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
                      ...(isPriest
                        ? [
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
                              String(
                                detailMember?.linkedContributorCount || 0,
                              ),
                            ],
                          ]
                        : []),
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

                {visibleDetailSection === 'attendance' ? (
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
                ) : (
                  <div className="rounded-3xl border border-white/10 bg-black/10 p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Contribution history
                    </p>
                    <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {(
                        detailMember?.contributionSummary?.contributions || []
                      ).length === 0 ? (
                        <p className="text-sm text-stone-300">
                          No linked contributions for this member.
                        </p>
                      ) : (
                        (
                          detailMember?.contributionSummary?.contributions || []
                        ).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-white">
                                  {item.fundAccountName || 'General contribution'}
                                </p>
                                <p className="mt-1 text-xs text-stone-400">
                                  {item.date}
                                  {item.paymentReference
                                    ? ` · ${item.paymentReference}`
                                    : ''}
                                </p>
                              </div>
                              <p className="font-semibold text-amber-100">
                                {formatKes(item.amount)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
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

