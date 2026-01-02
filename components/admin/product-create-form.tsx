import { createProduct } from "@/server/actions/products";
import { redirect } from "next/navigation";
import ProductCreateFormClient from "@/components/admin/product-create-form.client";

type ProductCreateFormProps = {
  products: any[];
  categories: any[];
  suppliers: any[];
  summaryTitle?: string;
  successRedirect?: string;
  enableRootNoIva?: boolean;
  defaultOpen?: boolean;
};

export default function ProductCreateForm({
  products,
  categories,
  suppliers,
  summaryTitle = "Crear Producto",
  successRedirect = "/dashboard/admin/productos?message=Producto%20creado",
  enableRootNoIva = false,
  defaultOpen = false,
}: ProductCreateFormProps) {
  async function handleCreateProduct(formData: FormData) {
    "use server";
    const images = (formData.getAll("images[]") as string[]).filter(Boolean);
    const mainImageUpload = String(formData.get("mainImage") || "").trim();
    const mainImage = String(formData.get("image") || "").trim() || mainImageUpload;
    if (mainImage) images.unshift(mainImage);
    const limited = images.slice(0, 4);
    const relatedIds = (formData.getAll("relatedIds[]") as string[]).map(String).filter(Boolean);
    const type = String(formData.get("type") || "SIMPLE") as any;
    const stockUnits = parseInt(String(formData.get("stockUnits") || formData.get("stock") || "0"), 10);
    const stockMinUnits = parseInt(String(formData.get("stockMinUnits") || "0"), 10);
    const allowBackorder = String(formData.get("allowBackorder") || "") === "on";
    const priceUSD = parseFloat(String(formData.get("priceUSD") || "0"));
    const priceAllyUSD = formData.get("priceAllyUSD") ? parseFloat(String(formData.get("priceAllyUSD"))) : null;
    const priceWholesaleUSD = formData.get("priceWholesaleUSD")
      ? parseFloat(String(formData.get("priceWholesaleUSD")))
      : null;
    const basePriceUsdInput = String(formData.get("basePriceUsd") || "").trim();
    const basePriceUsdParsed = basePriceUsdInput ? parseFloat(basePriceUsdInput) : NaN;
    const basePriceUsd = Number.isFinite(basePriceUsdParsed) ? basePriceUsdParsed : priceUSD;
    const unitsPerPackage =
      type === "GROUPED" ? parseInt(String(formData.get("unitsPerPackage") || "0"), 10) || null : null;
    const stockPackages =
      type === "GROUPED" ? parseInt(String(formData.get("stockPackages") || "0"), 10) || null : null;
    const soldBy = String(formData.get("soldBy") || "UNIT") as any;
    const weightKg = formData.get("weightKg") ? parseFloat(String(formData.get("weightKg"))) : null;
    const heightCm = formData.get("heightCm") ? parseFloat(String(formData.get("heightCm"))) : null;
    const widthCm = formData.get("widthCm") ? parseFloat(String(formData.get("widthCm"))) : null;
    const depthCm = formData.get("depthCm") ? parseFloat(String(formData.get("depthCm"))) : null;
    const freightType = String(formData.get("freightType") || "") || null;
    const categoryId = String(formData.get("categoryId") || "") || null;
    const supplierId = String(formData.get("supplierId") || "") || null;
    const isNew = Boolean(formData.get("isNew"));
    const videoUrl = String((formData.get("videoUrl") as string) || "").trim() || null;
    const showSocialButtons = Boolean(formData.get("showSocialButtons"));
    const deliveryAllowedVehicles = Array.from(
      new Set(
        (formData.getAll("deliveryAllowedVehicles[]") as string[])
          .map((v) => String(v || "").toUpperCase())
          .filter((v) => v === "MOTO" || v === "CARRO" || v === "CAMIONETA"),
      ),
    );
    const rootNoIvaOnly = enableRootNoIva && String(formData.get("rootNoIvaOnly") || "") === "on";
    const isActive = String(formData.get("isActive") || "") === "on";

    const productFamilyRaw = String(formData.get("productFamily") || "STANDARD").toUpperCase();
    const productFamily =
      productFamilyRaw === "PARAMETRIC_FURNITURE" || productFamilyRaw === "KITCHEN_MODULE"
        ? productFamilyRaw
        : "STANDARD";
    const isParametric = productFamily !== "STANDARD";
    const isKitchenModule = productFamily === "KITCHEN_MODULE";
    const isParametricFurniture = productFamily === "PARAMETRIC_FURNITURE";

    const toInt = (value: FormDataEntryValue | null) => {
      const parsed = parseInt(String(value || ""), 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const widthMinMm = isParametric ? toInt(formData.get("widthMinMm")) : null;
    const widthMaxMm = isParametric ? toInt(formData.get("widthMaxMm")) : null;
    let widthMm = isParametric ? toInt(formData.get("widthMm")) : null;
    const heightMm = isParametric ? toInt(formData.get("heightMm")) : null;
    const depthMm = isParametricFurniture ? toInt(formData.get("depthMm")) : null;
    if (isKitchenModule && widthMm == null) {
      widthMm = widthMinMm ?? widthMaxMm;
    }
    const heightMinMm = isParametricFurniture ? toInt(formData.get("heightMinMm")) : null;
    const heightMaxMm = isParametricFurniture ? toInt(formData.get("heightMaxMm")) : null;
    const parametricPricingFormula = isParametric
      ? String(formData.get("parametricPricingFormula") || "").trim() || null
      : null;
    const kitchenCategoryInput = String(formData.get("kitchenCategory") || "").trim();
    const kitchenCategory = isKitchenModule && kitchenCategoryInput ? kitchenCategoryInput : null;
    const isVisibleInKitchenDesigner =
      isKitchenModule && String(formData.get("isVisibleInKitchenDesigner") || "") === "on";
    const kitchenPriceLowUsd = isKitchenModule && String(formData.get("kitchenPriceLowUsd") || "").length
      ? parseFloat(String(formData.get("kitchenPriceLowUsd")))
      : null;
    const kitchenPriceMidUsd = isKitchenModule && String(formData.get("kitchenPriceMidUsd") || "").length
      ? parseFloat(String(formData.get("kitchenPriceMidUsd")))
      : null;
    const kitchenPriceHighUsd = isKitchenModule && String(formData.get("kitchenPriceHighUsd") || "").length
      ? parseFloat(String(formData.get("kitchenPriceHighUsd")))
      : null;

    await createProduct({
      name: String(formData.get("name") || ""),
      slug: String(formData.get("slug") || ""),
      brand: String(formData.get("brand") || ""),
      description: String(formData.get("description") || ""),
      images: limited,
      sku: String(formData.get("sku") || "") || null,
      barcode: String(formData.get("barcode") || ""),
      priceUSD,
      priceAllyUSD,
      priceWholesaleUSD,
      basePriceUsd,
      isActive,
      productFamily,
      isParametric,
      widthMm,
      heightMm,
      depthMm,
      widthMinMm,
      widthMaxMm,
      heightMinMm,
      heightMaxMm,
      parametricPricingFormula,
      kitchenCategory,
      isVisibleInKitchenDesigner,
      kitchenPriceLowUsd,
      kitchenPriceMidUsd,
      kitchenPriceHighUsd,
      stock: stockUnits,
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
      categoryId,
      supplierId,
      isNew,
      videoUrl,
      showSocialButtons,
      relatedIds,
      deliveryAllowedVehicles,
      rootNoIvaOnly,
    });
    redirect(successRedirect);
  }

  return (
    <ProductCreateFormClient
      products={products}
      categories={categories}
      suppliers={suppliers}
      summaryTitle={summaryTitle}
      defaultOpen={defaultOpen}
      enableRootNoIva={enableRootNoIva}
      action={handleCreateProduct}
    />
  );
}
