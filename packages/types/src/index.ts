export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
  accountId: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface LeadDTO {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  stageId: string;
  dealValue: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
