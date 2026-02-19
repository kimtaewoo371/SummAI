# 🔧 Supabase 연결 오류 해결 가이드

## ❌ 오류 메시지
```
Auth error: AuthRetryableFetchError: Failed to fetch
```

이 오류는 **Supabase 서버에 연결할 수 없다**는 의미입니다.

## ✅ 해결 방법 (순서대로 확인)

### 1️⃣ 브라우저 콘솔 확인

**개발자 도구 열기:**
- Windows: `F12` 또는 `Ctrl + Shift + I`
- Mac: `Cmd + Option + I`

**Console 탭에서 확인할 내용:**

```
❌ Supabase configuration missing!
VITE_SUPABASE_URL: ❌ Missing
VITE_SUPABASE_ANON_KEY: ❌ Missing
```

**또는**

```
❌ VITE_SUPABASE_URL seems invalid: https://your-project.supabase.co
Should be like: https://xxxxx.supabase.co
```

### 2️⃣ .env.local 파일 확인

**파일 위치:** 프로젝트 루트 (package.json과 같은 폴더)

**올바른 형식:**
```env
VITE_GEMINI_API_KEY=AIzaSyD...실제키...
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...실제키...
```

**❌ 흔한 실수:**

```env
# 잘못된 예시 1: 플레이스홀더 그대로 사용
VITE_SUPABASE_URL=https://your-project.supabase.co  ❌

# 잘못된 예시 2: 따옴표 사용
VITE_SUPABASE_URL="https://xxx.supabase.co"  ❌

# 잘못된 예시 3: 공백 포함
VITE_SUPABASE_URL = https://xxx.supabase.co  ❌

# 올바른 예시
VITE_SUPABASE_URL=https://xxx.supabase.co  ✅
```

### 3️⃣ Supabase 프로젝트 URL과 Key 찾기

#### Supabase 대시보드에서 찾기

1. **https://supabase.com 로그인**

2. **프로젝트 선택**

3. **Settings (톱니바퀴 아이콘) → API**

4. **복사할 값들:**

```
Project URL (URL 섹션에서):
https://abcdefghijk.supabase.co
↑ 이것을 VITE_SUPABASE_URL에 입력

anon public (Project API keys 섹션에서):
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBh...
↑ 이것을 VITE_SUPABASE_ANON_KEY에 입력
```

**중요:**
- `service_role` 키가 아닌 `anon public` 키를 사용하세요!
- 키 전체를 복사하세요 (매우 길어요)

### 4️⃣ 서버 재시작

**.env.local 파일 수정 후 반드시 서버 재시작!**

```powershell
# Ctrl + C로 서버 중지
# 그 다음 다시 시작
npm run dev
```

### 5️⃣ Supabase 프로젝트 활성화 확인

Supabase 대시보드에서:

```
Project Status: Active ✅
```

**만약 "Paused" 상태라면:**
- Restore 버튼 클릭
- 프로젝트 활성화 대기

### 6️⃣ 네트워크 연결 확인

**브라우저에서 직접 접속 테스트:**

```
https://YOUR-PROJECT-ID.supabase.co/rest/v1/
```

**정상 응답:**
```json
{"message":"The server is running"}
```

**오류:**
- "사이트에 연결할 수 없음" → URL이 잘못됨
- CORS 오류 → 정상 (브라우저에서 직접 접속 시 나타남)

### 7️⃣ Supabase 테이블 생성 확인

**Table Editor → profiles 테이블이 있는지 확인**

**없다면:**

1. SQL Editor 열기
2. `supabase-schema.sql` 파일 내용 복사
3. 붙여넣기 후 Run

## 🔍 디버깅 체크리스트

```
[ ] .env.local 파일이 프로젝트 루트에 있음
[ ] VITE_SUPABASE_URL이 https://xxx.supabase.co 형식
[ ] VITE_SUPABASE_ANON_KEY가 실제 키로 설정됨
[ ] 플레이스홀더(your-project, your-anon-key)를 실제 값으로 변경
[ ] 따옴표나 공백 없이 작성
[ ] 서버 재시작함 (npm run dev)
[ ] Supabase 프로젝트가 Active 상태
[ ] profiles 테이블이 생성됨
[ ] 브라우저 콘솔에 ✅ 표시가 보임
```

## 💡 여전히 안 된다면?

### 방법 1: .env.local 파일 재생성

```powershell
# 기존 파일 삭제 (메모장에서)
# 새로 만들기

# .env.local 파일 내용:
VITE_GEMINI_API_KEY=실제_키
VITE_SUPABASE_URL=실제_URL
VITE_SUPABASE_ANON_KEY=실제_키
```

**저장 후 서버 재시작**

### 방법 2: 캐시 삭제

```powershell
# 서버 중지 (Ctrl + C)

# 캐시 삭제
rm -r -fo node_modules
rm package-lock.json

# 재설치
npm install

# 실행
npm run dev
```

### 방법 3: 새 Supabase 프로젝트 생성

1. https://supabase.com
2. New Project
3. 프로젝트 생성 대기
4. Settings → API에서 URL과 Key 복사
5. .env.local 업데이트

## 📸 스크린샷으로 확인

### ✅ 정상 작동 시 콘솔 출력

```
🔐 Attempting signup for: test@example.com
✅ Signup successful
```

### ❌ 오류 시 콘솔 출력

```
❌ Supabase configuration missing!
VITE_SUPABASE_URL: ❌ Missing
VITE_SUPABASE_ANON_KEY: ❌ Missing
```

**또는**

```
🔐 Attempting signup for: test@example.com
❌ Signup error: Failed to fetch
Cannot connect to Supabase. Please check:
1. VITE_SUPABASE_URL is correct
2. VITE_SUPABASE_ANON_KEY is correct
3. Your internet connection
4. Supabase project is active
```

## 🆘 그래도 안 되면?

1. **브라우저 콘솔 스크린샷** 캡처
2. **.env.local 파일 내용** (키는 일부만) 공유
3. **Supabase 프로젝트 상태** 확인

---

**대부분의 경우 .env.local 파일 문제입니다!** 
다시 한 번 꼼꼼히 확인해주세요. 🔍
