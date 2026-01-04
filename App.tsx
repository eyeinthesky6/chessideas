import React, { useState, useEffect } from 'react';
import { UserProfile, Drill, DrillSchedule, Theme, DrillOutcome, LinkedAccount, AccountProvider, TrainingMode, ChessGame, TimeControl } from './types';
import { fetchRecentGames } from './services/lichessService';
import { fetchChessComGames } from './services/chesscomService';
import { generateDrillsFromGames, getDemoDrills, getDemoGames, generateDrillFromMode } from './services/analysisService';
import { scheduler } from './services/scheduler';
import { createInitialSkill, updateSkill } from './services/skillService';
import { logEvent, getRecentLogs } from './services/logger';
import { DrillPlayer } from './components/DrillPlayer';
import { Dashboard } from './components/Dashboard'; 
import { APP_NAME } from './constants';
import { persistence } from './services/persistence';

const Icons = {
  Brain: () => <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>,
  User: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  Bug: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>,
  Target: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
  Flag: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-8a2 2 0 012-2h10a2 2 0 012 2v8m2-2h-2m2-4h-2m-2-4h-2m-2-4h-2m-2-4h-2" /></svg>
};

enum View { ONBOARDING, IMPORT_SUMMARY, MODE_SELECTION, DASHBOARD, TRAINING, PROFILE }
interface ToastMessage { id: number; text: string; type: 'error' | 'success' | 'info'; }

export default function App() {
  const [view, setView] = useState<View>(View.ONBOARDING);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [rawGames, setRawGames] = useState<ChessGame[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DrillSchedule>>({});
  const [selectedTimeControls, setSelectedTimeControls] = useState<TimeControl[]>(['rapid', 'blitz', 'classical']);
  const [sessionQueue, setSessionQueue] = useState<string[]>([]);
  const [activeQueueIndex, setActiveQueueIndex] = useState(0);
  const [loadingState, setLoadingState] = useState<{status: string, progress: number} | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  useEffect(() => {
    try {
        const loadedUser = persistence.loadUser();
        if (loadedUser) {
          console.log("[App] Loaded User:", loadedUser.username);
          setUser(loadedUser);
          setRawGames(persistence.loadGames());
          setDrills(persistence.loadDrills());
          setSchedules(persistence.loadSchedules());
          setSelectedTimeControls(persistence.loadTimeControls());
          setView(View.DASHBOARD);
        }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (user) persistence.saveUser(user);
    if (rawGames.length) persistence.saveGames(rawGames);
    if (drills.length) persistence.saveDrills(drills);
    if (Object.keys(schedules).length) persistence.saveSchedules(schedules);
    persistence.saveTimeControls(selectedTimeControls);
  }, [user, rawGames, drills, schedules, selectedTimeControls]);

  const showToast = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
      const id = Date.now();
      setToasts(prev => [...prev, { id, text, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const handleFullReset = () => {
      if (window.confirm("Are you sure? This will delete all local data.")) {
          persistence.clearAll();
          window.location.reload();
      }
  };

  const handleImport = async (usernameInput: string, provider: AccountProvider) => {
    if (user && user.accounts.some(a => a.provider === provider && a.username.toLowerCase() === usernameInput.toLowerCase())) {
        showToast(`${provider} account already linked.`, 'info');
        return;
    }

    setLoadingState({ status: `Connecting to ${provider}...`, progress: 10 });
    try {
      let newGames: ChessGame[] = [];
      let generatedDrills: Drill[] = [];
      let isDemo = false;

      if (usernameInput === 'demo') {
         newGames = getDemoGames(); 
         isDemo = true;
         generatedDrills = getDemoDrills();
      } else if (provider === 'lichess') {
         newGames = await fetchRecentGames(usernameInput, 60);
         setLoadingState({ status: `Analyzing ${newGames.length} games...`, progress: 40 });
         generatedDrills = await generateDrillsFromGames(newGames);
      } else {
         newGames = await fetchChessComGames(usernameInput, 40);
         setLoadingState({ status: `Analyzing ${newGames.length} games...`, progress: 40 });
         generatedDrills = await generateDrillsFromGames(newGames);
      }

      if (newGames.length === 0 && !isDemo) {
        setLoadingState(null);
        showToast(`No ${provider} games found for '${usernameInput}'.`, 'error');
        return;
      }

      setLoadingState({ status: "Syncing profile...", progress: 90 });
      const newSchedules: Record<string, DrillSchedule> = {};
      generatedDrills.forEach(d => { if (!schedules[d.id]) newSchedules[d.id] = scheduler.createInitialSchedule(d.id); });

      const finalUsername = isDemo ? 'Demo User' : (newGames[0]?.white === 'Anonymous' ? usernameInput : newGames[0]?.white || usernameInput);
      
      const newUserProfile = user ? {
          ...user,
          accounts: [...user.accounts, { provider, username: finalUsername, status: 'active', lastSyncAt: Date.now() } as LinkedAccount]
      } : {
          id: `user-${Date.now()}`,
          username: finalUsername,
          accounts: [{ provider, username: finalUsername, status: 'active', lastSyncAt: Date.now() }] as LinkedAccount[],
          rating: 1200, 
          skills: Object.values(Theme).reduce((acc, theme) => { acc[theme as Theme] = createInitialSkill(); return acc; }, {} as Record<Theme, any>)
      };

      setUser(newUserProfile);
      
      if (!user) {
          setRawGames(newGames);
          setDrills(generatedDrills);
          setSchedules(newSchedules);
      } else {
          const gameIds = new Set(rawGames.map(g => g.id));
          const uniqueNewGames = newGames.filter(g => !gameIds.has(g.id));
          setRawGames(prev => [...prev, ...uniqueNewGames]);
          setDrills(prev => [...prev, ...generatedDrills]);
          setSchedules(prev => ({...prev, ...newSchedules}));
      }

      setLoadingState(null);
      setView(View.DASHBOARD);
      
    } catch (e: any) {
      showToast(e.message || "Import failed", 'error');
      setLoadingState(null);
    }
  };

  const handleModeSelect = (mode: TrainingMode, options: any = {}) => {
      setLoadingState({ status: "Preparing training session...", progress: 50 });
      const eligibleGames = rawGames.filter(g => selectedTimeControls.includes(g.timeControl) || g.timeControl === 'unknown');
      
      if (eligibleGames.length === 0) {
          setLoadingState(null);
          showToast("No games found.", 'error');
          return;
      }
      
      let selectedMode = mode;
      if (mode === TrainingMode.ANY) {
          const r = Math.random();
          if (r < 0.4) selectedMode = TrainingMode.CRITICAL_POSITION;
          else if (r < 0.65) selectedMode = TrainingMode.RANDOM_MOMENT;
          else if (r < 0.85) selectedMode = TrainingMode.START_FROM_MOVE;
          else selectedMode = TrainingMode.ENDGAME_FINISH;
      }
      
      const drill = generateDrillFromMode(eligibleGames, selectedMode, options);

      if (!drill || !drill.fen || drill.fen === 'start' || drill.fen === 'startpos') {
          setLoadingState(null);
          showToast("Could not generate valid drill.", 'error');
          return;
      }

      startSessionWithDrill(drill);
  };

  const startSessionWithDrill = (drill: Drill) => {
      setDrills(prev => [...prev, drill]);
      setSchedules(prev => ({...prev, [drill.id]: scheduler.createInitialSchedule(drill.id)}));
      setSessionQueue([drill.id]);
      setActiveQueueIndex(0);
      
      setTimeout(() => { setLoadingState(null); setView(View.TRAINING); }, 500); 
  };
  
  const handleDrillComplete = (outcome: DrillOutcome, resultData: any) => {
      if (!user) return;
      const currentDrillId = sessionQueue[activeQueueIndex];
      const drill = drills.find(d => d.id === currentDrillId);
      if (!drill) return;

      const currentSchedule = schedules[drill.id];
      const newSchedule = scheduler.calculateNext(currentSchedule, outcome);
      setSchedules(prev => ({ ...prev, [drill.id]: newSchedule }));

      const oldSkill = user.skills[drill.theme];
      const newSkill = updateSkill(oldSkill, outcome, drill.difficulty);
      
      setUser({ ...user, skills: { ...user.skills, [drill.theme]: newSkill } });
      logEvent('drill_completed', { ...resultData, outcome }, user.id);
  };

  const handleLogout = () => {
      persistence.clearAll();
      window.location.reload();
  };

  if (loadingState) return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 mb-6 rounded-full border-4 border-slate-800 border-t-cyan-500 animate-spin"></div>
          <h2 className="text-xl text-slate-200 font-semibold mb-2">{loadingState.status}</h2>
      </div>
  );

  const Layout = ({ children }: any) => (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
          {children}
          <div className="fixed top-4 left-0 right-0 z-[100] flex flex-col items-center pointer-events-none px-4 space-y-2">
              {toasts.map(t => (
                  <div key={t.id} className={`px-4 py-2 rounded-lg shadow-xl backdrop-blur-md border text-sm font-medium ${t.type === 'error' ? 'bg-red-900/90 border-red-500/50' : 'bg-slate-800/90 border-slate-700'}`}>{t.text}</div>
              ))}
          </div>
          <button onClick={() => setShowDiagnostics(!showDiagnostics)} className="fixed bottom-20 right-4 p-2 bg-slate-900/50 hover:bg-slate-800 text-slate-600 rounded-full text-xs z-50 border border-slate-800/50"><Icons.Bug /></button>
          {showDiagnostics && (
              <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur p-4 overflow-auto font-mono text-xs">
                  <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-2">
                      <h2 className="text-lg font-bold text-cyan-500">Diagnostics</h2>
                      <button onClick={() => setShowDiagnostics(false)} className="px-3 py-1 bg-slate-800 rounded hover:bg-slate-700">Close</button>
                  </div>
                  <div className="mb-4">
                      <button onClick={handleFullReset} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-500 w-full">RESET ALL DATA</button>
                  </div>
                  <div className="space-y-1">
                      {getRecentLogs().map((log: any, i: number) => (
                          <div key={i} className={`border-l-2 pl-2 py-1 ${log.level === 'error' ? 'border-red-500' : 'border-slate-700'}`}>
                              <span className="font-bold mr-2">{log.event}</span>
                              <span className="opacity-70">{JSON.stringify(log.data).slice(0, 100)}</span>
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>
  );

  if (view === View.ONBOARDING) return (
      <Layout>
          <div className="min-h-screen flex items-center justify-center p-4">
              <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 relative">
                  <div className="flex items-center justify-center mb-8 space-x-3 text-cyan-400"><Icons.Brain /><h1 className="text-2xl font-bold tracking-tight text-white">{APP_NAME}</h1></div>
                  <div className="space-y-4">
                      <ImportForm provider="lichess" label="Connect Lichess" onSubmit={handleImport} />
                      <ImportForm provider="chesscom" label="Connect Chess.com" onSubmit={handleImport} />
                      <div className="mt-6 pt-6 border-t border-slate-800 text-center"><button onClick={() => handleImport('demo', 'lichess')} className="text-xs text-slate-600 hover:text-slate-400">Try Demo Mode</button></div>
                  </div>
              </div>
          </div>
      </Layout>
  );

  if (view === View.MODE_SELECTION) {
    const eligibleCount = rawGames.filter(g => selectedTimeControls.includes(g.timeControl) || g.timeControl === 'unknown').length;
    return (
      <Layout>
          <div className="min-h-screen p-6 flex flex-col items-center">
              <header className="w-full max-w-md mb-6">
                  <button onClick={() => setView(View.DASHBOARD)} className="text-xs text-slate-500 mb-2">← Back</button>
                  <h1 className="text-2xl font-bold text-white mb-1">Training Mode</h1>
                  <p className="text-slate-400 text-sm">Pool: {eligibleCount} games</p>
              </header>
              <div className="w-full max-w-md space-y-4">
                  <button onClick={() => handleModeSelect(TrainingMode.ANY)} className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 text-white p-4 rounded-xl shadow-lg text-left"><span className="font-bold text-lg">Any (Surprise Me)</span></button>
                  <div className="grid grid-cols-1 gap-3">
                      <ModeCard title="Random Moment" desc="Jump into a random point." icon={<Icons.Target />} onClick={() => handleModeSelect(TrainingMode.RANDOM_MOMENT)} />
                      <ModeCard title="Critical Position" desc="Start from a pivotal moment." icon={<Icons.Brain />} onClick={() => handleModeSelect(TrainingMode.CRITICAL_POSITION)} />
                      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                          <div className="font-bold text-white mb-2">Start from Move N</div>
                          <div className="flex space-x-2">
                              {[6, 10, 14].map(n => <button key={n} onClick={() => handleModeSelect(TrainingMode.START_FROM_MOVE, { startMove: n })} className="flex-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 py-2 rounded border border-slate-700">Move {n}</button>)}
                          </div>
                      </div>
                      <ModeCard title="Endgame Finish" desc="Convert the endgame." icon={<Icons.Flag />} onClick={() => handleModeSelect(TrainingMode.ENDGAME_FINISH)} />
                  </div>
              </div>
          </div>
      </Layout>
    );
  }

  if (view === View.DASHBOARD) {
    return (
      <Layout>
          <Dashboard user={user} onTrain={() => setView(View.MODE_SELECTION)} selectedTimeControls={selectedTimeControls} onToggleTimeControl={(tc) => setSelectedTimeControls(prev => prev.includes(tc) ? prev.filter(t => t !== tc) : [...prev, tc])} />
          <NavBar active="home" onNav={setView} />
      </Layout>
    );
  }

  if (view === View.TRAINING) {
      const currentDrill = drills.find(d => d.id === sessionQueue[activeQueueIndex]);
      const sourceGame = rawGames.find(g => g.id === currentDrill?.sourceGameId);
      if (!currentDrill) return <Layout><div className="h-screen flex items-center justify-center"><button onClick={() => setView(View.DASHBOARD)} className="bg-slate-800 px-4 py-2 rounded">Back</button></div></Layout>;
      return (
          <Layout>
               <div className="h-screen w-full overflow-hidden relative">
                   <DrillPlayer key={currentDrill.id} drill={currentDrill} game={sourceGame} schedule={null} userSkills={user?.skills} userId={user?.id || 'anon'} onComplete={handleDrillComplete} onNext={() => { if (activeQueueIndex + 1 < sessionQueue.length) setActiveQueueIndex(prev => prev + 1); else { setSessionQueue([]); setView(View.DASHBOARD); }}} />
                   <div className="absolute top-4 left-4 z-20"><button onClick={() => setView(View.DASHBOARD)} className="p-2 bg-slate-900/80 rounded-full text-slate-400">Back</button></div>
               </div>
          </Layout>
      );
  }

  if (view === View.PROFILE) {
    return (
        <Layout>
            <div className="pb-20 p-6">
                <header className="flex justify-between items-center mb-8"><h1 className="text-2xl font-bold text-white">Profile</h1><button onClick={handleLogout} className="text-xs text-red-400">Log Out</button></header>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8 flex items-center space-x-4"><div className="w-16 h-16 bg-slate-800 rounded-full border-2 border-cyan-500 flex items-center justify-center"><Icons.User /></div><div><h2 className="text-lg font-bold text-white">{user?.username}</h2></div></div>
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase">Linked Accounts</h3>
                    <div className="space-y-3">{user?.accounts.map((acc, i) => (<div key={i} className="flex justify-between items-center bg-slate-900 p-3 rounded text-sm"><span className="capitalize text-slate-300">{acc.provider}</span><span className="text-cyan-400">{acc.username}</span></div>))}</div>
                </div>
                <NavBar active="profile" onNav={setView} />
            </div>
        </Layout>
    );
  }
  return <div>Unknown</div>;
}

const ModeCard = ({ title, desc, icon, onClick }: any) => (<button onClick={onClick} className="w-full bg-slate-900 border border-slate-800 p-4 rounded-xl hover:bg-slate-800 text-left"><div className="flex items-start space-x-3"><div className="bg-slate-800 p-2 rounded-lg text-cyan-400">{icon}</div><div><div className="font-bold text-white">{title}</div><div className="text-xs text-slate-400">{desc}</div></div></div></button>);
const ImportForm = ({ provider, label, onSubmit }: any) => { const [val, setVal] = useState(""); return (<form onSubmit={(e) => { e.preventDefault(); onSubmit(val, provider); }} className="relative"><input type="text" placeholder="Username" value={val} onChange={e => setVal(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 px-4 text-white" /><button type="submit" disabled={!val} className="absolute right-1 top-1 bottom-1 bg-slate-800 px-4 rounded-md text-xs">{label}</button></form>); };
const NavBar = ({ active, onNav }: any) => (<nav className="fixed bottom-0 left-0 right-0 bg-slate-900/90 border-t border-slate-800 pb-safe pt-2 px-6 flex justify-around z-50"><NavBtn icon={<Icons.Brain />} label="Home" active={active === 'home'} onClick={() => onNav(View.DASHBOARD)} /><NavBtn icon={<Icons.User />} label="Profile" active={active === 'profile'} onClick={() => onNav(View.PROFILE)} /></nav>);
const NavBtn = ({ icon, label, active, onClick }: any) => (<button onClick={onClick} className={`flex flex-col items-center p-2 ${active ? 'text-cyan-400' : 'text-slate-500'}`}>{icon}<span className="text-[10px] mt-1 font-medium">{label}</span></button>);