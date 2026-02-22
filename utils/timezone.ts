// src/utils/timezone.ts
// 타임존 관련 유틸리티 함수

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * 사용자의 브라우저 타임존 가져오기
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * IP 기반 타임존 자동 감지 (무료 API 사용)
 */
export async function detectTimezoneFromIP(): Promise<string | null> {
  try {
    // 무료 IP 기반 위치 API 사용
    const response = await fetch('https://ipapi.co/json/', {
      signal: AbortSignal.timeout(3000) // 3초 타임아웃
    });
    
    if (!response.ok) throw new Error('IP detection failed');
    
    const data = await response.json();
    return data.timezone || null;
  } catch (error) {
    console.warn('IP-based timezone detection failed:', error);
    return null;
  }
}

/**
 * 최선의 타임존 자동 감지 (브라우저 + IP 조합)
 */
export async function detectBestTimezone(): Promise<string> {
  // 1차: 브라우저 타임존 (항상 사용 가능, 가장 정확)
  const browserTz = getUserTimezone();
  
  // 2차: IP 기반 타임존 (백업용, 느릴 수 있음)
  try {
    const ipTz = await detectTimezoneFromIP();
    
    // 둘 다 있고 다르면 로그 출력
    if (ipTz && ipTz !== browserTz) {
      console.log(`🌍 Timezone detection:`, {
        browser: browserTz,
        ip: ipTz,
        using: browserTz // 브라우저 우선
      });
    }
    
    // 브라우저 타임존이 더 정확하므로 항상 브라우저 사용
    return browserTz;
  } catch {
    // IP 감지 실패해도 브라우저 타임존 사용
    return browserTz;
  }
}

/**
 * 사용자의 타임존을 자동 감지하여 Supabase에 저장
 * (로그인 시 자동 호출됨)
 */
export async function updateUserTimezone(
  client: SupabaseClient,
  userId: string
): Promise<{ success: boolean; timezone?: string; error?: string }> {
  try {
    // 최선의 타임존 자동 감지
    const timezone = await detectBestTimezone();
    
    console.log(`✅ Auto-detected timezone: ${timezone}`);
    
    const { data, error } = await client.rpc('update_timezone', {
      user_id: userId,
      new_timezone: timezone
    });

    if (error) throw error;

    return {
      success: true,
      timezone: timezone
    };
  } catch (error: any) {
    console.error('Failed to update timezone:', error);
    
    // 실패해도 브라우저 타임존으로 폴백
    try {
      const fallbackTz = getUserTimezone();
      const { error: fallbackError } = await client.rpc('update_timezone', {
        user_id: userId,
        new_timezone: fallbackTz
      });
      
      if (!fallbackError) {
        return {
          success: true,
          timezone: fallbackTz
        };
      }
    } catch {}
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 사용자의 타임존을 수동으로 변경
 */
export async function manuallyUpdateTimezone(
  client: SupabaseClient,
  userId: string,
  timezone: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await client.rpc('update_timezone', {
      user_id: userId,
      new_timezone: timezone
    });

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 사용자 로컬 시간 기준 다음 자정까지 남은 시간 계산
 */
export function getTimeUntilMidnight(): {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
} {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);

  const diff = midnight.getTime() - now.getTime();
  const totalSeconds = Math.floor(diff / 1000);
  
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds
  };
}

/**
 * 자정까지 남은 시간을 포맷팅
 */
export function formatTimeUntilMidnight(): string {
  const { hours, minutes } = getTimeUntilMidnight();
  
  if (hours > 0) {
    return `${hours}hours ${minutes}minutes`;
  }
  return `${minutes}minutes`;
}

/**
 * 타임존 이름을 사용자 친화적인 형태로 변환
 */
export function formatTimezone(timezone: string): string {
  const cityMap: Record<string, string> = {
    'Asia/Seoul': 'Seoul',
    'America/New_York': 'New York',
    'America/Los_Angeles': 'Los Angeles',
    'Europe/London': 'London',
    'Europe/Paris': 'Paris',
    'Asia/Tokyo': 'Tokyo',
    'Asia/Shanghai': 'Shanghai',
    'Australia/Sydney': 'Sydney',
  };

  return cityMap[timezone] || timezone.split('/')[1]?.replace(/_/g, ' ') || timezone;
}

/**
 * 사용자의 타임존 정보를 가져오기
 */
export async function getUserTimezoneInfo(
  client: SupabaseClient,
  userId: string
): Promise<{
  timezone: string;
  localTime: string;
  timeUntilReset: string;
} | null> {
  try {
    const { data: profile, error } = await client
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single();

    if (error || !profile) return null;

    const timezone = profile.timezone || 'UTC';
    const now = new Date();
    const localTime = now.toLocaleString('ko-KR', { 
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit'
    });

    return {
      timezone,
      localTime,
      timeUntilReset: formatTimeUntilMidnight()
    };
  } catch (error) {
    console.error('Failed to get timezone info:', error);
    return null;
  }
}