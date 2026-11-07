/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  Home, Users, Award, BarChart3, Menu, Sparkles
} from 'lucide-react';
import { NavigationMenuId } from './Sidebar';

interface MobileBottomNavProps {
  currentView: NavigationMenuId;
  onNavigate: (viewId: NavigationMenuId) => void;
  onOpenMenu: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentView,
  onNavigate,
  onOpenMenu
}) => {
  const navItems = [
    {
      id: 'dashboard' as NavigationMenuId,
      label: 'Trang chủ',
      icon: Home,
      action: () => onNavigate('dashboard')
    },
    {
      id: 'students' as NavigationMenuId,
      label: 'Học sinh',
      icon: Users,
      action: () => onNavigate('students')
    },
    {
      id: 'rewards' as NavigationMenuId,
      label: 'Đổi thưởng',
      icon: Award,
      action: () => onNavigate('rewards')
    },
    {
      id: 'reports' as NavigationMenuId,
      label: 'Báo cáo',
      icon: BarChart3,
      action: () => onNavigate('reports')
    },
  ];

  return (
    <nav 
      aria-label="Thanh điều hướng di động"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_25px_rgba(15,23,42,0.08)] px-2 py-1.5 flex items-center justify-around lg:hidden safe-area-pb"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentView === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={item.action}
            className={`flex-1 py-1 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all relative focus:outline-hidden normal-case ${
              isActive
                ? 'text-indigo-600 font-bold'
                : 'text-slate-600 hover:text-indigo-600 font-semibold'
            }`}
          >
            {isActive && (
              <span className="absolute -top-1 w-8 h-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full" />
            )}
            <div className={`p-1 rounded-xl transition-all ${
              isActive ? 'bg-indigo-50 text-indigo-700 scale-105 shadow-2xs' : 'text-slate-600'
            }`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10.5px] tracking-tight leading-none normal-case truncate max-w-[64px]">
              {item.label}
            </span>
          </button>
        );
      })}

      {/* Menu Nút Mở Toàn Bộ 16 Tính Năng */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex-1 py-1 px-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-slate-700 hover:text-indigo-600 font-bold transition-all focus:outline-hidden active:scale-95 normal-case"
        title="Mở toàn bộ 16 chức năng Lớp Học Hạnh Phúc"
      >
        <div className="p-1 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-xs shadow-indigo-600/30">
          <Menu className="w-5 h-5" />
        </div>
        <span className="text-[10.5px] tracking-tight leading-none normal-case text-indigo-700 font-bold">
          Menu
        </span>
      </button>
    </nav>
  );
};
