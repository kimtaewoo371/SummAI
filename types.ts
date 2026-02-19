export interface ActionItem {
  task: string;
  owner: string;
  deadline: string;
}

export interface AnalysisResult {
  executive_summary: string;
  action_items: ActionItem[];
  suggested_reply: string;
  resultText?: string;
  outputLength?: number;
}

// ✅ 'payment' step 추가
export type AppStep = 'input' | 'processing' | 'result' | 'login' | 'recharge' | 'payment';

export interface UserState {
  isLoggedIn: boolean;
  usageCount: number;
  email?: string;
  userId?: string;
  isPro?: boolean; // ✅ 구독 상태 추가
}