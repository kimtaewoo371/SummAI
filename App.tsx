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

  /* ================= DEBUG: 상태 추적 ================= */
  useEffect(() => {
    console.log("STEP CHANGED →", step);
  }, [step]);

  useEffect(() => {
    console.log("READY STATE →", {
      isReady,
      hasClient: !!client,
      appReady,
      loading,
    });
  }, [isReady, client, appReady, loading]);

  /* ================= AUTH INIT ================= */
  useEffect(() => {
    let isMounted = true;
    let authSubscription: any = null;

    const initAuth = async () => {
      if (!client) return;

      console.log("INIT AUTH START");

      try {
        const {
          data: { session },
        } = await client.auth.getSession();

        console.log("SESSION →", session);

        if (session?.user && isMounted) {
          const profile = await getProfile(client, session.user.id);

          console.log("PROFILE →", profile);

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
      } catch (err) {
        console.error("AUTH INIT ERROR:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          setAppReady(true);
          console.log("AUTH INIT COMPLETE");
        }
      }

      const { data } = client.auth.onAuthStateChange(
        async (event, session) => {
          console.log("AUTH EVENT:", event);
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

  /* ================= ANALYZE ================= */
  const handleProcess = useCallback(
    async (text: string) => {
      console.log("HANDLE PROCESS START");

      if (!isReady || !client || loading || step === "processing") {
        console.log("BLOCKED:", {
          isReady,
          hasClient: !!client,
          loading,
          step,
        });
        return;
      }

      setError(null);
      setResult(null);

      setInput(text);
      setStep("processing");

      try {
        console.log("CALLING analyzeText...");
        const data = await analyzeText(client, text);
        console.log("analyzeText RESPONSE:", data);

        if (!data) throw new Error("No AI response");

        setResult(data);
        setStep("result");
      } catch (err: any) {
        console.error("ANALYZE ERROR:", err);
        setError(err.message || "Analysis failed");
        setStep("input");
      }
    },
    [user, client, isReady, loading, step]
  );

  /* ================= RESET ================= */
  const handleReset = () => {
    console.log("RESET TRIGGERED");
    window.location.reload();
  };

  const handleSignOut = async () => {
    if (!client) return;
    await signOut(client);
    setStep("input");
  };

  /* ================= LOADING GATE ================= */
  if (!isReady || !client || !appReady || loading) {
    console.log("GLOBAL LOADING SCREEN");
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
      <div className="min-h-screen bg-white">
        <main className="pt-16">
          {step === "input" && (
            <Landing
              onProcess={handleProcess}
              disabled={!isReady || !client || !appReady || loading}
            />
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
              onSuccess={() => setStep("input")}
              onCancel={() => setStep("recharge")}
            />
          )}
        </main>
      </div>
    </PayPalScriptProvider>
  );
};

export default App;