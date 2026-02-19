# 🍔 메뉴바(햄버거 아이콘) 추가하기

## 문제
우측 상단에 햄버거 메뉴 아이콘(≡)이 안 보입니다.

## 해결 방법 1: 새 버전 다운로드 (추천)

1. **insightstream-fixed.zip** 다시 다운로드
2. 기존 폴더 삭제
3. 새로 압축 해제
4. npm install
5. npm run dev

이 방법이 가장 쉽고 확실합니다!

## 해결 방법 2: 수동으로 코드 추가

### App.tsx 수정

**파일 위치:** `프로젝트루트/App.tsx`

**찾을 코드 (약 189번 줄):**
```tsx
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase tracking-widest hover:text-gray-500 transition-colors">Log In</button>
            )}
          </div>
        </nav>
```

**다음과 같이 수정:**
```tsx
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase tracking-widest hover:text-gray-500 transition-colors">Log In</button>
            )}

            {/* Menubar Icon - 이 부분을 추가! */}
            <button 
              onClick={() => setStep('recharge')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100 shadow-sm"
              aria-label="Recharge Credits"
            >
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </nav>
```

### 정확한 위치

**before (추가 전):**
```tsx
          <div className="flex items-center gap-8">
            {!user.isLoggedIn && step !== 'recharge' && (
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                {Math.max(0, FREE_LIMIT - user.usageCount)} Credits Left
              </span>
            )}

            {user.isLoggedIn ? (
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{user.email}</span>
                <button onClick={handleSignOut} className="text-[10px] font-black uppercase tracking-widest hover:text-black transition-colors">Sign Out</button>
              </div>
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase tracking-widest hover:text-gray-500 transition-colors">Log In</button>
            )}
          </div>  <!-- 여기서 닫힘 -->
        </nav>
```

**after (추가 후):**
```tsx
          <div className="flex items-center gap-8">
            {!user.isLoggedIn && step !== 'recharge' && (
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                {Math.max(0, FREE_LIMIT - user.usageCount)} Credits Left
              </span>
            )}

            {user.isLoggedIn ? (
              <div className="flex items-center gap-6">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{user.email}</span>
                <button onClick={handleSignOut} className="text-[10px] font-black uppercase tracking-widest hover:text-black transition-colors">Sign Out</button>
              </div>
            ) : (
              <button onClick={() => setStep('login')} className="text-[10px] font-black uppercase tracking-widest hover:text-gray-500 transition-colors">Log In</button>
            )}

            {/* 🍔 여기에 메뉴바 추가! */}
            <button 
              onClick={() => setStep('recharge')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100 shadow-sm"
              aria-label="Recharge Credits"
            >
              <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
            </button>
          </div>
        </nav>
```

### 저장 후 확인

1. App.tsx 저장
2. 브라우저 새로고침 (또는 서버가 자동 재시작)
3. 우측 상단에 햄버거 아이콘 확인

## 작동 확인

**메뉴바 클릭 시:**
- Recharge 페이지로 이동
- 충전/플랜 선택 화면 표시

## 스크린샷

**메뉴바가 있는 상태:**
```
┌─────────────────────────────────────────────┐
│ [X] REPLAI          3 Credits Left  Log In ☰│
└─────────────────────────────────────────────┘
                                              ↑
                                        이 아이콘!
```

## 문제가 계속되면?

1. 코드를 정확히 복사했는지 확인
2. 중괄호 { } 개수가 맞는지 확인
3. 저장 후 브라우저 새로고침
4. 여전히 안 되면 → 새 버전 다운로드 (해결 방법 1)

---

**권장:** 새 버전을 다운로드하는 것이 가장 쉽고 확실합니다!
