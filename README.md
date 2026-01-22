# Carpihogar.com - E-commerce + Backoffice

Carpihogar.com es una plataforma integral de comercio electronico y gestion operativa para retail y proyectos de mobiliario. Incluye tienda online, paneles por rol (cliente, aliado, vendedor, delivery y admin), flujos de presupuestos y ventas, inventario, compras, envios, reportes y mensajeria, con soporte de automatizaciones y asistencia inteligente.

---

## Caracteristicas principales

- Catalogo online con categorias, buscador, wishlist y comparador.
- Carrito y checkout con metodos de pago en USD/VES.
- Paneles diferenciados por rol con permisos y acciones especificas.
- Presupuestos con conversion a venta y precios P1/P2.
- Inventario, compras, proveedores, cuentas por cobrar y comisiones.
- Envios, entregas y reportes por rol y por periodo.
- Integraciones: Vercel Blob, correo SMTP, OpenAI (asistente, voz, OCR), ManyChat.

---

## Arquitectura y organizacion

- `app/`: rutas publicas, dashboards y API Routes.
- `components/`: UI reutilizable (admin, cliente, aliado, etc.).
- `server/actions/`: logica de negocio (ventas, compras, presupuestos, inventario, usuarios).
- `prisma/schema.prisma`: modelo de datos.
- `middleware.ts`: proteccion de rutas por rol.
- `lib/`: auth, prisma, mailer, integraciones.

---

## Roles y permisos

- `CLIENTE`: compra en la tienda y administra su perfil.
- `ALIADO`: crea presupuestos y ventas propias con P2.
- `VENDEDOR`: registra ventas en tienda y gestiona presupuestos.
- `DELIVERY`: gestiona entregas asignadas.
- `DESPACHO`: acceso limitado a envios.
- `ADMIN`: acceso completo y configuracion global.

La seguridad se aplica en `middleware.ts` y en acciones del servidor.

---

## Modulos del sistema

### Sitio publico
- Home con heroes y categorias destacadas.
- Listado y detalle de productos.
- Carrito, calculo de envios y checkout.
- Asistente inteligente para soporte y compras.

### Panel de Cliente
- Pedidos, envios, favoritos, direcciones y perfil.

### Panel de Aliado
- Presupuestos, ventas, reportes y KPIs.

### Panel de Admin
- Productos, categorias, inventario y movimientos.
- Compras, proveedores, cuentas por pagar.
- Ventas, presupuestos, conversiones y reportes.
- Usuarios, roles, ajustes y configuracion general.

### Panel de Delivery
- Registro, envios asignados y actualizacion de estados.

---

## Stack tecnico

- Next.js (App Router), React, TailwindCSS.
- NextAuth (credenciales + Google OAuth).
- Prisma + PostgreSQL.
- Nodemailer (SMTP).
- Vercel Blob.

---

## Seguridad y buenas practicas

- Verificacion por rol en rutas y acciones.
- Control de acceso en endpoints sensibles.
- Auditoria de eventos criticos (ventas, compras, envios, pagos).
- Politicas de password y verificacion de email configurables.

---

## Variables de entorno

Revisa `.env.example`. Minimo recomendado:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `NEXT_PUBLIC_URL`
- `EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `BLOB_READ_WRITE_TOKEN` (si usas Vercel Blob)
- `OPENAI_API_KEY` (si usas IA)
- `ROOT_EMAIL`

---

## Desarrollo local

1. Copia `.env.example` a `.env` y completa valores.
2. Instala dependencias: `npm install`
3. Genera Prisma: `npx prisma generate`
4. Migraciones: `npx prisma migrate dev`
5. Ejecuta: `npm run dev`

---

## Despliegue en Vercel

1. Vincula el repositorio.
2. Configura Environment Variables (Production/Preview).
3. Rama principal: `master`.
4. Cada `git push` despliega automaticamente.

---

## Datos de la empresa

- Nombre comercial: carpihogar.com
- Razon social: trends172,ca
- RIF: J-31758009-5
- Email: root@carpihogar.com
- Direccion: Av Industrial, Edificio Teca, Barinas, Estado Barinas, Venezuela
- Telefonos: 04245262306

---

## Propiedad intelectual y copyright

Este repositorio y su contenido (codigo fuente, arquitectura, textos, branding, disenos, flujos y documentos) estan protegidos por derechos de autor y otras leyes de propiedad intelectual.

- Copyright (c) 2025 Carpihogar.com / trends172,ca. Todos los derechos reservados.
- No se permite copiar, modificar, distribuir, sublicenciar o explotar comercialmente este codigo sin autorizacion escrita.
- El uso no autorizado constituye una infraccion legal y puede generar responsabilidades civiles y penales.

Consulta el archivo `LICENSE` para terminos adicionales.

