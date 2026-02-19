import React, { useState } from 'react';
import { PayPalButtons } from "@paypal/react-paypal-js";
import { useSupabase } from './providers.tsx/SupabaseProvider';

interface PaymentPageProps {
  userId?: string;
  onSuccess: (subscriptionId: string) => void;
  onCancel: () => void;
}

const PaymentPage: React.FC<PaymentPageProps> = ({ userId, onSuccess, onCancel }) => {
  const { client } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const PAYPAL_PLAN_ID = import.meta.env.VITE_PAYPAL_PLAN_ID || 'YOUR_PLAN_ID_HERE';

  const plan = {
    name: 'Professional',
    price: '$9',
    period: 'month',
    features: [
      '100 uses per day',
      '3,000 analyses per month',
      'Priority Processing',
      'Slack Integration',
      'Email Integration',
      'Cancel anytime',
    ]
  };

  // ✅ 클라이언트에서 직접 is_pro 수정 X
  // Edge Function이 PayPal에 실제 결제 확인 후 서버에서만 업데이트
  const verifyAndActivate = async (subscriptionId: string) => {
    if (!client) throw new Error('Client not available');

    const { data, error } = await client.functions.invoke('super-endpoint', {
      body: { subscriptionId },
    });

    if (error) throw new Error(error.message || '구독 검증 실패');
    if (!data?.success) throw new Error('구독을 활성화할 수 없습니다');
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white py-20 px-6">
      <div className="max-w-lg mx-auto">

        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-12 hover:text-black transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Plans
        </button>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Upgrade to Pro</h1>
          <p className="text-gray-500 font-medium">Unlock unlimited executive analysis</p>
        </div>

        {/* 플랜 카드 */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900">{plan.name}</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Monthly Subscription</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black text-gray-900">{plan.price}</span>
              <span className="text-gray-400 text-sm">/{plan.period}</span>
            </div>
          </div>
          <ul className="space-y-3">
            {plan.features.map((feature, idx) => (
              <li key={idx} className="flex items-center gap-3 text-sm text-gray-700 font-medium">
                <div className="w-5 h-5 bg-black rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs font-bold text-red-600">{error}</p>
          </div>
        )}

        {/* PayPal 버튼 */}
        <div className="mb-6">
          {PAYPAL_PLAN_ID === 'YOUR_PLAN_ID_HERE' ? (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl text-center">
              <p className="text-sm font-bold text-yellow-800 mb-2">⚠️ PayPal Plan ID 설정 필요</p>
              <p className="text-xs text-yellow-700">.env.local에 VITE_PAYPAL_PLAN_ID를 설정해주세요.</p>
            </div>
          ) : (
            <PayPalButtons
              style={{ layout: "vertical", color: "black", shape: "rect", label: "subscribe" }}
              disabled={loading}
              createSubscription={(_data, actions) => {
                return actions.subscription.create({ plan_id: PAYPAL_PLAN_ID });
              }}
              onApprove={async (data) => {
                setLoading(true);
                setError(null);
                try {
                  const subscriptionId = data.subscriptionID || '';
                  await verifyAndActivate(subscriptionId);
                  onSuccess(subscriptionId);
                } catch (err) {
                  setError(err instanceof Error ? err.message : '결제 처리 실패. 고객센터에 문의해주세요.');
                } finally {
                  setLoading(false);
                }
              }}
              onError={() => {
                setError('결제에 실패했습니다. 다시 시도하거나 다른 결제 수단을 사용해주세요.');
              }}
              onCancel={() => {
                setError('결제가 취소되었습니다. 플랜이 변경되지 않았습니다.');
              }}
            />
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-black rounded-full animate-spin"></div>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">결제 검증 중...</span>
          </div>
        )}

        <div className="text-center mt-8 space-y-2">
          <p className="text-xs text-gray-400 font-medium">🔒 Secure payment powered by PayPal</p>
          <p className="text-xs text-gray-400">Cancel anytime · 30-day money-back guarantee</p>
        </div>

      </div>
    </div>
  );
};

export default PaymentPage;