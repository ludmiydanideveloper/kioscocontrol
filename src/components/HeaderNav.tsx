import React from 'react';
import {
  Store,
  ShoppingCart,
  AlertTriangle,
  Package,
  BarChart3,
  Users,
  Truck,
  Wallet,
  Camera,
  Volume2,
  VolumeX,
  Settings,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { cx } from './ui';
import type { Role } from '../utils/auth';

export type NavTab =
  | 'pos'
  | 'alerts'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'cash'
  | 'reports';

interface HeaderNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  role: Role | null;
  lowStockCount: number;
  outOfStockCount: number;
  receivablesTotal: number;
  payablesTotal: number;
  cashOpen: boolean;
  onOpenScanner: () => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  onChangeMyPin?: () => void;
}

const TABS: { id: NavTab; label: string; icon: React.ElementType }[] = [
  { id: 'pos', label: 'Vender', icon: ShoppingCart },
  { id: 'alerts', label: 'Alertas', icon: AlertTriangle },
  { id: 'inventory', label: 'Inventario', icon: Package },
  { id: 'customers', label: 'Fiado', icon: Users },
  { id: 'suppliers', label: 'Proveedores', icon: Truck },
  { id: 'cash', label: 'Caja', icon: Wallet },
  { id: 'reports', label: 'Reportes', icon: BarChart3 },
];

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentTab,
  onTabChange,
  role,
  lowStockCount,
  outOfStockCount,
  receivablesTotal,
  payablesTotal,
  cashOpen,
  onOpenScanner,
  isAudioMuted,
  onToggleAudio,
  onOpenSettings,
  onLogout,
  onChangeMyPin,
}) => {
  const totalAlerts = lowStockCount + outOfStockCount;
  const isCashier = role === 'cashier';
  const tabs = isCashier ? [] : TABS;

  const dot = (id: NavTab): { count?: number; tone: string } | null => {
    if (id === 'alerts' && totalAlerts > 0) return { count: totalAlerts, tone: 'bg-danger' };
    if (id === 'customers' && receivablesTotal > 0) return { tone: 'bg-warn' };
    if (id === 'suppliers' && payablesTotal > 0) return { tone: 'bg-warn' };
    if (id === 'cash' && cashOpen) return { tone: 'bg-brand' };
    return null;
  };

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-2 hover:text-ink transition-colors';

  return (
    <>
      <header className="sticky top-0 z-40 bg-canvas/85 backdrop-blur-md border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-ink text-white flex items-center justify-center">
              <Store className="h-[18px] w-[18px]" strokeWidth={2} />
            </div>
            <div className="flex items-center gap-2 leading-none">
              <span className="text-[15px] font-semibold tracking-tight">Kiosco</span>
              {isCashier && (
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                  Vendedor
                </span>
              )}
            </div>
          </div>

          {tabs.length > 0 && (
            <nav className="hidden lg:flex items-center gap-1">
              {tabs.map(({ id, label, icon: Icon }) => {
                const d = dot(id);
                const active = currentTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => onTabChange(id)}
                    title={label}
                    className={cx(
                      'relative inline-flex items-center gap-1.5 rounded-lg px-2.5 xl:px-3 h-9 text-[13px] font-medium transition-colors',
                      active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2} />
                    <span className="hidden xl:inline">{label}</span>
                    {d && (
                      <span
                        className={cx(
                          'ml-0.5 inline-flex items-center justify-center rounded-full text-white text-[10px] font-semibold nums',
                          d.count ? 'min-w-4 h-4 px-1' : 'h-1.5 w-1.5',
                          active ? 'bg-white/30' : d.tone,
                        )}
                      >
                        {d.count ?? ''}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={onOpenScanner}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-white h-9 px-3 text-sm font-medium hover:bg-brand/90 transition-colors"
            >
              <Camera className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Escanear</span>
            </button>
            <button onClick={onToggleAudio} className={iconBtn} title={isAudioMuted ? 'Sonido apagado' : 'Sonido'}>
              {isAudioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            {onOpenSettings && (
              <button onClick={onOpenSettings} className={iconBtn} title="Configuración">
                <Settings className="h-4 w-4" />
              </button>
            )}
            {onChangeMyPin && (
              <button onClick={onChangeMyPin} className={iconBtn} title="Cambiar mi PIN">
                <KeyRound className="h-4 w-4" />
              </button>
            )}
            {onLogout && (
              <button onClick={onLogout} className={iconBtn} title="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {tabs.length > 0 && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-stretch justify-around">
            {tabs.map(({ id, label, icon: Icon }) => {
              const d = dot(id);
              const active = currentTab === id;
              return (
                <button
                  key={id}
                  onClick={() => onTabChange(id)}
                  className={cx(
                    'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                    active ? 'text-ink' : 'text-muted',
                  )}
                >
                  <span className="relative">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                    {d && (
                      <span
                        className={cx(
                          'absolute -top-0.5 -right-1.5 rounded-full text-white text-[9px] font-semibold nums flex items-center justify-center',
                          d.count ? 'min-w-3.5 h-3.5 px-0.5' : 'h-2 w-2',
                          d.tone,
                        )}
                      >
                        {d.count ?? ''}
                      </span>
                    )}
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
};
