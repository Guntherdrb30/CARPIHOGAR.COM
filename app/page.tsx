import HeroCarousel from '@/components/hero-carousel-simple';
import HeroEcpdCarousel from '@/components/hero-ecpd-carousel';
import NewProducts from '@/components/new-products';
import TrendingProducts from '@/components/trending-products';
import AlliesRanking from '@/components/allies-ranking';
import ShowToastFromSearch from '@/components/show-toast-from-search';
import { getSettings } from '@/server/actions/settings';
import Link from 'next/link';

export default async function Home() {
  const settings = await getSettings();
  const images = Array.isArray((settings as any).homeHeroUrls)
    ? ((settings as any).homeHeroUrls as string[]).filter(Boolean)
    : undefined;
  const ecpdImages = Array.isArray((settings as any).ecpdHeroUrls)
    ? ((settings as any).ecpdHeroUrls as string[]).filter(Boolean)
    : undefined;
  return (
    <div>
      <HeroCarousel
        images={images}
        autoplayMs={Number((settings as any).heroAutoplayMs || 5000)}
      />
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <section className="bg-[#f3f3f3]">
        <div className="container mx-auto px-4 py-10">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] items-center rounded-2xl border border-gray-200 bg-white shadow-sm p-6 md:p-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-gray-500">
                Kitchen Studio
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900">
                Crea tu cocina y obten un presupuesto en tiempo real
              </h2>
              <p className="text-sm text-gray-600 max-w-xl">
                Disena modulos, distribuciones y acabados con una vista 3D profesional.
                Ajusta dimensiones con precision milimetrica y recibe el costo actualizado
                al instante para tomar decisiones mas rapido.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="rounded-full bg-gray-100 px-3 py-1">Vista 3D interactiva</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Presupuesto vivo</span>
                <span className="rounded-full bg-gray-100 px-3 py-1">Modulos premium</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/crea-tu-cocina"
                  className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-gray-800 transition-colors"
                >
                  Crear mi cocina ahora
                </Link>
                <Link
                  href="/crea-tu-cocina"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Ver la experiencia
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-gray-100 via-white to-gray-200 blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/uploads/cocina%20moderna%20.png"
                  alt="Cocina moderna en 3D"
                  className="h-[280px] w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
      <HeroEcpdCarousel
        images={ecpdImages}
        autoplayMs={Number((settings as any).heroAutoplayMs || 5000)}
      />
      <NewProducts />
      <TrendingProducts />
      <AlliesRanking />
    </div>
  );
}
