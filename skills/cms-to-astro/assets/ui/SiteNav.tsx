/**
 * Site navigation: Base UI navigation menu (desktop, dropdowns on hover/click/keyboard) and a
 * Base UI dialog as slide-in drawer (phone). Built on the shadcn components `navigation-menu` and
 * `sheet` (`npx shadcn@latest add navigation-menu sheet`). Use it as an island in the header:
 *
 *   <SiteNav client:load items={navigation.main} current={Astro.url.pathname}
 *            labels={{ menu: 'Menü', close: 'Menü schließen', nav: 'Hauptnavigation' }} />
 *
 * Every link is in the server-rendered HTML (dropdown content uses keepMounted), so crawlers, the
 * migration kit's link scan and the content comparison see the whole menu. Style through `classes`
 * (Tailwind classes per part) or edit this file; it belongs to the site.
 */
import * as React from 'react';
import { MenuIcon, XIcon } from 'lucide-react';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface NavItem {
  label: string;
  href?: string;
  children?: NavItem[];
}

type Part = 'desktop' | 'link' | 'trigger' | 'dropdown' | 'dropdownLink' | 'menuButton' | 'drawer' | 'drawerLink';

export interface SiteNavProps {
  items: NavItem[];
  /** Astro.url.pathname: marks the current page (aria-current) and its parent */
  current?: string;
  /** Width from which the desktop menu shows; below it the drawer. Default 'md' (768 px). */
  breakpoint?: 'sm' | 'md' | 'lg' | 'xl';
  /** Drawer side */
  side?: 'left' | 'right';
  labels?: { menu?: string; close?: string; nav?: string };
  classes?: Partial<Record<Part, string>>;
}

// Literal class names, so Tailwind finds them.
const SHOW_FROM = { sm: 'hidden sm:flex', md: 'hidden md:flex', lg: 'hidden lg:flex', xl: 'hidden xl:flex' };
const HIDE_FROM = { sm: 'sm:hidden', md: 'md:hidden', lg: 'lg:hidden', xl: 'xl:hidden' };

const norm = (p: string) => p.replace(/(\/index)?\.html$/, '').replace(/\/+$/, '') || '/';
const isCurrent = (href: string | undefined, current: string | undefined) =>
  !!href && !!current && !/^[a-z]+:/i.test(href) && norm(href) === norm(current);
const inTrail = (item: NavItem, current: string | undefined): boolean =>
  isCurrent(item.href, current) || (item.children ?? []).some((c) => inTrail(c, current));

export default function SiteNav({
  items,
  current,
  breakpoint = 'md',
  side = 'right',
  labels = {},
  classes = {},
}: SiteNavProps) {
  const [open, setOpen] = React.useState(false);
  const navLabel = labels.nav ?? 'Main';

  return (
    <>
      <NavigationMenu aria-label={navLabel} className={cn(SHOW_FROM[breakpoint], classes.desktop)}>
        <NavigationMenuList>
          {items.map((item, i) =>
            item.children?.length ? (
              <NavigationMenuItem key={i}>
                <NavigationMenuTrigger
                  data-current={inTrail(item, current) ? '' : undefined}
                  className={classes.trigger}
                >
                  {item.label}
                </NavigationMenuTrigger>
                <NavigationMenuContent keepMounted>
                  <ul className={cn('grid w-max min-w-52 gap-0.5', classes.dropdown)}>
                    {item.href && (
                      <li>
                        <NavigationMenuLink
                          href={item.href}
                          active={isCurrent(item.href, current)}
                          className={classes.dropdownLink}
                        >
                          {item.label}
                        </NavigationMenuLink>
                      </li>
                    )}
                    {item.children.map((child, j) => (
                      <li key={j}>
                        <NavigationMenuLink
                          href={child.href}
                          active={isCurrent(child.href, current)}
                          className={classes.dropdownLink}
                        >
                          {child.label}
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            ) : (
              <NavigationMenuItem key={i}>
                <NavigationMenuLink
                  href={item.href}
                  active={isCurrent(item.href, current)}
                  className={cn(navigationMenuTriggerStyle(), classes.link)}
                >
                  {item.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ),
          )}
        </NavigationMenuList>
      </NavigationMenu>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label={labels.menu ?? 'Menu'}
          className={cn(
            'inline-flex size-10 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            HIDE_FROM[breakpoint],
            classes.menuButton,
          )}
        >
          <MenuIcon aria-hidden="true" className="size-6" />
        </SheetTrigger>
        <SheetContent side={side} showCloseButton={false} className={cn('overflow-y-auto p-4', classes.drawer)}>
          <div className="flex items-center justify-between">
            <SheetTitle>{labels.menu ?? 'Menu'}</SheetTitle>
            <SheetClose
              aria-label={labels.close ?? 'Close menu'}
              className="inline-flex size-10 items-center justify-center rounded-md hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <XIcon aria-hidden="true" className="size-5" />
            </SheetClose>
          </div>
          <nav aria-label={navLabel}>
            <DrawerList items={items} current={current} className={classes.drawerLink} />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function DrawerList({
  items,
  current,
  className,
  depth = 0,
}: {
  items: NavItem[];
  current?: string;
  className?: string;
  depth?: number;
}) {
  return (
    <ul className={cn('grid gap-0.5', depth > 0 && 'mt-0.5 ml-3 border-l pl-3')}>
      {items.map((item, i) => (
        <li key={i}>
          {item.href ? (
            <a
              href={item.href}
              aria-current={isCurrent(item.href, current) ? 'page' : undefined}
              className={cn(
                'block rounded-md px-2 py-2 text-base hover:bg-muted aria-[current=page]:font-semibold',
                className,
              )}
            >
              {item.label}
            </a>
          ) : (
            <span className="block px-2 py-2 text-base font-medium text-muted-foreground">{item.label}</span>
          )}
          {item.children?.length ? (
            <DrawerList items={item.children} current={current} className={className} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
