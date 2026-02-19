
import React, { useEffect, useState } from 'react';

const Loading: React.FC = () => {
  const [steps, setSteps] = useState([
    { label: 'Deconstructing document hierarchy...', done: false },
    { label: 'Extracting executive decisions...', done: false },
    { label: 'Refining professional tone...', done: false },
  ]);

  useEffect(() => {
    const timeouts = [
      setTimeout(() => setSteps(s => s.map((item, i) => i === 0 ? { ...item, done: true } : item)), 1000),
      setTimeout(() => setSteps(s => s.map((item, i) => i === 1 ? { ...item, done: true } : item)), 2000),
      setTimeout(() => setSteps(s => s.map((item, i) => i === 2 ? { ...item, done: true } : item)), 3000),
    ];
    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md text-center">
        <div className="mb-12">
           <div className="w-12 h-12 border-2 border-gray-100 border-t-black rounded-full animate-spin mx-auto"></div>
        </div>
        
        <h1 className="text-2xl font-black text-gray-900 mb-8 tracking-tight uppercase">Processing Intelligence</h1>

        <div className="space-y-4 text-left border border-gray-50 p-8 rounded-2xl bg-gray-50/50">
             {steps.map((step, idx) => (
               <div key={idx} className={`flex items-center gap-4 transition-all duration-700 ${step.done ? 'opacity-100' : 'opacity-20'}`}>
                 <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${step.done ? 'bg-black text-white' : 'bg-gray-200'}`}>
                   {step.done ? (
                     <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                     </svg>
                   ) : (
                     <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                   )}
                 </div>
                 <span className="text-[10px] font-bold uppercase tracking-widest text-gray-800">{step.label}</span>
               </div>
             ))}
        </div>
      </div>
    </div>
  );
};

export default Loading;
