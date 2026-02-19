import React from 'react';

interface RechargePageProps {
  onBack: () => void;
  onLogin: () => void;
  onUpgrade: () => void;
}

const RechargePage: React.FC<RechargePageProps> = ({ onBack, onLogin, onUpgrade }) => {
  const plans = [
    {
      name: 'Starter',
      price: '$0',
      description: 'Experience the power of analysis.',
      features: [
        '10 free uses per day',      // ✅ 10/day
        '200 analyses per month',    // ✅ 300 → 200 수정
        'Email Integration',
      ],
      button: 'Current Plan',
      active: false,
      onClick: null,
    },
    {
      name: 'Professional',
      price: '$9',
      description: 'For power users and office leads.',
      features: [
        '100 uses per day',          // ✅ 명시
        '3,000 analyses per month',  // ✅ 3000/월
        'Email Integration',
        'Slack Integration',
        'Priority Processing',
      ],
      button: 'Upgrade Now',
      active: true,
      onClick: onUpgrade,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: '.',
      features: ['.', '.', '.', '.'],
      button: 'Contact Sales',
      active: false,
      onClick: () => window.open('mailto:sales@SummAI.com', '_blank'),
    }
  ];

  return (
    <div className="min-h-[calc(100vh-64px)] bg-white py-20 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] mb-4 block">Plan Update Required</span>
          <h1 className="text-5xl font-black text-gray-900 mb-6 tracking-tight">Keep the insights flowing.</h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10 font-medium">
            You've reached your limit. Sign in to unlock more or upgrade for unlimited high-speed executive analysis.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={onLogin}
              className="bg-black text-white px-10 py-4 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg hover:bg-gray-800 transition-all"
            >
              Sign in
            </button>
            <button
              onClick={onBack}
              className="bg-white text-gray-400 border border-gray-100 px-10 py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:text-black hover:border-black transition-all"
            >
              Dismiss
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`p-10 rounded-3xl border ${plan.active ? 'border-black bg-white shadow-xl scale-105 z-10' : 'border-gray-100 bg-gray-50 opacity-80'} flex flex-col`}
            >
              {plan.active && (
                <div className="self-start bg-black text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4">
                  Recommended
                </div>
              )}
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-black text-gray-900 tracking-tight">{plan.price}</span>
                {plan.price !== 'Custom' && <span className="text-gray-400 text-xs font-bold">/mo</span>}
              </div>
              <p className="text-gray-400 text-sm mb-8 leading-relaxed font-medium">{plan.description}</p>

              <ul className="space-y-4 mb-12 flex-grow">
                {plan.features.map((feature, fidx) => (
                  <li key={fidx} className="flex items-center gap-3 text-xs text-gray-600 font-bold">
                    <div className="w-1 h-1 bg-black rounded-full" />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={plan.onClick || undefined}
                disabled={!plan.active && plan.name === 'Starter'}
                className={`w-full py-4 rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all ${
                  plan.active
                    ? 'bg-black text-white hover:bg-gray-800 cursor-pointer'
                    : plan.name === 'Enterprise'
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {plan.button}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RechargePage;