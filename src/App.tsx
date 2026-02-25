import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Users, 
  TrendingUp, 
  Target, 
  Coins, 
  ChevronRight, 
  AlertCircle,
  BarChart3,
  Settings,
  Play,
  Eye,
  CheckCircle2,
  Trash2
} from 'lucide-react';

// --- Types ---
interface Team {
  id: number;
  name: string;
  balance: number;
}

interface Round {
  id: number;
  theme: string;
  actual_value: number | null;
  status: 'open' | 'closed' | 'revealed';
}

interface Submission {
  id: number;
  team_id: number;
  team_name: string;
  predicted_value: number;
  bid_amount: number;
  score: number;
  error_percent: number;
}

// --- Components ---

const Card = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-[#151619] border border-white/10 rounded-2xl overflow-hidden shadow-2xl ${className}`}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false,
  className = "" 
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'danger' | 'outline',
  disabled?: boolean,
  className?: string
}) => {
  const variants = {
    primary: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20",
    secondary: "bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20",
    danger: "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20",
    outline: "bg-transparent border border-white/20 hover:bg-white/5 text-white"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-6 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  type = "text", 
  value, 
  onChange, 
  placeholder,
  suffix,
  className = "",
  disabled = false
}: { 
  label: string, 
  type?: string, 
  value: string | number, 
  onChange: (val: string) => void,
  placeholder?: string,
  suffix?: string,
  className?: string,
  disabled?: boolean
}) => (
  <div className={`space-y-2 ${className}`}>
    <label className="text-xs font-mono uppercase tracking-widest text-white/40">{label}</label>
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors placeholder:text-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      {suffix && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 font-mono text-sm">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'landing' | 'participant' | 'admin'>('landing');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const isAdminAuthenticatedRef = useRef(false);
  useEffect(() => { isAdminAuthenticatedRef.current = isAdminAuthenticated; }, [isAdminAuthenticated]);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const currentRoundRef = useRef<Round | null>(null);
  useEffect(() => { currentRoundRef.current = currentRound; }, [currentRound]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [gameTitle, setGameTitle] = useState('DATA PARADOX');
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Participant State
  const [teamNameInput, setTeamNameInput] = useState('');
  const [predictionInput, setPredictionInput] = useState('');
  const [bidInput, setBidInput] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Admin State
  const [newRoundTheme, setNewRoundTheme] = useState('');
  const [actualValueInput, setActualValueInput] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      console.log('WebSocket connected');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS Message:', data.type);
        if (data.type === 'ROUND_STARTED') {
          setCurrentRound(data.round);
          setHasSubmitted(false);
          setPredictionInput('');
          setBidInput('');
          setSubmissions([]);
        } else if (data.type === 'ROUND_REVEALED') {
          fetchCurrentRound();
          fetchTeams();
          if (currentRoundRef.current?.id && isAdminAuthenticatedRef.current) {
            fetchSubmissions(currentRoundRef.current.id);
          }
        } else if (data.type === 'SUBMISSION_RECEIVED') {
          if (currentRoundRef.current?.id && isAdminAuthenticatedRef.current) {
            fetchSubmissions(currentRoundRef.current.id);
          }
        } else if (data.type === 'GAME_RESET') {
          console.log('Resetting game state...');
          setTeam(null);
          setCurrentRound(null);
          setTeams([]);
          setSubmissions([]);
          setHasSubmitted(false);
          setPredictionInput('');
          setBidInput('');
          if (!isAdminAuthenticatedRef.current) {
            setView('landing');
          }
        } else if (data.type === 'SETTINGS_UPDATED') {
          if (data.key === 'game_title') {
            setGameTitle(data.value);
          }
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };
    setWs(socket);
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, []); // Stable WebSocket connection

  useEffect(() => {
    fetchCurrentRound();
    fetchTeams();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.game_title) setGameTitle(data.game_title);
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const fetchCurrentRound = async () => {
    try {
      const res = await fetch('/api/rounds/current');
      if (!res.ok) throw new Error('Failed to fetch current round');
      const data = await res.json();
      setCurrentRound(data);
      if (data?.id && isAdminAuthenticatedRef.current) {
        fetchSubmissions(data.id);
      }
    } catch (error) {
      console.error('Error fetching current round:', error);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await fetch('/api/teams');
      if (!res.ok) throw new Error('Failed to fetch teams');
      const data = await res.json();
      setTeams(data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchSubmissions = async (roundId: number) => {
    if (!adminPassword) return;
    try {
      const res = await fetch(`/api/admin/submissions/${roundId}`, {
        headers: { 'x-admin-password': adminPassword }
      });
      if (!res.ok) throw new Error('Failed to fetch submissions');
      const data = await res.json();
      setSubmissions(data);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    }
  };

  const handleAdminAccess = () => {
    if (isAdminAuthenticated) {
      setView('admin');
    } else {
      setShowAdminLogin(true);
    }
  };

  const handleAdminLogin = async () => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput })
      });
      
      if (res.ok) {
        setIsAdminAuthenticated(true);
        setAdminPassword(adminPasswordInput);
        setShowAdminLogin(false);
        setView('admin');
        setAdminPasswordInput('');
      } else {
        alert('Incorrect Password');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to connect to server');
    }
  };
  const handleJoin = async () => {
    if (!teamNameInput) return;
    const res = await fetch('/api/teams/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamNameInput })
    });
    const data = await res.json();
    setTeam(data);
    setView('participant');
  };

  const handleSubmitPrediction = async () => {
    if (!team || !currentRound) {
      alert("Session error. Please rejoin.");
      return;
    }
    
    const pred = parseFloat(predictionInput);
    const bid = parseFloat(bidInput);
    
    if (isNaN(pred)) {
      alert("Please enter a valid prediction value.");
      return;
    }
    
    if (isNaN(bid) || bid <= 0) {
      alert("Please enter a valid bid amount greater than 0.");
      return;
    }

    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: Number(team.id),
          roundId: Number(currentRound.id),
          predictedValue: pred,
          bidAmount: bid
        })
      });
      
      if (res.ok) {
        setHasSubmitted(true);
      } else {
        const err = await res.json();
        alert(err.error || "Submission failed");
      }
    } catch (e) {
      console.error("Submission error:", e);
      alert("Network error. Please try again.");
    }
  };

  const handleStartRound = async () => {
    if (!newRoundTheme) return;
    await fetch('/api/admin/rounds', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({ theme: newRoundTheme })
    });
    setNewRoundTheme('');
  };

  const handleReveal = async () => {
    if (!actualValueInput || !currentRound) return;
    await fetch('/api/admin/rounds/reveal', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-admin-password': adminPassword
      },
      body: JSON.stringify({
        roundId: currentRound.id,
        actualValue: parseFloat(actualValueInput)
      })
    });
    setActualValueInput('');
  };

  const handleReset = async () => {
    console.log("Executing game reset...");
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 
          'x-admin-password': adminPassword
        }
      });
      
      if (res.ok) {
        console.log("Reset successful, clearing local state");
        setTeam(null);
        setCurrentRound(null);
        setTeams([]);
        setSubmissions([]);
        setHasSubmitted(false);
        setPredictionInput('');
        setBidInput('');
        setShowResetConfirm(false);
      } else {
        const err = await res.json();
        console.error("Reset failed:", err);
        alert(`Failed to reset game: ${err.error || 'Unknown error'}`);
        setShowResetConfirm(false);
      }
    } catch (error) {
      console.error('Reset error:', error);
      alert('Error connecting to server during reset');
      setShowResetConfirm(false);
    }
  };

  const handleUpdateGameTitle = async (newTitle: string) => {
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': adminPassword
        },
        body: JSON.stringify({ key: 'game_title', value: newTitle })
      });
    } catch (e) {
      console.error('Error updating game title:', e);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-emerald-500/30">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <TrendingUp className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight uppercase">{gameTitle}</h1>
              <p className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Strategy Defines Victory</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {team && (
              <div className="flex items-center gap-6 mr-6">
                <div className="text-right">
                  <p className="text-[10px] font-mono text-white/40 uppercase">Team</p>
                  <p className="font-semibold">{team.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono text-white/40 uppercase">Balance</p>
                  <p className="font-mono text-emerald-400 font-bold">
                    {teams.find(t => t.id === team.id)?.balance?.toFixed(0) ?? '2000'} 
                    <span className="text-[10px] ml-1">COINS</span>
                  </p>
                </div>
              </div>
            )}
            <button 
              onClick={handleAdminAccess}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {showAdminLogin && (
            <motion.div 
              key="admin-login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            >
              <Card className="w-full max-w-sm p-8 space-y-6">
                <div className="text-center space-y-2">
                  <Settings className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h3 className="text-xl font-bold">Admin Access</h3>
                  <p className="text-xs text-white/40 uppercase tracking-widest">Enter Password to Continue</p>
                </div>
                <Input 
                  label="Password" 
                  type="password" 
                  value={adminPasswordInput}
                  onChange={setAdminPasswordInput}
                  placeholder="••••••••"
                />
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowAdminLogin(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button onClick={handleAdminLogin} className="flex-1">
                    Login
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto text-center space-y-8 py-20"
            >
              <div className="space-y-4">
                <h2 className="text-5xl font-bold tracking-tighter">Welcome to {gameTitle}.</h2>
                <p className="text-white/60 leading-relaxed">
                  Analyze the data, calculate the risk, and predict the future. 
                  2000 coins to start. One winner takes all.
                </p>
              </div>

              <Card className="p-8 space-y-6">
                <Input 
                  label="Team Name" 
                  placeholder="e.g. Data Wizards" 
                  value={teamNameInput}
                  onChange={setTeamNameInput}
                />
                <Button onClick={handleJoin} className="w-full">
                  Join Competition <ChevronRight className="w-4 h-4" />
                </Button>
              </Card>
            </motion.div>
          )}

          {view === 'participant' && (
            <motion.div 
              key="participant"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                    <BarChart3 className="text-emerald-500 w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight uppercase">{gameTitle}</h2>
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Live Competition</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-black/40 p-2 rounded-2xl border border-white/5">
                  <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] font-mono text-white/40 uppercase">Your Team</p>
                    <p className="font-bold text-sm">{team?.name}</p>
                  </div>
                  <div className="px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                    <p className="text-[10px] font-mono text-emerald-500 uppercase">Balance</p>
                    <p className="font-mono font-bold text-emerald-400 text-sm">
                      {teams.find(t => t.id === team?.id)?.balance?.toFixed(0) ?? '2000'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <Card className="p-10 border-white/10 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full -mr-32 -mt-32" />
                    
                    {!currentRound ? (
                      <div className="text-center py-20 space-y-6 relative z-10">
                        <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto border border-white/5 animate-pulse">
                          <Users className="text-white/20 w-10 h-10" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-bold">Waiting for Round...</h3>
                          <p className="text-white/40 max-w-xs mx-auto">The administrator is preparing the next data challenge. Stay tuned.</p>
                        </div>
                      </div>
                    ) : currentRound.status === 'revealed' ? (
                      <div className="text-center py-20 space-y-8 relative z-10">
                        <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/20">
                          <CheckCircle2 className="text-emerald-500 w-10 h-10" />
                        </div>
                        <div className="space-y-4">
                          <h3 className="text-3xl font-bold tracking-tight">Round Complete</h3>
                          <div className="inline-flex flex-col items-center p-6 bg-white/5 rounded-3xl border border-white/5">
                            <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">Actual Revealed Value</p>
                            <span className="text-5xl font-mono font-bold text-emerald-400">{currentRound.actual_value}</span>
                          </div>
                        </div>
                        <p className="text-white/40 italic">Preparing the next paradox...</p>
                      </div>
                    ) : (
                      <div className="space-y-10 relative z-10">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="text-[10px] font-mono text-emerald-500 uppercase tracking-widest">Active Challenge</p>
                            <h3 className="text-4xl font-bold tracking-tight leading-none">{currentRound.theme}</h3>
                          </div>
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 text-xs font-bold rounded-xl border border-emerald-500/20 animate-pulse">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                            LIVE
                          </div>
                        </div>

                        {hasSubmitted ? (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-emerald-500/5 border border-emerald-500/20 rounded-3xl p-10 text-center space-y-6"
                          >
                            <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                              <CheckCircle2 className="w-8 h-8 text-black" />
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-2xl font-bold">Prediction Locked</h4>
                              <p className="text-white/60">Your bid of <span className="text-emerald-400 font-mono font-bold">{bidInput} COINS</span> is registered. Awaiting revelation.</p>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="space-y-8">
                            <div className="grid md:grid-cols-2 gap-8">
                              <div className="space-y-3">
                                <Input 
                                  label="Your Prediction" 
                                  placeholder="0.00" 
                                  type="number"
                                  value={predictionInput}
                                  onChange={setPredictionInput}
                                  className="text-2xl font-mono"
                                />
                                <p className="text-[10px] text-white/20 uppercase">Enter your best estimate</p>
                              </div>
                              <div className="space-y-3">
                                <Input 
                                  label="Bid Amount" 
                                  placeholder="0" 
                                  type="number"
                                  suffix="COINS"
                                  value={bidInput}
                                  onChange={setBidInput}
                                  className="text-2xl font-mono"
                                />
                                <p className="text-[10px] text-white/20 uppercase">Risk what you can afford</p>
                              </div>
                            </div>
                            <Button onClick={handleSubmitPrediction} className="w-full py-8 text-lg rounded-2xl shadow-xl shadow-emerald-500/10">
                              Submit to the Paradox <Target className="w-5 h-5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>

                  <div className="grid md:grid-cols-3 gap-6">
                    {[
                      { label: "Ultra Precision", mult: "3.0x", desc: "Error ≤ 2%", color: "text-emerald-400" },
                      { label: "High Precision", mult: "2.0x", desc: "Error ≤ 5%", color: "text-blue-400" },
                      { label: "Good Prediction", mult: "1.5x", desc: "Error ≤ 10%", color: "text-purple-400" }
                    ].map((m, i) => (
                      <div key={i}>
                        <Card className="p-6 border-white/5 hover:bg-white/5 transition-colors group">
                          <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest mb-2">{m.label}</p>
                          <p className={`text-3xl font-bold font-mono ${m.color} group-hover:scale-110 transition-transform origin-left`}>{m.mult}</p>
                          <p className="text-[10px] font-mono text-white/20 uppercase mt-2">{m.desc}</p>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="p-6 bg-white/5 rounded-3xl border border-white/5 space-y-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-white/40" />
                      <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Paradox Rules</p>
                    </div>
                    <p className="text-xs text-white/40 leading-relaxed">
                      Predictions with over <span className="text-rose-500 font-bold">25% error</span> result in a total loss of the bid. Precision is rewarded exponentially.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'admin' && isAdminAuthenticated && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-12"
            >
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-8">
                  <Card className="p-8 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="w-5 h-5 text-emerald-500" />
                      <h3 className="font-bold">Admin Controls</h3>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Round Management</p>
                        {currentRound && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            currentRound.status === 'open' 
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                              : 'bg-white/5 text-white/40 border-white/10'
                          }`}>
                            {currentRound.status.toUpperCase()}
                          </span>
                        )}
                      </div>

                      <Input 
                        label="Game Title" 
                        placeholder="e.g. DATA PARADOX" 
                        value={gameTitle}
                        onChange={(val) => {
                          setGameTitle(val);
                          handleUpdateGameTitle(val);
                        }}
                      />
                      
                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-mono uppercase tracking-widest text-white/40">New Round Theme</label>
                          {currentRound?.status === 'open' && (
                            <span className="text-[10px] text-amber-500 font-bold animate-pulse">ROUND IN PROGRESS</span>
                          )}
                        </div>
                        <Input 
                          label="" 
                          placeholder="e.g. IPL Match Metrics" 
                          value={newRoundTheme}
                          onChange={setNewRoundTheme}
                          disabled={currentRound?.status === 'open'}
                        />
                        <Button 
                          onClick={handleStartRound} 
                          variant="secondary" 
                          className="w-full"
                          disabled={currentRound?.status === 'open' || !newRoundTheme}
                        >
                          Start New Round <Play className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-white/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-mono uppercase tracking-widest text-white/40">Actual Value</label>
                        {currentRound?.status === 'revealed' && (
                          <span className="text-[10px] text-emerald-500 font-bold">COMPLETED</span>
                        )}
                      </div>
                      <Input 
                        label="" 
                        placeholder="Enter revealed value" 
                        type="number"
                        value={actualValueInput}
                        onChange={setActualValueInput}
                        disabled={!currentRound || currentRound.status === 'revealed'}
                      />
                      <Button 
                        onClick={handleReveal} 
                        variant="danger" 
                        className="w-full" 
                        disabled={!currentRound || currentRound.status === 'revealed' || !actualValueInput}
                      >
                        Reveal & Calculate <Eye className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="pt-6 border-t border-white/5">
                      {!showResetConfirm ? (
                        <Button 
                          onClick={() => setShowResetConfirm(true)} 
                          variant="outline" 
                          className="w-full text-rose-500 border-rose-500/20 hover:bg-rose-500/10"
                        >
                          Reset Entire Game <Trash2 className="w-4 h-4" />
                        </Button>
                      ) : (
                        <div className="space-y-3 p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                          <p className="text-[10px] font-mono text-rose-500 uppercase font-bold text-center">Confirm Reset?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button onClick={handleReset} variant="danger" className="py-2 text-xs">
                              Yes, Reset
                            </Button>
                            <Button onClick={() => setShowResetConfirm(false)} variant="outline" className="py-2 text-xs">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>

                  <Card className="p-8">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold">Submissions</h3>
                      <span className="text-xs font-mono text-white/40">{submissions.length} RECEIVED</span>
                    </div>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                      {submissions.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                          <div>
                            <p className="text-sm font-semibold">{sub.team_name}</p>
                            <p className="text-[10px] font-mono text-white/40">BID: {sub.bid_amount}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-mono">PRED: {sub.predicted_value}</p>
                            {currentRound?.status === 'revealed' && (
                              <p className={`text-[10px] font-bold ${sub.score > sub.bid_amount ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {sub.score > sub.bid_amount ? '+' : ''}{(sub.score - sub.bid_amount).toFixed(1)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-6 h-6 text-yellow-500" />
                      <h3 className="text-2xl font-bold tracking-tight">Leaderboard</h3>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { fetchTeams(); fetchCurrentRound(); }} className="py-2 px-4 text-xs">
                        Refresh Data
                      </Button>
                      <Button variant="outline" onClick={() => setView('participant')} className="py-2 px-4 text-xs">
                        Player View
                      </Button>
                      <Button variant="danger" onClick={() => { setIsAdminAuthenticated(false); setAdminPassword(''); setView('landing'); }} className="py-2 px-4 text-xs">
                        Logout Admin
                      </Button>
                    </div>
                  </div>

                  <Card className="overflow-hidden border-white/10">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/5">
                            <th className="px-6 py-4 text-[10px] font-mono text-white/40 uppercase tracking-widest">Rank</th>
                            <th className="px-6 py-4 text-[10px] font-mono text-white/40 uppercase tracking-widest">Team Name</th>
                            <th className="px-6 py-4 text-[10px] font-mono text-white/40 uppercase tracking-widest text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teams.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="px-6 py-20 text-center text-white/20 italic">
                                No teams joined yet.
                              </td>
                            </tr>
                          ) : teams.map((t, i) => (
                            <motion.tr 
                              key={t.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className="border-b border-white/5 hover:bg-white/5 transition-colors group"
                            >
                              <td className="px-6 py-4">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold transition-all duration-300 ${
                                  i === 0 ? 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 scale-110' :
                                  i === 1 ? 'bg-slate-400/20 text-slate-400 border border-slate-400/20' :
                                  i === 2 ? 'bg-amber-700/20 text-amber-700 border border-amber-700/20' :
                                  'bg-white/5 text-white/40'
                                }`}>
                                  {i + 1}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="font-semibold group-hover:text-emerald-400 transition-colors">{t.name}</span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <span className="font-mono font-bold text-emerald-400 text-lg">
                                  {t.balance.toFixed(0)}
                                  <span className="text-[10px] ml-1 text-white/20">COINS</span>
                                </span>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <div className="grid grid-cols-2 gap-4">
                    <Card className="p-6 bg-emerald-500/5 border-emerald-500/20">
                      <div className="flex items-center gap-3 mb-2">
                        <BarChart3 className="w-5 h-5 text-emerald-500" />
                        <p className="text-xs font-mono text-white/40 uppercase">Total Liquidity</p>
                      </div>
                      <p className="text-3xl font-bold font-mono">
                        {teams.reduce((acc, t) => acc + t.balance, 0).toFixed(0)}
                      </p>
                    </Card>
                    <Card className="p-6 bg-indigo-500/5 border-indigo-500/20">
                      <div className="flex items-center gap-3 mb-2">
                        <Users className="w-5 h-5 text-indigo-500" />
                        <p className="text-xs font-mono text-white/40 uppercase">Active Teams</p>
                      </div>
                      <p className="text-3xl font-bold font-mono">{teams.length}</p>
                    </Card>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-10 py-12 border-t border-white/5 mt-20">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-30">
            <TrendingUp className="w-4 h-4" />
            <span className="text-[10px] font-mono uppercase tracking-widest">Data Paradox Engine v1.0</span>
          </div>
          <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
            © 2026 Competitive Prediction Systems
          </p>
        </div>
      </footer>
    </div>
  );
}
