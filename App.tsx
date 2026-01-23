import React, { useState, useEffect, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Phone, BarChart, Award, Settings as SettingsIcon, Search, Moon, Sun, LogOut, ZoomIn, ZoomOut, Terminal } from 'lucide-react';

// Pages
import { Campaigns } from './pages/Campaigns';
import { Contacts } from './pages/Contacts';
import { Calls } from './pages/Calls';
import { Reports } from './pages/Reports';
import { Quality } from './pages/Quality';
import { Settings } from './pages/Settings';
import { Logs } from './pages/Logs';

// --- Theme Context ---
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
}

const ThemeContext = createContext<ThemeContextType>({ theme: 'light', toggleTheme: () => {}, zoomLevel: 100, setZoomLevel: () => {} });

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
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 transition-colors duration-200">
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Logo Area */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Callcenter IA - DDM</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Gestão de Campanhas e Análise de Performance</p>
          </div>
          <span className="hidden md:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-white shadow-sm">
             <span className="w-2 h-2 rounded-full bg-white mr-1.5 animate-pulse"></span>
             VAPI Conectada
          </span>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button 
             onClick={handleZoomClick}
             className="hidden md:flex items-center border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
             title="Ajustar Zoom/Densidade"
          >
             {zoomLevel > 100 ? <ZoomIn className="w-4 h-4 text-slate-400 dark:text-slate-300 mr-2" /> : <ZoomOut className="w-4 h-4 text-slate-400 dark:text-slate-300 mr-2" />}
             <span className="text-xs text-slate-500 dark:text-slate-300 font-medium w-8 text-center">{zoomLevel}%</span>
          </button>
          
          <button 
            onClick={toggleTheme}
            className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors"
            title="Alternar Tema"
          >
             {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          
          <button className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors">
             <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="px-6 flex overflow-x-auto no-scrollbar">
        <NavItem to="/" icon={LayoutDashboard} label="Campanhas" />
        <NavItem to="/contacts" icon={Users} label="Contatos" />
        <NavItem to="/calls" icon={Phone} label="Ligações" />
        <NavItem to="/reports" icon={BarChart} label="Relatórios" />
        <NavItem to="/quality" icon={Award} label="Qualidade" />
        <NavItem to="/logs" icon={Terminal} label="Logs do Sistema" />
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