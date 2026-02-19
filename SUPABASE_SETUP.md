# Supabase 설정 가이드

InsightStream을 Supabase와 연결하는 방법을 단계별로 설명합니다.

## 📋 사전 준비

- Supabase 계정 (없으면 [여기](https://supabase.com)에서 무료 가입)
- 이메일 인증 완료

---

## 🚀 1단계: Supabase 프로젝트 생성

### 1. Supabase에 로그인
[https://supabase.com](https://supabase.com)에 접속해서 로그인

### 2. 새 프로젝트 생성
1. **"New Project"** 클릭
2. 프로젝트 정보 입력:
   - **Name**: `insightstream` (또는 원하는 이름)
   - **Database Password**: 강력한 비밀번호 (저장해두세요!)
   - **Region**: `Northeast Asia (Seoul)` 선택 (한국에서 가장 빠름)
3. **"Create new project"** 클릭
4. ⏳ 데이터베이스 준비까지 약 2분 대기

---

## 🗄️ 2단계: 데이터베이스 설정

### 1. SQL Editor 열기
- 왼쪽 사이드바에서 **"SQL Editor"** 클릭

### 2. 스키마 실행
1. **"New query"** 버튼 클릭
2. `supabase-schema.sql` 파일의 내용을 복사해서 붙여넣기
3. **"Run"** 버튼 클릭 (또는 `Ctrl+Enter`)
4. ✅ 성공 메시지 확인

### 3. 테이블 확인
- 왼쪽 사이드바에서 **"Table Editor"** 클릭
- `profiles` 테이블이 생성되었는지 확인

---

## 🔑 3단계: API 키 가져오기

### 1. Settings 페이지로 이동
- 왼쪽 사이드바 하단의 **⚙️ Settings** 클릭
- **"API"** 메뉴 선택

### 2. 필요한 정보 복사

#### Project URL
```
https://xxxxxxxxxxxxx.supabase.co
```
이 값을 복사하세요

#### anon public Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFz...
```
이 긴 문자열을 복사하세요

⚠️ **주의**: `service_role` 키는 절대 사용하지 마세요! (서버 전용)

---

## ⚙️ 4단계: 환경 변수 설정

### 1. `.env.local` 파일 열기
프로젝트 루트에 있는 `.env.local` 파일을 에디터로 엽니다.

### 2. 값 입력
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

위에서 복사한 값들을 정확히 붙여넣으세요.

### 3. 파일 저장
- `Ctrl+S` (Windows/Linux) 또는 `Cmd+S` (Mac)

---

## 📧 5단계: 이메일 인증 설정 (선택사항)

개발 중에는 이메일 인증을 비활성화하는 것이 편리합니다.

### 1. Authentication 설정
- 왼쪽 사이드바에서 **"Authentication"** 클릭
- **"Settings"** 탭 선택

### 2. Email Confirmation 비활성화
1. **"Email"** 섹션 찾기
2. **"Confirm email"** 토글을 **OFF**로 변경
3. 하단의 **"Save"** 버튼 클릭

⚠️ **프로덕션에서는 반드시 ON으로 설정하세요!**

---

## ✅ 6단계: 테스트

### 1. 개발 서버 실행
```bash
npm run dev
```

### 2. 브라우저에서 확인
`http://localhost:3000` 접속

### 3. 회원가입 테스트
1. **"Log In"** 버튼 클릭
2. **"Don't have an account? Sign Up"** 클릭
3. 이메일과 비밀번호 입력 (비밀번호는 6자 이상)
4. **"Sign Up"** 클릭
5. ✅ 성공 메시지 확인

### 4. 로그인 테스트
1. 같은 이메일과 비밀번호로 로그인
2. ✅ 상단에 이메일 주소가 표시되면 성공!

### 5. 사용량 추적 테스트
1. 문서를 분석 (3번 실행)
2. Supabase Dashboard > Table Editor > profiles
3. 본인의 `usage_count`가 증가했는지 확인

---

## 🔍 데이터베이스 확인하기

### Supabase Dashboard에서 데이터 보기
1. **Table Editor** 클릭
2. `profiles` 테이블 선택
3. 가입한 사용자 목록과 사용량 확인

### SQL로 직접 쿼리
```sql
-- 모든 사용자 조회
SELECT * FROM profiles;

-- 사용량이 많은 순서로 정렬
SELECT email, usage_count 
FROM profiles 
ORDER BY usage_count DESC;

-- 특정 사용자의 사용량 확인
SELECT email, usage_count 
FROM profiles 
WHERE email = 'your-email@example.com';
```

---

## 🛠️ 문제 해결

### ❌ "Failed to fetch" 에러
**원인**: API 키나 URL이 잘못됨
**해결**:
1. `.env.local` 파일의 값 다시 확인
2. Supabase Dashboard에서 올바른 키 복사
3. 개발 서버 재시작 (`npm run dev`)

### ❌ 회원가입 시 에러
**원인**: 데이터베이스 스키마가 제대로 설정되지 않음
**해결**:
1. Supabase SQL Editor에서 `supabase-schema.sql` 다시 실행
2. Table Editor에서 `profiles` 테이블 존재 확인
3. RLS 정책이 활성화되어 있는지 확인

### ❌ 사용량이 업데이트되지 않음
**원인**: RLS 정책 문제
**해결**:
```sql
-- RLS 확인
SELECT * FROM pg_policies WHERE tablename = 'profiles';

-- 모든 정책 삭제 후 재생성
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- supabase-schema.sql의 정책 부분만 다시 실행
```

### ❌ 로그인 후 바로 로그아웃됨
**원인**: 브라우저 쿠키 설정 문제
**해결**:
1. 브라우저 쿠키 허용 확인
2. 시크릿 모드에서 테스트
3. 다른 브라우저로 테스트

---

## 📊 유용한 SQL 쿼리

### 전체 사용자 수
```sql
SELECT COUNT(*) as total_users FROM profiles;
```

### 평균 사용량
```sql
SELECT AVG(usage_count) as avg_usage FROM profiles;
```

### 최근 가입자 10명
```sql
SELECT email, created_at 
FROM profiles 
ORDER BY created_at DESC 
LIMIT 10;
```

### 특정 사용자 초기화
```sql
UPDATE profiles 
SET usage_count = 0 
WHERE email = 'your-email@example.com';
```

---

## 🎯 다음 단계

Supabase 연결이 완료되었습니다! 이제:

1. ✅ 사용자 인증 완료
2. ✅ 사용량 추적 완료
3. 🚀 앱을 배포하고 싶다면 Vercel/Netlify 가이드를 참고하세요
4. 💳 결제 기능을 추가하고 싶다면 Stripe 통합을 고려하세요

---

## 💡 추가 팁

### 개발 중 사용자 빠르게 생성
```sql
-- 테스트 사용자 직접 생성 (실제로는 앱에서 가입하는 것이 좋음)
INSERT INTO auth.users (email, encrypted_password)
VALUES ('test@example.com', crypt('password123', gen_salt('bf')));
```

### Supabase의 무료 플랜 제한
- 500MB 데이터베이스 저장
- 5GB 파일 저장
- 50,000 월간 활성 사용자
- 2GB 대역폭

개인 프로젝트로는 충분합니다!

---

궁금한 점이 있으면 [Supabase 공식 문서](https://supabase.com/docs)를 참고하세요.
