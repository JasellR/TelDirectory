
'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, UserCircle } from 'lucide-react';
import { logoutAction } from '@/lib/auth-actions';
import { useTransition } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface UserMenuProps {
  username: string;
}

export function UserMenu({ username }: UserMenuProps) {
  const [isPending, startTransition] = useTransition();
  const { t } = useTranslation();

  const handleLogout = () => {
    startTransition(async () => {
      await logoutAction();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            {/* Placeholder for actual avatar image if you add them later */}
            {/* <AvatarImage src="/avatars/01.png" alt={username} /> */}
            <AvatarFallback>{username.substring(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{username}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {t('authenticatedUserLabel')}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Add more items here if needed, e.g., "Profile", "Settings" */}
        {/* <DropdownMenuItem>
          <UserCircle className="mr-2 h-4 w-4" />
          <span>{t('profileDropdownItem')}</span>
        </DropdownMenuItem> */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} disabled={isPending} className="cursor-pointer">
          <LogOut className="mr-2 h-4 w-4" />
          <span>{isPending ? t('loggingOutButton') : t('logoutButton')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
