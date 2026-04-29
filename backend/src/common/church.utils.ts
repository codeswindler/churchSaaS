export interface ChurchSmsConfig {
  churchId?: string | null;
  smsPartnerId?: string | null;
  smsApiKey?: string | null;
  smsShortcode?: string | null;
  smsShortcodes?: string[] | null;
  smsBaseUrl?: string | null;
}

export interface ChurchMpesaConfig {
  mpesaEnvironment?: string | null;
  mpesaConsumerKey?: string | null;
  mpesaConsumerSecret?: string | null;
  mpesaPasskey?: string | null;
  mpesaShortcode?: string | null;
  mpesaCallbackUrl?: string | null;
}

export interface ChurchIdentity {
  id: string;
  name: string;
  slug: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export function sanitizeChurchForTenant(church: ChurchIdentity | null) {
  if (!church) {
    return null;
  }

  return {
    id: church.id,
    name: church.name,
    slug: church.slug,
    contactEmail: church.contactEmail ?? null,
    contactPhone: church.contactPhone ?? null,
    logoUrl: church.logoUrl ?? null,
    address: church.address ?? null,
    notes: church.notes ?? null,
    status: church.status ?? null,
    createdAt: church.createdAt,
    updatedAt: church.updatedAt,
  };
}

export function hasConfiguredSmsCredentials(church: ChurchSmsConfig | null) {
  return Boolean(
    church?.smsPartnerId && church?.smsApiKey && church?.smsShortcode,
  );
}

export function getChurchSmsShortcodes(church: ChurchSmsConfig | null) {
  const values = [
    church?.smsShortcode,
    ...(Array.isArray(church?.smsShortcodes) ? church?.smsShortcodes || [] : []),
  ];
  const normalized = values
    .map((value) => `${value || ''}`.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function getConfiguredMpesaCallbackUrl(
  church: ChurchMpesaConfig | null,
) {
  return church?.mpesaCallbackUrl || process.env.MPESA_CALLBACK_URL || null;
}

export function hasConfiguredMpesaCredentials(
  church: ChurchMpesaConfig | null,
) {
  return Boolean(
    church?.mpesaConsumerKey &&
    church?.mpesaConsumerSecret &&
    church?.mpesaPasskey &&
    church?.mpesaShortcode &&
    getConfiguredMpesaCallbackUrl(church),
  );
}

export function hasConfiguredMpesaC2B(church: ChurchMpesaConfig | null) {
  return Boolean(
    church?.mpesaShortcode && getConfiguredMpesaCallbackUrl(church),
  );
}

export function buildChurchIntegrationSummary(
  church: ChurchSmsConfig & ChurchMpesaConfig,
) {
  const mpesaC2bConfigured = hasConfiguredMpesaC2B(church);
  const mpesaStkConfigured = hasConfiguredMpesaCredentials(church);

  return {
    smsConfigured: hasConfiguredSmsCredentials(church),
    smsShortcode: church.smsShortcode ?? null,
    smsShortcodes: getChurchSmsShortcodes(church),
    smsBaseUrl: church.smsBaseUrl ?? null,
    mpesaConfigured: mpesaC2bConfigured,
    mpesaC2bConfigured,
    mpesaStkConfigured,
    mpesaEnvironment: church.mpesaEnvironment ?? null,
    mpesaShortcode: church.mpesaShortcode ?? null,
    mpesaCallbackUrl: getConfiguredMpesaCallbackUrl(church),
  };
}
