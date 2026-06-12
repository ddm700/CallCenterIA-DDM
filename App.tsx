import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Phone, BarChart, Award, Settings as SettingsIcon, Search, Moon, Sun, LogOut, ZoomIn, ZoomOut, Terminal, Handshake } from 'lucide-react';

// Pages
import { Campaigns } from './pages/Campaigns';
import { Contacts } from './pages/Contacts';
import { Calls } from './pages/Calls';
import { Reports } from './pages/Reports';
import { Quality } from './pages/Quality';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';
import { KpiAcordos } from './pages/KpiAcordos';

// --- Theme Context ---
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => { }, zoomLevel: 100, setZoomLevel: () => { } });

export const useTheme = () => useContext(ThemeContext);

const NavItem: React.FC<{ to: string; icon: any; label: string }> = ({ to, icon: Icon, label }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `
        flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2
        ${isActive
          ? 'border-primary text-slate-900 dark:text-white bg-orange-50/50 dark:bg-slate-800'
          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
        }
      `}
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  );
};

const TopBar = () => {
  const { theme, toggleTheme, zoomLevel, setZoomLevel } = useTheme();

  const handleZoomClick = () => {
    // Cycle through zoom levels: 90% -> 100% -> 110% -> 90%
    if (zoomLevel === 100) setZoomLevel(110);
    else if (zoomLevel === 110) setZoomLevel(90);
    else setZoomLevel(100);
  };

  return (
    <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-all duration-300 shadow-sm">
      <div className="px-6 py-2 flex items-center justify-between">
        {/* Logo Area */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-primary to-orange-600 rounded-md shadow-lg shadow-orange-500/20">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight leading-none">Callcenter IA - DDM</h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 ml-4">
            <span className="flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              VAPI CONNECTED
            </span>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomClick}
            className="hidden md:flex items-center h-8 border border-slate-200 dark:border-slate-700 rounded-md px-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors btn-click"
            title="Adjust Density"
          >
            {zoomLevel > 100 ? <ZoomIn className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mr-2" /> : <ZoomOut className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 mr-2" />}
            <span className="text-xs text-slate-600 dark:text-slate-300 font-mono w-8 text-center">{zoomLevel}%</span>
          </button>

          <button
            onClick={toggleTheme}
            className="h-8 w-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 transition-colors btn-click"
            title="Toggle Theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          <button className="h-8 w-8 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md border border-slate-200 dark:border-slate-700 transition-colors btn-click">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation - Tech Style */}
      <div className="px-6 flex overflow-x-auto no-scrollbar border-t border-slate-100 dark:border-slate-800/50">
        <NavItem to="/" icon={LayoutDashboard} label="Campanhas" />
        <NavItem to="/contacts" icon={Users} label="Contatos" />
        <NavItem to="/calls" icon={Phone} label="Ligações" />
        <NavItem to="/reports" icon={BarChart} label="Relatórios" />
        <NavItem to="/kpi-acordos" icon={Handshake} label="KPI Acordos" />
        <NavItem to="/quality" icon={Award} label="Qualidade" />
        <NavItem to="/logs" icon={Terminal} label="System Logs" />
        <NavItem to="/settings" icon={SettingsIcon} label="Configurações" />
      </div>
    </header>
  );
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [zoomLevel, setZoomLevel] = useState(100);

  useEffect(() => {
    // Check local storage or system preference
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, zoomLevel, setZoomLevel }}>
      <Router>
        <div
          className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans pb-20 transition-colors duration-200"
          style={{ zoom: `${zoomLevel}%` }} // CSS Zoom property for density control
        >
          <TopBar />
          <main className="p-6 max-w-[1600px] mx-auto">
            <Routes>
              <Route path="/" element={<Campaigns />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/calls" element={<Calls />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/kpi-acordos" element={<KpiAcordos />} />
              <Route path="/quality" element={<Quality />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/logs" element={<Logs />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeContext.Provider>
  );
};

export default App;
