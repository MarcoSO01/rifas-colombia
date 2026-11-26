-- =====================================================================
--  RIFAS COLOMBIA · Migración v3
--  · Multimedia desde enlaces (TikTok, Instagram, Facebook, Vimeo, Drive) y PDF
--  · Sección "¿Cómo se juega?" por rifa (video, PDF o imagen)
--  · Redes sociales del organizador
--
--  Ejecutar DESPUÉS de 002. Re-ejecutable.
-- =====================================================================

-- 1. Nuevos tipos de multimedia y ubicación
alter type public.media_kind add value if not exists 'embed';   -- TikTok, Instagram, Facebook, Vimeo, Drive…
alter type public.media_kind add value if not exists 'pdf';
alter type public.media_placement add value if not exists 'rules';  -- "¿Cómo se juega?"

-- 2. Redes sociales y textos para publicar
alter table public.site_settings add column if not exists facebook_url  text;
alter table public.site_settings add column if not exists instagram_url text;
alter table public.site_settings add column if not exists tiktok_url    text;
alter table public.site_settings add column if not exists share_hashtags text default '#sorteo #rifa #Colombia';

-- 3. Storage: PDF y videos de iPhone (.mov) en el bucket público
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'video/mp4', 'video/webm', 'video/quicktime',
         'application/pdf'
       ]
 where id = 'raffle-images';

-- 4. Marca por defecto (solo si nunca se cambió)
update public.site_settings set brand_name = 'Iñistare Sorteos' where brand_name = 'RifaYa';
