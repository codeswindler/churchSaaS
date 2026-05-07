import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  Eye,
  EyeOff,
  ImagePlus,
  Link as LinkIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api, { getSession } from '../../services/api';

const emptyForm = {
  isPublished: true,
  heroTitle: '',
  welcomeMessage: '',
  verseReference: '',
  verseText: '',
  dailyVerses: [] as any[],
  featuredImageUrl: '',
  serviceTimes: [] as any[],
  events: [] as any[],
  massPrograms: [] as any[],
  sermons: [] as any[],
  fundDisplays: [] as any[],
  galleryImages: [] as any[],
  contactNote: '',
};

const defaultGalleryImages = [
  {
    id: 'default_1',
    title: 'default_1',
    imageUrl: '/congregation-defaults/default_1.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_2',
    title: 'default_2',
    imageUrl: '/congregation-defaults/default_2.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_3',
    title: 'default_3',
    imageUrl: '/congregation-defaults/default_3.avif',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_4',
    title: 'default_4',
    imageUrl: '/congregation-defaults/default_4.jpg',
    isActive: true,
    isDefault: true,
  },
  {
    id: 'default_5',
    title: 'default_5',
    imageUrl: '/congregation-defaults/default_5.jpg',
    isActive: true,
    isDefault: true,
  },
];

function createId() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function createServiceTime() {
  return { id: createId(), label: '', time: '', location: '' };
}

function createEvent() {
  return {
    id: createId(),
    title: '',
    date: '',
    time: '',
    description: '',
    imageUrl: '',
  };
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function createDailyVerse() {
  return {
    id: createId(),
    date: getTodayInputDate(),
    reference: '',
    text: '',
  };
}

function createMassProgram() {
  return { id: createId(), title: '', day: '', time: '', details: '' };
}

function createSermon() {
  return {
    id: createId(),
    title: '',
    date: '',
    speaker: '',
    summary: '',
    mediaUrl: '',
    imageUrl: '',
  };
}

function createFundDisplay(fundAccountId = '') {
  return {
    id: createId(),
    title: '',
    description: '',
    fundAccountId,
    startDate: getTodayInputDate(),
    endMode: 'to_date',
    endDate: '',
    isActive: true,
  };
}

function createGalleryImage(imageUrl = '', title = '', isDefault = false) {
  return {
    id: isDefault ? `gallery-${createId()}` : createId(),
    title: getGalleryImageTitle({ imageUrl, title, isDefault }),
    imageUrl,
    isActive: true,
    isDefault,
  };
}

function getDefaultImageName(imageUrl?: string | null) {
  const filename = imageUrl?.split('/').pop() || '';
  const name = filename.replace(/\.(avif|jpe?g|png|webp)$/i, '');
  return /^default_\d+$/i.test(name) ? name : '';
}

function getGalleryImageTitle(item: {
  imageUrl?: string | null;
  title?: string | null;
  isDefault?: boolean | null;
}) {
  return getDefaultImageName(item.imageUrl) || item.title || 'Uploaded photo';
}

function normalizeGalleryImageTitle(item: any) {
  const defaultName = getDefaultImageName(item?.imageUrl);
  if (!defaultName) return item;
  return { ...item, title: defaultName, isDefault: true };
}

function normalizeForm(data: any) {
  const dailyVerses =
    data?.dailyVerses?.length > 0
      ? data.dailyVerses
      : data?.verseText
        ? [
            {
              id: createId(),
              date: getTodayInputDate(),
              reference: data.verseReference || '',
              text: data.verseText || '',
            },
          ]
        : [createDailyVerse()];

  return {
    ...emptyForm,
    ...data,
    isPublished: true,
    heroTitle: data?.heroTitle || '',
    welcomeMessage: data?.welcomeMessage || '',
    verseReference: data?.verseReference || '',
    verseText: data?.verseText || '',
    dailyVerses,
    featuredImageUrl: data?.featuredImageUrl || '',
    serviceTimes: data?.serviceTimes || [],
    events: data?.events || [],
    massPrograms: data?.massPrograms || [],
    sermons: data?.sermons || [],
    fundDisplays: data?.fundDisplays || [],
    galleryImages: (data?.galleryImages || []).map(normalizeGalleryImageTitle),
    contactNote: data?.contactNote || '',
  };
}

function buildSavePayload(form: typeof emptyForm) {
  const firstVerse = form.dailyVerses.find((item) => item.text);
  return {
    ...form,
    isPublished: true,
    verseReference: firstVerse?.reference || form.verseReference,
    verseText: firstVerse?.text || form.verseText,
    galleryImages: form.galleryImages.map(normalizeGalleryImageTitle),
  };
}

function resolveMediaUrl(value?: string | null) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value;
}

export default function ChurchCongregation() {
  const queryClient = useQueryClient();
  const session = getSession();
  const publicPath = session?.church?.slug ? `/c/${session.church.slug}` : '';
  const publicUrl =
    typeof window !== 'undefined' && publicPath
      ? `${window.location.origin}${publicPath}`
      : publicPath;
  const [form, setForm] = useState(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ['church-congregation-page'],
    queryFn: () =>
      api.get('/church/congregation-page').then((response) => response.data),
  });
  const { data: fundAccounts } = useQuery({
    queryKey: ['church-fund-accounts'],
    queryFn: () =>
      api.get('/church/fund-accounts').then((response) => response.data),
  });
  const activeFundAccounts = (fundAccounts || []).filter(
    (fundAccount: any) => fundAccount.isActive !== false,
  );

  useEffect(() => {
    if (data) {
      setForm(normalizeForm(data));
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch('/church/congregation-page', buildSavePayload(form)),
    onSuccess: (response) => {
      setForm(normalizeForm(response.data));
      toast.success('Sermons & announcements updated');
      queryClient.invalidateQueries({ queryKey: ['church-congregation-page'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          'Unable to update sermons & announcements',
      );
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      file,
      target,
      index,
    }: {
      file: File;
      target: 'featured' | 'event' | 'gallery' | 'sermon';
      index?: number;
    }) => {
      const payload = new FormData();
      payload.append('image', file);
      const response = await api.post(
        '/church/congregation-page/images',
        payload,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        },
      );
      return { imageUrl: response.data.imageUrl, target, index };
    },
    onSuccess: ({ imageUrl, target, index }) => {
      setForm((current) => {
        if (target === 'featured') {
          return { ...current, featuredImageUrl: imageUrl };
        }

        if (target === 'event' && typeof index === 'number') {
          const events = [...current.events];
          events[index] = { ...events[index], imageUrl };
          return { ...current, events };
        }

        if (target === 'sermon' && typeof index === 'number') {
          const sermons = [...current.sermons];
          sermons[index] = { ...sermons[index], imageUrl };
          return { ...current, sermons };
        }

        return {
          ...current,
          galleryImages: [
            ...current.galleryImages,
            createGalleryImage(imageUrl),
          ],
        };
      });
      toast.success('Image uploaded');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Unable to upload image');
    },
  });

  const pageSummary = useMemo(
    () => [
      { label: 'Service Times', value: form.serviceTimes.length },
      { label: 'Daily Verses', value: form.dailyVerses.length },
      { label: 'Events', value: form.events.length },
      { label: 'Programs', value: form.massPrograms.length },
      { label: 'Sermons', value: form.sermons.length },
      { label: 'Fund Displays', value: form.fundDisplays.length },
      { label: 'Gallery Images', value: form.galleryImages.length },
    ],
    [form],
  );

  const updateListItem = (
    key:
      | 'dailyVerses'
      | 'serviceTimes'
      | 'events'
      | 'massPrograms'
      | 'sermons'
      | 'fundDisplays'
      | 'galleryImages',
    index: number,
    field: string,
    value: unknown,
  ) => {
    setForm((current) => {
      const nextItems = [...current[key]];
      nextItems[index] = { ...nextItems[index], [field]: value };
      return { ...current, [key]: nextItems };
    });
  };

  const removeListItem = (
    key:
      | 'dailyVerses'
      | 'serviceTimes'
      | 'events'
      | 'massPrograms'
      | 'sermons'
      | 'fundDisplays'
      | 'galleryImages',
    index: number,
  ) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const uploadImage = (
    file: File | undefined,
    target: 'featured' | 'event' | 'gallery' | 'sermon',
    index?: number,
  ) => {
    if (!file) return;
    uploadMutation.mutate({ file, target, index });
  };

  const addDefaultGalleryImage = (
    image: (typeof defaultGalleryImages)[number],
  ) => {
    setForm((current) => {
      const alreadyAdded = current.galleryImages.some(
        (item) => item.imageUrl === image.imageUrl,
      );
      if (alreadyAdded) {
        return current;
      }

      return {
        ...current,
        galleryImages: [
          ...current.galleryImages,
          createGalleryImage(image.imageUrl, image.title, true),
        ],
      };
    });
  };

  const addAllDefaultGalleryImages = () => {
    setForm((current) => {
      const existingUrls = new Set(
        current.galleryImages.map((item) => item.imageUrl),
      );
      const nextDefaults = defaultGalleryImages
        .filter((image) => !existingUrls.has(image.imageUrl))
        .map((image) => createGalleryImage(image.imageUrl, image.title, true));

      if (nextDefaults.length === 0) {
        return current;
      }

      return {
        ...current,
        galleryImages: [...current.galleryImages, ...nextDefaults],
      };
    });
  };

  const toggleGalleryImageActive = (index: number) => {
    setForm((current) => {
      const galleryImages = [...current.galleryImages];
      galleryImages[index] = {
        ...galleryImages[index],
        isActive: galleryImages[index].isActive === false,
      };
      return { ...current, galleryImages };
    });
  };

  if (isLoading) {
    return <div className="panel p-6 text-stone-300">Loading page...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Sermons & Announcements
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Keep members updated
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-stone-300">
              Update daily scripture, sermons, announcements, worship times, and
              selected public photos for this church only.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            {publicPath ? (
              <a
                className="btn-secondary justify-center"
                href={publicPath}
                rel="noreferrer"
                target="_blank"
              >
                <Eye size={16} />
                Preview
              </a>
            ) : null}
            {publicUrl ? (
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(publicUrl);
                  toast.success('Public link copied');
                }}
              >
                <LinkIcon size={16} />
                Copy link
              </button>
            ) : null}
            <button
              className="btn-primary justify-center"
              disabled={saveMutation.isPending}
              type="button"
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save page'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {pageSummary.map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-white/10 bg-black/10 p-4"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
                {item.label}
              </p>
              <div className="mt-3 text-2xl font-semibold text-white">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <section className="panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Main Message
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Page introduction
                </h3>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                <Eye size={16} />
                Always published
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <div>
                <label className="label">Hero title</label>
                <input
                  className="input"
                  value={form.heroTitle}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      heroTitle: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">Welcome message</label>
                <textarea
                  className="input min-h-32"
                  value={form.welcomeMessage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      welcomeMessage: event.target.value,
                    }))
                  }
                />
              </div>
              <section className="rounded-3xl border border-white/10 bg-black/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                      Today&apos;s Word
                    </p>
                    <p className="mt-1 text-sm text-stone-300">
                      Add one or more verses for the day. The public page shows
                      them as a carousel.
                    </p>
                  </div>
                  <button
                    className="btn-secondary justify-center"
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        dailyVerses: [
                          ...current.dailyVerses,
                          createDailyVerse(),
                        ],
                      }))
                    }
                  >
                    <BookOpen size={16} />
                    Add verse
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {form.dailyVerses.map((item, index) => (
                    <div
                      key={item.id || index}
                      className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 md:grid-cols-[150px_190px_1fr_auto]"
                    >
                      {[
                        ['date', 'Date', 'date'],
                        ['reference', 'Reference', 'text'],
                        ['text', 'Verse text', 'text'],
                      ].map(([field, label, type]) => (
                        <div key={field}>
                          <label className="label-compact">{label}</label>
                          <input
                            className="input-compact mt-1.5"
                            type={type}
                            value={item[field] || ''}
                            onChange={(event) =>
                              updateListItem(
                                'dailyVerses',
                                index,
                                field,
                                event.target.value,
                              )
                            }
                          />
                        </div>
                      ))}
                      <button
                        aria-label="Remove verse"
                        className="btn-secondary self-end px-3 py-2"
                        type="button"
                        onClick={() => removeListItem('dailyVerses', index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Public Collections
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Fund account totals
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                disabled={activeFundAccounts.length === 0}
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    fundDisplays: [
                      ...current.fundDisplays,
                      createFundDisplay(activeFundAccounts[0]?.id || ''),
                    ],
                  }))
                }
              >
                <Plus size={16} />
                Add display
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {form.fundDisplays.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <label className="inline-flex items-center gap-3 text-sm font-semibold text-stone-200">
                      <input
                        checked={item.isActive !== false}
                        className="h-4 w-4 accent-emerald-300"
                        type="checkbox"
                        onChange={(event) =>
                          updateListItem(
                            'fundDisplays',
                            index,
                            'isActive',
                            event.target.checked,
                          )
                        }
                      />
                      Show on public page
                    </label>
                    <button
                      aria-label="Remove fund display"
                      className="btn-secondary self-start px-3 py-2"
                      type="button"
                      onClick={() => removeListItem('fundDisplays', index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
                    <div>
                      <label className="label-compact">Display title</label>
                      <input
                        className="input-compact mt-1.5"
                        placeholder="Tithe collections"
                        value={item.title || ''}
                        onChange={(event) =>
                          updateListItem(
                            'fundDisplays',
                            index,
                            'title',
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="label-compact">Fund account</label>
                      <select
                        className="input-compact mt-1.5"
                        value={item.fundAccountId || ''}
                        onChange={(event) =>
                          updateListItem(
                            'fundDisplays',
                            index,
                            'fundAccountId',
                            event.target.value,
                          )
                        }
                      >
                        <option value="">Select account</option>
                        {activeFundAccounts.map((fundAccount: any) => (
                          <option key={fundAccount.id} value={fundAccount.id}>
                            {fundAccount.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[180px_180px_180px]">
                    <div>
                      <label className="label-compact">Start date</label>
                      <input
                        className="input-compact mt-1.5"
                        type="date"
                        value={item.startDate || ''}
                        onChange={(event) =>
                          updateListItem(
                            'fundDisplays',
                            index,
                            'startDate',
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="label-compact">End mode</label>
                      <select
                        className="input-compact mt-1.5"
                        value={item.endMode || 'to_date'}
                        onChange={(event) =>
                          updateListItem(
                            'fundDisplays',
                            index,
                            'endMode',
                            event.target.value,
                          )
                        }
                      >
                        <option value="to_date">To date</option>
                        <option value="static">Fixed end date</option>
                      </select>
                    </div>
                    {item.endMode === 'static' ? (
                      <div>
                        <label className="label-compact">End date</label>
                        <input
                          className="input-compact mt-1.5"
                          type="date"
                          value={item.endDate || ''}
                          onChange={(event) =>
                            updateListItem(
                              'fundDisplays',
                              index,
                              'endDate',
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    <label className="label-compact">Public note</label>
                    <textarea
                      className="input-compact mt-1.5 min-h-20"
                      placeholder="Optional short context shown below the total."
                      value={item.description || ''}
                      onChange={(event) =>
                        updateListItem(
                          'fundDisplays',
                          index,
                          'description',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              ))}
              {form.fundDisplays.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-black/10 p-4 text-sm text-stone-400">
                  Add a public collection display when you want members to see a
                  fund account total for a selected timeframe.
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Worship Times
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Services and meetings
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    serviceTimes: [
                      ...current.serviceTimes,
                      createServiceTime(),
                    ],
                  }))
                }
              >
                <Plus size={16} />
                Add time
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {form.serviceTimes.map((item, index) => (
                <div
                  key={item.id || index}
                  className="grid gap-3 rounded-3xl border border-white/10 bg-black/10 p-4 md:grid-cols-[1fr_0.7fr_1fr_auto]"
                >
                  {[
                    ['label', 'Label'],
                    ['time', 'Time'],
                    ['location', 'Location'],
                  ].map(([field, label]) => (
                    <div key={field}>
                      <label className="label-compact">{label}</label>
                      <input
                        className="input-compact mt-1.5"
                        value={item[field] || ''}
                        onChange={(event) =>
                          updateListItem(
                            'serviceTimes',
                            index,
                            field,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  ))}
                  <button
                    aria-label="Remove service time"
                    className="btn-secondary self-end px-3 py-2"
                    type="button"
                    onClick={() => removeListItem('serviceTimes', index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Events
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Upcoming announcements
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    events: [...current.events, createEvent()],
                  }))
                }
              >
                <CalendarDays size={16} />
                Add event
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {form.events.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[1fr_180px_160px_auto]">
                    {[
                      ['title', 'Title', 'text'],
                      ['date', 'Date', 'date'],
                      ['time', 'Time', 'text'],
                    ].map(([field, label, type]) => (
                      <div key={field}>
                        <label className="label-compact">{label}</label>
                        <input
                          className="input-compact mt-1.5"
                          type={type}
                          value={item[field] || ''}
                          onChange={(event) =>
                            updateListItem(
                              'events',
                              index,
                              field,
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      aria-label="Remove event"
                      className="btn-secondary self-end px-3 py-2"
                      type="button"
                      onClick={() => removeListItem('events', index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                    <div>
                      <label className="label-compact">Description</label>
                      <textarea
                        className="input-compact mt-1.5 min-h-24"
                        value={item.description || ''}
                        onChange={(event) =>
                          updateListItem(
                            'events',
                            index,
                            'description',
                            event.target.value,
                          )
                        }
                      />
                    </div>
                    <div>
                      <label className="label-compact">Event image</label>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        className="input-compact mt-1.5"
                        type="file"
                        onChange={(event) => {
                          uploadImage(event.target.files?.[0], 'event', index);
                          event.target.value = '';
                        }}
                      />
                      {item.imageUrl ? (
                        <img
                          alt=""
                          className="mt-3 h-24 w-full rounded-2xl object-cover"
                          src={resolveMediaUrl(item.imageUrl)}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Mass Programs
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Public program schedule
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    massPrograms: [
                      ...current.massPrograms,
                      createMassProgram(),
                    ],
                  }))
                }
              >
                <Plus size={16} />
                Add program
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {form.massPrograms.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[1fr_150px_150px_auto]">
                    {[
                      ['title', 'Title'],
                      ['day', 'Day'],
                      ['time', 'Time'],
                    ].map(([field, label]) => (
                      <div key={field}>
                        <label className="label-compact">{label}</label>
                        <input
                          className="input-compact mt-1.5"
                          value={item[field] || ''}
                          onChange={(event) =>
                            updateListItem(
                              'massPrograms',
                              index,
                              field,
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      aria-label="Remove program"
                      className="btn-secondary self-end px-3 py-2"
                      type="button"
                      onClick={() => removeListItem('massPrograms', index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-3">
                    <label className="label-compact">Details</label>
                    <textarea
                      className="input-compact mt-1.5 min-h-24"
                      value={item.details || ''}
                      onChange={(event) =>
                        updateListItem(
                          'massPrograms',
                          index,
                          'details',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Sermons
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  Past sermon library
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    sermons: [...current.sermons, createSermon()],
                  }))
                }
              >
                <BookOpen size={16} />
                Add sermon
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {form.sermons.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-3xl border border-white/10 bg-black/10 p-4"
                >
                  <div className="grid gap-3 md:grid-cols-[1fr_150px_180px_auto]">
                    {[
                      ['title', 'Title', 'text'],
                      ['date', 'Date', 'date'],
                      ['speaker', 'Speaker', 'text'],
                    ].map(([field, label, type]) => (
                      <div key={field}>
                        <label className="label-compact">{label}</label>
                        <input
                          className="input-compact mt-1.5"
                          type={type}
                          value={item[field] || ''}
                          onChange={(event) =>
                            updateListItem(
                              'sermons',
                              index,
                              field,
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      aria-label="Remove sermon"
                      className="btn-secondary self-end px-3 py-2"
                      type="button"
                      onClick={() => removeListItem('sermons', index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
                    <div className="space-y-3">
                      <div>
                        <label className="label-compact">Sermon summary</label>
                        <textarea
                          className="input-compact mt-1.5 min-h-24"
                          value={item.summary || ''}
                          onChange={(event) =>
                            updateListItem(
                              'sermons',
                              index,
                              'summary',
                              event.target.value,
                            )
                          }
                        />
                      </div>
                      <div>
                        <label className="label-compact">
                          Audio, video, or notes link
                        </label>
                        <input
                          className="input-compact mt-1.5"
                          value={item.mediaUrl || ''}
                          onChange={(event) =>
                            updateListItem(
                              'sermons',
                              index,
                              'mediaUrl',
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label-compact">Sermon image</label>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        className="input-compact mt-1.5"
                        type="file"
                        onChange={(event) => {
                          uploadImage(event.target.files?.[0], 'sermon', index);
                          event.target.value = '';
                        }}
                      />
                      {item.imageUrl ? (
                        <img
                          alt=""
                          className="mt-3 h-28 w-full rounded-2xl object-cover"
                          src={resolveMediaUrl(item.imageUrl)}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Featured Image
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Public page cover
            </h3>
            <input
              accept="image/png,image/jpeg,image/webp"
              className="input mt-5"
              type="file"
              onChange={(event) => {
                uploadImage(event.target.files?.[0], 'featured');
                event.target.value = '';
              }}
            />
            {form.featuredImageUrl ? (
              <img
                alt=""
                className="mt-4 aspect-[4/3] w-full rounded-3xl object-cover"
                src={resolveMediaUrl(form.featuredImageUrl)}
              />
            ) : (
              <div className="mt-4 flex aspect-[4/3] items-center justify-center rounded-3xl border border-white/10 bg-black/10 text-stone-400">
                <ImagePlus size={28} />
              </div>
            )}
          </section>

          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Gallery
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Public photos
                </h3>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary px-3 py-2 text-xs"
                  type="button"
                  onClick={addAllDefaultGalleryImages}
                >
                  <Plus size={15} />
                  Defaults
                </button>
                <label className="btn-secondary cursor-pointer px-3 py-2">
                  <ImagePlus size={16} />
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    type="file"
                    onChange={(event) => {
                      uploadImage(event.target.files?.[0], 'gallery');
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {form.galleryImages.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-4 text-sm leading-6 text-stone-300">
                  Add a default image or upload a church photo. Only active
                  images appear on the public page.
                </div>
              ) : null}
              {form.galleryImages.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-3xl border border-white/10 bg-black/10 p-3"
                >
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#10251f]">
                    <img
                      alt=""
                      className={`aspect-video w-full object-cover transition ${
                        item.isActive === false ? 'opacity-45 grayscale' : ''
                      }`}
                      src={resolveMediaUrl(item.imageUrl)}
                    />
                    <span
                      className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                        item.isActive === false
                          ? 'bg-stone-900/75 text-stone-300'
                          : 'bg-emerald-500/90 text-white'
                      }`}
                    >
                      {item.isActive === false ? 'Inactive' : 'Active'}
                    </span>
                    {item.isDefault ? (
                      <span className="absolute right-3 top-3 rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-950">
                        Default
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white">
                      {getGalleryImageTitle(item)}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <button
                        className="btn-secondary justify-center px-3 py-2 text-xs"
                        type="button"
                        onClick={() => toggleGalleryImageActive(index)}
                      >
                        {item.isActive === false ? (
                          <Eye size={15} />
                        ) : (
                          <EyeOff size={15} />
                        )}
                        {item.isActive === false ? 'Activate' : 'Deactivate'}
                      </button>
                      <button
                        aria-label="Remove gallery image"
                        className="btn-secondary px-3 py-2"
                        type="button"
                        onClick={() => removeListItem('galleryImages', index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">
                    Default library
                  </p>
                  <p className="mt-1 text-sm text-stone-300">
                    Built-in images for pages without uploaded photos.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                {defaultGalleryImages.map((image) => {
                  const alreadyAdded = form.galleryImages.some(
                    (item) => item.imageUrl === image.imageUrl,
                  );
                  return (
                    <div
                      className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5"
                      key={image.id}
                    >
                      <img
                        alt=""
                        className="aspect-[4/3] w-full rounded-xl bg-[#10251f] object-cover"
                        src={image.imageUrl}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">
                          {image.title}
                        </p>
                        <p className="mt-1 text-xs text-stone-400">
                          Default image
                        </p>
                      </div>
                      <button
                        className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={alreadyAdded}
                        type="button"
                        onClick={() => addDefaultGalleryImage(image)}
                      >
                        {alreadyAdded ? 'Added' : 'Use'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Contact Note
            </p>
            <textarea
              className="input mt-4 min-h-32"
              value={form.contactNote}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  contactNote: event.target.value,
                }))
              }
            />
          </section>
        </aside>
      </section>
    </div>
  );
}
