-- Exportación de solo lectura para cotejar el CSV. No modifica datos.
-- Ejecutar en SQL Editor y descargar el resultado como CSV.
select id, subscriber_number, full_name, first_name, last_name,
       dni, email, phone, birth_date, address, access_status,
       created_at, updated_at
from public.clients
order by id;
-- source_subscriber_number no se incluye porque la migración 019
-- puede no estar aplicada aún en esta base de datos.
