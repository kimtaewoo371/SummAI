import React from 'react';
import { AnalysisResult } from '../types';

interface ResultViewProps {
  input: string;
  result: AnalysisResult;
  onReset: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({ input, result, onReset }) => {
  const copyAsEmail = () => {
    const text = `Hi Team,

${result.executive_summary}

${result.suggested_reply}

Best regards,
[Your Name]`;
    navigator.clipboard.writeText(text);
    alert('Copied as Email Draft!');
  };

  const copyAsSlack = () => {
    const text = `${result.executive_summary}\n\n*Action Items:*\n${result.action_items.map(i => `• ${i.task} (${i.owner} by ${i.deadline})`).join('\n')}`;
    navigator.clipboard.writeText(text);
    alert('Copied as Slack Note!');
  };

  return (
    <div className="flex h-screen w-full bg-white overflow-hidden">
      {/* Left Sidebar: Original (Direct & Clean) */}
      <div className="w-1/4 border-r border-gray-100 bg-gray-50 p-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Original Document</h3>
          <button onClick={onReset} className="text-[10px] font-bold text-black border border-black/10 px-2 py-1 rounded hover:bg-black hover:text-white transition-all uppercase">
            New Analysis
          </button>
        </div>
        <div className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap font-medium">
          {input}
        </div>
      </div>

      {/* Right Content: Analysis (Direct & Spaced) */}
      <div className="w-3/4 p-12 overflow-y-auto bg-white">
        <div className="max-w-3xl mx-auto space-y-16">
          
          {/* Executive Summary */}
          <section>
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Summary (BLUF)</h2>
            <p className="text-xl font-black text-gray-900 leading-[1.4] tracking-tight">
              {result.executive_summary}
            </p>
          </section>

          {/* Action Items */}
          <section>
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Action Items</h2>
            <div className="border border-gray-100 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 font-bold text-gray-400 text-[10px] uppercase">Task</th>
                    <th className="px-6 py-4 font-bold text-gray-400 text-[10px] uppercase">Owner</th>
                    <th className="px-6 py-4 font-bold text-gray-400 text-[10px] uppercase">Deadline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.action_items.map((item, index) => (
                    <tr key={index}>
                      <td className="px-6 py-5 text-gray-900 font-semibold">{item.task}</td>
                      <td className="px-6 py-5 text-gray-500 font-bold">{item.owner}</td>
                      <td className="px-6 py-5 text-gray-400">{item.deadline}</td>
                    </tr>
                  ))}
                  {result.action_items.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-10 text-center text-gray-300 font-medium">No actions detected.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Suggested Reply */}
          <section>
            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Suggested Reply</h2>
            <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
              <div className="text-base text-gray-700 leading-relaxed whitespace-pre-wrap">
                {result.suggested_reply}
              </div>
            </div>
          </section>

          {/* Actions Bar */}
          <div className="fixed bottom-10 right-10 flex gap-3">
            <button 
              onClick={copyAsEmail} 
              className="bg-white text-black border border-gray-200 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:border-black transition-all flex items-center gap-2 shadow-sm"
            >
              Copy Email
            </button>
            <button 
              onClick={copyAsSlack} 
              className="bg-black text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center gap-2 shadow-xl"
            >
              Copy Slack
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultView;