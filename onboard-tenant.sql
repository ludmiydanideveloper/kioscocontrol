-- ============================================================================
-- Alta de un kiosco nuevo (tenant) en KioscoControl.
-- Corré esto en el SQL Editor de Supabase DESPUÉS de aplicar schema.sql.
--
-- Con esto alcanza: el dueño del negocio nuevo se activa SU PROPIA cuenta de
-- administrador desde la app (vos no elegís ni ves su PIN). Pasos:
--
-- 1) Acá abajo, completá `slug` y `name` y ejecutá el bloque.
--    <slug> es un código corto sin espacios ni mayúsculas para ese negocio
--    (ej: "elsol", "kiosco-ruta9"). Tiene que ser único entre todos los
--    kioscos — si ya existe, este script no hace nada (es seguro reintentar).
--
-- 2) Pasále al dueño el link de la app y el código (slug) que elegiste. Él:
--      a) Abre https://kioscocontrol.vercel.app
--      b) Toca "¿Es otro kiosco? Cambiar" en la pantalla de PIN, escribe el
--         código y confirma.
--      c) La app le va a aparecer "abierta" (todavía no hay admin). Entra a
--         Configuración → PIN de administrador → elige su propio PIN
--         (6 a 8 dígitos) → Activar.
--
-- Listo — ese negocio ya tiene su administrador, con sus datos 100% separados
-- de cualquier otro kiosco. Si más adelante quiere un PIN de vendedor, lo
-- activa él mismo desde Configuración, igual que hacés vos en el tuyo.
-- ============================================================================

insert into public.tenants (id, slug, name)
values ('TODO-slug', 'TODO-slug', 'TODO Nombre del kiosco')
on conflict (id) do nothing;
