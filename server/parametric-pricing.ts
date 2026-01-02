import { applyPriceAdjustments, type CurrencyCode, type PriceAdjustmentSettings } from "@/server/price-adjustments";

type ParametricProduct = {
  productFamily?: string | null;
  basePriceUsd?: any;
  priceUSD?: any;
  parametricPricingFormula?: string | null;
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
  widthMinMm?: number | null;
  widthMaxMm?: number | null;
  heightMinMm?: number | null;
  heightMaxMm?: number | null;
  categoryId?: string | null;
};

type ParametricDimensions = {
  widthMm?: number | null;
  heightMm?: number | null;
  depthMm?: number | null;
};

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" };

const toNumberSafe = (value: any, fallback = 0) => {
  try {
    if (value == null) return fallback;
    if (typeof value === "number") return isFinite(value) ? value : fallback;
    if (typeof value?.toNumber === "function") return value.toNumber();
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const clamp = (value: number, min?: number | null, max?: number | null) => {
  if (min != null && value < min) return min;
  if (max != null && value > max) return max;
  return value;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function tokenizeFormula(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "%") {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    const isDigit = ch >= "0" && ch <= "9";
    if (isDigit || (ch === "." && i + 1 < len && input[i + 1] >= "0" && input[i + 1] <= "9")) {
      let numStr = "";
      let dotCount = 0;
      while (i < len) {
        const c = input[i];
        const digit = c >= "0" && c <= "9";
        if (digit) {
          numStr += c;
          i += 1;
          continue;
        }
        if (c === ".") {
          dotCount += 1;
          if (dotCount > 1) break;
          numStr += c;
          i += 1;
          continue;
        }
        break;
      }
      const num = Number(numStr);
      if (!isFinite(num)) return null;
      tokens.push({ type: "number", value: num });
      continue;
    }
    const isIdentStart =
      (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
    if (isIdentStart) {
      let ident = "";
      while (i < len) {
        const c = input[i];
        const ok =
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "_";
        if (!ok) break;
        ident += c;
        i += 1;
      }
      if (!ident.length) return null;
      tokens.push({ type: "ident", value: ident });
      continue;
    }
    return null;
  }
  return tokens;
}

function toRpn(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const ops: Token[] = [];

  const precedence: Record<string, number> = {
    "u-": 3,
    "*": 2,
    "/": 2,
    "%": 2,
    "+": 1,
    "-": 1,
  };

  let prev: Token | null = null;
  for (const token of tokens) {
    if (token.type === "number" || token.type === "ident") {
      output.push(token);
      prev = token;
      continue;
    }
    if (token.type === "paren") {
      if (token.value === "(") {
        ops.push(token);
        prev = token;
        continue;
      }
      while (ops.length) {
        const last = ops.pop()!;
        if (last.type === "paren" && last.value === "(") break;
        output.push(last);
      }
      prev = token;
      continue;
    }
    if (token.type === "op") {
      const isUnary =
        token.value === "-" &&
        (!prev || (prev.type === "op" || (prev.type === "paren" && prev.value === "(")));
      const opKey = isUnary ? "u-" : token.value;
      const prec = precedence[opKey];
      if (prec == null) return null;
      while (ops.length) {
        const last = ops[ops.length - 1];
        if (last.type !== "op") break;
        const lastKey = last.value;
        const lastPrec = precedence[lastKey];
        if (lastPrec == null || lastPrec < prec) break;
        output.push(ops.pop()!);
      }
      ops.push({ type: "op", value: opKey });
      prev = token;
      continue;
    }
  }
  while (ops.length) {
    const last = ops.pop()!;
    if (last.type === "paren") return null;
    output.push(last);
  }
  return output;
}

function evalRpn(rpn: Token[], vars: Record<string, number>): number | null {
  const stack: number[] = [];
  for (const token of rpn) {
    if (token.type === "number") {
      stack.push(token.value);
      continue;
    }
    if (token.type === "ident") {
      if (!(token.value in vars)) return null;
      stack.push(vars[token.value]);
      continue;
    }
    if (token.type === "op") {
      if (token.value === "u-") {
        const a = stack.pop();
        if (a == null) return null;
        stack.push(-a);
        continue;
      }
      const b = stack.pop();
      const a = stack.pop();
      if (a == null || b == null) return null;
      switch (token.value) {
        case "+":
          stack.push(a + b);
          break;
        case "-":
          stack.push(a - b);
          break;
        case "*":
          stack.push(a * b);
          break;
        case "/":
          stack.push(b === 0 ? 0 : a / b);
          break;
        case "%":
          stack.push(b === 0 ? 0 : a % b);
          break;
        default:
          return null;
      }
      continue;
    }
  }
  if (stack.length !== 1) return null;
  return stack[0];
}

function evaluateFormula(formula: string, vars: Record<string, number>): number | null {
  const tokens = tokenizeFormula(formula);
  if (!tokens) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  return evalRpn(rpn, vars);
}

function resolveDimensions(product: ParametricProduct, dimensions?: ParametricDimensions) {
  const baseWidth = toNumberSafe(product.widthMm, 0);
  const baseHeight = toNumberSafe(product.heightMm, 0);
  const baseDepth = toNumberSafe(product.depthMm, 0);

  const widthInput = toNumberSafe(dimensions?.widthMm, 0);
  const heightInput = toNumberSafe(dimensions?.heightMm, 0);
  const depthInput = toNumberSafe(dimensions?.depthMm, 0);

  const widthMin = toNumberSafe(product.widthMinMm, 0) || null;
  const widthMax = toNumberSafe(product.widthMaxMm, 0) || null;
  const heightMin = toNumberSafe(product.heightMinMm, 0) || null;
  const heightMax = toNumberSafe(product.heightMaxMm, 0) || null;

  const family = String(product.productFamily || "STANDARD").toUpperCase();
  const isKitchen = family === "KITCHEN_MODULE";

  const widthUsedRaw = widthInput > 0 ? widthInput : baseWidth;
  const widthUsed =
    widthUsedRaw > 0 ? clamp(widthUsedRaw, widthMin, widthMax) : clamp(baseWidth, widthMin, widthMax);

  const heightBase = isKitchen ? baseHeight : (heightInput > 0 ? heightInput : baseHeight);
  const heightUsed = isKitchen
    ? baseHeight
    : (heightBase > 0 ? clamp(heightBase, heightMin, heightMax) : clamp(baseHeight, heightMin, heightMax));

  const depthUsed = depthInput > 0 ? depthInput : baseDepth;

  const safeBaseWidth = baseWidth > 0 ? baseWidth : widthUsed || 1;
  const safeBaseHeight = baseHeight > 0 ? baseHeight : heightUsed || 1;
  const safeBaseDepth = baseDepth > 0 ? baseDepth : depthUsed || 1;

  return {
    widthMm: widthUsed || safeBaseWidth,
    heightMm: heightUsed || safeBaseHeight,
    depthMm: depthUsed || safeBaseDepth,
    widthBaseMm: safeBaseWidth,
    heightBaseMm: safeBaseHeight,
    depthBaseMm: safeBaseDepth,
    widthMinMm: widthMin || 0,
    widthMaxMm: widthMax || 0,
    heightMinMm: heightMin || 0,
    heightMaxMm: heightMax || 0,
    isKitchen,
  };
}

export function computeParametricPrice({
  product,
  dimensions,
  currency,
  supplierCurrency,
  settings,
}: {
  product: ParametricProduct;
  dimensions?: ParametricDimensions;
  currency: CurrencyCode;
  supplierCurrency?: CurrencyCode | string | null;
  settings: PriceAdjustmentSettings;
}): number {
  const base = toNumberSafe(product.basePriceUsd, 0);
  const fallback = toNumberSafe(product.priceUSD, 0);
  const basePrice = base > 0 ? base : fallback;
  if (!isFinite(basePrice) || basePrice <= 0) return 0;

  const formula = String(product.parametricPricingFormula || "").trim();
  if (!formula) return roundMoney(basePrice);

  const dims = resolveDimensions(product, dimensions);
  const widthDeltaMm = dims.widthMm - dims.widthBaseMm;
  const heightDeltaMm = dims.isKitchen ? 0 : dims.heightMm - dims.heightBaseMm;
  const depthDeltaMm = dims.depthMm - dims.depthBaseMm;
  const widthRatio = dims.widthBaseMm > 0 ? dims.widthMm / dims.widthBaseMm : 1;
  const heightRatio = dims.isKitchen
    ? 1
    : dims.heightBaseMm > 0
      ? dims.heightMm / dims.heightBaseMm
      : 1;
  const depthRatio = dims.depthBaseMm > 0 ? dims.depthMm / dims.depthBaseMm : 1;

  const value = evaluateFormula(formula, {
    basePriceUsd: basePrice,
    widthMm: dims.widthMm,
    heightMm: dims.isKitchen ? dims.heightBaseMm : dims.heightMm,
    depthMm: dims.depthMm,
    widthBaseMm: dims.widthBaseMm,
    heightBaseMm: dims.heightBaseMm,
    depthBaseMm: dims.depthBaseMm,
    widthMinMm: dims.widthMinMm,
    widthMaxMm: dims.widthMaxMm,
    heightMinMm: dims.heightMinMm,
    heightMaxMm: dims.heightMaxMm,
    widthDeltaMm,
    heightDeltaMm,
    depthDeltaMm,
    widthRatio,
    heightRatio,
    depthRatio,
  });

  const computed = value != null && isFinite(value) && value > 0 ? value : basePrice;

  const adjusted = applyPriceAdjustments({
    basePriceUSD: computed,
    currency,
    supplierCurrency,
    categoryId: product.categoryId || null,
    settings,
  });
  return roundMoney(adjusted);
}

export function computeParametricCartPrice(args: {
  product: ParametricProduct;
  dimensions?: ParametricDimensions;
  currency: CurrencyCode;
  supplierCurrency?: CurrencyCode | string | null;
  settings: PriceAdjustmentSettings;
}): number {
  return computeParametricPrice(args);
}

export function computeParametricQuotePrice(args: {
  product: ParametricProduct;
  dimensions?: ParametricDimensions;
  currency: CurrencyCode;
  supplierCurrency?: CurrencyCode | string | null;
  settings: PriceAdjustmentSettings;
}): number {
  return computeParametricPrice(args);
}

export function computeParametricKitchenDesignerPrice(args: {
  product: ParametricProduct;
  dimensions?: ParametricDimensions;
  currency: CurrencyCode;
  supplierCurrency?: CurrencyCode | string | null;
  settings: PriceAdjustmentSettings;
}): number {
  return computeParametricPrice(args);
}
