# 🚀 빠른 시작 가이드 (5분 안에!)

## ✅ 체크리스트

### 1️⃣ 압축 해제
```bash
unzip insightstream-fixed.zip
cd fixed_project
```

### 2️⃣ 의존성 설치
```bash
npm install
```

### 3️⃣ 환경 변수 설정

`.env.local` 파일을 열어서 다음 값들을 입력하세요:

```env
VITE_GEMINI_API_KEY=your-actual-gemini-api-key-here
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-actual-supabase-key
VITE_PAYPAL_CLIENT_ID=your-paypal-client-id (optional)
```

**API 키 받는 방법:**
- Gemini API: https://makersuite.google.com/app/apikey
- Supabase: https://supabase.com → 프로젝트 생성 → Settings → API
- PayPal (선택): https://developer.paypal.com

### 4️⃣ Supabase 테이블 생성

1. Supabase 대시보드 열기
2. SQL Editor 클릭
3. `supabase-schema.sql` 파일 내용 복사
4. 실행 (Run)

### 5️⃣ 개발 서버 실행
```bash
npm run dev
```

브라우저에서 `http://localhost:5173` 열기

## 🎯 테스트 방법

### 비로그인 테스트
1. 텍스트 입력 후 Analyze 클릭
2. 3회까지 무료로 사용 가능
3. 4회째에 Recharge 페이지로 이동

### 로그인 테스트
1. "Log In" 버튼 클릭
2. Supabase 인증으로 로그인
3. 로그인 후 usage_count가 DB에 저장됨

## ❗ 자주 발생하는 문제

### 문제 1: "Failed to fetch"
**해결**: `.env.local` 파일에 올바른 API 키가 있는지 확인

### 문제 2: Supabase 연결 실패
**해결**: 
1. Supabase URL과 ANON_KEY 확인
2. `supabase-schema.sql` 실행 여부 확인

### 문제 3: PayPal 버튼 안 보임
**해결**: `VITE_PAYPAL_CLIENT_ID`가 설정되지 않았어도 앱은 작동합니다. PayPal 기능만 비활성화됩니다.

## 📋 필수 vs 선택 설정

### ✅ 필수
- `VITE_GEMINI_API_KEY` - Gemini API 키
- `VITE_SUPABASE_URL` - Supabase 프로젝트 URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key

### 🔹 선택
- `VITE_PAYPAL_CLIENT_ID` - PayPal 결제 (나중에 추가 가능)

## 🎨 주요 기능 확인

- [ ] 텍스트 분석 작동
- [ ] 비로그인 3회 제한 작동
- [ ] 로그인 기능 작동
- [ ] Supabase에 usage_count 저장
- [ ] 에러 메시지 표시
- [ ] Recharge 페이지 표시

## 🆘 도움이 필요하면

1. `INTEGRATION_GUIDE.md` 읽기
2. `SUPABASE_SETUP.md` 확인
3. GitHub Issues에 질문 남기기

---

**모든 준비 완료!** 🎉
이제 `npm run dev`로 시작하세요!
