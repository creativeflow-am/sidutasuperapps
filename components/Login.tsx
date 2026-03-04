
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (password: string) => boolean;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onLogin(password);
    if (!success) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full"></div>
      </div>

      <div className={`w-full max-w-md bg-[#141414] border border-white/10 rounded-[32px] p-8 shadow-2xl transition-all duration-300 ${error ? 'shake border-red-500/50' : ''}`}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-black text-2xl mb-4 shadow-lg shadow-blue-600/20">
            <i className="fas fa-lock"></i>
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
            Creative<span className="text-blue-600">Flow</span> Hub
          </h1>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-2">Private Access Only</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-1">Enter Access Key</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/10 focus:outline-none focus:border-blue-600/50 transition-all"
              autoFocus
            />
          </div>
          
          <button 
            type="submit"
            className="w-full py-4 bg-blue-600 text-black rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-blue-500 active:scale-[0.98] transition-all"
          >
            Unlock Access
          </button>
        </form>

        {error && (
          <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center mt-4 animate-pulse">
            Invalid Access Key
          </p>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <p className="text-white/20 text-[9px] font-medium leading-relaxed">
            Authorized personnel only. All access attempts are logged.<br/>
            Contact administrator if you lost your key.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};

export default Login;
