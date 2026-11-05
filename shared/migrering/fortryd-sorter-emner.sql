-- Fortryder sorteringen: sætter de 21 flyttede beskeder tilbage til 'andet' (som i backup-beskeder-emne.csv).
-- Kun hvis emnet stadig er det sorteringen satte; er det rettet bagefter af personalet, bliver det ved.
update public.beskeder b
set emne = 'andet'
from (values
  ('087703a8-9bf1-4610-b5af-1f763184b8e4'::uuid, 'aftaler'),
  ('639774b9-72d3-4be6-a5da-41dd10f00bfd'::uuid, 'husk'),
  ('83e96e06-b82b-4b27-84fa-95881e6e8dce'::uuid, 'husk'),
  ('8b2f6452-907d-4313-9b66-7fa62dafa686'::uuid, 'husk'),
  ('d1bec237-3f2d-4988-84b8-3e64a9f2fce2'::uuid, 'husk'),
  ('864ed982-557e-4c24-b9e2-a72538c2f50b'::uuid, 'medicin'),
  ('bf11ebcf-5cb8-4e81-ade1-88c65e2b693d'::uuid, 'medicin'),
  ('4ffa504e-6659-4e96-9380-15ca092e85ec'::uuid, 'motion'),
  ('5b77baf7-b508-4a1f-bf1c-3f2867570042'::uuid, 'motion'),
  ('70c88d89-6fc4-4d06-981f-0623725ef865'::uuid, 'motion'),
  ('decc9329-0931-46f3-b67f-ba26677048f2'::uuid, 'motion'),
  ('5a9ffb79-3d12-4390-b03a-0351f71dd30c'::uuid, 'obs'),
  ('9d5f215f-898a-4182-a3f3-6cbab9611284'::uuid, 'obs'),
  ('c9cc4b3f-f7ec-408f-9263-0e427c5faea7'::uuid, 'obs'),
  ('dc56ba31-9b01-4e68-977a-c3730cb8ffb3'::uuid, 'obs'),
  ('e086ed62-77dc-4d94-bee3-988b85898e6a'::uuid, 'obs'),
  ('ed39b5c9-cb45-4e45-bd03-2aa711027f0c'::uuid, 'obs'),
  ('116fa655-c7f7-488e-b3b8-83bb51ce493b'::uuid, 'struktur'),
  ('45a887a0-8d21-416d-8e08-7f772349d1f8'::uuid, 'struktur'),
  ('d95cb09f-386c-4c28-8c6b-f64eff93e78e'::uuid, 'struktur'),
  ('e45fc764-f1a2-40b2-b69f-2924087d4291'::uuid, 'struktur')
) as v(id, nyt)
where b.id = v.id and b.emne = v.nyt;
