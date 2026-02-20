import React, { useState, useCallback, useEffect } from "react";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import { AppStep, AnalysisResult, UserState } from "./types";
import Landing from "./components/Landing";
import Loading from "./components/Loading";
import ResultView from "./components/ResultView";
import LoginPage from "./components/LoginPage";
import RechargePage from "./components/RechargePage";
import PaymentPage from "./components/PaymentPage";
import { analyzeText } from "./services/geminiService";
import {
  useSupabase,
  getProfile,
  incrementUsageCount,
  signOut,
} from "./services/supabaseClient";

const ANONYMOUS_DAILY_LIMIT = 10;

const App: React.FC = () => {
  const { client, isReady } = useSupabase();

  const [appReady, setAppReady] = useState(false);
  const [step, setStep] = useState<AppStep>("input");
  const [input, setInput] = useState<string>("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [usageInfo, setUsageInfo] = useState<any>(null);

  const [user, setUser] = useState<UserState>({
    isLoggedIn: false,
    usageCount: 0,
    isPro: false,
  });

  /* ================= AUTH INIT ================= */
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initAuth = async () => {
      if (!client) return;

      try {
        const {
          data: { session },
        } = await client.auth.getSession();

        if (session?.user && isMounted) {
          const profile = await getProfile(client, session.user.id);

          if (profile && isMounted) {
            setUser({
              isLoggedIn: true,
              usageCount: profile.usage_count,
              email: profile.email,
              userId: session.user.id,
              isPro: profile.is_pro || false,
            });

            setUsageInfo({
              daily: profile.daily_usage ?? 0,
              monthly: profile.monthly_usage ?? 0,
              dailyLimit: profile.is_pro ? 100 : 10,
              monthlyLimit: profile.is_pro ? 3000 : 200,
            });
          }
        }
      } catch (err) {
        console.error("Auth init error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setAppReady(true);
        }
      }

      const { data } = client.auth.onAuthStateChange(
        async (event, session) => {
          if (!isMounted) return;

          if (
            (event === "SIGNED_IN" || event === "USER_UPDATED") &&
            session?.user
          ) {
            const profile = await getProfile(client, session.user.id);
            if (profile && isMounted) {
              setUser({
                isLoggedIn: true,
                usageCount: profile.usage_count,
                email: profile.email,
                userId: session.user.id,
                isPro: profile.is_pro || false,
              });
            }
          }

          if (event === "SIGNED_OUT") {
            setUser({
              isLoggedIn: false,
              usageCount: 0,
              isPro: false,
            });
            setUsageInfo(null);
          }
        }
      );

      authSubscription = data.subscription;
    };

    if (isReady && client) initAuth();

    return () => {
      isMounted = false;
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [client, isReady]);

  /* ================= EDGE WARM-UP ================= */
  useEffect(() => {
    if (!client) return;

    // 첫 진입 시 Edge Function 깨워두기
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rapid-function`, {
      method: "OPTIONS",
    }).catch(() => {});
  }, [client]);

  /* ================= ANALYZE ================= */
  const handleProcess = useCallback(
    async (text: string) => {
      if (!isReady || !client || loading || step === "processing") {
        return;
      }

      setError(null);
      setResult(null);

      // 비로그인 사용자 제한
      if (!user.isLoggedIn) {
        const todayKey = `anonymous_usage_${new Date()
          .toISOString()
          .slice(0, 10)}`;

        const usage = parseInt(localStorage.getItem(todayKey) || "0");

        if (usage >= ANONYMOUS_DAILY_LIMIT) {
          setStep("recharge");
          return;
        }

        localStorage.setItem(todayKey, String(usage + 1));
      }

      setInput(text);
      setStep("processing");

      try {
        const data = await analyzeText(client, text);

        if (!data) throw new Error("No AI response");

        setResult(data);
        setStep("result");

        if (user.isLoggedIn && user.userId) {
          const updatedProfile = await incrementUsageCount(
            client,
            user.userId,
            text.length,
            data.resultText?.length || 0,
            0
          );

          setUsageInfo({
            daily: updatedProfile.daily_usage,
            monthly: updatedProfile.monthly_usage,
            dailyLimit: updatedProfile.is_pro ? 100 : 10,
            monthlyLimit: updatedProfile.is_pro ? 3000 : 200,
          });

          setUser((prev) => ({
            ...prev,
            usageCount: updatedProfile.daily_usage,
          }));
        }
      } catch (err: any) {
        setError(err.message || "Analysis failed");
        setStep("input");
      }
    },
    [client, isReady, loading, step, user]
  );

  /* ================= HANDLERS ================= */
  const handleReset = () => {
    window.location.reload();
  };

  const handleSignOut = async () => {
    if (!client) return;
    await signOut(client);
    setStep("input");
  };

  const handlePaymentSuccess = async () => {
    if (client && user.userId) {
      const profile = await getProfile(client, user.userId);
      if (profile) {
        setUser((prev) => ({
          ...prev,
          isPro: !!profile.is_pro,
        }));
      }
    }
    setStep("input");
  };

  const remainingDaily = usageInfo
    ? Math.max(0, usageInfo.dailyLimit - usageInfo.daily)
    : !user.isLoggedIn
    ? Math.max(0, ANONYMOUS_DAILY_LIMIT)
    : null;

  /* ================= GLOBAL LOADING ================= */
  if (!isReady || !client || !appReady || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  /* ================= RENDER ================= */
  return (
    <PayPalScriptProvider
      options={{
        clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || "",
      }}
    >
      <div className="min-h-screen text-gray-900 font-sans bg-white">
        <main className="pt-16">
          {step === "input" && (
            <>
              {error && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-2 rounded-full z-50 text-[10px] font-bold">
                  {error}
                </div>
              )}

              <Landing
                onProcess={handleProcess}
                disabled={!isReady || !client || !appReady || loading}
              />
            </>
          )}

          {step === "processing" && <Loading />}

          {step === "result" && result && (
            <ResultView
              input={input}
              result={result}
              onReset={handleReset}
            />
          )}

          {step === "login" && (
            <LoginPage
              onLoginSuccess={() => setStep("input")}
              onBack={() => setStep("input")}
            />
          )}

          {step === "recharge" && (
            <RechargePage
              onBack={() => setStep("input")}
              onLogin={() => setStep("login")}
              onUpgrade={() => setStep("payment")}
            />
          )}

          {step === "payment" && (
            <PaymentPage
              userId={user.userId}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setStep("recharge")}
            />
          )}
        </main>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;