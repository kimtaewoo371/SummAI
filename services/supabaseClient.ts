import { useSupabase } from '../components/providers.tsx/SupabaseProvider';

// ⚠️ 이제 직접 export 하지 않음 - Provider를 통해서만 사용

//////////////////// AUTH ////////////////////

export const signup = async (client: any, email: string, password: string) => {
  const { data, error } = await client.auth.signUp({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  return data;
};

export const signin = async (client: any, email: string, password: string) => {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  return data;
};

export const signOut = async (client: any) => {
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message);
};

export const getCurrentUser = async (client: any) => {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
};

//////////////////// PROFILE ////////////////////

export const getProfile = async (client: any, userId: string) => {
  console.log('🔍 Fetching profile for user:', userId);
  
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) {
    console.error('❌ Profile fetch error:', error.message);
    return null;
  }

  console.log('✅ Profile fetched successfully');
  return data;
};

//////////////////// USAGE ////////////////////

// 사용 가능 여부 확인 (분석 전 호출)
export const checkUsageLimit = async (
  client: any,
  userId: string
) => {
  const { data, error } = await client.rpc('check_usage_limit', {
    user_id: userId
  });

  if (error) throw error;
  return data;
};

export const incrementUsageCount = async (
  client: any,
  userId: string,
  inputLength?: number,
  outputLength?: number,
  estimatedCost?: number
) => {
  const { data, error } = await client.rpc('increment_usage', {
    user_id: userId,
    input_length: inputLength || 0,
    output_length: outputLength || 0,
    estimated_cost: estimatedCost || 0
  });

  if (error) throw error;
  return data;
};

// 🔥 Hook으로 client 가져오기
export { useSupabase };