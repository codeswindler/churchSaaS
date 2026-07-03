import {
  ChartColumn,
  Clock4,
  Coins,
  MessageSquareText,
  MonitorPlay,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getChurchUserPermissions, getSession } from '../../services/api';

const accessCards = [
  {
    permission: 'dashboard.view',
    title: 'Overview dashboard',
    description: 'View finance KPIs, contribution trends, and account splits.',
    to: '/church/dashboard',
    icon: ChartColumn,
  },
  {
    permission: 'presentation.manage',
    title: 'Presentation',
    description: 'Build worship slides and control the projector display.',
    to: '/church/presentation',
    icon: MonitorPlay,
  },
  {
    permission: 'fundAccounts.view',
    title: 'Fund accounts',
    description: 'View contribution accounts and receipt message setup.',
    to: '/church/fund-accounts',
    icon: Coins,
  },
  {
    permission: 'contributions.view',
    title: 'Contributions',
    description: 'Review confirmed collections and contribution records.',
    to: '/church/contributions',
    icon: Clock4,
  },
  {
    permission: 'messaging.view',
    title: 'Messaging',
    description: 'Compose SMS messages and review recipient groups.',
    to: '/church/messaging',
    icon: Send,
  },
  {
    permission: 'discipleship.view',
    title: 'Discipleship',
    description: 'Track members, groups, and Sunday attendance.',
    to: '/church/discipleship',
    icon: UserCheck,
  },
  {
    permission: 'discipleship.view',
    title: 'One-on-one',
    description: 'Record pastoral visits, proposed solutions, and next visits.',
    to: '/church/one-on-one',
    icon: MessageSquareText,
  },
  {
    permission: 'users.view',
    title: 'Staff users',
    description: 'Manage staff access, roles, and permission overrides.',
    to: '/church/users',
    icon: Users,
  },
  {
    permission: 'reports.view',
    title: 'Reports',
    description: 'Open reports and export collection summaries.',
    to: '/church/reports',
    icon: ShieldCheck,
  },
];

export default function ChurchAccessHome() {
  const session = getSession();
  const permissions = new Set(getChurchUserPermissions(session?.user));
  const allowedCards = accessCards.filter((card) =>
    permissions.has(card.permission),
  );

  return (
    <div className="church-console-page access-page space-y-6">
      <section className="panel p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
          Workspace Access
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-white">
          Here is what your account can access
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
          Your role controls which modules appear in this console. Finance
          dashboard KPIs stay hidden unless dashboard access is assigned.
        </p>
      </section>

      {allowedCards.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {allowedCards.map(({ title, description, to, icon: Icon }) => (
            <Link
              key={to}
              className="panel block p-5 transition hover:-translate-y-0.5 hover:bg-white/5"
              to={to}
            >
              <Icon className="text-amber-200" size={22} />
              <h4 className="mt-4 text-lg font-semibold text-white">
                {title}
              </h4>
              <p className="mt-2 text-sm leading-6 text-stone-300">
                {description}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
                Open
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <section className="panel p-6">
          <h4 className="text-lg font-semibold text-white">
            No module access is assigned yet
          </h4>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
            Ask a church administrator to assign a role or permission override
            before using this workspace.
          </p>
        </section>
      )}
    </div>
  );
}
