import React, { useMemo } from 'react';
import { UserProfile, Theme, TimeControl } from '../types';
import { getRecentLogs } from '../services/logger';

interface DashboardProps {
  user: UserProfile | null;
  onTrain: () => void;
  selectedTimeControls: TimeControl[];
  onToggleTimeControl: (tc: TimeControl) => void;
}

const Icons = {
  Bolt: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Trend: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>,
  Flame: () => <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.248c-2 2-6 6-6 10.752 0 4.418 3.582 8 8 8s8-3.582 8-8c0-4.752-4-8.752-6-10.752zm0 16.752c-2.761 0-5-2.239-5-5 0-2 1.5-3.5 1.5-3.5s-1.5 2-1.5 3.5c0 2.761 2.239 5 5 5s5-2.239 5-5c0-1.5-1.5-3.5-1.5-3.5s1.5 1.5 1.5 3.5c0 2.761-2.239 5-5 5z"/></svg>
};

export const Dashboard: React.FC<DashboardProps> = ({ 
  user, 
  onTrain, 
  selectedTimeControls, 
  onToggleTimeControl 
}) => {
  
  const recentLogs = getRecentLogs().filter(l => l.event === 'drill_completed').slice(0, 5);

  const themes = Object.values(Theme);
  const radarData = useMemo(() => {
    if (!user) return [];
    return themes.map(theme => ({
      theme,
      value: user.skills[theme]?.mastery || 0
    }));
  }, [user, themes]);

  const getCoordinatesForAngle = (angle: number, value: number) => {
    const radius = 80; 
    const centerX = 100;
    const centerY = 100;
    const r = (value / 100) * radius;
    const x = centerX + r * Math.cos((angle - 90) * (Math.PI / 180));
    const y = centerY + r * Math.sin((angle - 90) * (Math.PI / 180));
    return { x, y };
  };

  const radarPoints = radarData.map((d, i) => {
    const angle = (360 / themes.length) * i;
    return getCoordinatesForAngle(angle, d.value);
  }).map(p => `${p.x},${p.y}`).join(' ');

  const fullPolyPoints = themes.map((_, i) => {
    const angle = (360 / themes.length) * i;
    const p = getCoordinatesForAngle(angle, 100);
    return `${p.x},${p.y}`;
  }).join(' ');

  return (
    <div className="pb-24 p-6 max-w-4xl mx-auto animate-fade-in">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Hello, <span className="text-cyan-400">{user?.username}</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Ready to push your limits?</p>
        </div>
        <div className="flex flex-col items-end">
             <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Est. Rating</span>
                <div className="text-2xl font-mono font-bold text-cyan-500">{Math.round(user?.rating || 1200)}</div>
             </div>
        </div>
      </header>

      <div className="relative group overflow-hidden bg-gradient-to-r from-cyan-600 to-blue-700 rounded-2xl p-6 shadow-2xl mb-10 transition-transform hover:scale-[1.01]">
        <div className="absolute right-0 top-0 h-full w-1/2 bg-white/5 skew-x-12 transform translate-x-12"></div>
        <div className="relative z-10 flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                   <Icons.Bolt /> Daily Training
                </h2>
                <p className="text-cyan-100 text-sm max-w-xs mb-6">
                    Your personalized drill queue is ready.
                </p>
                <div className="flex items-center gap-3">
                    <button onClick={onTrain} className="bg-white text-blue-900 px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-cyan-50 transition-colors">Start Session</button>
                    <div className="flex bg-black/20 rounded-lg p-1">
                        {['blitz', 'rapid', 'classical'].map(tc => {
                            const active = selectedTimeControls.includes(tc as TimeControl);
                            return (
                                <button key={tc} onClick={(e) => { e.stopPropagation(); onToggleTimeControl(tc as TimeControl); }} className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-bold transition-all ${active ? 'bg-white/20 text-white shadow-sm' : 'text-cyan-100/50 hover:text-white'}`}>{tc}</button>
                            );
                        })}
                    </div>
                </div>
            </div>
            
            <div className="hidden sm:block relative w-40 h-40">
                <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg">
                    <polygon points={fullPolyPoints} className="fill-black/20 stroke-white/10" strokeWidth="1" />
                    {[75, 50, 25].map(r => <circle key={r} cx="100" cy="100" r={r * 0.8} className="fill-none stroke-white/5" />)}
                    <polygon points={radarPoints} className="fill-cyan-400/50 stroke-cyan-200" strokeWidth="2" />
                </svg>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Icons.Trend /> Skill Breakdown</h3>
            <div className="grid grid-cols-1 gap-4">
                {themes.map((theme) => {
                    const skill = user?.skills[theme];
                    const mastery = Math.round(skill?.mastery || 0);
                    return (
                        <div key={theme} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between group hover:border-slate-700 transition-colors">
                            <div className="flex-1">
                                <div className="flex justify-between mb-2">
                                    <span className="font-medium text-slate-200">{theme}</span>
                                    <span className="text-sm font-bold text-cyan-400">{mastery}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400" style={{ width: `${mastery}%` }}></div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
        <div className="space-y-6">
            <h3 className="text-lg font-bold text-white">Recent Activity</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 min-h-[300px]">
                {recentLogs.length === 0 ? <p className="text-slate-500 text-sm text-center py-10">No drills completed.</p> : (
                    <div className="space-y-4">
                        {recentLogs.map((log, i) => (
                            <div key={i} className="flex items-start gap-3 pb-3 border-b border-slate-800/50 last:border-0">
                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${log.data.outcome === 'FAILURE' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                                <div><div className="text-sm text-slate-300 font-medium">Drill Completed</div><div className="text-xs text-slate-500">{log.data.outcome}</div></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};