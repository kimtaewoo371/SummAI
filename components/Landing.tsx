import React, { useState } from 'react';

interface LandingProps {
  onProcess: (text: string) => void;
  disabled?: boolean; // 🔥 App에서 내려주는 시스템 준비 상태
}

const Landing: React.FC<LandingProps> = ({ onProcess, disabled = false }) => {
  const [input, setInput] = useState('');

  const isInputValid = input.trim().length >= 10;
  const isButtonDisabled = disabled || !isInputValid;

  const handleSubmit = () => {
    if (isButtonDisabled) return;
    onProcess(input);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-5xl text-center">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.4em] mb-4 block">
          Executive Assistant
        </span>

        <h1 className="text-6xl font-black text-gray-900 mb-6 tracking-tight leading-none">
          Stop Typing. Just Paste.
        </h1>

        <p className="text-lg text-gray-500 mb-12 font-medium max-w-2xl mx-auto">
          Make complex documents into High-Impact summaries in seconds.
        </p>

        <div className="relative mb-10">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste your document or email thread here..."
            className="w-full h-64 p-8 text-lg border border-gray-200 rounded-2xl bg-gray-50 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-all resize-none text-gray-800 placeholder:text-gray-300 shadow-sm"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isButtonDisabled}
          className="bg-black text-white px-16 py-5 rounded-xl text-lg font-bold uppercase tracking-widest shadow-lg hover:bg-gray-800 transform active:scale-[0.98] transition-all disabled:opacity-20 disabled:cursor-not-allowed mb-20"
        >
          Analyze Document
        </button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-12 border-t border-gray-100 opacity-60">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-900">
                Direct BLUF
              </h4>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-900">
                Task Extraction
              </h4>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </div>
            <div className="text-center">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-900">
                Polished Output
              </h4>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;