'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateEan13, normalizeBarcode } from '@/lib/barcode';
import { getSettings } from '@/server/actions/settings';
import { unstable_cache as unstableCache } from 'next/cache';
import { applyPriceAdjustments, getPriceAdjustmentSettings } from '@/server/price-adjustments';

// Ensure optional columns exist for new features (best-effort, tolerant if missing perms)
async function ensureProductColumns() {
  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "public"."Product" ' +
      'ADD COLUMN IF NOT EXISTS "videoUrl" TEXT, ' +
      'ADD COLUMN IF NOT EXISTS "showSocialButtons" BOOLEAN NOT NULL DEFAULT false, ' +
      'ADD COLUMN IF NOT EXISTS "isConfigurable" BOOLEAN NOT NULL DEFAULT false, ' +
      'ADD COLUMN IF NOT EXISTS "configSchema" JSONB, ' +
      'ADD COLUMN IF NOT EXISTS "rootNoIvaOnly" BOOLEAN NOT NULL DEFAULT false, ' +
      'ADD COLUMN IF NOT EXISTS "kitchenPriceLowUsd" NUMERIC(10,2), ' +
      'ADD COLUMN IF NOT EXISTS "kitchenPriceMidUsd" NUMERIC(10,2), ' +
      'ADD COLUMN IF NOT EXISTS "kitchenPriceHighUsd" NUMERIC(10,2)'
    );
  } catch {}
}

function parseCsvSimple(text: string, delimiter?: string): Array<Record<string,string>> {
    const dl = delimiter && delimiter.length ? delimiter : (text.indexOf(';') > -1 ? ';' : ',');
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
    if (!lines.length) return [];
    const header = lines[0];
    const headers: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < header.length; i++) {
        const ch = header[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (!inQ && ch === dl) { headers.push(cur.trim()); cur = ''; }
        else { cur += ch; }
    }
    headers.push(cur.trim());
    const rows: Array<Record<string,string>> = [];
    for (let li = 1; li < lines.length; li++) {
        const line = lines[li]; cur=''; inQ=false; const cols: string[]=[];
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQ = !inQ; continue; }
            if (!inQ && ch === dl) { cols.push(cur); cur=''; }
            else { cur += ch; }
        }
        cols.push(cur);
        const rec: Record<string,string> = {};
        for (let i=0;i<headers.length;i++) { rec[headers[i]] = (cols[i] ?? '').trim(); }
        rows.push(rec);
    }
    return rows;
}

function pick(obj: Record<string,string>, names: string[]): string | undefined {
    for (const n of names) {
        const k = Object.keys(obj).find(h => h.toLowerCase().replace(/\s+/g,'') === n.toLowerCase().replace(/\s+/g,''));
        if (k && obj[k]) return obj[k];
    }
    return undefined;
}

export async function importProductsCsv(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') throw new Error('Not authorized');
    const file = formData.get('file') as unknown as File | null;
    if (!file) throw new Error('Archivo CSV requerido');
    const delimiter = String(formData.get('delimiter') || '') || undefined;
    const defaultSupplierId = String(formData.get('supplierId') || '') || undefined;

    const text = await (file as any).text();
    const rows = parseCsvSimple(text, delimiter);
    if (!rows.length) throw new Error('CSV vacÃ­o');

    const settings = await getSettings();
    const defClient = Number((settings as any).defaultMarginClientPct ?? 40);
    const defAlly = Number((settings as any).defaultMarginAllyPct ?? 30);
    const defWholesale = Number((settings as any).defaultMarginWholesalePct ?? 20);

    for (const r of rows) {
        const name = (pick(r, ['name','producto','product']) || '').trim();
        if (!name) continue;
        const code = pick(r, ['code','sku','codigo','cÃ³digo']) || null;
        const barcodeIn = pick(r, ['barcode','ean','ean13']) || '';
        const barcode = normalizeBarcode(barcodeIn || '') || null;
        const brand = pick(r, ['brand','marca']) || 'Sin marca';
        const description = pick(r, ['description','descripcion','descripciÃ³n']) || '';
        const categorySlug = pick(r, ['category','categoria','categorÃ­a','categorySlug']) || '';
        const supplierId = (pick(r, ['supplierId','proveedorId']) || defaultSupplierId || '') || undefined;
        const stockStr = pick(r, ['stock','existencia','cantidad']) || '0';
        const costStr = pick(r, ['costUSD','costo','costoUSD']) || '';
        const priceStr = pick(r, ['priceUSD','precio','precioUSD']) || '';
        const imagesStr = pick(r, ['images','imagenes','imÃ¡genes']) || '';
        const images = imagesStr ? imagesStr.split(/[|;,\s]+/g).map(s => s.trim()).filter(Boolean).slice(0,4) : [];
        const stock = Number(String(stockStr).replace(',','.')) || 0;
        const costUSD = costStr ? Number(String(costStr).replace(',','.')) : undefined;
        let priceUSD = priceStr ? Number(String(priceStr).replace(',','.')) : undefined;
        let priceAllyUSD: number | undefined = undefined;
        let priceWholesaleUSD: number | undefined = undefined;
        let marginClientPct = defClient;
        let marginAllyPct = defAlly;
        let marginWholesalePct = defWholesale;
        if (typeof costUSD === 'number' && !isNaN(costUSD)) {
            priceUSD = Number((costUSD * (1 + marginClientPct/100)).toFixed(2));
            priceAllyUSD = Number((costUSD * (1 + marginAllyPct/100)).toFixed(2));
            priceWholesaleUSD = Number((costUSD * (1 + marginWholesalePct/100)).toFixed(2));
        }

        // Find existing
        let product = null as any;
        if (code) {
            const digits = code.replace(/\D/g,'');
            product = await prisma.product.findFirst({ where: { OR: [ { sku: code }, { code: code }, ...(digits.length>=6 ? [{ barcode: digits }] : []) ] } });
        }
        if (!product) {
            product = await prisma.product.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
        }

        const data: any = {
            name,
            brand,
            description: description || null,
            images,
            sku: code || null,
            code: code || null,
            barcode: barcode || null,
            stock,
            supplierId: supplierId || null,
        };
        if (categorySlug) {
            try {
                const cat = await prisma.category.findFirst({ where: { slug: categorySlug } });
                if (cat) data.categoryId = cat.id;
            } catch {}
        }
        if (typeof costUSD === 'number' && !isNaN(costUSD)) {
            data.costUSD = costUSD as any;
            data.lastCost = costUSD as any;
            data.avgCost = costUSD as any;
            data.marginClientPct = marginClientPct as any;
            data.marginAllyPct = marginAllyPct as any;
            data.marginWholesalePct = marginWholesalePct as any;
        }
        if (typeof priceUSD === 'number' && !isNaN(priceUSD)) {
            data.priceUSD = priceUSD as any;
            data.priceClientUSD = priceUSD as any;
            if (typeof priceAllyUSD === 'number') data.priceAllyUSD = priceAllyUSD as any;
            if (typeof priceWholesaleUSD === 'number') data.priceWholesaleUSD = priceWholesaleUSD as any;
        }

        if (product) {
            await prisma.product.update({ where: { id: product.id }, data });
        } else {
            const slug = (pick(r, ['slug']) || `${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Math.random().toString(36).slice(2,7)}`).replace(/^-+|-+$/g,'');
            await prisma.product.create({ data: { ...data, slug } });
        }
    }
    revalidatePath('/dashboard/admin/productos');
    return { ok: true } as any;
}

export async function getProducts(filters?: { isNew?: boolean; categorySlug?: string; q?: string; supplierId?: string }) {
    await ensureProductColumns();
    const where: any = {};

    if (filters?.isNew) {
        where.isNew = true;
    }

    if (filters?.categorySlug) {
        // Correct relational filter for optional 1:1 relation
        where.category = { is: { slug: filters.categorySlug } } as any;
    }

    if (filters?.q) {
        const tokens = String(filters.q).split(/\s+/).filter(Boolean);
        if (tokens.length) {
            where.AND = tokens.map((t) => ({
                OR: [
                    { name: { contains: t, mode: 'insensitive' } },
                    { sku: { contains: t, mode: 'insensitive' } },
                    { code: { contains: t, mode: 'insensitive' } },
                ],
            }));
        }
    }
    if (filters?.supplierId) {
        where.supplierId = filters.supplierId;
    }

    const dec = (x: any, fb: number | null = null) => {
        try {
            if (x == null) return fb;
            if (typeof x === 'number') return x;
            if (typeof x?.toNumber === 'function') return x.toNumber();
            const n = Number(x);
            return isNaN(n) ? fb : n;
        } catch { return fb; }
    };

    try {
        const pricing = await getPriceAdjustmentSettings();
        const products = await prisma.product.findMany({
            where,
            include: {
                category: true,
                supplier: true,
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return products.map(p => {
            const categoryId = (p as any).categoryId || (p as any).category?.id || null;
            const basePrice = dec((p as any).priceUSD, 0)!;
            const baseAlly = dec((p as any).priceAllyUSD, null);
            const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
            return {
                ...p,
                images: Array.isArray((p as any).images) ? (p as any).images : [],
                priceUSD: applyPriceAdjustments({
                    basePriceUSD: basePrice,
                    currency: 'USD',
                    supplierCurrency,
                    categoryId,
                    settings: pricing,
                }),
                priceAllyUSD: baseAlly != null
                    ? applyPriceAdjustments({
                        basePriceUSD: baseAlly,
                        currency: 'USD',
                        supplierCurrency,
                        categoryId,
                        settings: pricing,
                    })
                    : null,
                avgCost: dec((p as any).avgCost, null),
                lastCost: dec((p as any).lastCost, null),
            };
        });
    } catch (err) {
        console.warn('[getProducts] DB not reachable or query failed. Returning empty list.', err);
        return [] as any[];
    }
}

export async function createProduct(data: any) {
    await ensureProductColumns();
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const email = String((session?.user as any)?.email || '').toLowerCase();
    const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
    const isRoot = email === rootEmail;

    // Normalize and ensure unique slug to avoid server errors on duplicates
    const baseName = String(data?.name || '').trim();
    const baseSlug = String(data?.slug || '').trim() || baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    async function ensureUniqueSlug(slug: string) {
        let candidate = slug.replace(/^-+|-+$/g, '');
        let i = 1;
        // Safety cap to avoid infinite loops
        while (await prisma.product.findUnique({ where: { slug: candidate } })) {
            i += 1;
            candidate = `${slug}-${i}`;
            if (i > 50) { // fallback to random suffix
                candidate = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
                break;
            }
        }
        return candidate;
    }
    const uniqueSlug = await ensureUniqueSlug(baseSlug);

    // Normalize/auto-generate barcode if not provided
    let barcode: string | undefined = normalizeBarcode(data?.barcode);
    if (!barcode) {
        for (let i = 0; i < 5; i++) {
            const candidate = generateEan13('200');
            const exists = await prisma.product.findFirst({ where: { barcode: candidate }, select: { id: true } });
            if (!exists) { barcode = candidate; break; }
        }
    }

    // Extract relatedIds if provided by the form
    const relatedIds: string[] = Array.isArray(data?.relatedIds)
        ? (data.relatedIds as string[]).map((x) => String(x)).filter(Boolean)
        : [];
    const {
        relatedIds: _ignore,
        slug: _slugIn,
        priceUSD,
        priceAllyUSD,
        priceWholesaleUSD,
        stock,
        stockUnits,
        stockMinUnits,
        allowBackorder,
        type,
        unitsPerPackage,
        stockPackages,
        soldBy,
        weightKg,
        heightCm,
        widthCm,
        depthCm,
        freightType,
        deliveryAllowedVehicles,
        rootNoIvaOnly: rootNoIvaOnlyInput,
        ...rest
    } = data || {};

    const numericPriceUSD = Number(priceUSD || 0);
    const numericPriceAllyUSD = priceAllyUSD != null ? Number(priceAllyUSD) : null;
    const numericPriceWholesaleUSD = priceWholesaleUSD != null ? Number(priceWholesaleUSD) : null;

    const units = stockUnits != null ? parseInt(String(stockUnits), 10) : parseInt(String(stock ?? 0), 10);
    const minUnits = stockMinUnits != null ? parseInt(String(stockMinUnits), 10) : 0;
    const allowBo = Boolean(allowBackorder);
    const typeSafe = (String(type || 'SIMPLE').toUpperCase() as any);
    const unitsPerPkg = unitsPerPackage != null ? parseInt(String(unitsPerPackage), 10) : null;
    const stockPkgs = stockPackages != null ? parseInt(String(stockPackages), 10) : null;
    const soldBySafe = (String(soldBy || 'UNIT').toUpperCase() as any);

    const weightKgNum = weightKg != null ? Number(weightKg) : null;
    const heightCmNum = heightCm != null ? Number(heightCm) : null;
    const widthCmNum = widthCm != null ? Number(widthCm) : null;
    const depthCmNum = depthCm != null ? Number(depthCm) : null;
    const volumeCm3 =
        heightCmNum != null && widthCmNum != null && depthCmNum != null
            ? Number((heightCmNum * widthCmNum * depthCmNum).toFixed(2))
            : null;
    const allowedVehiclesInput = Array.isArray(deliveryAllowedVehicles)
        ? deliveryAllowedVehicles
        : (deliveryAllowedVehicles ? [deliveryAllowedVehicles] : []);
    const allowedVehicles = Array.from(
        new Set(
            allowedVehiclesInput
                .map((v) => String(v || '').toUpperCase())
                .filter((v) => v === 'MOTO' || v === 'CARRO' || v === 'CAMIONETA')
        )
    );

    // Create product first
    const product = await prisma.product.create({
        data: {
            ...rest,
            slug: uniqueSlug,
            barcode,
            priceUSD: numericPriceUSD as any,
            priceAllyUSD: numericPriceAllyUSD as any,
            priceWholesaleUSD: numericPriceWholesaleUSD as any,
            priceClientUSD: numericPriceUSD as any,
            stock: units,
            stockUnits: units,
            stockMinUnits: minUnits,
            allowBackorder: allowBo,
            type: typeSafe,
            unitsPerPackage: unitsPerPkg,
            stockPackages: stockPkgs,
            soldBy: soldBySafe,
            weightKg: weightKgNum as any,
            heightCm: heightCmNum as any,
            widthCm: widthCmNum as any,
            depthCm: depthCmNum as any,
            volumeCm3: volumeCm3 as any,
            freightType: freightType || null,
            deliveryAllowedVehicles: allowedVehicles,
            rootNoIvaOnly: isRoot && Boolean(rootNoIvaOnlyInput),
        },
    });

    // Persist relationships both directions (A<->B) via join table
    if (relatedIds.length) {
        const unique = Array.from(new Set(relatedIds.filter((id) => id && id !== product.id)));
        const rows = [] as Array<{ fromId: string; toId: string }>;
        for (const id of unique) {
            rows.push({ fromId: product.id, toId: id });
            rows.push({ fromId: id, toId: product.id });
        }
        try {
            // createMany for efficiency; skipDuplicates to avoid collisions
            await (prisma as any).relatedProduct.createMany({ data: rows, skipDuplicates: true });
        } catch (e) {
            // Non-fatal if relations fail; product is created
            console.warn('[createProduct] relatedProduct.createMany failed', e);
        }
    }

    revalidatePath('/dashboard/admin/productos');
    return product;
}

export async function updateProduct(id: string, data: any) {
    await ensureProductColumns();
    const product = await prisma.product.update({
        where: { id },
        data,
    });
    revalidatePath('/dashboard/admin/productos');
    return product;
}

export async function deleteProduct(id: string) {
    await prisma.product.delete({ where: { id } });
    revalidatePath('/dashboard/admin/productos');
}

export async function deleteProductByForm(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const id = String(formData.get('id'));
    const secret = String(formData.get('secret') || '');
    const { getDeleteSecret } = await import('@/server/actions/settings');
    const configured = await getDeleteSecret();
    if (!configured) {
        redirect('/dashboard/admin/productos?message=&error=Falta%20configurar%20la%20clave%20de%20eliminaci%C3%B3n');
    }
    if (secret !== configured) {
        redirect('/dashboard/admin/productos?message=&error=Clave%20secreta%20inv%C3%A1lida');
    }
    try {
        await deleteProduct(id);
        redirect('/dashboard/admin/productos?message=Producto%20eliminado');
    } catch (e) {
        const email = String((session?.user as any)?.email || '').toLowerCase();
        const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
        const isRoot = email === rootEmail;
        if (!isRoot) {
            redirect('/dashboard/admin/productos?error=No%20se%20puede%20eliminar:%20tiene%20registros%20relacionados');
        }
        try {
            await prisma.$transaction([
                prisma.relatedProduct.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } }) as any,
                prisma.wishlistItem.deleteMany({ where: { productId: id } }) as any,
                prisma.quoteItem.deleteMany({ where: { productId: id } }) as any,
                prisma.orderItem.deleteMany({ where: { productId: id } }) as any,
                prisma.purchaseOrderItem.deleteMany({ where: { productId: id } }) as any,
                (prisma as any).purchaseItem.deleteMany({ where: { productId: id } }) as any,
                prisma.stockMovement.deleteMany({ where: { productId: id } }) as any,
            ]);
            await deleteProduct(id);
            try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PRODUCT_DELETE_FORCED', details: id } }); } catch {}
            redirect('/dashboard/admin/productos?message=Producto%20eliminado');
        } catch {
            redirect('/dashboard/admin/productos?error=No%20se%20pudo%20eliminar:%20dependencias%20no%20removidas');
        }
    }
}

export async function updateProductInline(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const id = String(formData.get('id'));
    const priceUSD = formData.get('priceUSD');
    const priceAllyUSD = formData.get('priceAllyUSD');
    const stock = formData.get('stock');
    const isNew = formData.get('isNew');
    const image = String(formData.get('image') || '').trim();

    const data: any = {};
    if (priceUSD !== null) {
        data.priceUSD = parseFloat(String(priceUSD));
        data.priceClientUSD = parseFloat(String(priceUSD));
    }
    if (priceAllyUSD !== null && String(priceAllyUSD).length) data.priceAllyUSD = parseFloat(String(priceAllyUSD));
    if (stock !== null) {
        const units = parseInt(String(stock), 10);
        data.stock = units;
        data.stockUnits = units;
    }
    if (isNew !== null) data.isNew = String(isNew) === 'on' || String(isNew) === 'true';
    if (image) data.images = { push: image } as any;

    try {
        await prisma.product.update({ where: { id }, data });
        try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PRODUCT_UPDATE_INLINE', details: id } }); } catch {}
        revalidatePath('/dashboard/admin/productos');
        redirect('/dashboard/admin/productos?message=Producto%20actualizado');
    } catch (e) {
        revalidatePath('/dashboard/admin/productos');
        redirect('/dashboard/admin/productos?error=No%20se%20pudo%20actualizar');
    }
}

export async function createStockMovement(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const productId = String(formData.get('productId'));
    const type = String(formData.get('type')) as 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    const quantity = parseInt(String(formData.get('quantity') || '0'), 10);
    const reason = String(formData.get('reason') || '');

    if (!['ENTRADA','SALIDA','AJUSTE'].includes(type) || !quantity) {
        throw new Error('Invalid movement');
    }

    await prisma.stockMovement.create({
        data: { productId, type: type as any, quantity, reason, userId: (session?.user as any)?.id },
    });

    // apply stock change
    const delta = type === 'ENTRADA' ? quantity : type === 'SALIDA' ? -quantity : 0;
    await prisma.product.update({
        where: { id: productId },
        data: {
            stock: {
                increment: delta,
            },
            stockUnits: {
                increment: delta,
            } as any,
        },
    });
    await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'STOCK_MOVE_'+type, details: `${productId}:${quantity}:${reason}` } });

    revalidatePath('/dashboard/admin/productos');
}

export async function getStockMovements(productId: string, take = 20) {
    const moves = await prisma.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take });
    return moves;
}

export async function getProductById(id: string) {
    const product = await prisma.product.findUnique({ where: { id } });
    return product;
}

export async function getRelatedIds(productId: string) {
    try {
        const rows = await prisma.relatedProduct.findMany({ where: { fromId: productId }, select: { toId: true } });
        const ids = Array.from(new Set(rows.map(r => r.toId).filter((x) => x !== productId)));
        return ids;
    } catch (e) {
        // If the join table doesn't exist yet, just return empty
        return [];
    }
}

// Returns banner images for main categories, picking a product image per category
export const getFeaturedCategoryBanners = unstableCache(async () => {
    const slugs = ['carpinteria', 'hogar'];
    const out: Array<{ name: string; slug: string; href: string; image: string }> = [];
    const nowWin = Math.floor(Date.now() / (6 * 60 * 60 * 1000)); // 6 hours window
    for (const slug of slugs) {
        try {
            const cat = await prisma.category.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
            if (!cat) {
                // Fallback static
                out.push({ name: slug === 'hogar' ? 'Hogar' : 'CarpinterÃ­a', slug, href: `/productos?categoria=${slug}`, image: slug === 'hogar' ? '/images/hero-carpinteria-2.svg' : '/images/hero-carpinteria-1.svg' });
                continue;
            }
            const prods = await prisma.product.findMany({
                where: { categoryId: cat.id, images: { isEmpty: false } as any },
                select: { images: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            let image = '';
            if (prods.length) {
                const salt = Array.from(slug).reduce((s, ch) => s + ch.charCodeAt(0), 0);
                const idx = (nowWin + salt) % prods.length;
                image = prods[idx].images[0] || '';
            }
            if (!image) image = slug === 'hogar' ? '/images/hero-carpinteria-2.svg' : '/images/hero-carpinteria-1.svg';
            out.push({ name: cat.name || (slug === 'hogar' ? 'Hogar' : 'CarpinterÃ­a'), slug, href: `/productos?categoria=${slug}`, image });
        } catch {
            out.push({ name: slug === 'hogar' ? 'Hogar' : 'CarpinterÃ­a', slug, href: `/productos?categoria=${slug}`, image: slug === 'hogar' ? '/images/hero-carpinteria-2.svg' : '/images/hero-carpinteria-1.svg' });
        }
    }
    return out;
}, ['featured-category-banners-v1'], { revalidate: 6 * 60 * 60 });

export async function updateProductFull(formData: FormData) {
    await ensureProductColumns();
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const id = String(formData.get('id'));
    const name = String(formData.get('name') || '');
    const slug = String(formData.get('slug') || '');
    const description = String(formData.get('description') || '');
    const brand = String(formData.get('brand') || '').trim();
    const model = String(formData.get('model') || '').trim() || null;
    const sku = String(formData.get('sku') || '') || null;
    const barcode = String(formData.get('barcode') || '') || null;
    const supplierCode = String(formData.get('supplierCode') || '') || null;
    const guarantee = String(formData.get('guarantee') || '') || null;
    const rawKeywords = String(formData.get('keywords') || '');
    const keywords = rawKeywords
        ? rawKeywords.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
    const type = String(formData.get('type') || 'SIMPLE').toUpperCase() as any;

    const priceUSDInput = formData.get('priceUSD');
    const priceUSDParsed =
        priceUSDInput != null && String(priceUSDInput).length
            ? parseFloat(String(priceUSDInput))
            : null;
    const priceUSD = Number.isFinite(priceUSDParsed) ? priceUSDParsed : null;
    const priceAllyUSDInput = formData.get('priceAllyUSD');
    const priceAllyUSD =
        priceAllyUSDInput != null && String(priceAllyUSDInput).length
            ? parseFloat(String(priceAllyUSDInput))
            : null;
    const priceWholesaleUSDInput = formData.get('priceWholesaleUSD');
    const priceWholesaleUSD =
        priceWholesaleUSDInput != null && String(priceWholesaleUSDInput).length
            ? parseFloat(String(priceWholesaleUSDInput))
            : null;
    const kitchenPriceLowUsdRaw = formData.get('kitchenPriceLowUsd');
    const kitchenPriceMidUsdRaw = formData.get('kitchenPriceMidUsd');
    const kitchenPriceHighUsdRaw = formData.get('kitchenPriceHighUsd');
    const kitchenPriceLowUsd =
        kitchenPriceLowUsdRaw != null && String(kitchenPriceLowUsdRaw).length
            ? parseFloat(String(kitchenPriceLowUsdRaw))
            : null;
    const kitchenPriceMidUsd =
        kitchenPriceMidUsdRaw != null && String(kitchenPriceMidUsdRaw).length
            ? parseFloat(String(kitchenPriceMidUsdRaw))
            : null;
    const kitchenPriceHighUsd =
        kitchenPriceHighUsdRaw != null && String(kitchenPriceHighUsdRaw).length
            ? parseFloat(String(kitchenPriceHighUsdRaw))
            : null;
    const currentProduct = await prisma.product.findUnique({
        where: { id },
        select: { priceUSD: true, basePriceUsd: true, productFamily: true, images: true },
    });
    const isKitchenModule =
        String((currentProduct as any)?.productFamily || '').toUpperCase() === 'KITCHEN_MODULE';
    const resolvedKitchenMid =
        kitchenPriceMidUsd != null && Number.isFinite(kitchenPriceMidUsd) && kitchenPriceMidUsd > 0
            ? kitchenPriceMidUsd
            : null;
    const currentPriceUsd =
        typeof (currentProduct as any)?.priceUSD?.toNumber === 'function'
            ? (currentProduct as any).priceUSD.toNumber()
            : currentProduct?.priceUSD != null
                ? Number((currentProduct as any).priceUSD)
                : 0;
    const resolvedPriceUSD =
        priceUSD != null
            ? priceUSD
            : isKitchenModule && resolvedKitchenMid != null
                ? resolvedKitchenMid
                : currentPriceUsd;

    const stockUnits = parseInt(String(formData.get('stockUnits') || '0'), 10);
    const stockMinUnits = parseInt(String(formData.get('stockMinUnits') || '0'), 10);
    const allowBackorder = String(formData.get('allowBackorder') || '') === 'on' || String(formData.get('allowBackorder') || '') === 'true';
    const unitsPerPackage = formData.get('unitsPerPackage') ? parseInt(String(formData.get('unitsPerPackage') || '0'), 10) : null;
    const stockPackages = formData.get('stockPackages') ? parseInt(String(formData.get('stockPackages') || '0'), 10) : null;
    const soldBy = String(formData.get('soldBy') || 'UNIT').toUpperCase() as any;

    const weightKg = formData.get('weightKg') ? parseFloat(String(formData.get('weightKg'))) : null;
    const heightCm = formData.get('heightCm') ? parseFloat(String(formData.get('heightCm'))) : null;
    const widthCm = formData.get('widthCm') ? parseFloat(String(formData.get('widthCm'))) : null;
    const depthCm = formData.get('depthCm') ? parseFloat(String(formData.get('depthCm'))) : null;
    const freightType = String(formData.get('freightType') || '') || null;
    const status = String(formData.get('status') || 'ACTIVE').toUpperCase() as any;

    const categoryId = String(formData.get('categoryId') || '' ) || null;
    const supplierId = String(formData.get('supplierId') || '' ) || null;
    const isNew = String(formData.get('isNew') || '') === 'on' || String(formData.get('isNew') || '') === 'true';
    const videoUrl = String(formData.get('videoUrl') || '').trim() || null;
    const showSocialButtons = String(formData.get('showSocialButtons') || '') === 'on' || String(formData.get('showSocialButtons') || '') === 'true';
    const deliveryAllowedVehiclesRaw = formData.getAll('deliveryAllowedVehicles[]') as string[];
    const deliveryAllowedVehicles = Array.from(
        new Set(
            deliveryAllowedVehiclesRaw
                .map((v) => String(v || '').toUpperCase())
                .filter((v) => v === 'MOTO' || v === 'CARRO' || v === 'CAMIONETA')
        )
    );

    const volumeCm3 =
        heightCm != null && widthCm != null && depthCm != null
            ? Number((heightCm * widthCm * depthCm).toFixed(2))
            : null;

    // Images handling
    const replaceAll = String(formData.get('replaceAllImages') || '') === 'on' || String(formData.get('replaceAllImages') || '') === 'true';
    const mainImageUpload = String(formData.get('mainImage') || '').trim();
    const extraImages = (formData.getAll('images[]') as string[]).filter(Boolean);

    const current = replaceAll ? [] : (currentProduct?.images || []);
    let images: string[] = [...current];
    if (mainImageUpload) {
        images = [mainImageUpload, ...images.filter((i) => i !== mainImageUpload)];
    }
    if (extraImages.length) {
        images = images.concat(extraImages);
    }
    images = images.filter(Boolean).slice(0, 4);

    const updateData: any = {
        name,
        slug,
        description,
        brand,
        model,
        sku,
        barcode,
        supplierCode,
        guarantee,
        keywords,
        type,
        priceUSD: resolvedPriceUSD as any,
        priceClientUSD: resolvedPriceUSD as any,
        stock: stockUnits,
        stockUnits,
        stockMinUnits,
        allowBackorder,
        unitsPerPackage,
        stockPackages,
        soldBy,
        weightKg: weightKg as any,
        heightCm: heightCm as any,
        widthCm: widthCm as any,
        depthCm: depthCm as any,
        volumeCm3: volumeCm3 as any,
        freightType,
        status,
        categoryId,
        supplierId,
        isNew,
        images,
        videoUrl,
        showSocialButtons,
        deliveryAllowedVehicles,
    };
    if (formData.has('kitchenPriceLowUsd')) {
        updateData.kitchenPriceLowUsd = kitchenPriceLowUsd as any;
    }
    if (formData.has('kitchenPriceMidUsd')) {
        updateData.kitchenPriceMidUsd = kitchenPriceMidUsd as any;
    }
    if (formData.has('kitchenPriceHighUsd')) {
        updateData.kitchenPriceHighUsd = kitchenPriceHighUsd as any;
    }
    if (formData.has('priceAllyUSD')) {
        updateData.priceAllyUSD = priceAllyUSD as any;
    }
    if (formData.has('priceWholesaleUSD')) {
        updateData.priceWholesaleUSD = priceWholesaleUSD as any;
    }
    if (isKitchenModule && resolvedKitchenMid != null) {
        updateData.basePriceUsd = resolvedKitchenMid as any;
    }

    const product = await prisma.product.update({
        where: { id },
        data: updateData,
    });

    // Update related products if provided (tolerant if join table doesn't exist yet)
    const relatedIds = (formData.getAll('relatedIds[]') as string[]).map(String).filter(Boolean);
    if (Array.isArray(relatedIds)) {
        try {
            const unique = Array.from(new Set(relatedIds.filter((rid) => rid && rid !== id)));
            const rows = [] as Array<{ fromId: string; toId: string }>;
            for (const rid of unique) {
                rows.push({ fromId: id, toId: rid });
                rows.push({ fromId: rid, toId: id });
            }
            await prisma.$transaction([
                prisma.relatedProduct.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } }),
                (prisma as any).relatedProduct.createMany({ data: rows, skipDuplicates: true }),
            ]);
        } catch (e) {
            // Non-fatal if join table missing
            console.warn('[updateProductFull] relatedProduct ops skipped', e);
        }
    }
    await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PRODUCT_UPDATE_FULL', details: id } });
    revalidatePath('/dashboard/admin/productos');
    redirect('/dashboard/admin/productos?message=Producto%20actualizado');
}

export async function updateProductBarcodeByForm(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const id = String(formData.get('id') || '');
    const generate = String(formData.get('generate') || '').toLowerCase();
    const input = String(formData.get('barcode') || '');
    let newBarcode: string | undefined = undefined;
    if (generate === '1' || generate === 'true' || generate === 'on') {
        for (let i = 0; i < 5; i++) {
            const candidate = generateEan13('200');
            const exists = await prisma.product.findFirst({ where: { barcode: candidate }, select: { id: true } });
            if (!exists) { newBarcode = candidate; break; }
        }
    } else {
        newBarcode = normalizeBarcode(input);
    }
    if (!newBarcode) {
        redirect('/dashboard/admin/productos?error=C%C3%B3digo%20inv%C3%A1lido');
    }
    const conflict = await prisma.product.findFirst({ where: { barcode: newBarcode!, NOT: { id } }, select: { id: true } });
    if (conflict) {
        redirect('/dashboard/admin/productos?error=C%C3%B3digo%20ya%20en%20uso');
    }
    await prisma.product.update({ where: { id }, data: { barcode: newBarcode } });
    try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PRODUCT_BARCODE_SET', details: `${id}:${newBarcode}` } }); } catch {}
    revalidatePath('/dashboard/admin/productos');
    redirect('/dashboard/admin/productos?message=C%C3%B3digo%20actualizado');
}

export async function getProductPageData(slug: string) {
  await ensureProductColumns();

  const raw = String(slug || '').trim();
  const candidates = (() => {
    const arr: string[] = [];
    if (raw) arr.push(raw);
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) arr.push(decoded);
    } catch {}
    return Array.from(new Set(arr));
  })();

  let product: any = null;

  // 1) Intentar exact match de slug (incluyendo variantes decodificadas)
  for (const s of candidates) {
    if (!s) continue;
    product = await prisma.product.findUnique({ where: { slug: s } });
    if (product) break;
  }

  // 2) Fallback: slug con sufijo generado / case-insensitive
  if (!product) {
    for (const s of candidates) {
      if (!s) continue;
      try {
        const found = await prisma.product.findFirst({
          where: {
            OR: [
              { slug: { startsWith: s + '-' } as any },
              { slug: { equals: s, mode: 'insensitive' } as any },
            ],
          },
        });
        if (found) {
          product = found;
          break;
        }
      } catch {}
    }
  }

  // 3) Fallback adicional: buscar por nombre con varias heurísticas
  if (!product && candidates.length) {
    const nameCandidate = candidates[candidates.length - 1];
    try {
      // Igual que el texto completo
      product = await prisma.product.findFirst({
        where: { name: { equals: nameCandidate, mode: 'insensitive' } },
      });
      // Contiene el texto completo
      if (!product) {
        product = await prisma.product.findFirst({
          where: { name: { contains: nameCandidate, mode: 'insensitive' } },
        });
      }
      // Contiene todas las palabras (ej. "Bisagra Master Black" -> AND de [bisagra, master, black])
      if (!product) {
        const words = nameCandidate
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 1);
        if (words.length) {
          product = await prisma.product.findFirst({
            where: {
              AND: words.map((w) => ({
                name: { contains: w, mode: 'insensitive' },
              })),
            },
          });
        }
      }
    } catch {}
  }
  if (product) {
    product = await prisma.product.findUnique({
      where: { id: product.id },
      include: { supplier: true },
    });
  }
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });

  if (!product || !settings) {
    return { product: null, settings: null, relatedProducts: [] };
  }
  const pricing = await getPriceAdjustmentSettings();

  // Prefer curated relateds via join; fallback to same-category suggestions
  let relatedProducts: any[] = [];
  try {
    const curated = await prisma.relatedProduct.findMany({ where: { fromId: product.id }, select: { toId: true } });
    const curatedIds = curated.map((r) => r.toId);
    relatedProducts = curatedIds.length
      ? await prisma.product.findMany({ where: { id: { in: curatedIds } }, include: { category: true, supplier: true }, take: 12 })
      : await prisma.product.findMany({
          where: { categoryId: product.categoryId, id: { not: product.id } },
          include: { category: true, supplier: true },
          take: 10,
        });
  } catch (e) {
    // If related table is missing, just use same-category fallback
    relatedProducts = await prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: product.id } },
      include: { category: true, supplier: true },
      take: 10,
    });
  }

  const dec = (x: any, fb: number | null = null) => {
    try {
      if (x == null) return fb;
      if (typeof x === 'number') return x;
      if (typeof x?.toNumber === 'function') return x.toNumber();
      const n = Number(x);
      return isNaN(n) ? fb : n;
    } catch { return fb; }
  };

  const categoryId = (product as any).categoryId || (product as any).category?.id || null;
  const basePrice = dec((product as any).priceUSD, 0)!;
  const baseAlly = dec((product as any).priceAllyUSD, null);
  const supplierCurrency = (product as any).supplier?.chargeCurrency || null;
  const serializableProduct = {
    ...product,
    images: Array.isArray((product as any).images) ? (product as any).images : [],
    priceUSD: applyPriceAdjustments({
      basePriceUSD: basePrice,
      currency: 'USD',
      supplierCurrency,
      categoryId,
      settings: pricing,
    }),
    priceAllyUSD: baseAlly != null
      ? applyPriceAdjustments({
          basePriceUSD: baseAlly,
          currency: 'USD',
          supplierCurrency,
          categoryId,
          settings: pricing,
        })
      : null,
    avgCost: dec((product as any).avgCost, null),
    lastCost: dec((product as any).lastCost, null),
  } as any;

  const serializableSettings = {
    ...settings,
    ivaPercent: dec((settings as any).ivaPercent, 16)!,
    tasaVES: dec((settings as any).tasaVES, 40)!,
    sellerCommissionPercent: dec((settings as any).sellerCommissionPercent, 5)!,
  } as any;

  const serializableRelatedProducts = relatedProducts.map((p) => {
    const relCategoryId = (p as any).categoryId || (p as any).category?.id || null;
    const relBase = dec((p as any).priceUSD, 0)!;
    const relAlly = dec((p as any).priceAllyUSD, null);
    const relSupplierCurrency = (p as any).supplier?.chargeCurrency || null;
    return {
      ...p,
      images: Array.isArray((p as any).images) ? (p as any).images : [],
      priceUSD: applyPriceAdjustments({
        basePriceUSD: relBase,
        currency: 'USD',
        supplierCurrency: relSupplierCurrency,
        categoryId: relCategoryId,
        settings: pricing,
      }),
      priceAllyUSD: relAlly != null
        ? applyPriceAdjustments({
            basePriceUSD: relAlly,
            currency: 'USD',
            supplierCurrency: relSupplierCurrency,
            categoryId: relCategoryId,
            settings: pricing,
          })
        : null,
      avgCost: dec((p as any).avgCost, null),
      lastCost: dec((p as any).lastCost, null),
    };
  });

  return {
    product: serializableProduct,
    settings: serializableSettings,
    relatedProducts: serializableRelatedProducts,
  };
}

// Top-selling products for home trends section
export async function getTrendingProducts(limit = 9, daysBack = 60) {
  try {
    const pricing = await getPriceAdjustmentSettings();
    const to = new Date();
    const from = new Date(to.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const items = await prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: from, lte: to } } },
      select: { productId: true, priceUSD: true, quantity: true },
    });
    const agg = new Map<string, { qty: number; revenueUSD: number }>();
    for (const it of items) {
      const key = it.productId;
      const unit = Number(it.priceUSD || 0);
      const rev = unit * Number(it.quantity || 0);
      const curr = agg.get(key) || { qty: 0, revenueUSD: 0 };
      curr.qty += Number(it.quantity || 0);
      curr.revenueUSD += rev;
      agg.set(key, curr);
    }
    // Sort by quantity sold primarily ("mÃ¡s se venden"), fallback by revenue
    const sorted = Array.from(agg.entries())
      .sort((a, b) => (b[1].qty - a[1].qty) || (b[1].revenueUSD - a[1].revenueUSD))
      .slice(0, limit);
    const ids = sorted.map(([id]) => id);
    if (!ids.length) return [] as any[];
    const products = await prisma.product.findMany({ where: { id: { in: ids } }, include: { category: true, supplier: true } });
    // Preserve order by revenue
    const order = new Map(ids.map((id, idx) => [id, idx]));
    const dec = (x: any, fb: number | null = null) => {
      try {
        if (x == null) return fb;
        if (typeof x === 'number') return x;
        if (typeof x?.toNumber === 'function') return x.toNumber();
        const n = Number(x);
        return isNaN(n) ? fb : n;
      } catch { return fb; }
    };
    return products
      .map((p: any) => {
        const categoryId = p.categoryId || p.category?.id || null;
        const base = dec(p.priceUSD, 0)!;
        const baseAlly = dec(p.priceAllyUSD, null);
        const supplierCurrency = (p as any).supplier?.chargeCurrency || null;
        return {
          ...p,
          images: Array.isArray(p.images) ? p.images : [],
          priceUSD: applyPriceAdjustments({
            basePriceUSD: base,
            currency: 'USD',
            supplierCurrency,
            categoryId,
            settings: pricing,
          }),
          priceAllyUSD: baseAlly != null
            ? applyPriceAdjustments({
                basePriceUSD: baseAlly,
                currency: 'USD',
                supplierCurrency,
                categoryId,
                settings: pricing,
              })
            : null,
          avgCost: dec(p.avgCost, null),
          lastCost: dec(p.lastCost, null),
        };
      })
      .sort((a: any, b: any) => (order.get(a.id)! - order.get(b.id)!));
  } catch (e) {
    console.warn('[getTrendingProducts] failed', e);
    return [] as any[];
  }
}

export async function anonymizeProductByForm(formData: FormData) {
    const session = await getServerSession(authOptions);
    if ((session?.user as any)?.role !== 'ADMIN') {
        throw new Error('Not authorized');
    }
    const email = String((session?.user as any)?.email || '').toLowerCase();
    const rootEmail = String(process.env.ROOT_EMAIL || 'root@carpihogar.com').toLowerCase();
    const isRoot = email === rootEmail;
    if (!isRoot) {
        redirect('/dashboard/admin/productos?error=Solo%20root%20puede%20anonimizar%20productos');
    }
    const id = String(formData.get('id') || '');
    const secret = String(formData.get('secret') || '');
    const { getDeleteSecret } = await import('@/server/actions/settings');
    const configured = await getDeleteSecret();
    if (!configured) {
        redirect('/dashboard/admin/productos?error=Falta%20configurar%20la%20clave');
    }
    if (secret !== configured) {
        redirect('/dashboard/admin/productos?error=Clave%20secreta%20invalida');
    }

    try {
        await prisma.$transaction([
            prisma.relatedProduct.deleteMany({ where: { OR: [{ fromId: id }, { toId: id }] } }) as any,
            prisma.product.update({
                where: { id },
                data: {
                    name: 'Eliminado',
                    brand: 'Eliminado',
                    description: 'Producto anonimizado',
                    images: [],
                    videoUrl: null as any,
                    showSocialButtons: false,
                    sku: null,
                    code: null,
                    barcode: null,
                    priceUSD: 0 as any,
                    priceAllyUSD: null as any,
                    priceWholesaleUSD: null as any,
                    costUSD: null as any,
                    marginClientPct: null as any,
                    marginAllyPct: null as any,
                    marginWholesalePct: null as any,
                    priceClientUSD: null as any,
                    stock: 0,
                    supplierId: null,
                    categoryId: null,
                    isNew: false,
                    slug: (`deleted-${id}`) as any,
                },
            }) as any,
        ]);
        try { await prisma.auditLog.create({ data: { userId: (session?.user as any)?.id, action: 'PRODUCT_ANONYMIZED', details: id } }); } catch {}
        revalidatePath('/dashboard/admin/productos');
        redirect('/dashboard/admin/productos?message=Producto%20anonimizado');
    } catch (e) {
        revalidatePath('/dashboard/admin/productos');
        redirect('/dashboard/admin/productos?error=No%20se%20pudo%20anonimizar');
    }
}
