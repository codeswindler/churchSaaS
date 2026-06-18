export interface MobileFundAccountDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface MobileFundAccountsResponseDto {
  fundAccounts: MobileFundAccountDto[];
}
