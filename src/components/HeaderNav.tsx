import React from 'react';
import {
  Store,
  ShoppingCart,
  AlertTriangle,
  Package,
  BarChart3,
  Users,
  Wallet,
  Camera,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Settings,
  Lock,
} from 'lucide-react';
import { longDate } from '../utils/format';
import type { BackendMode } from '../utils/db';

export type NavTab = 'pos' | 'alerts' | 'inventory' | 'customers' | 'cash' | 'reports';

interface HeaderNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  lowStockCount: number;
  outOfStockCount: number;
  receivablesTotal: number;
  cashOpen: boolean;
  backendMode: BackendMode;
  isConnected: boolean;
  onOpenScanner: () => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onOpenSettings: () => void;
  pinEnabled: boolean;
  onLock: () => void;
}

const TABS: { id: NavTab; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'pos', label: 'Venta Rápida', short: 'Venta', icon: ShoppingCart },
  { id: 'alerts', label: 'Alertas Stock', short: 'Alertas', icon: AlertTriangle },
  { id: 'inventory', label: 'Inventario', short: 'Stock', icon: Package },
  { id: 'customers', label: 'Fiado', short: 'Fiado', icon: Users },
  { id: 'cash', label: 'Caja', short: 'Caja', icon: Wallet },
  { id: 'reports', label: 'Reportes', short: 'Reportes', icon: BarChart3 },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentTab,
  onTabChange,
  lowStockCount,
  outOfStockCount,
  receivablesTotal,
  cashOpen,
  backendMode,
  isConnected,
  onOpenScanner,
  isAudioMuted,
  onToggleAudio,
  onOpenSettings,
  pinEnabled,
  onLock,
}) => {
  const totalAlerts = lowStockCount + outOfStockCount;

  const badgeFor = (id: NavTab): string | null => {
    if (id === 'alerts' && totalAlerts > 0) return `${totalAlerts}`;
    if (id === 'customers' && receivablesTotal > 0)
      return '$' + Math.round(receivablesTotal / 1000) + 'k';
    if (id === 'cash') return cashOpen ? '●' : null;
    return null;
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#F9F9F7] border-b-2 border-black select-none">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center border-2 border-black">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <span className="block text-[9px] sm:text-[10px] font-bold tracking-[0.3em] uppercase text-black/50 leading-none mb-0.5">
                System Terminal
              </span>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-2xl font-black tracking-tighter text-black leading-none">
                  KIOSKO<span className="font-serif italic font-normal text-neutral-600">.CONTROL</span>
                </h1>
                {(() => {
                  const local = backendMode === 'local';
                  const ok = !local && isConnected;
                  const cls = local
                    ? 'border-amber-600 bg-amber-50 text-amber-800'
                    : ok
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
                    : 'border-red-600 bg-red-50 text-red-700';
                  const label = local ? 'Local' : ok ? 'Live Sync' : 'Conectando';
                  return (
                    <div
                      className={`flex items-center space-x-1.5 px-2 py-0.5 border text-[10px] font-mono uppercase tracking-wider font-bold ${cls}`}
                      title={
                        local
                          ? 'Modo local: los datos se guardan en este dispositivo'
                          : ok
                          ? 'Sincronizado en tiempo real'
                          : 'Conectando con la base central'
                      }
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          ok ? 'bg-emerald-600 animate-pulse' : local ? 'bg-amber-500' : 'bg-red-600'
                        }`}
                      />
                      <span className="hidden sm:inline">{label}</span>
                      {ok ? <Wifi className="w-3 h-3 sm:hidden" /> : <WifiOff className="w-3 h-3 sm:hidden" />}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="hidden xl:block text-right">
            <p className="text-sm font-serif italic text-neutral-700 capitalize">{longDate()}</p>
          </div>

          <nav className="hidden md:flex items-center border-2 border-black bg-white divide-x-2 divide-black">
            {TABS.map(({ id, label, icon: Icon }) => {
              const badge = badgeFor(id);
              return (
                <button
                  key={id}
                  id={`tab-btn-${id}-desktop`}
                  onClick={() => onTabChange(id)}
                  className={`relative px-3 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors ${
                    currentTab === id ? 'bg-black text-white' : 'text-black hover:bg-[#F2F2EF]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                  {badge && (
                    <span
                      className={`px-1.5 py-0.2 text-[10px] font-mono font-bold border ${
                        currentTab === id
                          ? 'bg-white text-black border-white'
                          : id === 'cash'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-red-600 text-white border-red-600'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center space-x-2">
            <button
              id="btn-header-scanner"
              onClick={onOpenScanner}
              className="px-3 py-2 bg-black hover:bg-neutral-800 text-white border-2 border-black text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-colors"
              title="Escanear con la cámara del celular"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Escanear</span>
            </button>
            <button
              id="btn-toggle-audio"
              onClick={onToggleAudio}
              className={`p-2 border-2 border-black text-xs transition-colors ${
                isAudioMuted ? 'bg-[#F2F2EF] text-neutral-400' : 'bg-white text-black hover:bg-[#F2F2EF]'
              }`}
              title={isAudioMuted ? 'Sonidos silenciados' : 'Sonidos activos'}
            >
              {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            {pinEnabled && (
              <button
                onClick={onLock}
                className="p-2 border-2 border-black bg-white text-black hover:bg-[#F2F2EF]"
                title="Bloquear"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onOpenSettings}
              className="p-2 border-2 border-black bg-white text-black hover:bg-[#F2F2EF]"
              title="Configuración"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Nav inferior fija (mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#F9F9F7] border-t-2 border-black px-1 py-1 flex items-center justify-around shadow-lg overflow-x-auto no-scrollbar">
        {TABS.map(({ id, short, icon: Icon }) => {
          const badge = badgeFor(id);
          return (
            <button
              key={id}
              id={`mobile-tab-${id}`}
              onClick={() => onTabChange(id)}
              className={`relative flex flex-col items-center py-1.5 px-2.5 transition-colors flex-shrink-0 ${
                currentTab === id
                  ? 'text-black font-black border-b-2 border-black'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] uppercase font-bold tracking-wider mt-0.5">{short}</span>
              {badge && (
                <span className="absolute top-0 right-0 px-1 bg-red-600 text-white text-[8px] font-mono font-bold">
                  {badge === '●' ? '●' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
};
