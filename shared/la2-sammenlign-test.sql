-- ==================================================================
-- LA2 Sammenlign — test af mødedata-tabellerne direkte i databasen.
-- Projekt: lumxvqhlmokspqnazhso.   STATUS: skrevet til godkendelse, IKKE kørt.
--
-- Kør som ét blok i Supabase SQL Editor (eller via MCP). Alt rulles tilbage:
-- blokken slutter med en bevidst fejl, hvis tekst er testresultatet, så der
-- hverken efterlades testplaner, noter eller fælles punkter.
--
-- Hver linje i resultatet er "OK" eller "FEJL" + hvad der blev testet.
-- ==================================================================

do $$
declare
  rid  uuid;
  pid  uuid;
  nid  uuid;
  cid  uuid;
  n    int;
  res  text := '';

  -- JWT-claims for de tre roller
  c_anon   text := '{"role":"anon"}';
  c_editor text := '{"role":"authenticated","app_metadata":{"la2_role":"editor"}}';
  c_screen text := '{"role":"authenticated","app_metadata":{"la2_role":"screen"}}';
begin
  -- ---- opsætning som ejer: en testplan med to versioner ----
  select resident_id into rid from public.la2_residents limit 1;
  if rid is null then raise exception 'Ingen la2_residents at teste med'; end if;

  insert into public.la2_plans
    (resident_id, plan_type, perspective, title, content, status,
     episode_date, episode_group_id, created_by_name, updated_by_name)
  values
    (rid, 'laering', 'min', '__SQL_TEST__', '{"a":{}}'::jsonb, 'aktiv',
     current_date, gen_random_uuid(), 'SQL-test', 'SQL-test')
  returning id into pid;

  update public.la2_plans set content = '{"a":{"x":"y"}}'::jsonb, updated_by_name = 'SQL-test' where id = pid;

  select count(*) into n from public.la2_plan_versions where plan_id = pid;
  res := res || E'\n' || case when n = 2 then 'OK    ' else 'FEJL  ' end || 'testplanen har 2 versioner (' || n || ')';

  -- ---- anon: ingen adgang ----
  perform set_config('request.jwt.claims', c_anon, true);
  set local role anon;
  begin
    perform 1 from public.la2_compare_notes limit 1;
    res := res || E'\nFEJL  anon kunne læse la2_compare_notes';
  exception when others then
    res := res || E'\nOK    anon kan ikke læse la2_compare_notes';
  end;
  begin
    perform 1 from public.la2_compare_common limit 1;
    res := res || E'\nFEJL  anon kunne læse la2_compare_common';
  exception when others then
    res := res || E'\nOK    anon kan ikke læse la2_compare_common';
  end;
  reset role;

  -- ---- screen: ingen adgang til mødedata ----
  perform set_config('request.jwt.claims', c_screen, true);
  set local role authenticated;
  begin
    select count(*) into n from public.la2_compare_notes;
    res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'screen ser ingen noter (' || n || ')';
  exception when others then
    res := res || E'\nOK    screen kan ikke læse la2_compare_notes';
  end;
  begin
    insert into public.la2_compare_common
      (resident_id, plan_type, left_plan_id, right_plan_id, row_key, left_item_id, created_by_name)
    values (rid, 'laering', pid, pid, '__t__', 'a', 'screen');
    res := res || E'\nFEJL  screen kunne oprette fælles punkt';
  exception when others then
    res := res || E'\nOK    screen kan ikke oprette fælles punkt';
  end;
  reset role;

  -- ---- editor: noter ----
  perform set_config('request.jwt.claims', c_editor, true);
  set local role authenticated;

  insert into public.la2_compare_notes
    (resident_id, plan_type, left_plan_id, left_version_no, right_plan_id, right_version_no,
     row_key, marking, note, created_by_name, updated_by_name)
  values (rid, 'laering', pid, 1, pid, 2, '__t__', 'forskel', 'note', 'SQL-test', 'SQL-test')
  returning id into nid;
  res := res || E'\nOK    editor kan oprette note';

  begin
    insert into public.la2_compare_notes
      (resident_id, plan_type, left_plan_id, left_version_no, right_plan_id, right_version_no,
       row_key, note, created_by_name, updated_by_name)
    values (rid, 'laering', pid, 1, pid, 2, '__t__', 'dublet', 'SQL-test', 'SQL-test');
    res := res || E'\nFEJL  dublet-note kunne oprettes';
  exception when unique_violation then
    res := res || E'\nOK    dublet-note afvises (unique)';
  end;

  begin
    insert into public.la2_compare_notes
      (resident_id, plan_type, left_plan_id, left_version_no, right_plan_id, right_version_no,
       row_key, note, created_by_name, updated_by_name)
    values (rid, 'trivsel', pid, 1, pid, 2, '__t2__', 'x', 'SQL-test', 'SQL-test');
    res := res || E'\nFEJL  note med forkert plantype kunne oprettes';
  exception when others then
    res := res || E'\nOK    note med forkert plantype afvises';
  end;

  begin
    insert into public.la2_compare_notes
      (resident_id, plan_type, left_plan_id, left_version_no, right_plan_id, right_version_no,
       row_key, note, created_by_name, updated_by_name)
    values (rid, 'laering', pid, 1, pid, 77, '__t3__', 'x', 'SQL-test', 'SQL-test');
    res := res || E'\nFEJL  note til version der ikke findes kunne oprettes';
  exception when foreign_key_violation then
    res := res || E'\nOK    note til ukendt version afvises (fk)';
  end;

  begin
    insert into public.la2_compare_notes
      (resident_id, plan_type, left_plan_id, left_version_no, right_plan_id, right_version_no,
       row_key, marking, note, created_by_name, updated_by_name)
    values (rid, 'laering', pid, 1, pid, 2, '__t4__', 'noget-andet', '', 'SQL-test', 'SQL-test');
    res := res || E'\nFEJL  ugyldig markering kunne oprettes';
  exception when check_violation then
    res := res || E'\nOK    ugyldig markering afvises (check)';
  end;

  update public.la2_compare_notes
     set note = 'ændret', marking = 'enige', row_key = 'andet', left_version_no = 2
   where id = nid;
  select count(*) into n from public.la2_compare_notes
   where id = nid and note = 'ændret' and marking = 'enige' and row_key = '__t__' and left_version_no = 1;
  res := res || E'\n' || case when n = 1 then 'OK    ' else 'FEJL  ' end || 'note kan rettes, men felt og version ligger fast';

  begin
    delete from public.la2_compare_notes where id = nid;
    get diagnostics n = row_count;
    res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'editor kan ikke slette note (' || n || ' slettet)';
  exception when insufficient_privilege then
    res := res || E'\nOK    editor kan ikke slette note (permission denied)';
  end;

  -- ---- editor: fælles punkter ----
  insert into public.la2_compare_common
    (resident_id, plan_type, left_plan_id, right_plan_id, row_key, left_item_id, created_by_name)
  values (rid, 'laering', pid, pid, '__t__', 'a', 'SQL-test')
  returning id into cid;
  res := res || E'\nOK    editor kan oprette fælles punkt';

  begin
    insert into public.la2_compare_common
      (resident_id, plan_type, left_plan_id, right_plan_id, row_key, left_item_id, right_item_id, created_by_name)
    values (rid, 'laering', pid, pid, '__t__', 'a', 'b', 'SQL-test');
    res := res || E'\nFEJL  samme punkt kunne ligge i midten to gange';
  exception when unique_violation then
    res := res || E'\nOK    samme punkt kan ikke ligge i midten to gange';
  end;

  begin
    insert into public.la2_compare_common
      (resident_id, plan_type, left_plan_id, right_plan_id, row_key, created_by_name)
    values (rid, 'laering', pid, pid, '__t5__', 'SQL-test');
    res := res || E'\nFEJL  fælles punkt uden punkt-id kunne oprettes';
  exception when check_violation then
    res := res || E'\nOK    fælles punkt uden punkt-id afvises';
  end;

  begin
    update public.la2_compare_common set right_item_id = 'z' where id = cid;
    get diagnostics n = row_count;
    res := res || E'\n' || case when n = 0 then 'OK    ' else 'FEJL  ' end || 'fælles punkt kan ikke opdateres (' || n || ' rettet)';
  exception when insufficient_privilege then
    res := res || E'\nOK    fælles punkt kan ikke opdateres (permission denied)';
  end;

  delete from public.la2_compare_common where id = cid;
  get diagnostics n = row_count;
  res := res || E'\n' || case when n = 1 then 'OK    ' else 'FEJL  ' end || 'editor kan slette fælles punkt';

  reset role;

  -- ---- skriv resultatet og rul alt tilbage ----
  raise exception E'TESTRESULTAT (rullet tilbage):%', res;
end
$$;
