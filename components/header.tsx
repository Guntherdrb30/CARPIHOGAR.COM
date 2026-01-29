'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/store/cart';
import { useSession, signOut } from 'next-auth/react';
import { User, ShoppingCart, LogIn, LogOut, Home, Box, Star, Mail, Menu, X, Minus, Plus, Trash2, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ProductLiveSearch from '@/components/product-live-search';
import ConfirmDialog from '@/components/confirm-dialog';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuToggle,
  Button,
  Badge,
  Card,
  CardBody,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
} from '@heroui/react';

type HeaderProps = {
  logoUrl?: string;
  brandName?: string;
};

export default function Header({ logoUrl, brandName }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const totalItems = useCartStore((state) => state.getTotalItems());
  const cartItems = useCartStore((s) => s.items);
  const cartTotalUSD = useCartStore((s) => s.getTotalUSD());
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartVisible, setCartVisible] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const cartRef = useRef<HTMLDivElement | null>(null);
  const experiencesRef = useRef<HTMLDivElement | null>(null);
  const { data: session, status } = useSession();
  const [experiencesOpen, setExperiencesOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (cartRef.current && !cartRef.current.contains(target)) {
        setCartOpen(false);
      }
      if (experiencesRef.current && !experiencesRef.current.contains(target)) {
        setExperiencesOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const clearAssistantCart = async () => {
    try {
      await fetch('/api/assistant/ui-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'clear_cart' }),
      });
    } catch {}
  };

  const solutionsLinks = [
    { href: '/moodboard', label: 'Moodboard' },
    { href: '/personalizar-muebles', label: 'Configurador de mobiliario' },
    { href: '/crea-tu-cocina', label: 'Crea tu cocina' },
  ];

  const navLinks = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/productos', label: 'Productos', icon: Box },
    { href: '/crea-tu-cocina', label: 'Crea tu cocina', icon: Sparkles },
    { href: '/novedades', label: 'Novedades', icon: Star },
    { href: '/contacto', label: 'Contacto', icon: Mail },
  ];

  const role = (session?.user as any)?.role as string | undefined;
  const dashboardHref =
    role === 'ADMIN'
      ? '/dashboard/admin'
      : role === 'SUPERVISOR_PROYECTOS'
      ? '/dashboard/supervisor'
      : role === 'ALIADO'
      ? '/dashboard/aliado'
      : role === 'DELIVERY'
      ? '/dashboard/delivery'
      : '/dashboard/cliente';
  const dashboardLabel =
    role === 'ADMIN'
      ? 'Admin'
      : role === 'SUPERVISOR_PROYECTOS'
      ? 'Supervisor'
      : role === 'ALIADO'
      ? 'Mi Panel'
      : role === 'DELIVERY'
      ? 'Delivery'
      : 'Mi Perfil';
  const authenticatedLinks = [
    { href: dashboardHref, label: dashboardLabel, icon: User },
    { href: '/carrito', label: 'Carrito', icon: ShoppingCart },
  ];

  const unauthenticatedLinks = [
    { href: '/auth/login', label: 'Ingresar', icon: LogIn },
    { href: '/carrito', label: 'Carrito', icon: ShoppingCart },
  ];

  const getLinks = () => {
    if (status === 'authenticated') {
      return [...navLinks, ...authenticatedLinks];
    }
    return [...navLinks, ...unauthenticatedLinks];
  };

  const allLinks = getLinks();

  // Mobile cart open/close with animation mount control
  const openCart = () => {
    setCartVisible(true);
    setTimeout(() => setCartOpen(true), 10);
  };
  const closeCart = () => {
    setCartOpen(false);
    setTimeout(() => setCartVisible(false), 250);
  };


  return (
    <header className="sticky top-0 z-50">
      <Navbar
        isBordered
        isBlurred
        maxWidth="full"
        height={72}
        className="bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 shadow-md"
        classNames={{
          menu: 'bg-white shadow-xl border',
          menuItem: 'bg-white',
          wrapper: 'h-[72px]'
        }}
        isMenuOpen={isOpen}
        onMenuOpenChange={setIsOpen}
      >
        <NavbarBrand>
          <Link href="/" className="flex items-center gap-3" aria-label={brandName || 'Inicio'}>
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt={brandName || 'Logo'} className="h-9 lg:h-10 w-auto object-contain" />
                <span className="hidden xl:inline text-2xl font-bold text-brand">
                  {brandName || 'Carpihogar.ai'}
                </span>
              </>
            ) : (
              <span className="text-2xl md:text-3xl font-bold text-brand">{brandName || 'Carpihogar.ai'}</span>
            )}
          </Link>
        </NavbarBrand>

        <NavbarContent className="hidden xl:flex flex-1 justify-center min-w-0">
          <div className="w-full max-w-xl">
            <ProductLiveSearch placeholder="Buscar productos..." />
          </div>
        </NavbarContent>

        {/* Compact search (lg only) */}
        <NavbarContent className="hidden lg:flex xl:hidden" justify="center">
          <Button isIconOnly variant="light" aria-label="Buscar" onPress={() => setSearchOpen(true)}>
            <Search size={18} />
          </Button>
        </NavbarContent>

        <NavbarContent justify="end" className="hidden lg:flex items-center gap-1">
          {/* Links principales */}
          {allLinks
            .filter((l) => l.href !== '/carrito')
            .map((link) => (
              <NavbarItem key={link.href} className="px-1">
                <Link
                  href={link.href}
                  className="text-gray-700/80 hover:text-brand transition-colors px-2 py-1 whitespace-nowrap text-sm xl:text-base"
                >
                  {link.label}
                </Link>
              </NavbarItem>
            ))}

          {/* Menú Experiencias (Moodboard + Configurador) */}
          <NavbarItem className="px-1">
            <div
              className="relative"
              ref={experiencesRef}
            >
              <button
                type="button"
                onClick={() => setExperiencesOpen((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 text-sm xl:text-base transition-colors ${
                  experiencesOpen
                    ? "text-brand"
                    : "text-gray-700/80 hover:text-brand"
                }`}
              >
                <Sparkles size={16} className="text-brand" />
                <span>Experiencias</span>
              </button>
              {experiencesOpen && (
                <div className="absolute left-0 mt-2 min-w-[220px] rounded-lg border bg-white shadow-lg py-2 z-[900]">
                  {solutionsLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center px-3 py-1.5 text-xs xl:text-sm text-gray-700 hover:bg-gray-50 hover:text-brand"
                      onClick={() => setExperiencesOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </NavbarItem>

          <NavbarItem>
            <div className="relative" ref={cartRef}>
              <Badge
                content={isClient && totalItems > 0 ? totalItems : null}
                color="danger"
                isInvisible={!isClient || totalItems === 0}
                placement="top-right"
                size="lg"
                classNames={{ badge: 'bg-[var(--color-brand)] text-white ring-2 ring-white' }}
              >
                <Button variant="light" size="sm" onPress={() => setCartOpen((v) => !v)} startContent={<ShoppingCart size={18} />}>
                  Carrito
                </Button>
              </Badge>
              {cartOpen && (
                <div className="absolute right-0 mt-2 w-80 z-[1000]">
                  <Card className="shadow-xl bg-white border">
                    <CardBody className="p-0">
                      <div className="p-3 font-semibold">Tu Carrito</div>
                      <Divider />
                      <div className="max-h-64 overflow-auto divide-y">
                        {cartItems.length === 0 ? (
                          <div className="p-3 text-sm text-gray-600">{"A\u00fan no has agregado productos."}</div>
                        ) : (
                          cartItems.slice(0, 4).map((it) => (
                            <div key={it.id} className="p-3 text-sm flex items-center gap-2">
                              <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex-none">
                                {it.image ? <img src={it.image} className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{it.name}</div>
                                <div className="mt-1 flex items-center gap-1">
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="flat"
                                    aria-label="Disminuir"
                                    onPress={() => {
                                      const n = it.quantity - 1;
                                      if (n <= 0) {
                                        removeItem(it.id);
                                        toast.success('Producto eliminado del carrito');
                                      } else {
                                        updateQty(it.id, n);
                                        toast.info(`Cantidad actualizada a ${n}`);
                                      }
                                    }}
                                  >
                                    <Minus size={12} />
                                  </Button>
                                  <span className="px-1">{it.quantity}</span>
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="flat"
                                    aria-label="Aumentar"
                                    onPress={() => {
                                      const max = typeof it.stock === 'number' ? it.stock : Infinity;
                                      if (it.quantity >= (max as number)) {
                                        toast.warning(`Stock mǭximo disponible: ${max}`);
                                        return;
                                      }
                                      const n = it.quantity + 1;
                                      updateQty(it.id, n);
                                      toast.info(`Cantidad actualizada a ${n}`);
                                    }}
                                  >
                                    <Plus size={12} />
                                  </Button>
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="flat"
                                    className="text-red-600"
                                    aria-label="Eliminar"
                                    onPress={() => {
                                      removeItem(it.id);
                                      toast.success('Producto eliminado del carrito');
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                </div>
                              </div>
                              <div className="text-gray-700 whitespace-nowrap font-medium">${(it.priceUSD * it.quantity).toFixed(2)}</div>
                            </div>
                          ))
                        )}
                      </div>
                      <Divider />
                      <div className="p-3 text-sm flex items-center justify-between">
                        <span>Total aprox.</span>
                        <span className="font-semibold">${cartTotalUSD.toFixed(2)}</span>
                      </div>
                      <div className="p-3 pt-0 flex gap-2 items-center">
                        <Button size="sm" variant="flat" color="danger" onPress={() => setConfirmClear(true)}>
                          Vaciar
                        </Button>
                        <Link href="/carrito" className="flex-1">
                          <Button fullWidth size="sm" variant="bordered" onPress={() => setCartOpen(false)}>
                            Ver Carrito
                          </Button>
                        </Link>
                        <Link href="/checkout/revisar" className="flex-1">
                          <Button fullWidth size="sm" color="primary" onPress={() => setCartOpen(false)}>
                            Pagar
                          </Button>
                        </Link>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}
            </div>
          </NavbarItem>

          {status === 'authenticated' && (
            <NavbarItem>
              <Button variant="light" size="sm" onPress={() => signOut()} startContent={<LogOut size={16} />}>
                Cerrar Sesion
              </Button>
            </NavbarItem>
          )}
        </NavbarContent>

        {/* Mobile actions */}
        <NavbarContent className="md:hidden" justify="end">
          {/* Mobile search trigger (between logo and cart) */}
          <NavbarItem>
            <Button isIconOnly variant="light" aria-label="Buscar" onPress={() => setSearchOpen(true)}>
              <Search size={20} />
            </Button>
          </NavbarItem>
          <NavbarItem>
            <Badge
              content={isClient && totalItems > 0 ? totalItems : null}
              color="danger"
              isInvisible={!isClient || totalItems === 0}
              size="lg"
              classNames={{ badge: 'bg-[var(--color-brand)] text-white ring-2 ring-white' }}
            >
              <Button isIconOnly variant="light" aria-label="Carrito" onPress={openCart}>
                <ShoppingCart size={20} />
              </Button>
            </Badge>
          </NavbarItem>
          <NavbarMenuToggle aria-label={isOpen ? 'Cerrar menú' : 'Abrir menú'} icon={isOpen ? <X /> : <Menu />} />
        </NavbarContent>

        {/* Mobile menu content */}
        <NavbarMenu>
          <div className="px-4 py-3">
            <ProductLiveSearch placeholder="Buscar productos..." />
          </div>
          <nav className="flex flex-col px-2 pb-4 gap-1">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded text-gray-700 hover:bg-gray-100"
                onClick={() => setIsOpen(false)}
              >
                <span className="flex items-center">
                  <link.icon className="mr-2" size={20} />
                  {link.label}
                </span>
              </Link>
            ))}

            {/* Sección Experiencias en móvil */}
            <div className="mt-3 border-t pt-3">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Experiencias
              </p>
              {solutionsLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 rounded text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  onClick={() => setIsOpen(false)}
                >
                  <Sparkles size={18} className="text-brand" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
            {status === 'authenticated' && (
              <Button variant="light" startContent={<LogOut size={18} />} onPress={() => { signOut(); setIsOpen(false); }}>
                Cerrar Sesion
              </Button>
            )}
          </nav>
        </NavbarMenu>
      </Navbar>

      {/* Quick search modal for compact layouts */}
      <Modal
        isOpen={searchOpen}
        onOpenChange={setSearchOpen}
        placement="top-center"
        backdrop="opaque"
        size="md"
        radius="lg"
        shadow="lg"
        scrollBehavior="inside"
        classNames={{
          wrapper: 'w-full max-w-md mx-auto p-2',
          base: 'bg-white',
          header: 'bg-white border-b px-4 py-3',
          body: 'bg-white p-4',
        }}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Buscar productos</ModalHeader>
              <ModalBody>
                <ProductLiveSearch placeholder="Buscar productos..." onDone={() => setSearchOpen(false)} />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Mobile cart drawer */}
      {cartVisible && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <div className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${cartOpen ? 'opacity-100' : 'opacity-0'}`} onClick={closeCart} />
          <div className={`absolute inset-y-0 right-0 w-80 max-w-[90%] bg-white shadow-xl flex flex-col transform transition-transform duration-300 ${cartOpen ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="flex items-center justify-between p-3 border-b">
              <div className="font-semibold">Tu Carrito</div>
              <button onClick={closeCart} aria-label="Cerrar" className="p-1 rounded hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto divide-y">
              {cartItems.length === 0 ? (
                <div className="p-4 text-sm text-gray-600">{"A\u00fan no has agregado productos."}</div>
              ) : (
                cartItems.slice(0, 20).map((it) => (
                  <div key={it.id} className="p-3 text-sm flex items-center gap-2">
                    <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 flex-none">
                      {it.image ? <img src={it.image} className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium text-gray-800">{it.name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          aria-label="Disminuir"
                          onClick={() => {
                            const next = it.quantity - 1;
                            if (next <= 0) {
                              removeItem(it.id);
                              toast.success('Producto eliminado del carrito');
                            } else {
                              updateQty(it.id, next);
                              toast.info(`Cantidad actualizada a ${next}`);
                            }
                          }}
                          className="p-1 rounded border hover:bg-gray-50"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-[2ch] text-center">{it.quantity}</span>
                        <button
                          aria-label="Aumentar"
                          onClick={() => {
                            const max = typeof it.stock === 'number' ? it.stock : Infinity;
                            if (it.quantity >= (max as number)) {
                              toast.warning(`Stock mǭximo disponible: ${max}`);
                              return;
                            }
                            const next = it.quantity + 1;
                            updateQty(it.id, next);
                            toast.info(`Cantidad actualizada a ${next}`);
                          }}
                          className="p-1 rounded border hover:bg-gray-50"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          aria-label="Eliminar"
                          onClick={() => {
                            removeItem(it.id);
                            toast.success('Producto eliminado del carrito');
                          }}
                          className="ml-2 p-1 rounded border hover:bg-gray-50 text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                        {typeof it.stock === 'number' && isFinite(it.stock) && (
                          <span className="ml-1 text-[11px] text-gray-500">({it.stock} disp.)</span>
                        )}
                      </div>
                    </div>
                    <div className="text-gray-700 whitespace-nowrap font-medium">${(it.priceUSD * it.quantity).toFixed(2)}</div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t text-sm flex items-center justify-between">
              <span>Total aprox.</span>
              <span className="font-semibold">${cartTotalUSD.toFixed(2)}</span>
            </div>
            <div className="p-3 pt-0 flex gap-2 items-center">
              <button
                onClick={() => {
                  setConfirmClear(true);
                }}
                className="text-xs px-2 py-2 border border-red-500 text-red-600 rounded"
              >
                Vaciar
              </button>
              <a href="/carrito" className="flex-1 text-center border rounded py-2" onClick={closeCart}>Ver Carrito</a>
              <a href="/checkout/revisar" className="flex-1 text-center bg-brand text-white rounded py-2" onClick={closeCart}>Pagar</a>
            </div>
          </div>
        </div>
      )}

      {/* Confirm clear cart (global) */}
      <ConfirmDialog
        open={confirmClear}
        title="Vaciar carrito"
        message="Esta accion vaciara todos los productos del carrito."
        confirmText="Si, vaciar"
        cancelText="Cancelar"
        onConfirm={() => {
          clearCart();
          clearAssistantCart();
          setConfirmClear(false);
          toast.success('Carrito vaciado');
        }}
        onClose={() => setConfirmClear(false)}
      />
    </header>
  );
}
