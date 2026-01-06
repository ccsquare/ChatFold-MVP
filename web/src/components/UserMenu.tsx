'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { AuthDialog } from './auth/AuthDialog';
import { ThemeToggle } from './ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, LogIn, UserPlus, User } from 'lucide-react';
import { toast } from 'sonner';

export function UserMenu() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const handleLoginClick = () => {
    setAuthMode('login');
    setAuthDialogOpen(true);
  };

  const handleRegisterClick = () => {
    setAuthMode('register');
    setAuthDialogOpen(true);
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 hover:bg-cf-hover rounded-md p-1 transition-colors">
            <div
              className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"
              aria-hidden="true"
            >
              {isAuthenticated && user ? (
                <span className="text-white text-xs font-medium">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              ) : (
                <User className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <p className="text-[12px] font-medium text-cf-text">
                {isAuthenticated && user ? user.username : 'Guest'}
              </p>
              <p className="text-[10px] text-cf-text-secondary">
                {isAuthenticated && user
                  ? user.plan.charAt(0).toUpperCase() + user.plan.slice(1)
                  : 'Not logged in'}
              </p>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isAuthenticated ? (
              <>
                <DropdownMenuItem disabled className="text-xs">
                  {user?.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={handleLoginClick}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Log in
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleRegisterClick}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Sign up
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} defaultMode={authMode} />
    </>
  );
}
