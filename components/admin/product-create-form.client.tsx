"use client";

import { useState } from "react";
import { PendingButton } from "@/components/pending-button";
import ProductMediaManager from "@/components/admin/product-media-manager";
import RelatedProductsPicker from "@/components/admin/related-products-picker";

type ProductCreateFormClientProps = {
  products: any[];
  categories: any[];
  suppliers: any[];
  summaryTitle?: string;
  defaultOpen?: boolean;
  enableRootNoIva?: boolean;
  action: (formData: FormData) => void;
};

type ProductFamily = "STANDARD" | "PARAMETRIC_FURNITURE" | "KITCHEN_MODULE";

export default function ProductCreateFormClient({
  products,
  categories,
  suppliers,
  summaryTitle = "Crear Producto",
  defaultOpen = false,
  enableRootNoIva = false,
  action,
}: ProductCreateFormClientProps) {
  const [productFamily, setProductFamily] = useState<ProductFamily>("STANDARD");
  const isParametricFurniture = productFamily === "PARAMETRIC_FURNITURE";
  const isKitchenModule = productFamily === "KITCHEN_MODULE";

  return (
    <details className="form-card" open={defaultOpen}>
      <summary className="text-lg font-bold cursor-pointer">{summaryTitle}</summary>
      <form action={action} className="form-grid mt-3">
        <div className="md:col-span-3 border-b pb-2 mb-2">
          <label className="block text-sm text-gray-700 mb-1">Tipo de producto</label>
          <select
            name="productFamily"
            className="form-select"
            value={productFamily}
            onChange={(e) => setProductFamily(e.target.value as ProductFamily)}
            required
          >
            <option value="STANDARD">STANDARD</option>
            <option value="PARAMETRIC_FURNITURE">PARAMETRIC_FURNITURE</option>
            <option value="KITCHEN_MODULE">KITCHEN_MODULE</option>
          </select>
        </div>

        <div className="md:col-span-3 border-b pb-2 mb-2">
          <h3 className="font-semibold text-sm mb-2">Tipo comercial</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="SIMPLE" defaultChecked /> Producto simple
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="type" value="GROUPED" /> Producto agrupado (caja/paquete)
            </label>
          </div>
        </div>

        <input name="name" placeholder="Nombre del producto" className="form-input md:col-span-2" required />
        <input name="slug" placeholder="slug-ejemplo" className="form-input" required />
        <input name="sku" placeholder="CИdigo interno Carpihogar (SKU)" className="form-input" />
        <input name="barcode" placeholder="CИdigo de barras (opcional)" className="form-input" />
        <input name="brand" placeholder="Marca" className="form-input" required />
        <input name="model" placeholder="Modelo" className="form-input" />
        <div className="md:col-span-3">
          <label className="block text-sm text-gray-700 mb-1">Descripcion</label>
          <textarea
            name="description"
            placeholder="Descripcion del producto"
            className="w-full border rounded px-2 py-1 min-h-[80px]"
          ></textarea>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio base (USD)</label>
          <input name="basePriceUsd" type="number" step="0.01" placeholder="Precio base" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Cliente (USD)</label>
          <input name="priceUSD" type="number" step="0.01" placeholder="Precio Cliente" className="form-input" required />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Aliado (USD)</label>
          <input name="priceAllyUSD" type="number" step="0.01" placeholder="Precio Aliado" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Precio Mayorista (USD)</label>
          <input
            name="priceWholesaleUSD"
            type="number"
            step="0.01"
            placeholder="Precio Mayorista"
            className="form-input"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en unidades</label>
          <input name="stockUnits" type="number" min="0" placeholder="Stock unidades" className="form-input" required />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock minimo</label>
          <input name="stockMinUnits" type="number" min="0" placeholder="Stock minimo" className="form-input" />
        </div>
        <div className="md:col-span-1 flex items-end">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="allowBackorder" /> Permitir venta por pedido (solo ERP)
          </label>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Unidades por paquete/caja</label>
          <input name="unitsPerPackage" type="number" min="0" placeholder="Unidades por paquete" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Stock en paquetes/cajas</label>
          <input name="stockPackages" type="number" min="0" placeholder="Stock paquetes" className="form-input" />
        </div>
        <div className="md:col-span-1">
          <label className="block text-sm text-gray-700 mb-1">Forma de venta</label>
          <select name="soldBy" className="form-select">
            <option value="UNIT">Solo unidad</option>
            <option value="PACKAGE">Solo caja/paquete</option>
            <option value="BOTH">Ambas</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-1">Peso (kg)</label>
          <input name="weightKg" type="number" step="0.001" min="0" placeholder="Peso kg" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Alto (cm)</label>
          <input name="heightCm" type="number" step="0.01" min="0" placeholder="Alto" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Ancho (cm)</label>
          <input name="widthCm" type="number" step="0.01" min="0" placeholder="Ancho" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Profundidad (cm)</label>
          <input name="depthCm" type="number" step="0.01" min="0" placeholder="Profundidad" className="form-input" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Tipo de flete</label>
          <select name="freightType" className="form-select">
            <option value="">Seleccionar tipo de flete</option>
            <option value="normal">Normal</option>
            <option value="fragil">Fragil</option>
            <option value="voluminoso">Voluminoso</option>
            <option value="sobrepeso">Sobrepeso</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-700 mb-1">Vehiculos permitidos para delivery</label>
          <p className="text-xs text-gray-500 mb-1">
            Marca los tipos de vehiculo que pueden transportar este producto. Si dejas todos en blanco, se
            permiten todos.
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="MOTO" /> Moto
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="CARRO" /> Carro
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="deliveryAllowedVehicles[]" value="CAMIONETA" /> Camioneta
            </label>
          </div>
        </div>
        <input name="videoUrl" placeholder="URL de video (opcional)" className="form-input" />
        <select name="categoryId" className="form-select">
          <option value="">Sin categoria</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{`${"- ".repeat(c.depth || 0)}${c.name}`}</option>
          ))}
        </select>
        <select name="supplierId" className="form-select">
          <option value="">Sin proveedor</option>
          {suppliers.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {isParametricFurniture && (
          <div className="md:col-span-3 border-t pt-3">
            <h3 className="font-semibold text-sm mb-2">Parametros de muebles</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ancho base (mm)</label>
                <input name="widthMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Alto base (mm)</label>
                <input name="heightMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Profundidad base (mm)</label>
                <input name="depthMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ancho minimo (mm)</label>
                <input name="widthMinMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ancho maximo (mm)</label>
                <input name="widthMaxMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Alto minimo (mm)</label>
                <input name="heightMinMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Alto maximo (mm)</label>
                <input name="heightMaxMm" type="number" min="0" step="1" className="form-input" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm text-gray-700 mb-1">Formula de precio</label>
                <input
                  name="parametricPricingFormula"
                  placeholder="Ej: basePriceUsd * (widthMm / 600)"
                  className="form-input w-full"
                />
              </div>
            </div>
          </div>
        )}

        {isKitchenModule && (
          <div className="md:col-span-3 border-t pt-3">
            <h3 className="font-semibold text-sm mb-2">Parametros de cocina</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Categoria</label>
                <select name="kitchenCategory" className="form-select">
                  <option value="">Seleccionar</option>
                  <option value="LOW">LOW</option>
                  <option value="HIGH">HIGH</option>
                  <option value="PANTRY">PANTRY</option>
                  <option value="TOWER">TOWER</option>
                  <option value="FRIDGE">FRIDGE</option>
                  <option value="CONDIMENT">CONDIMENT</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Altura fija (mm)</label>
                <input name="heightMm" type="number" min="0" step="1" className="form-input" required />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ancho minimo (mm)</label>
                <input name="widthMinMm" type="number" min="0" step="1" className="form-input" required />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Ancho maximo (mm)</label>
                <input name="widthMaxMm" type="number" min="0" step="1" className="form-input" required />
              </div>
              <div className="md:col-span-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="isVisibleInKitchenDesigner" /> Visible en Kitchen Designer
                </label>
              </div>
            </div>
            <div className="mt-4 border-t pt-3">
              <h4 className="font-semibold text-sm mb-2">Precios por gama (cocina)</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Precio baja gama (USD)</label>
                  <input
                    name="kitchenPriceLowUsd"
                    type="number"
                    step="0.01"
                    placeholder="Precio baja"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Precio media gama (USD)</label>
                  <input
                    name="kitchenPriceMidUsd"
                    type="number"
                    step="0.01"
                    placeholder="Precio media"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Precio alta gama (USD)</label>
                  <input
                    name="kitchenPriceHighUsd"
                    type="number"
                    step="0.01"
                    placeholder="Precio alta"
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="md:col-span-3">
          <RelatedProductsPicker products={products as any} name="relatedIds[]" watchCategoryName="categoryId" />
        </div>
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="showSocialButtons" /> Mostrar botones Instagram/TikTok en el producto
            </label>
          </div>
          <div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="isActive" defaultChecked /> Producto activo
            </label>
          </div>
          {enableRootNoIva && (
            <div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 text-red-700 font-semibold">
                <input type="checkbox" name="rootNoIvaOnly" /> Vender sin IVA (solo desde panel root)
              </label>
            </div>
          )}
        </div>
        <ProductMediaManager />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="isNew" /> Nuevo
        </label>
        <div className="md:col-span-3">
          <div className="form-actions">
            <PendingButton className="bg-green-600 text-white px-3 py-1 rounded" pendingText="Creando...">
              Crear
            </PendingButton>
          </div>
        </div>
      </form>
    </details>
  );
}
