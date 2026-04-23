import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Mail, PhoneCall, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import api from '../../services/api';

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

export default function PlatformEnquiries() {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-enquiries'],
    queryFn: () => api.get('/platform/enquiries').then((response) => response.data),
  });

  const enquiries = data || [];

  const stats = useMemo(() => {
    const lastSevenDays = new Date();
    lastSevenDays.setDate(lastSevenDays.getDate() - 7);

    return {
      total: enquiries.length,
      recent: enquiries.filter(
        (item: any) => new Date(item.createdAt).getTime() >= lastSevenDays.getTime(),
      ).length,
      withPhone: enquiries.filter((item: any) => Boolean(item.phone)).length,
      latest:
        enquiries.length > 0 ? formatDateTime(enquiries[0]?.createdAt) : 'No submissions yet',
    };
  }, [enquiries]);

  return (
    <div className="space-y-6">
      <div className="overview-stat-grid">
        {[
          {
            label: 'Total enquiries',
            value: stats.total,
            icon: ClipboardList,
          },
          {
            label: 'Last 7 days',
            value: stats.recent,
            icon: Sparkles,
          },
          {
            label: 'With phone contact',
            value: stats.withPhone,
            icon: PhoneCall,
          },
          {
            label: 'Latest submission',
            value: stats.latest,
            icon: Mail,
            compact: true,
          },
        ].map((item) => (
          <div key={item.label} className="stat-card">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                {item.label}
              </p>
              <item.icon size={18} className="text-amber-200" />
            </div>
            <div
              className={`mt-5 font-semibold text-white ${
                item.compact ? 'text-base leading-7' : 'text-2xl'
              }`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <section className="table-shell">
        <div className="border-b border-white/10 px-6 py-5 xl:px-8 xl:py-7">
          <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
            Client pipeline
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Submitted enquiries
          </h3>
          <p className="mt-2 max-w-4xl text-sm text-stone-300">
            Review organizations that want onboarding help, then follow up
            using the contact details they shared from the landing page.
          </p>
        </div>

        {isLoading ? (
          <div className="p-6 text-stone-300">Loading enquiries...</div>
        ) : enquiries.length === 0 ? (
          <div className="p-6 text-stone-300">
            No enquiries submitted yet.
          </div>
        ) : (
          <div className="table-scroll-region">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Contact</th>
                  <th>Submitted</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {enquiries.map((enquiry: any) => (
                  <tr key={enquiry.id}>
                    <td>
                      <div className="font-medium text-white">
                        {enquiry.organizationName}
                      </div>
                      <div className="mt-2">
                        <span className="badge border-white/10 bg-white/5 text-stone-100">
                          {`${enquiry.status || 'new'}`.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="font-medium text-white">
                        {enquiry.contactName}
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-stone-300">
                        <div>{enquiry.email}</div>
                        <div>{enquiry.phone || 'Phone not provided'}</div>
                      </div>
                    </td>
                    <td className="text-sm text-stone-300">
                      {formatDateTime(enquiry.createdAt)}
                    </td>
                    <td>
                      <p className="max-w-3xl whitespace-pre-wrap text-sm leading-6 text-stone-300">
                        {enquiry.message}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
