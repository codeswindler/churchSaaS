import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  HeartHandshake,
  Mail,
  MapPin,
  Moon,
  Phone,
  PlayCircle,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BibleReader } from '../../components/BibleReader';
import api from '../../services/api';

const PUBLIC_THEME_STORAGE_KEY = 'church_public_theme';

function resolveMediaUrl(value?: string | null) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-KE', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatLongDate(value?: string | null) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-KE', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return date.toLocaleDateString('en-KE', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getTodayInputDate() {
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 10);
}

function toInputDate(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function isCurrentVerseDate(value?: string | null) {
  const date = toInputDate(value);
  return !date || date >= getTodayInputDate();
}

export default function PublicCongregation() {
  const { slug = '' } = useParams();
  const [activeVerseIndex, setActiveVerseIndex] = useState(0);
  const [publicTheme, setPublicTheme] = useState(() => {
    if (typeof window === 'undefined') return 'day';
    return localStorage.getItem(PUBLIC_THEME_STORAGE_KEY) || 'day';
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-congregation-page', slug],
    queryFn: () =>
      api
        .get(`/public/churches/${slug}/congregation`)
        .then((response) => response.data),
    enabled: Boolean(slug),
  });
  useEffect(() => {
    localStorage.setItem(PUBLIC_THEME_STORAGE_KEY, publicTheme);
  }, [publicTheme]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f7f3ea] p-8 text-stone-700">
        Loading verses & announcements...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f3ea] p-6 text-stone-800">
        <div className="max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
            Verses & Announcements
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Page not available</h1>
          <p className="mt-3 text-stone-600">
            This church page may be unavailable right now.
          </p>
        </div>
      </div>
    );
  }

  const church = data.church || {};
  const page = data.page || {};
  const serviceTimes = page.serviceTimes || [];
  const events = page.events || [];
  const programs = page.massPrograms || [];
  const sermons = page.sermons || [];
  const gallery = (page.galleryImages || []).filter(
    (image: any) => image?.imageUrl && image.isActive !== false,
  );
  const logoUrl = resolveMediaUrl(church.logoUrl) || '/brand-logo.jpeg';
  const dailyVerses =
    Array.isArray(page.dailyVerses) && page.dailyVerses.length > 0
      ? page.dailyVerses.filter(
          (item: any) => item?.text && isCurrentVerseDate(item.date),
        )
      : page.verseText
        ? [
            {
              id: 'legacy-verse',
              date: page.updatedAt || null,
              reference: page.verseReference,
              versionLabel: 'KJV',
              text: page.verseText,
            },
          ]
        : [];
  const safeActiveVerseIndex = Math.min(
    activeVerseIndex,
    Math.max(dailyVerses.length - 1, 0),
  );
  const activeVerse = dailyVerses[safeActiveVerseIndex] || null;
  const fallbackFeaturedImage =
    gallery.length > 0
      ? gallery[safeActiveVerseIndex % gallery.length]?.imageUrl
      : null;
  const featuredImageUrl = resolveMediaUrl(
    page.featuredImageUrl || fallbackFeaturedImage,
  );
  const isNightMode = publicTheme === 'night';
  const pageClass = isNightMode
    ? 'min-h-screen bg-[#071b17] text-stone-50'
    : 'min-h-screen bg-[#f7f3ea] text-stone-900';
  const headerClass = isNightMode
    ? 'border-b border-white/10 bg-[#071b17]/92 backdrop-blur'
    : 'border-b border-stone-200/80 bg-[#f7f3ea]/90 backdrop-blur';
  const heroGlowClass = isNightMode
    ? 'absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(125,211,252,0.14),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(252,211,77,0.12),transparent_28%)]'
    : 'absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(30,111,135,0.16),transparent_30%),radial-gradient(circle_at_85%_0%,rgba(190,136,46,0.18),transparent_28%)]';
  const eyebrowClass = isNightMode
    ? 'text-xs font-semibold uppercase tracking-[0.28em] text-amber-200'
    : 'text-xs font-semibold uppercase tracking-[0.28em] text-[#9b6b19]';
  const sectionEyebrowClass = isNightMode
    ? 'text-xs font-semibold uppercase tracking-[0.24em] text-amber-200'
    : 'text-xs font-semibold uppercase tracking-[0.24em] text-[#9b6b19]';
  const bodyTextClass = isNightMode ? 'text-stone-300' : 'text-stone-700';
  const mutedTextClass = isNightMode ? 'text-stone-400' : 'text-stone-600';
  const panelClass = isNightMode
    ? 'rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-sm'
    : 'rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm';
  const itemCardClass = isNightMode
    ? 'rounded-3xl border border-white/10 bg-white/[0.05] p-4'
    : 'rounded-3xl border border-stone-200 bg-[#fbfaf6] p-4';
  const articleClass = isNightMode
    ? 'overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05]'
    : 'overflow-hidden rounded-3xl border border-stone-200 bg-[#fbfaf6]';
  const sermonCardClass = isNightMode
    ? 'overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] shadow-sm'
    : 'overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm';
  const infoPillClass = isNightMode
    ? 'flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-stone-200'
    : 'flex items-center gap-3 rounded-2xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-700';
  const officeClass = isNightMode
    ? 'rounded-[28px] border border-white/10 bg-[#0f2f2a] p-6 text-white shadow-sm'
    : 'rounded-[28px] border border-stone-200 bg-[#14352e] p-6 text-white shadow-sm';
  const sermonButtonClass = isNightMode
    ? 'mt-5 inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-2 text-sm font-semibold text-[#10241f] transition hover:bg-amber-100'
    : 'mt-5 inline-flex items-center gap-2 rounded-full bg-[#143f34] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#215e4e]';
  const actionButtonClass = isNightMode
    ? 'inline-flex items-center gap-2 rounded-full bg-amber-200 px-4 py-2 text-sm font-semibold text-[#10241f] transition hover:bg-amber-100'
    : 'inline-flex items-center gap-2 rounded-full bg-[#143f34] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#215e4e]';
  const bibleInputClass = isNightMode
    ? 'mt-1.5 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-sm text-stone-50 outline-none transition focus:border-amber-200/45 focus:ring-2 focus:ring-amber-200/15'
    : 'mt-1.5 w-full rounded-2xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 outline-none transition focus:border-[#143f34]/40 focus:ring-2 focus:ring-[#143f34]/10';
  const bibleButtonClass = isNightMode
    ? 'inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-amber-200/25 bg-amber-200 px-4 py-2.5 text-sm font-semibold text-[#10241f] transition hover:bg-amber-100'
    : 'inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[#143f34]/10 bg-[#143f34] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#215e4e]';
  const bibleLabelClass = isNightMode
    ? 'text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400'
    : 'text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500';

  const showPreviousVerse = () => {
    setActiveVerseIndex((current) =>
      dailyVerses.length > 0
        ? (current - 1 + dailyVerses.length) % dailyVerses.length
        : 0,
    );
  };

  const showNextVerse = () => {
    setActiveVerseIndex((current) =>
      dailyVerses.length > 0 ? (current + 1) % dailyVerses.length : 0,
    );
  };

  return (
    <div className={pageClass}>
      <header className={headerClass}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="flex min-w-0 items-center gap-3" to={`/c/${slug}`}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
              <img
                alt=""
                className="h-full w-full object-contain p-1.5"
                onError={(event) => {
                  if (!event.currentTarget.src.endsWith('/brand-logo.jpeg')) {
                    event.currentTarget.src = '/brand-logo.jpeg';
                  }
                }}
                src={logoUrl}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">
                {church.name}
              </div>
              <p
                className={`truncate text-xs uppercase tracking-[0.22em] ${
                  isNightMode ? 'text-stone-400' : 'text-stone-500'
                }`}
              >
                Verses & Announcements
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <button
              aria-label={
                isNightMode ? 'Switch to day mode' : 'Switch to night mode'
              }
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition ${
                isNightMode
                  ? 'border-white/15 bg-white/10 text-amber-100 hover:bg-white/15'
                  : 'border-stone-200 bg-white/80 text-[#163f34] hover:bg-white'
              }`}
              title={isNightMode ? 'Day mode' : 'Night mode'}
              type="button"
              onClick={() =>
                setPublicTheme((current) =>
                  current === 'night' ? 'day' : 'night',
                )
              }
            >
              {isNightMode ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link
              className="inline-flex items-center gap-2 rounded-full bg-[#163f34] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#215e4e]"
              to={`/c/${slug}/give`}
            >
              <HeartHandshake size={16} />
              Give
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className={heroGlowClass} />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_460px] lg:px-8 lg:py-16">
            <div className="flex flex-col justify-center">
              <p className={eyebrowClass}>
                {church.name}
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.01em] sm:text-6xl">
                {page.heroTitle || `Welcome to ${church.name}`}
              </h1>
              <p className={`mt-6 max-w-2xl text-lg leading-8 ${bodyTextClass}`}>
                {page.welcomeMessage}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {church.address ? (
                  <div className={infoPillClass}>
                    <MapPin size={16} className="text-[#1e6f87]" />
                    {church.address}
                  </div>
                ) : null}
                {church.contactPhone ? (
                  <a
                    className={infoPillClass}
                    href={`tel:${church.contactPhone}`}
                  >
                    <Phone size={16} className="text-[#1e6f87]" />
                    {church.contactPhone}
                  </a>
                ) : null}
              </div>
            </div>

            <div
              className={`relative min-h-[420px] overflow-hidden rounded-[32px] shadow-2xl shadow-stone-900/15 ${
                featuredImageUrl
                  ? 'bg-[#14352e]'
                  : 'bg-[radial-gradient(circle_at_top_left,rgba(253,230,138,0.22),transparent_30%),linear-gradient(145deg,#123b33_0%,#0e2b25_58%,#071b17_100%)]'
              }`}
            >
              {featuredImageUrl ? (
                <img
                  alt=""
                  className="h-full min-h-[420px] w-full object-cover"
                  src={featuredImageUrl}
                />
              ) : null}
              <div
                className={`absolute inset-0 flex flex-col justify-end p-6 text-white ${
                  featuredImageUrl
                    ? 'bg-[linear-gradient(180deg,rgba(0,0,0,0.42)_0%,rgba(0,0,0,0.25)_34%,rgba(0,0,0,0.82)_72%,rgba(0,0,0,0.95)_100%)]'
                    : ''
                }`}
              >
                <div className="mb-auto flex items-center justify-between gap-3">
                  <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-lg shadow-black/30 backdrop-blur-sm">
                    {formatLongDate(activeVerse?.date)}
                  </span>
                  {dailyVerses.length > 1 ? (
                    <span className="rounded-full border border-white/20 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-black/30 backdrop-blur-sm">
                      {safeActiveVerseIndex + 1} /{' '}
                      {dailyVerses.length}
                    </span>
                  ) : null}
                </div>

                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
                  Today&apos;s Word
                </p>
                <blockquote className="mt-4 text-2xl font-semibold leading-8 drop-shadow-[0_3px_8px_rgba(0,0,0,0.95)]">
                  {activeVerse?.text ||
                    "Today's encouragement will appear here soon."}
                </blockquote>
                {activeVerse?.reference ? (
                  <p className="mt-4 text-sm font-semibold text-amber-100 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]">
                    {activeVerse.reference}
                    {activeVerse.versionLabel || activeVerse.version ? (
                      <span className="ml-2">
                        ({activeVerse.versionLabel || activeVerse.version})
                      </span>
                    ) : null}
                  </p>
                ) : null}

                {dailyVerses.length > 1 ? (
                  <div className="mt-6 flex items-center justify-between gap-4">
                    <div className="flex gap-2">
                      {dailyVerses.map((verse: any, index: number) => (
                        <button
                          aria-label={`Show verse ${index + 1}`}
                          className={`h-2.5 rounded-full transition ${
                            index === safeActiveVerseIndex
                              ? 'w-8 bg-amber-200'
                              : 'w-2.5 bg-white/35'
                          }`}
                          key={verse.id || index}
                          type="button"
                          onClick={() => setActiveVerseIndex(index)}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        aria-label="Previous verse"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 transition hover:bg-white/20"
                        type="button"
                        onClick={showPreviousVerse}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        aria-label="Next verse"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 transition hover:bg-white/20"
                        type="button"
                        onClick={showNextVerse}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <BibleReader
            buttonClassName={bibleButtonClass}
            defaultReference={activeVerse?.reference}
            inputClassName={bibleInputClass}
            isNightMode={isNightMode}
            labelClassName={bibleLabelClass}
            panelClassName={panelClass}
          />
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className={panelClass}>
            <p className={sectionEyebrowClass}>
              Worship Times
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Join us this week</h2>
            <div className="mt-6 space-y-3">
              {serviceTimes.map((item: any, index: number) => (
                <div
                  className={itemCardClass}
                  key={item.id || index}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{item.label}</h3>
                      {item.location ? (
                        <p className={`mt-1 text-sm ${mutedTextClass}`}>
                          {item.location}
                        </p>
                      ) : null}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#e6f2ef] px-3 py-1.5 text-sm font-semibold text-[#163f34]">
                      <Clock3 size={14} />
                      {item.time}
                    </div>
                  </div>
                </div>
              ))}
              {serviceTimes.length === 0 ? (
                <p className={mutedTextClass}>Service times will appear here.</p>
              ) : null}
            </div>
          </div>

          <div className={panelClass}>
            <p className={sectionEyebrowClass}>
              Events
            </p>
            <h2 className="mt-3 text-3xl font-semibold">
              Upcoming announcements
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {events.map((event: any, index: number) => (
                <article
                  className={articleClass}
                  key={event.id || index}
                >
                  {event.imageUrl ? (
                    <img
                      alt=""
                      className="aspect-video w-full object-cover"
                      src={resolveMediaUrl(event.imageUrl)}
                    />
                  ) : null}
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1e6f87]">
                      <CalendarDays size={14} />
                      {[formatDate(event.date), event.time]
                        .filter(Boolean)
                        .join(' - ')}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold">{event.title}</h3>
                    {event.description ? (
                      <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                        {event.description}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
              {events.length === 0 ? (
                <p className={mutedTextClass}>Upcoming events will appear here.</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-12 sm:px-6 lg:grid-cols-[1fr_0.8fr] lg:px-8">
          <div className={panelClass}>
            <p className={sectionEyebrowClass}>
              Mass Programs
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Program schedule</h2>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {programs.map((program: any, index: number) => (
                <article
                  className={itemCardClass}
                  key={program.id || index}
                >
                  <h3 className="text-lg font-semibold">{program.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-[#1e6f87]">
                    {[program.day, program.time].filter(Boolean).join(' - ')}
                  </p>
                  {program.details ? (
                    <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
                      {program.details}
                    </p>
                  ) : null}
                </article>
              ))}
              {programs.length === 0 ? (
                <p className={mutedTextClass}>Programs will appear here.</p>
              ) : null}
            </div>
          </div>

          <aside className={officeClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-100">
              Church Office
            </p>
            <h2 className="mt-3 text-3xl font-semibold">Stay connected</h2>
            {page.contactNote ? (
              <p className="mt-4 leading-7 text-white/80">{page.contactNote}</p>
            ) : null}
            <div className="mt-6 space-y-3 text-sm">
              {church.contactPhone ? (
                <a
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3"
                  href={`tel:${church.contactPhone}`}
                >
                  <Phone size={16} />
                  {church.contactPhone}
                </a>
              ) : null}
              {church.contactEmail ? (
                <a
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3"
                  href={`mailto:${church.contactEmail}`}
                >
                  <Mail size={16} />
                  {church.contactEmail}
                </a>
              ) : null}
            </div>
          </aside>
        </section>

        {sermons.length > 0 ? (
          <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className={sectionEyebrowClass}>
                  Archive
                </p>
                <h2 className="mt-3 text-3xl font-semibold">
                  Past verses and messages
                </h2>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sermons.map((sermon: any, index: number) => (
                <article
                  className={sermonCardClass}
                  key={sermon.id || index}
                >
                  {sermon.imageUrl ? (
                    <img
                      alt=""
                      className="aspect-video w-full object-cover"
                      src={resolveMediaUrl(sermon.imageUrl)}
                    />
                  ) : null}
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1e6f87]">
                      <CalendarDays size={14} />
                      {formatDate(sermon.date) || 'Recent entry'}
                    </div>
                    <h3 className="mt-3 text-xl font-semibold">
                      {sermon.title}
                    </h3>
                    {sermon.speaker ? (
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          isNightMode ? 'text-stone-400' : 'text-stone-500'
                        }`}
                      >
                        {sermon.speaker}
                      </p>
                    ) : null}
                    {sermon.summary ? (
                      <p className={`mt-3 text-sm leading-6 ${mutedTextClass}`}>
                        {sermon.summary}
                      </p>
                    ) : null}
                    {sermon.mediaUrl ? (
                      <a
                        className={sermonButtonClass}
                        href={sermon.mediaUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <PlayCircle size={16} />
                        Open resource
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
