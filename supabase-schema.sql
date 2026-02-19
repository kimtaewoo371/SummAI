-- ============================================================
-- SummAI Database Schema v2
-- 기존 스키마에서 이 파일 전체를 Supabase SQL Editor에 실행
-- ============================================================

-- ① 누락된 컬럼 추가
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_pro               BOOLEAN   DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_id      TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status  TEXT      DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS subscribed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS daily_usage          INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_usage        INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reset_date      DATE      DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS last_monthly_reset   DATE      DEFAULT DATE_TRUNC('month', CURRENT_DATE);

-- ============================================================
-- ② RLS 정책 재설정 — is_pro 등 민감한 컬럼은 유저가 직접 못 건드리게
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- ✅ 유저가 업데이트할 수 있는 컬럼을 명시적으로 제한
--    is_pro / subscription_id / subscription_status 는 유저가 직접 수정 불가
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- 아래 조건: is_pro 등 민감 컬럼이 변경되지 않아야 함
    AND is_pro              = (SELECT is_pro              FROM public.profiles WHERE id = auth.uid())
    AND subscription_id     IS NOT DISTINCT FROM (SELECT subscription_id     FROM public.profiles WHERE id = auth.uid())
    AND subscription_status IS NOT DISTINCT FROM (SELECT subscription_status FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- ③ increment_usage RPC — 서버사이드에서 사용량 체크 + 제한 적용
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_usage(
  user_id       UUID,
  input_length  INTEGER DEFAULT 0,
  output_length INTEGER DEFAULT 0,
  estimated_cost NUMERIC DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER   -- 서비스 권한으로 실행 (RLS 우회 가능하지만 함수 내에서만)
AS $$
DECLARE
  v_profile       public.profiles%ROWTYPE;
  v_daily_limit   INTEGER;
  v_monthly_limit INTEGER;
  v_today         DATE := CURRENT_DATE;
  v_this_month    DATE := DATE_TRUNC('month', CURRENT_DATE);
BEGIN
  -- 호출한 유저가 본인인지 검증
  IF auth.uid() != user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = user_id FOR UPDATE;

  -- 일/월 리셋
  IF v_profile.last_reset_date < v_today THEN
    v_profile.daily_usage     := 0;
    v_profile.last_reset_date := v_today;
  END IF;

  IF v_profile.last_monthly_reset < v_this_month THEN
    v_profile.monthly_usage      := 0;
    v_profile.last_monthly_reset := v_this_month;
  END IF;

  -- 플랜별 한도 설정
  IF v_profile.is_pro THEN
    v_daily_limit   := 100;
    v_monthly_limit := 3000;
  ELSE
    v_daily_limit   := 10;
    v_monthly_limit := 200;
  END IF;

  -- 한도 초과 체크
  IF v_profile.daily_usage >= v_daily_limit THEN
    RAISE EXCEPTION 'DAILY_LIMIT_EXCEEDED: % of % uses today', v_profile.daily_usage, v_daily_limit;
  END IF;

  IF v_profile.monthly_usage >= v_monthly_limit THEN
    RAISE EXCEPTION 'MONTHLY_LIMIT_EXCEEDED: % of % uses this month', v_profile.monthly_usage, v_monthly_limit;
  END IF;

  -- 사용량 증가 및 저장
  UPDATE public.profiles
  SET
    usage_count          = usage_count + 1,
    daily_usage          = v_profile.daily_usage + 1,
    monthly_usage        = v_profile.monthly_usage + 1,
    last_reset_date      = v_profile.last_reset_date,
    last_monthly_reset   = v_profile.last_monthly_reset,
    updated_at           = NOW()
  WHERE id = user_id;

  RETURN json_build_object(
    'daily_usage',    v_profile.daily_usage + 1,
    'monthly_usage',  v_profile.monthly_usage + 1,
    'daily_limit',    v_daily_limit,
    'monthly_limit',  v_monthly_limit,
    'is_pro',         v_profile.is_pro
  );
END;
$$;

-- ============================================================
-- ④ 신규 유저 프로필 자동 생성 트리거 활성화
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, email, usage_count, daily_usage, monthly_usage,
    last_reset_date, last_monthly_reset
  )
  VALUES (
    NEW.id, NEW.email, 0, 0, 0, CURRENT_DATE, DATE_TRUNC('month', CURRENT_DATE)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 등록 (없으면 생성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();