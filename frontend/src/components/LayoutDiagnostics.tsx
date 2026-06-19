import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

const desktopLandscapeQuery =
  '(min-width: 1024px) and (max-width: 1279px) and (orientation: landscape)';

const touchTabletLandscapeQuery =
  '(min-width: 480px) and (max-width: 1366px) and (orientation: landscape) and (hover: none) and (pointer: coarse) and (min-device-height: 600px)';

const compactLandscapeQuery = `${desktopLandscapeQuery}, ${touchTabletLandscapeQuery}`;

const tabletDensityQuery =
  '(min-width: 960px) and (max-width: 1100px) and (orientation: landscape) and (hover: none) and (pointer: coarse) and (min-device-height: 600px)';

const shortLandscapeTabletQuery =
  '(min-width: 480px) and (max-width: 1366px) and (orientation: landscape) and (hover: none) and (pointer: coarse) and (max-height: 560px)';

interface ElementSnapshot {
  display: string;
  visibility: string;
  gridTemplateColumns: string;
  flexDirection: string;
  gap: string;
  padding: string;
  width: number;
  height: number;
  left: number;
  top: number;
}

interface DiagnosticsReport {
  timestamp: string;
  href: string;
  classification: string;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  viewport: {
    innerWidth: number;
    innerHeight: number;
    outerWidth: number;
    outerHeight: number;
    devicePixelRatio: number;
    visualViewportWidth: number | null;
    visualViewportHeight: number | null;
    visualViewportScale: number | null;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    orientationType: string | null;
    orientationAngle: number | null;
  };
  media: Record<string, boolean>;
  layout: {
    rootFontSize: string;
    rootFontSizeExpected: string;
    bodyClientWidth: number;
    bodyScrollWidth: number;
    documentClientWidth: number;
    documentScrollWidth: number;
    hasHorizontalOverflow: boolean;
    appShellPresent: boolean;
    outsideAppShell: boolean;
    appShellGrid: ElementSnapshot | null;
    desktopSidebar: ElementSnapshot | null;
    mobileShellBar: ElementSnapshot | null;
  };
  queries: {
    compactLandscapeQuery: string;
    desktopLandscapeQuery: string;
    shortLandscapeTabletQuery: string;
    touchTabletLandscapeQuery: string;
    tabletDensityQuery: string;
  };
}

function mediaMatches(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(query).matches;
}

function snapshotElement(selector: string): ElementSnapshot | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const element = document.querySelector<HTMLElement>(selector);

  if (!element) {
    return null;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return {
    display: style.display,
    visibility: style.visibility,
    gridTemplateColumns: style.gridTemplateColumns,
    flexDirection: style.flexDirection,
    gap: style.gap,
    padding: style.padding,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    top: Math.round(rect.top),
  };
}

function classifyDevice() {
  const isShortLandscapeTablet = mediaMatches(shortLandscapeTabletQuery);
  const isTabletDensity = mediaMatches(tabletDensityQuery);
  const isCompactLandscape = mediaMatches(compactLandscapeQuery);
  const isDesktopWide = mediaMatches('(min-width: 1280px)');
  const isTouchFirst = mediaMatches('(hover: none) and (pointer: coarse)');
  const isLandscape = mediaMatches('(orientation: landscape)');
  const isTabletHeight = mediaMatches('(min-device-height: 600px)');
  const isPhoneWidth = mediaMatches('(max-width: 640px)');

  if (isTabletDensity) {
    return 'compact-tablet-density-active';
  }

  if (isShortLandscapeTablet && isCompactLandscape) {
    return 'compact-short-landscape-active';
  }

  if (isCompactLandscape) {
    return 'compact-landscape-layout-active';
  }

  if (isDesktopWide) {
    return 'desktop-wide-layout-active';
  }

  if (isTouchFirst && isLandscape && isTabletHeight) {
    return 'tablet-candidate-missed-compact-layout';
  }

  if (isTouchFirst && isPhoneWidth) {
    return 'phone-touch-layout';
  }

  return 'compact-or-unknown-layout';
}

function expectedRootFontSize() {
  if (mediaMatches(tabletDensityQuery)) {
    return '10.8px (75% tablet density)';
  }

  if (mediaMatches('(min-width: 1024px)')) {
    return '14.4px';
  }

  if (mediaMatches('(min-width: 641px)')) {
    return '15.04px';
  }

  return '15.36px';
}

function collectDiagnostics(): DiagnosticsReport {
  const visualViewport = window.visualViewport;
  const screenOrientation = window.screen.orientation;
  const rootStyle = window.getComputedStyle(document.documentElement);
  const documentElement = document.documentElement;
  const appShellGrid = snapshotElement('.app-shell-grid');
  const desktopSidebar = snapshotElement('.desktop-sidebar');
  const mobileShellBar = snapshotElement('.mobile-shell-bar');
  const appShellPresent = Boolean(appShellGrid);

  return {
    timestamp: new Date().toISOString(),
    href: window.location.href,
    classification: classifyDevice(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportWidth: visualViewport?.width ?? null,
      visualViewportHeight: visualViewport?.height ?? null,
      visualViewportScale: visualViewport?.scale ?? null,
    },
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      orientationType: screenOrientation?.type ?? null,
      orientationAngle: screenOrientation?.angle ?? null,
    },
    media: {
      compactLandscape: mediaMatches(compactLandscapeQuery),
      desktopLandscape: mediaMatches(desktopLandscapeQuery),
      shortLandscapeTablet: mediaMatches(shortLandscapeTabletQuery),
      touchTabletLandscape: mediaMatches(touchTabletLandscapeQuery),
      tabletDensity: mediaMatches(tabletDensityQuery),
      tailwindXlDesktop: mediaMatches('(min-width: 1280px)'),
      portrait: mediaMatches('(orientation: portrait)'),
      landscape: mediaMatches('(orientation: landscape)'),
      hoverNone: mediaMatches('(hover: none)'),
      hoverHover: mediaMatches('(hover: hover)'),
      pointerCoarse: mediaMatches('(pointer: coarse)'),
      pointerFine: mediaMatches('(pointer: fine)'),
      anyPointerCoarse: mediaMatches('(any-pointer: coarse)'),
      anyPointerFine: mediaMatches('(any-pointer: fine)'),
      maxHeight560: mediaMatches('(max-height: 560px)'),
      minDeviceHeight600: mediaMatches('(min-device-height: 600px)'),
      minWidth480: mediaMatches('(min-width: 480px)'),
      minWidth640: mediaMatches('(min-width: 640px)'),
      minWidth800: mediaMatches('(min-width: 800px)'),
      minWidth1024: mediaMatches('(min-width: 1024px)'),
    },
    layout: {
      rootFontSize: rootStyle.fontSize,
      rootFontSizeExpected: expectedRootFontSize(),
      bodyClientWidth: document.body.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      documentScrollWidth: documentElement.scrollWidth,
      hasHorizontalOverflow:
        documentElement.scrollWidth > documentElement.clientWidth ||
        document.body.scrollWidth > document.body.clientWidth,
      appShellPresent,
      outsideAppShell: !appShellPresent,
      appShellGrid,
      desktopSidebar,
      mobileShellBar,
    },
    queries: {
      compactLandscapeQuery,
      desktopLandscapeQuery,
      shortLandscapeTabletQuery,
      touchTabletLandscapeQuery,
      tabletDensityQuery,
    },
  };
}

function useDiagnosticsReport(enabled = true) {
  const [report, setReport] = useState<DiagnosticsReport | null>(() =>
    typeof window === 'undefined' || !enabled ? null : collectDiagnostics(),
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const update = () => setReport(collectDiagnostics());

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);

    const intervalId = window.setInterval(update, 1500);

    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  return report;
}

function ReportBlock({ report }: { report: DiagnosticsReport }) {
  const formattedReport = useMemo(() => JSON.stringify(report, null, 2), [report]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formattedReport);
      toast.success('Layout report copied');
    } catch {
      toast.error('Copy failed. Select the report text manually.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Mode</p>
          <p className="mt-2 break-words text-lg font-semibold text-amber-100">
            {report.classification}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Viewport</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {report.viewport?.innerWidth} × {report.viewport?.innerHeight}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            visual {Math.round(report.viewport?.visualViewportWidth || 0)} ×{' '}
            {Math.round(report.viewport?.visualViewportHeight || 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Screen</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {report.screen?.width} × {report.screen?.height}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Input</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {report.media?.pointerCoarse ? 'coarse' : 'not coarse'} /{' '}
            {report.media?.hoverNone ? 'no hover' : 'hover'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Shell</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {report.layout.appShellPresent ? 'inside AppShell' : 'outside AppShell'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-stone-400">Root font</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {report.layout.rootFontSize}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            expected {report.layout.rootFontSizeExpected}
          </p>
        </div>
      </div>

      <button
        className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-emerald-950 shadow-lg shadow-black/30"
        type="button"
        onClick={copyReport}
      >
        Copy layout report
      </button>

      <pre className="max-h-[60vh] overflow-auto rounded-3xl border border-white/10 bg-black/40 p-4 text-xs leading-relaxed text-emerald-50">
        {formattedReport}
      </pre>
    </div>
  );
}

export function LayoutDiagnosticsPage() {
  const report = useDiagnosticsReport();

  if (!report) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#071812] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200">
            Choice Networks
          </p>
          <h1 className="mt-3 text-3xl font-bold">Layout diagnostics</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
            Open this on the problem tablet, keep Chrome at 100%, then copy the
            report. For the most useful app-layout reading, open an authenticated
            page like <code>/church/dashboard?layoutDebug=1</code>.
          </p>
        </div>

        <ReportBlock report={report} />
      </div>
    </main>
  );
}

export function LayoutDiagnosticsOverlay() {
  const location = useLocation();
  const enabled = new URLSearchParams(location.search).has('layoutDebug');
  const report = useDiagnosticsReport(enabled);
  const [isExpanded, setIsExpanded] = useState(false);
  const formattedReport = useMemo(
    () => (report ? JSON.stringify(report, null, 2) : ''),
    [report],
  );

  if (!enabled || !report) {
    return null;
  }

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(formattedReport);
      toast.success('Layout report copied');
    } catch {
      toast.error('Copy failed. Open the full report to select it manually.');
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100000] rounded-2xl border border-amber-200/30 bg-[#071812]/95 p-3 text-white shadow-2xl backdrop-blur sm:right-auto sm:w-[min(34rem,calc(100vw-1.5rem))]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.25em] text-amber-200">
            Layout debug
          </p>
          <p className="mt-1 truncate text-sm font-semibold">
            {report.classification} · {report.viewport.innerWidth} ×{' '}
            {report.viewport.innerHeight} · root {report.layout.rootFontSize}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-amber-100"
            type="button"
            onClick={copyReport}
          >
            Copy
          </button>
          <button
            aria-expanded={isExpanded}
            className="rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-amber-100"
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? 'Hide' : 'Details'}
          </button>
          <a
            className="hidden rounded-full border border-white/15 px-3 py-2 text-xs font-bold text-amber-100 sm:inline-flex"
            href="/layout-diagnostics"
            target="_blank"
            rel="noreferrer"
          >
            Full page
          </a>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-3 max-h-[62vh] overflow-auto border-t border-white/10 pt-3">
          <ReportBlock report={report} />
        </div>
      ) : null}
    </div>
  );
}
