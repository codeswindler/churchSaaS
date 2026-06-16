import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Eye,
  ImagePlus,
  Link as LinkIcon,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BibleSelector,
  getBibleVersionLabel,
  type SelectedBibleVerse,
} from '../../components/BibleSelector';
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
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 10);
}

function toInputDate(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function isPastInputDate(value?: string | null) {
  const date = toInputDate(value);
  return Boolean(date && date < getTodayInputDate());
}

function createDailyVerse(date = getTodayInputDate()) {
  return {
    id: createId(),
    date,
    reference: '',
    version: 'kjv',
    versionLabel: 'KJV',
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
    approvalStatus: null,
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
              version: 'kjv',
              versionLabel: 'KJV',
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
  const isPriest = session?.user?.role === 'priest' || session?.user?.role === 'church_admin';
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
      toast.success('Verses & announcements updated');
      queryClient.invalidateQueries({ queryKey: ['church-congregation-page'] });
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message ||
          'Unable to update verses & announcements',
      );
    },
  });

  const reviewFundDisplayMutation = useMutation({
    mutationFn: ({
      displayId,
      action,
    }: {
      displayId: string;
      action: 'approve' | 'reject';
    }) =>
      api
        .post(`/church/congregation-page/fund-displays/${displayId}/${action}`)
        .then((response) => response.data),
    onSuccess: (data, variables) => {
      setForm(normalizeForm(data));
      queryClient.invalidateQueries({ queryKey: ['church-congregation-page'] });
      queryClient.invalidateQueries({ queryKey: ['church-notifications'] });
      toast.success(
        variables.action === 'approve'
          ? 'Fund display approved'
          : 'Fund display rejected',
      );
    },
    onError: (error: any) => {
      toast.error(
        error?.response?.data?.message || 'Unable to review fund display',
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

  const currentDailyVerses = useMemo(
    () =>
      form.dailyVerses
        .map((item, index) => ({ ...item, originalIndex: index }))
        .filter((item) => !isPastInputDate(item.date)),
    [form.dailyVerses],
  );

  const pageSummary = useMemo(
    () => [
      { label: 'Service Times', value: form.serviceTimes.length },
      { label: 'Current Verses', value: currentDailyVerses.length },
      { label: 'Events', value: form.events.length },
      { label: 'Programs', value: form.massPrograms.length },
      { label: 'Fund Displays', value: form.fundDisplays.length },
      { label: 'Gallery Images', value: form.galleryImages.length },
    ],
    [form, currentDailyVerses.length],
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

  const applyBibleVerse = (
    index: number,
    selectedVerse: SelectedBibleVerse,
  ) => {
    setForm((current) => {
      const dailyVerses = [...current.dailyVerses];
      dailyVerses[index] = {
        ...dailyVerses[index],
        reference: selectedVerse.reference,
        version: selectedVerse.version,
        versionLabel: selectedVerse.versionLabel,
        text: selectedVerse.text || dailyVerses[index]?.text || '',
      };
      return { ...current, dailyVerses };
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

  const useDefaultGalleryImageAsCover = (
    image: (typeof defaultGalleryImages)[number],
  ) => {
    setForm((current) => {
      return {
        ...current,
        featuredImageUrl: image.imageUrl,
      };
    });
  };

  const toggleDefaultGalleryImageUse = (
    image: (typeof defaultGalleryImages)[number],
  ) => {
    setForm((current) => {
      const existingIndex = current.galleryImages.findIndex(
        (item) => item.imageUrl === image.imageUrl,
      );

      if (existingIndex === -1) {
        return {
          ...current,
          galleryImages: [
            ...current.galleryImages,
            createGalleryImage(image.imageUrl, image.title, true),
          ],
        };
      }

      const galleryImages = [...current.galleryImages];
      galleryImages[existingIndex] = {
        ...galleryImages[existingIndex],
        isActive: galleryImages[existingIndex].isActive === false,
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
              Verses & Announcements
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              Keep members updated
            </h3>
            <p className="mt-2 max-w-3xl text-sm text-stone-300">
              Update daily scripture, announcements, worship times, and selected
              public photos for this church only.
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
                  {currentDailyVerses.map((item) => (
                    <div
                      key={item.id || item.originalIndex}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="w-full max-w-xs">
                          <label className="label-compact">Date</label>
                          <input
                            className="input-compact mt-1.5"
                            type="date"
                            value={item.date || ''}
                            onChange={(event) =>
                              updateListItem(
                                'dailyVerses',
                                item.originalIndex,
                                'date',
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <button
                          aria-label="Remove verse"
                          className="btn-secondary justify-center px-3 py-2"
                          type="button"
                          onClick={() =>
                            removeListItem('dailyVerses', item.originalIndex)
                          }
                        >
                          <Trash2 size={16} />
                          Remove
                        </button>
                      </div>

                      <BibleSelector
                        className="mt-4"
                        defaultReference={item.reference}
                        defaultVersion={item.version}
                        onSelect={(selectedVerse) =>
                          applyBibleVerse(item.originalIndex, selectedVerse)
                        }
                      />

                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                            Selected verse
                          </p>
                          <p className="text-sm font-semibold text-amber-200">
                            {item.reference
                              ? `${item.reference} (${item.versionLabel || getBibleVersionLabel(item.version)})`
                              : 'Choose a verse above'}
                          </p>
                        </div>
                        <textarea
                          className="input mt-3 min-h-24 resize-y"
                          value={item.text || ''}
                          onChange={(event) =>
                            updateListItem(
                              'dailyVerses',
                              item.originalIndex,
                              'text',
                              event.target.value,
                            )
                          }
                          placeholder="Verse text appears here. You can also paste text from a Bible source your church is licensed to use."
                        />
                      </div>
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
                    <div className="space-y-2">
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
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                          (item.approvalStatus || 'approved') === 'pending'
                            ? 'border-amber-200/40 text-amber-100'
                            : (item.approvalStatus || 'approved') === 'rejected'
                              ? 'border-rose-200/40 text-rose-100'
                              : 'border-emerald-200/30 text-emerald-100'
                        }`}
                      >
                        {(item.approvalStatus || 'approved') === 'pending'
                          ? 'Pending priest approval'
                          : (item.approvalStatus || 'approved') === 'rejected'
                            ? 'Rejected'
                            : 'Approved'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isPriest &&
                      item.id &&
                      (item.approvalStatus || 'approved') === 'pending' ? (
                        <>
                          <button
                            className="btn-primary px-3 py-2"
                            disabled={reviewFundDisplayMutation.isPending}
                            type="button"
                            onClick={() =>
                              reviewFundDisplayMutation.mutate({
                                displayId: item.id,
                                action: 'approve',
                              })
                            }
                          >
                            <CheckCircle2 size={16} />
                            Approve
                          </button>
                          <button
                            className="btn-secondary px-3 py-2"
                            disabled={reviewFundDisplayMutation.isPending}
                            type="button"
                            onClick={() =>
                              reviewFundDisplayMutation.mutate({
                                displayId: item.id,
                                action: 'reject',
                              })
                            }
                          >
                            <XCircle size={16} />
                            Reject
                          </button>
                        </>
                      ) : null}
                      <button
                        aria-label="Remove fund display"
                        className="btn-secondary self-start px-3 py-2"
                        type="button"
                        onClick={() => removeListItem('fundDisplays', index)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
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

        </div>

        <aside className="space-y-5">
          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Visual Assets
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Public page images
                </h3>
              </div>
              <label className="btn-secondary cursor-pointer px-3 py-2 text-xs">
                <ImagePlus size={15} />
                Upload
                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  type="file"
                  onChange={(event) => {
                    uploadImage(event.target.files?.[0], 'featured');
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/10 p-3">
              <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3">
                {form.featuredImageUrl ? (
                  <img
                    alt=""
                    className="aspect-[4/3] w-full rounded-xl bg-[#10251f] object-cover"
                    src={resolveMediaUrl(form.featuredImageUrl)}
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-white/5 text-stone-400">
                    <ImagePlus size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Current cover
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-400">
                    Use a default below or upload a cover image.
                  </p>
                </div>
              </div>
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
                  const galleryImage = form.galleryImages.find(
                    (item) => item.imageUrl === image.imageUrl,
                  );
                  const isCover = form.featuredImageUrl === image.imageUrl;
                  const isActiveGalleryImage =
                    galleryImage && galleryImage.isActive !== false;
                  return (
                    <div
                      className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5"
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
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        <button
                          className={`btn-secondary justify-center px-3 py-2 text-xs ${
                            isCover ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100' : ''
                          }`}
                          type="button"
                          onClick={() => useDefaultGalleryImageAsCover(image)}
                        >
                          {isCover ? 'Cover' : 'Use cover'}
                        </button>
                        <button
                          className={`btn-secondary justify-center px-3 py-2 text-xs ${
                            isActiveGalleryImage
                              ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-100'
                              : ''
                          }`}
                          type="button"
                          onClick={() => toggleDefaultGalleryImageUse(image)}
                        >
                          {isActiveGalleryImage ? 'In gallery' : 'Use gallery'}
                        </button>
                      </div>
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
