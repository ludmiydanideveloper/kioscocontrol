-- ============================================================================
-- Alta de un kiosco nuevo (tenant) en KioscoControl.
-- Corré esto en el SQL Editor de Supabase DESPUÉS de aplicar schema.sql.
--
-- Vos sos el único que puede dar de alta un kiosco nuevo — nadie se puede
-- registrar solo sin este paso (la app ya no deja "inventar" un código).
-- El dueño después se activa SU PROPIA cuenta con SU email real (vos no
-- elegís ni ves su contraseña). Pasos:
--
-- 1) Acá abajo, completá `slug` y `name` y ejecutá el bloque.
--    <slug> es un código corto sin espacios ni mayúsculas para ese negocio
--    (ej: "elsol", "kiosco-ruta9"). Tiene que ser único entre todos los
--    kioscos — si ya existe, este script no hace nada (es seguro reintentar).
--
-- 2) Pasále al dueño el link de la app y el código (slug) que elegiste. Él:
--      a) Abre https://kioscocontrol.vercel.app
--      b) Toca "¿No tenés cuenta? Activá tu kiosco", pone el código que le
--         diste, su email y una contraseña.
--      c) Queda como administrador de ESE negocio — separado del resto.
--
-- Si el código no coincide con uno que vos hayas creado acá, o ese kiosco ya
-- tiene administrador, la app se lo rechaza.
--
-- Si más adelante el dueño quiere un PIN de empleado, lo activa él mismo
-- desde Configuración → Empleados.
-- ============================================================================

insert into public.tenants (id, slug, name)
values ('TODO-slug', 'TODO-slug', 'TODO Nombre del kiosco')
on conflict (id) do nothing;
